from fastapi import HTTPException
from sqlalchemy.orm import Session, joinedload

from ..customers.models import Customer
from ..invoicing import service as invoicing_service
from ..invoicing.models import Invoice
from ..items.models import Item
from .models import Quotation, QuotationLine


def _default_unit_price(item: Item, customer: Customer | None) -> float:
	if customer and customer.is_wholesale:
		return float(item.wholesale_price)
	return float(item.retail_price)


def create_quotation(db: Session, customer_id: int | None, lines: list[dict], valid_until=None, notes: str | None = None) -> Quotation:
	customer = db.get(Customer, customer_id) if customer_id else None
	if customer_id and not customer:
		raise HTTPException(status_code=404, detail=f"Customer {customer_id} not found")

	quotation = Quotation(customer_id=customer_id, total=0, valid_until=valid_until, notes=notes)
	db.add(quotation)
	db.flush()

	total = 0.0
	for line in lines:
		item = db.get(Item, line["item_id"])
		if not item:
			raise HTTPException(status_code=404, detail=f"Item {line['item_id']} not found")
		unit_price = line["unit_price"] if line["unit_price"] is not None else _default_unit_price(item, customer)
		qty = line["qty"]
		line_total = qty * unit_price
		db.add(
			QuotationLine(
				quotation_id=quotation.id,
				item_id=item.id,
				item_name=item.item_name,
				barcode=item.barcode,
				qty=qty,
				unit_price=unit_price,
				line_total=line_total,
			)
		)
		total += line_total

	quotation.total = total
	db.commit()
	db.refresh(quotation)
	return quotation


def convert_to_invoice(db: Session, quotation: Quotation) -> Invoice:
	"""Turns an accepted quote into a real Invoice - stock only ever moves
	here, never at quotation creation. Delegates to
	invoicing.service.create_invoice() rather than re-deriving the same
	adjust_stock loop, so a converted quote and a hand-created invoice are
	built by the exact same code."""
	if quotation.status == "converted":
		raise HTTPException(status_code=409, detail="Quotation was already converted to an invoice")

	invoice = invoicing_service.create_invoice(
		db,
		customer_id=quotation.customer_id,
		# Re-uses the quote's own snapshot prices/qtys rather than looking
		# the item up fresh - what the customer was quoted is what they pay,
		# even if retail_price moved between quoting and converting.
		lines=[{"item_id": line.item_id, "qty": float(line.qty), "unit_price": float(line.unit_price)} for line in quotation.lines],
	)

	quotation.status = "converted"
	quotation.converted_invoice_id = invoice.id
	quotation.pdf_data = None  # stale - cached PDF still shows the old status
	db.commit()
	db.refresh(quotation)
	return invoice


def delete_quotation(db: Session, quotation: Quotation) -> None:
	"""Safe to hard-delete (unlike Invoice/Sale) because a quotation that
	was never converted never touched stock - there's no movement history
	to lose. A converted one is refused so converted_invoice_id on the
	real Invoice never dangles."""
	if quotation.status == "converted":
		raise HTTPException(status_code=409, detail="Can't delete a quotation that's already been converted to an invoice")
	db.delete(quotation)
	db.commit()


def list_quotations(db: Session, skip: int = 0, limit: int = 100, status: str | None = None, customer_id: int | None = None):
	base = db.query(Quotation)
	if status:
		base = base.filter(Quotation.status == status)
	if customer_id:
		base = base.filter(Quotation.customer_id == customer_id)

	total = base.count()
	quotations = (
		base.options(joinedload(Quotation.lines), joinedload(Quotation.customer))
		.order_by(Quotation.created_at.desc())
		.offset(skip)
		.limit(limit)
		.all()
	)
	return quotations, total


def get_quotation_pdf(db: Session, quotation: Quotation) -> bytes:
	"""Lazily renders and caches the PDF in quotation.pdf_data. convert_to_
	invoice() nulls this out on status change, so a cache hit here always
	matches the quotation's current state."""
	if quotation.pdf_data is not None:
		return bytes(quotation.pdf_data)

	from ..shared.archive import archive_document
	from .pdf import generate_quotation_pdf

	pdf_bytes = generate_quotation_pdf(quotation)
	quotation.pdf_data = pdf_bytes
	archive_document("Quotations", quotation.created_at, f"quotation-{quotation.id}.pdf", pdf_bytes)
	db.commit()
	return pdf_bytes
