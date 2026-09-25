from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from ..core.database import get_db
from ..invoicing.models import Invoice
from ..quotation.models import Quotation
from ..shared.export import to_csv_response
from . import models, schemas

router = APIRouter(prefix="/customers", tags=["customers"])


def _to_out(customer: models.Customer, balance: float) -> schemas.CustomerOut:
	return schemas.CustomerOut(
		id=customer.id,
		name=customer.name,
		phone=customer.phone,
		email=customer.email,
		address=customer.address,
		is_wholesale=customer.is_wholesale,
		created_at=customer.created_at,
		balance=balance,
	)


def _all_balances(db: Session) -> dict[int, float]:
	"""Accounts receivable per customer - sum of unpaid invoice totals,
	one aggregate query for the whole list rather than one query per row.
	Unpaid is the only status that's still owed: paid is settled, voided
	never happened (see invoicing/service.py)."""
	rows = (
		db.query(Invoice.customer_id, func.coalesce(func.sum(Invoice.total), 0))
		.filter(Invoice.status == "unpaid", Invoice.customer_id.isnot(None))
		.group_by(Invoice.customer_id)
		.all()
	)
	return {customer_id: float(total) for customer_id, total in rows}


def _balance_for(db: Session, customer_id: int) -> float:
	total = db.query(func.coalesce(func.sum(Invoice.total), 0)).filter(Invoice.status == "unpaid", Invoice.customer_id == customer_id).scalar()
	return float(total)


@router.get("", response_model=list[schemas.CustomerOut])
def list_customers(q: str | None = None, limit: int = Query(default=500, le=2000), db: Session = Depends(get_db)):
	"""Unpaginated by design for the common case (a real store's customer
	list fits comfortably in one response), but capped via `limit` so a
	picker doing live server-side search (see CustomerPicker.tsx) never
	pulls more than it can usefully show, and the endpoint stays bounded
	no matter how large the table eventually grows."""
	query = db.query(models.Customer)
	if q:
		like = f"%{q}%"
		query = query.filter(or_(models.Customer.name.ilike(like), models.Customer.phone.ilike(like)))
	customers = query.order_by(models.Customer.name).limit(limit).all()
	balances = _all_balances(db)
	return [_to_out(c, balances.get(c.id, 0.0)) for c in customers]


@router.get("/export/csv")
def export_customers_csv(db: Session = Depends(get_db)):
	"""Accounts-receivable ledger, as of right now - who owes us money and
	how much, one row per customer. Meant to hand straight to the
	accountant at month-end, not a transaction-level export."""
	customers = db.query(models.Customer).order_by(models.Customer.name).all()
	balances = _all_balances(db)
	rows = [
		{
			"Customer": c.name,
			"Phone": c.phone or "",
			"Email": c.email or "",
			"Customer Type": "Wholesale Customer" if c.is_wholesale else "Retail Customer",
			"Balance Owed (AR)": balances.get(c.id, 0.0),
		}
		for c in customers
	]
	return to_csv_response(rows, "customer_balances")


@router.post("", response_model=schemas.CustomerOut, status_code=201)
def create_customer(payload: schemas.CustomerCreate, db: Session = Depends(get_db)):
	customer = models.Customer(**payload.model_dump())
	db.add(customer)
	db.commit()
	db.refresh(customer)
	return _to_out(customer, 0.0)


@router.put("/{customer_id}", response_model=schemas.CustomerOut)
def update_customer(customer_id: int, payload: schemas.CustomerUpdate, db: Session = Depends(get_db)):
	customer = db.get(models.Customer, customer_id)
	if not customer:
		raise HTTPException(status_code=404, detail="Customer not found")
	for field, value in payload.model_dump().items():
		setattr(customer, field, value)
	db.commit()
	db.refresh(customer)
	return _to_out(customer, _balance_for(db, customer_id))


@router.delete("/{customer_id}", status_code=204)
def delete_customer(customer_id: int, db: Session = Depends(get_db)):
	"""Always allowed - any Invoice/Quotation this customer ever had
	already snapshotted customer_name-equivalent display data (their own
	line items snapshot item_name/price the same way), so detaching them
	(customer_id -> NULL) doesn't lose anything a real accounting record
	needs. The invoice/quotation itself is never touched, let alone
	deleted."""
	customer = db.get(models.Customer, customer_id)
	if not customer:
		raise HTTPException(status_code=404, detail="Customer not found")
	db.query(Invoice).filter(Invoice.customer_id == customer_id).update({"customer_id": None})
	db.query(Quotation).filter(Quotation.customer_id == customer_id).update({"customer_id": None})
	db.delete(customer)
	db.commit()
