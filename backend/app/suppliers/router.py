from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..core.database import get_db
from ..purchases.models import PurchaseOrder
from . import models, schemas

router = APIRouter(prefix="/suppliers", tags=["suppliers"])


@router.get("", response_model=list[schemas.SupplierOut])
def list_suppliers(db: Session = Depends(get_db)):
	return db.query(models.Supplier).order_by(models.Supplier.name).all()


@router.post("", response_model=schemas.SupplierOut, status_code=201)
def create_supplier(payload: schemas.SupplierCreate, db: Session = Depends(get_db)):
	if db.query(models.Supplier).filter(models.Supplier.name == payload.name).first():
		raise HTTPException(status_code=409, detail=f"Supplier '{payload.name}' already exists")
	supplier = models.Supplier(**payload.model_dump())
	db.add(supplier)
	db.commit()
	db.refresh(supplier)
	return supplier


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
	return supplier


@router.delete("/{supplier_id}", status_code=204)
def delete_supplier(supplier_id: int, db: Session = Depends(get_db)):
	supplier = db.get(models.Supplier, supplier_id)
	if not supplier:
		raise HTTPException(status_code=404, detail="Supplier not found")
	in_use = db.query(PurchaseOrder).filter(PurchaseOrder.supplier_id == supplier_id).first()
	if in_use:
		raise HTTPException(
			status_code=409,
			detail=f"'{supplier.name}' has purchase order history and can't be deleted.",
		)
	db.delete(supplier)
	db.commit()
