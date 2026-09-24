from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session, joinedload

from ..core.database import get_db
from ..invoicing.router import _to_out as _invoice_to_out
from ..invoicing.schemas import InvoiceOut
from . import models, schemas, service

router = APIRouter(prefix="/quotations", tags=["quotation"])


def _to_out(quotation: models.Quotation) -> schemas.QuotationOut:
	return schemas.QuotationOut(
		id=quotation.id,
		customer_id=quotation.customer_id,
		customer_name=quotation.customer.name if quotation.customer else None,
		total=quotation.total,
		status=quotation.status,
		valid_until=quotation.valid_until,
		notes=quotation.notes,
		user=quotation.user,
		created_at=quotation.created_at,
		converted_invoice_id=quotation.converted_invoice_id,
		lines=[schemas.QuotationLineOut.model_validate(line) for line in quotation.lines],
	)


@router.post("", response_model=schemas.QuotationOut, status_code=201)
def create_quotation(payload: schemas.QuotationCreate, db: Session = Depends(get_db)):
	quotation = service.create_quotation(
		db,
		customer_id=payload.customer_id,
		lines=[line.model_dump() for line in payload.lines],
		valid_until=payload.valid_until,
		notes=payload.notes,
	)
	return _to_out(quotation)


@router.get("", response_model=list[schemas.QuotationOut])
def list_quotations(
	response: Response,
	skip: int = 0,
	limit: int = Query(default=100, le=1000),
	status: str | None = None,
	customer_id: int | None = None,
	db: Session = Depends(get_db),
):
	quotations, total = service.list_quotations(db, skip=skip, limit=limit, status=status, customer_id=customer_id)
	response.headers["X-Total-Count"] = str(total)
	return [_to_out(q) for q in quotations]


@router.get("/{quotation_id}", response_model=schemas.QuotationOut)
def get_quotation(quotation_id: int, db: Session = Depends(get_db)):
	quotation = db.query(models.Quotation).options(joinedload(models.Quotation.lines), joinedload(models.Quotation.customer)).filter(models.Quotation.id == quotation_id).first()
	if not quotation:
		raise HTTPException(status_code=404, detail="Quotation not found")
	return _to_out(quotation)


@router.get("/{quotation_id}/pdf")
def get_quotation_pdf(quotation_id: int, db: Session = Depends(get_db)):
	quotation = db.query(models.Quotation).options(joinedload(models.Quotation.lines), joinedload(models.Quotation.customer)).filter(models.Quotation.id == quotation_id).first()
	if not quotation:
		raise HTTPException(status_code=404, detail="Quotation not found")
	pdf_bytes = service.get_quotation_pdf(db, quotation)
	return Response(
		content=pdf_bytes,
		media_type="application/pdf",
		headers={"Content-Disposition": f'inline; filename="quotation-{quotation.id}.pdf"'},
	)


@router.delete("/{quotation_id}", status_code=204)
def delete_quotation(quotation_id: int, db: Session = Depends(get_db)):
	quotation = db.get(models.Quotation, quotation_id)
	if not quotation:
		raise HTTPException(status_code=404, detail="Quotation not found")
	service.delete_quotation(db, quotation)


@router.post("/{quotation_id}/convert", response_model=InvoiceOut)
def convert_quotation(quotation_id: int, db: Session = Depends(get_db)):
	quotation = db.query(models.Quotation).options(joinedload(models.Quotation.lines), joinedload(models.Quotation.customer)).filter(models.Quotation.id == quotation_id).first()
	if not quotation:
		raise HTTPException(status_code=404, detail="Quotation not found")
	invoice = service.convert_to_invoice(db, quotation)
	return _invoice_to_out(invoice)
