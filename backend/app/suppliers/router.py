from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..core.database import get_db
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
