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
from .models import Sale, SaleLine


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
	against here."""
	if sale.voided:
		raise HTTPException(status_code=409, detail="Sale is already voided")

	for line in sale.lines:
		item = db.get(Item, line.item_id)
		items_service.adjust_stock(
			db,
			item,
			float(line.qty),
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
