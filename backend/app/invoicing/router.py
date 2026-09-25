from datetime import date, datetime, time

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session, joinedload

from ..core.database import get_db
from ..shared.concurrency import lock_row
from ..shared.export import to_csv_response
from ..shared.timezone import to_local
from . import models, schemas, service

router = APIRouter(prefix="/invoices", tags=["invoicing"])

EXPORT_COLUMNS = ["Invoice #", "Date", "Customer", "Item", "Barcode", "Qty", "Unit Price", "Line Total", "Status"]


def _to_out(invoice: models.Invoice) -> schemas.InvoiceOut:
	return schemas.InvoiceOut(
		id=invoice.id,
		customer_id=invoice.customer_id,
		customer_name=invoice.customer_name,
		warehouse_id=invoice.warehouse_id,
		total=invoice.total,
		exchange_rate=invoice.exchange_rate,
		status=invoice.status,
		due_date=invoice.due_date,
		notes=invoice.notes,
		user=invoice.user,
		created_at=invoice.created_at,
		paid_at=invoice.paid_at,
		voided_at=invoice.voided_at,
		lines=[schemas.InvoiceLineOut.model_validate(line) for line in invoice.lines],
	)


def _parse_date_range(from_date: str | None, to_date: str | None) -> tuple[datetime | None, datetime | None]:
	start = datetime.combine(date.fromisoformat(from_date), time.min) if from_date else None
	end = datetime.combine(date.fromisoformat(to_date), time.max) if to_date else None
	return start, end


@router.post("", response_model=schemas.InvoiceOut, status_code=201)
def create_invoice(payload: schemas.InvoiceCreate, db: Session = Depends(get_db)):
	invoice = service.create_invoice(
		db,
		customer_id=payload.customer_id,
		lines=[line.model_dump() for line in payload.lines],
		due_date=payload.due_date,
		notes=payload.notes,
		warehouse_id=payload.warehouse_id,
	)
	return _to_out(invoice)


@router.get("", response_model=list[schemas.InvoiceOut])
def list_invoices(
	response: Response,
	skip: int = 0,
	limit: int = Query(default=100, le=1000),
	from_date: str | None = None,
	to_date: str | None = None,
	status: str | None = None,
	customer_id: int | None = None,
	db: Session = Depends(get_db),
):
	start, end = _parse_date_range(from_date, to_date)
	invoices, total = service.list_invoices(db, skip=skip, limit=limit, from_date=start, to_date=end, status=status, customer_id=customer_id)
	response.headers["X-Total-Count"] = str(total)
	return [_to_out(inv) for inv in invoices]


@router.get("/export/csv")
def export_invoices_csv(from_date: str | None = None, to_date: str | None = None, db: Session = Depends(get_db)):
	start, end = _parse_date_range(from_date, to_date)
	invoices, _ = service.list_invoices(db, skip=0, limit=10_000, from_date=start, to_date=end)
	rows = [
		{
			"Invoice #": inv.id,
			"Date": to_local(inv.created_at).strftime("%Y-%m-%d %H:%M"),
			"Customer": inv.customer_name or "",
			"Item": line.item_name,
			"Barcode": line.barcode,
			"Qty": line.qty,
			"Unit Price": line.unit_price,
			"Line Total": line.line_total,
			"Status": inv.status,
		}
		for inv in invoices
		for line in inv.lines
	]
	return to_csv_response(rows, "invoices")


@router.get("/{invoice_id}", response_model=schemas.InvoiceOut)
def get_invoice(invoice_id: int, db: Session = Depends(get_db)):
	invoice = db.query(models.Invoice).options(joinedload(models.Invoice.lines), joinedload(models.Invoice.customer)).filter(models.Invoice.id == invoice_id).first()
	if not invoice:
		raise HTTPException(status_code=404, detail="Invoice not found")
	return _to_out(invoice)


@router.get("/{invoice_id}/pdf")
def get_invoice_pdf(invoice_id: int, db: Session = Depends(get_db)):
	invoice = db.query(models.Invoice).options(joinedload(models.Invoice.lines), joinedload(models.Invoice.customer)).filter(models.Invoice.id == invoice_id).first()
	if not invoice:
		raise HTTPException(status_code=404, detail="Invoice not found")
	pdf_bytes = service.get_invoice_pdf(db, invoice)
	return Response(
		content=pdf_bytes,
		media_type="application/pdf",
		headers={"Content-Disposition": f'inline; filename="invoice-{invoice.id}.pdf"'},
	)


@router.post("/{invoice_id}/mark-paid", response_model=schemas.InvoiceOut)
def mark_invoice_paid(invoice_id: int, db: Session = Depends(get_db)):
	if not lock_row(db, models.Invoice, invoice_id):
		raise HTTPException(status_code=404, detail="Invoice not found")
	invoice = db.query(models.Invoice).options(joinedload(models.Invoice.lines), joinedload(models.Invoice.customer)).filter(models.Invoice.id == invoice_id).first()
	invoice = service.mark_paid(db, invoice)
	return _to_out(invoice)


@router.post("/{invoice_id}/void", response_model=schemas.InvoiceOut)
def void_invoice(invoice_id: int, db: Session = Depends(get_db)):
	if not lock_row(db, models.Invoice, invoice_id):
		raise HTTPException(status_code=404, detail="Invoice not found")
	invoice = db.query(models.Invoice).options(joinedload(models.Invoice.lines), joinedload(models.Invoice.customer)).filter(models.Invoice.id == invoice_id).first()
	invoice = service.void_invoice(db, invoice)
	return _to_out(invoice)
