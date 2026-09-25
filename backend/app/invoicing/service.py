"""An invoice is a commitment to sell, not a completed sale - creating one
does NOT touch stock or count as revenue (confirmed decision: unpaid
invoices are pending, same as a Quotation, and shouldn't overstate either
inventory-on-hand or the books). Stock only actually moves - and the
invoice only actually becomes a "sale" for reporting purposes - in
mark_paid() below, the moment payment is confirmed. void_invoice()
mirrors that: it only reverses stock if the invoice had actually reached
"paid" (nothing was ever deducted for one that hadn't).

Every line's stock deduction still goes through items.service.
adjust_stock() - the one place stock math lives - so an invoice, a POS
sale, and a manual correction can never disagree about what "the current
quantity" is. create_invoice() is also called directly by quotation/
service.py's convert_to_invoice(), so there's one real code path for "how
does an invoice get created", not two - and that conversion inherits this
same pending-until-paid behavior for free."""

from fastapi import HTTPException
from sqlalchemy.orm import Session, joinedload

from ..customers.models import Customer
from ..items import service as items_service
from ..items.models import Item
from ..shared.currency import get_or_create_settings
from .models import Invoice, InvoiceLine


def _default_unit_price(item: Item, customer: Customer | None) -> float:
	if customer and customer.is_wholesale:
		return float(item.wholesale_price)
	return float(item.retail_price)


def create_invoice(
	db: Session,
	customer_id: int | None,
	lines: list[dict],
	due_date=None,
	notes: str | None = None,
	warehouse_id: int | None = None,
) -> Invoice:
	warehouse_id = warehouse_id or items_service.get_default_warehouse(db).id
	customer = db.get(Customer, customer_id) if customer_id else None
	if customer_id and not customer:
		raise HTTPException(status_code=404, detail=f"Customer {customer_id} not found")

	# Snapshotted at issue time - a later rate change must never alter what
	# this invoice showed, even if it stays unpaid for weeks.
	exchange_rate = float(get_or_create_settings(db).usd_to_lbp_rate)
	invoice = Invoice(customer_id=customer_id, customer_name=customer.name if customer else None, warehouse_id=warehouse_id, total=0, exchange_rate=exchange_rate, due_date=due_date, notes=notes)
	db.add(invoice)
	db.flush()  # assigns invoice.id, used below as the StockMovement.reference

	total = 0.0
	for line in lines:
		item = db.get(Item, line["item_id"])
		if not item:
			raise HTTPException(status_code=404, detail=f"Item {line['item_id']} not found")
		unit_price = line["unit_price"] if line["unit_price"] is not None else _default_unit_price(item, customer)
		qty = line["qty"]

		# No adjust_stock() here (see module docstring) - an invoice doesn't
		# move stock until it's actually paid.
		line_total = qty * unit_price
		db.add(
			InvoiceLine(
				invoice_id=invoice.id,
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

	invoice.total = total
	db.commit()
	db.refresh(invoice)
	return invoice


def mark_paid(db: Session, invoice: Invoice) -> Invoice:
	"""The moment stock actually moves and the invoice actually becomes
	revenue - see module docstring.

	Marking an invoice paid is a financial fact (the money was collected)
	and must never be blocked by the shelf count being wrong or stale -
	allow_negative=True means a mismatched inventory count shows up as
	negative stock (a real, visible signal something needs recounting)
	instead of silently refusing to record that the invoice was paid.

	Any line whose item was since deleted (see items/service.py:
	delete_item()) has nothing left to adjust - its own stock/movement
	history went with it - so it's skipped rather than crashing on a null
	item."""
	from datetime import datetime, timezone

	if invoice.status == "voided":
		raise HTTPException(status_code=409, detail="Voided invoice can't be marked paid")
	if invoice.status == "paid":
		raise HTTPException(status_code=409, detail="Invoice is already marked paid")

	for line in invoice.lines:
		if line.item_id is None:
			continue
		item = db.get(Item, line.item_id)
		if item is None:
			continue
		items_service.adjust_stock(
			db,
			item,
			-float(line.qty),
			warehouse_id=invoice.warehouse_id,
			reason="invoice",
			reference=f"INV-{invoice.id}",
			commit=False,
			allow_negative=True,
		)

	invoice.status = "paid"
	invoice.paid_at = datetime.now(timezone.utc)
	invoice.pdf_data = None  # stale - cached PDF still shows "UNPAID"
	db.commit()
	db.refresh(invoice)
	return invoice


def void_invoice(db: Session, invoice: Invoice) -> Invoice:
	"""Only reverses stock if the invoice had actually reached "paid" -
	an unpaid one never deducted anything in the first place (see module
	docstring), so there's nothing to restore."""
	from datetime import datetime, timezone

	if invoice.status == "voided":
		raise HTTPException(status_code=409, detail="Invoice is already voided")

	if invoice.status == "paid":
		for line in invoice.lines:
			if line.item_id is None:
				continue
			item = db.get(Item, line.item_id)
			if item is None:
				continue
			items_service.adjust_stock(
				db,
				item,
				float(line.qty),
				warehouse_id=invoice.warehouse_id,
				reason="invoice_void",
				reference=f"INV-{invoice.id}-void",
				commit=False,
			)

	invoice.status = "voided"
	invoice.voided_at = datetime.now(timezone.utc)
	invoice.pdf_data = None  # stale - cached PDF still shows the old status
	db.commit()
	db.refresh(invoice)
	return invoice


def list_invoices(
	db: Session,
	skip: int = 0,
	limit: int = 100,
	from_date=None,
	to_date=None,
	status: str | None = None,
	customer_id: int | None = None,
):
	"""Counted before the joinedload below is applied - same reasoning as
	items.service.list_items and pos.service.list_sales: counting on top
	of a joined collection load would double-count invoices with more
	than one line."""
	base = db.query(Invoice)
	if from_date:
		base = base.filter(Invoice.created_at >= from_date)
	if to_date:
		base = base.filter(Invoice.created_at <= to_date)
	if status:
		base = base.filter(Invoice.status == status)
	if customer_id:
		base = base.filter(Invoice.customer_id == customer_id)

	total = base.count()
	invoices = (
		base.options(joinedload(Invoice.lines), joinedload(Invoice.customer))
		.order_by(Invoice.created_at.desc())
		.offset(skip)
		.limit(limit)
		.all()
	)
	return invoices, total


def get_invoice_pdf(db: Session, invoice: Invoice) -> bytes:
	"""Lazily renders and caches the PDF in invoice.pdf_data. mark_paid()
	and void_invoice() null this out on any status change, so a cache hit
	here is always guaranteed to still match the invoice's current state."""
	if invoice.pdf_data is not None:
		return bytes(invoice.pdf_data)

	from ..shared.archive import archive_document
	from .pdf import generate_invoice_pdf

	pdf_bytes = generate_invoice_pdf(invoice)
	invoice.pdf_data = pdf_bytes
	archive_document("Invoices", invoice.created_at, f"invoice-{invoice.id}.pdf", pdf_bytes)
	db.commit()
	return pdf_bytes
