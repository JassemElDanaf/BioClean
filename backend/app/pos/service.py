"""Checkout is the one place a Sale gets created, and it deliberately does
not duplicate any stock-math - every line's deduction goes through
items.service.adjust_stock(), the same row-locked, audited path
StockAdjustModal already uses for a manual correction. That's what makes
a POS sale and a manual "remove stock" impossible to disagree about what
the current quantity is."""

from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from ..items import service as items_service
from ..items.models import Item
from ..shared.currency import get_or_create_settings
from .models import Return, ReturnLine, Sale, SaleLine


def checkout(
	db: Session,
	lines: list[dict],
	payment_method: str,
	amount_tendered: float | None,
	warehouse_id: int | None,
	idempotency_key: str | None = None,
) -> Sale:
	"""Nothing commits until every line has successfully cleared
	adjust_stock() - an insufficient-stock 409 on line 3 of 5 has to roll
	back lines 1-2 as well, not leave a sale half-charged against stock
	that doesn't exist. adjust_stock(commit=False) plus one commit here
	(same pattern items.router.create_item uses for item+initial stock) is
	what gets that: if anything raises, the session is simply never
	committed and get_db() discards it on close.

	idempotency_key makes retries of the exact same checkout attempt (a
	double-click, a dropped response the frontend resends, a timeout
	retry) safe: a request whose key already belongs to a Sale gets that
	same Sale handed back with zero further side effects, instead of a
	second sale that deducts stock twice. Checked twice - once up front
	(covers the common case cheaply) and once via the DB's unique
	constraint on commit (covers two requests racing each other, which the
	upfront check alone can't)."""
	if idempotency_key:
		existing = (
			db.query(Sale).options(joinedload(Sale.lines)).filter(Sale.idempotency_key == idempotency_key).first()
		)
		if existing:
			return existing

	warehouse_id = warehouse_id or items_service.get_default_warehouse(db).id

	sale = Sale(warehouse_id=warehouse_id, total=0, payment_method=payment_method, amount_tendered=amount_tendered, idempotency_key=idempotency_key)
	db.add(sale)
	db.flush()  # assigns sale.id, used below as the StockMovement.reference

	total = 0.0
	for line in lines:
		item = db.get(Item, line["item_id"])
		if not item:
			raise HTTPException(status_code=404, detail=f"Item {line['item_id']} not found")
		unit_price = line["unit_price"] if line["unit_price"] is not None else float(item.retail_price)
		qty = line["qty"]

		# Negative delta = sold. unit_cost is intentionally left unset here -
		# it means "what we paid the supplier", which a sale has nothing to
		# do with; passing it would incorrectly overwrite item.cost_price.
		items_service.adjust_stock(
			db,
			item,
			-qty,
			warehouse_id=warehouse_id,
			reason="pos_sale",
			reference=f"SALE-{sale.id}",
			commit=False,
		)

		line_total = qty * unit_price
		db.add(
			SaleLine(
				sale_id=sale.id,
				item_id=item.id,
				item_name=item.item_name,
				barcode=item.barcode,
				qty=qty,
				unit_price=unit_price,
				unit_cost=float(item.cost_price),
				line_total=line_total,
			)
		)
		total += line_total

	# Snapshotted from the live Settings.tax_rate/usd_to_lbp_rate at
	# checkout time - a rate change afterward must never alter what a past
	# receipt showed.
	live_settings = get_or_create_settings(db)
	tax_rate = float(live_settings.tax_rate)
	tax_amount = round(total * tax_rate / 100, 2)

	sale.tax_amount = tax_amount
	sale.total = total + tax_amount
	sale.exchange_rate = float(live_settings.usd_to_lbp_rate)

	if idempotency_key:
		try:
			db.commit()
		except IntegrityError:
			# Another request with the same key won the race and committed
			# first (the upfront check above missed it because both requests
			# ran that check before either had committed) - this request's
			# session never persisted anything, so just hand back the
			# winner's Sale instead of erroring or double-charging stock.
			db.rollback()
			winner = db.query(Sale).options(joinedload(Sale.lines)).filter(Sale.idempotency_key == idempotency_key).first()
			if winner:
				return winner
			raise
	else:
		db.commit()

	db.refresh(sale)
	return sale


def void_sale(db: Session, sale: Sale) -> Sale:
	"""Restoring stock (positive delta) can never fail the way removing it
	can, so - unlike checkout - there's no partial-failure case to guard
	against here.

	Only restores what's still actually outstanding on each line - if 2 of
	5 sold units were already returned (see create_return()), those 2 are
	already back in stock, and voiding must only restore the remaining 3.
	Restoring the full original line.qty regardless would double-count the
	already-returned portion and inflate stock above what was ever really
	on hand."""
	if sale.voided:
		raise HTTPException(status_code=409, detail="Sale is already voided")

	for line in sale.lines:
		already_returned = db.query(ReturnLine).filter(ReturnLine.sale_line_id == line.id).with_entities(ReturnLine.qty).all()
		already_returned_qty = sum(float(q[0]) for q in already_returned)
		restore_qty = float(line.qty) - already_returned_qty
		if restore_qty <= 0:
			continue
		if line.item_id is None:
			continue
		item = db.get(Item, line.item_id)
		if item is None:
			continue
		items_service.adjust_stock(
			db,
			item,
			restore_qty,
			warehouse_id=sale.warehouse_id,
			reason="pos_void",
			reference=f"SALE-{sale.id}-void",
			commit=False,
		)

	sale.voided = True
	sale.voided_at = datetime.now(timezone.utc)
	sale.pdf_data = None  # stale - cached receipt still shows it as active
	db.commit()
	db.refresh(sale)
	return sale


