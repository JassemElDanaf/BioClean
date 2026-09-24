from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..core.database import get_db
from ..invoicing.models import Invoice
from ..quotation.models import Quotation
from . import models, schemas

router = APIRouter(prefix="/customers", tags=["customers"])


@router.get("", response_model=list[schemas.CustomerOut])
def list_customers(q: str | None = None, db: Session = Depends(get_db)):
	query = db.query(models.Customer)
	if q:
		like = f"%{q}%"
		query = query.filter(or_(models.Customer.name.ilike(like), models.Customer.phone.ilike(like)))
	return query.order_by(models.Customer.name).all()


@router.post("", response_model=schemas.CustomerOut, status_code=201)
def create_customer(payload: schemas.CustomerCreate, db: Session = Depends(get_db)):
	customer = models.Customer(**payload.model_dump())
	db.add(customer)
	db.commit()
	db.refresh(customer)
	return customer


@router.put("/{customer_id}", response_model=schemas.CustomerOut)
def update_customer(customer_id: int, payload: schemas.CustomerUpdate, db: Session = Depends(get_db)):
	customer = db.get(models.Customer, customer_id)
	if not customer:
		raise HTTPException(status_code=404, detail="Customer not found")
	for field, value in payload.model_dump().items():
		setattr(customer, field, value)
	db.commit()
	db.refresh(customer)
	return customer


@router.delete("/{customer_id}", status_code=204)
def delete_customer(customer_id: int, db: Session = Depends(get_db)):
	customer = db.get(models.Customer, customer_id)
	if not customer:
		raise HTTPException(status_code=404, detail="Customer not found")
	has_invoice = db.query(Invoice).filter(Invoice.customer_id == customer_id).first()
	has_quotation = db.query(Quotation).filter(Quotation.customer_id == customer_id).first()
	if has_invoice or has_quotation:
		raise HTTPException(
			status_code=409,
			detail=f"'{customer.name}' has invoice or quotation history and can't be deleted.",
		)
	db.delete(customer)
	db.commit()
