from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..core.database import get_db
from ..purchases.models import PurchaseOrder
from ..shared.export import to_csv_response
from . import models, schemas

router = APIRouter(prefix="/suppliers", tags=["suppliers"])


def _to_out(supplier: models.Supplier, balance: float) -> schemas.SupplierOut:
	return schemas.SupplierOut(id=supplier.id, name=supplier.name, phone=supplier.phone, email=supplier.email, balance=balance)


def _all_balances(db: Session) -> dict[int, float]:
	"""Accounts payable per supplier - sum of received-but-unpaid PO
	totals. A pending order hasn't been received yet (nothing owed), and a
	cancelled one never will be (see PurchaseOrder.payment_status's
	docstring)."""
	rows = (
		db.query(PurchaseOrder.supplier_id, func.coalesce(func.sum(PurchaseOrder.total), 0))
		.filter(PurchaseOrder.status == "received", PurchaseOrder.payment_status == "unpaid")
		.group_by(PurchaseOrder.supplier_id)
		.all()
	)
	return {supplier_id: float(total) for supplier_id, total in rows}


def _balance_for(db: Session, supplier_id: int) -> float:
	total = (
		db.query(func.coalesce(func.sum(PurchaseOrder.total), 0))
		.filter(PurchaseOrder.status == "received", PurchaseOrder.payment_status == "unpaid", PurchaseOrder.supplier_id == supplier_id)
		.scalar()
	)
	return float(total)


@router.get("", response_model=list[schemas.SupplierOut])
def list_suppliers(db: Session = Depends(get_db)):
	suppliers = db.query(models.Supplier).order_by(models.Supplier.name).all()
	balances = _all_balances(db)
	return [_to_out(s, balances.get(s.id, 0.0)) for s in suppliers]


@router.get("/export/csv")
def export_suppliers_csv(db: Session = Depends(get_db)):
	"""Accounts-payable ledger, as of right now - who we owe money to and
	how much, one row per supplier. Meant to hand straight to the
	accountant at month-end, not a transaction-level export."""
	suppliers = db.query(models.Supplier).order_by(models.Supplier.name).all()
	balances = _all_balances(db)
	rows = [
		{
			"Supplier": s.name,
			"Phone": s.phone or "",
			"Email": s.email or "",
			"Balance Owed (AP)": balances.get(s.id, 0.0),
		}
		for s in suppliers
	]
	return to_csv_response(rows, "supplier_balances")


@router.post("", response_model=schemas.SupplierOut, status_code=201)
def create_supplier(payload: schemas.SupplierCreate, db: Session = Depends(get_db)):
	if db.query(models.Supplier).filter(models.Supplier.name == payload.name).first():
		raise HTTPException(status_code=409, detail=f"Supplier '{payload.name}' already exists")
	supplier = models.Supplier(**payload.model_dump())
	db.add(supplier)
	db.commit()
	db.refresh(supplier)
	return _to_out(supplier, 0.0)


@router.put("/{supplier_id}", response_model=schemas.SupplierOut)
def update_supplier(supplier_id: int, payload: schemas.SupplierUpdate, db: Session = Depends(get_db)):
	supplier = db.get(models.Supplier, supplier_id)
	if not supplier:
		raise HTTPException(status_code=404, detail="Supplier not found")
	if payload.name != supplier.name:
		existing = db.query(models.Supplier).filter(models.Supplier.name == payload.name).first()
		if existing and existing.id != supplier_id:
			raise HTTPException(status_code=409, detail=f"Supplier '{payload.name}' already exists")
	for field, value in payload.model_dump().items():
		setattr(supplier, field, value)
	db.commit()
	db.refresh(supplier)
	return _to_out(supplier, _balance_for(db, supplier_id))


@router.delete("/{supplier_id}", status_code=204)
def delete_supplier(supplier_id: int, db: Session = Depends(get_db)):
	"""Always allowed - any PurchaseOrder this supplier ever had already
	snapshotted supplier_name at creation time, so detaching them
	(supplier_id -> NULL) doesn't lose anything a real accounting record
	needs. The purchase order itself is never touched, let alone deleted."""
	supplier = db.get(models.Supplier, supplier_id)
	if not supplier:
		raise HTTPException(status_code=404, detail="Supplier not found")
	db.query(PurchaseOrder).filter(PurchaseOrder.supplier_id == supplier_id).update({"supplier_id": None})
	db.delete(supplier)
	db.commit()