def create_return(
	db: Session,
	sale: Sale,
	lines: list[dict],
	refund_method: str,
	reason: str | None,
) -> Return:
	"""Never touches the original Sale/SaleLine rows (see Return's
	docstring) - restores stock for exactly the returned quantity through
	the same adjust_stock() every other stock movement goes through, and
	is atomic the same way checkout() is: nothing commits until every line
	clears validation, so a bad line 2 of 3 can't leave line 1's stock
	already restored."""
	if sale.voided:
		raise HTTPException(status_code=409, detail="Can't return items from a voided sale - it was already fully reversed")

	sale_line_by_id = {line.id: line for line in sale.lines}

	ret = Return(sale_id=sale.id, refund_method=refund_method, total_refund=0, reason=reason)
	db.add(ret)
	db.flush()  # assigns ret.id, used below as the StockMovement.reference

	total_refund = 0.0
	for line in lines:
		sale_line = sale_line_by_id.get(line["sale_line_id"])
		if not sale_line:
			raise HTTPException(status_code=404, detail=f"Sale line {line['sale_line_id']} not found on this sale")

		already_returned = (
			db.query(ReturnLine).filter(ReturnLine.sale_line_id == sale_line.id).with_entities(ReturnLine.qty).all()
		)
		already_returned_qty = sum(float(q[0]) for q in already_returned)
		remaining = float(sale_line.qty) - already_returned_qty
		qty = line["qty"]
		if qty > remaining:
			raise HTTPException(
				status_code=409,
				detail=f"Can't return {qty:g} of '{sale_line.item_name}' - only {remaining:g} remaining (of {float(sale_line.qty):g} sold)",
			)

		item = db.get(Item, sale_line.item_id) if sale_line.item_id is not None else None
		if item is not None:
			items_service.adjust_stock(
				db,
				item,
				qty,
				warehouse_id=sale.warehouse_id,
				reason="return",
				reference=f"SALE-{sale.id}-return-{ret.id}",
				commit=False,
			)

		line_refund = qty * float(sale_line.unit_price)
		db.add(
			ReturnLine(
				return_id=ret.id,
				sale_line_id=sale_line.id,
				item_id=sale_line.item_id,
				item_name=sale_line.item_name,
				barcode=sale_line.barcode,
				qty=qty,
				unit_price=sale_line.unit_price,
				line_refund=line_refund,
			)
		)
		total_refund += line_refund

	ret.total_refund = total_refund
	sale.returned_total = float(sale.returned_total) + total_refund
	sale.pdf_data = None  # stale - cached receipt doesn't reflect the return
	db.commit()
	db.refresh(ret)
	return ret


def list_returns(db: Session, sale: Sale) -> list[Return]:
	return db.query(Return).options(joinedload(Return.lines)).filter(Return.sale_id == sale.id).order_by(Return.created_at.desc()).all()


def list_sales(
	db: Session,
	skip: int = 0,
	limit: int = 100,
	from_date=None,
	to_date=None,
) -> tuple[list[Sale], int]:
	"""Counted before the joinedload below is applied - same reasoning as
	items.service.list_items: counting on top of a joined collection load
	would double-count sales that have more than one line, and almost
	every real sale does."""
	base = db.query(Sale)
	if from_date:
		base = base.filter(Sale.created_at >= from_date)
	if to_date:
		base = base.filter(Sale.created_at <= to_date)

	total = base.count()
	sales = (
		base.options(joinedload(Sale.lines))
		.order_by(Sale.created_at.desc())
		.offset(skip)
		.limit(limit)
		.all()
	)
	return sales, total


def get_sale_receipt_pdf(db: Session, sale: Sale) -> bytes:
	"""Lazily renders and caches the PDF in sale.pdf_data. void_sale() nulls
	this out on status change, so a cache hit here always matches the
	sale's current state."""
	if sale.pdf_data is not None:
		return bytes(sale.pdf_data)

	from ..shared.archive import archive_document
	from .pdf import generate_sale_receipt_pdf

	pdf_bytes = generate_sale_receipt_pdf(sale)
	sale.pdf_data = pdf_bytes
	archive_document("Receipts", sale.created_at, f"receipt-{sale.id}.pdf", pdf_bytes)
	db.commit()
	return pdf_bytes


def print_sale_receipt(db: Session, sale: Sale) -> None:
	"""Sends the sale to the physical thermal receipt printer configured in
	Settings. Deliberately has nothing to roll back and touches no Sale
	field - a print failure (printer off, unconfigured, out of paper) is
	never allowed to look like the sale itself failed. Raises PrinterError
	on any problem; the router turns that into a 502 without touching the
	Sale row at all."""
	from .escpos_receipt import print_receipt

	settings = get_or_create_settings(db)
	print_receipt(sale, settings)
