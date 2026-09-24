from datetime import date, datetime, time

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session

from ..core.database import get_db
from ..shared.export import to_csv_response
from . import models, schemas

router = APIRouter(prefix="/income", tags=["income"])


def _parse_date_range(from_date: str | None, to_date: str | None) -> tuple[datetime | None, datetime | None]:
	start = datetime.combine(date.fromisoformat(from_date), time.min) if from_date else None
	end = datetime.combine(date.fromisoformat(to_date), time.max) if to_date else None
	return start, end


def _query(db: Session, from_date: str | None, to_date: str | None, source: str | None):
	start, end = _parse_date_range(from_date, to_date)
	query = db.query(models.Income)
	if start:
		query = query.filter(models.Income.date >= start)
	if end:
		query = query.filter(models.Income.date <= end)
	if source:
		query = query.filter(models.Income.source == source)
	return query.order_by(models.Income.date.desc())


@router.get("", response_model=list[schemas.IncomeOut])
def list_income(
	response: Response,
	skip: int = 0,
	limit: int = Query(default=200, le=2000),
	from_date: str | None = None,
	to_date: str | None = None,
	source: str | None = None,
	db: Session = Depends(get_db),
):
	query = _query(db, from_date, to_date, source)
	total = query.count()
	response.headers["X-Total-Count"] = str(total)
	return query.offset(skip).limit(limit).all()


@router.get("/export/csv")
def export_income_csv(from_date: str | None = None, to_date: str | None = None, source: str | None = None, db: Session = Depends(get_db)):
	entries = _query(db, from_date, to_date, source).all()
	rows = [
		{
			"Date": e.date.strftime("%Y-%m-%d"),
			"Source": e.source,
			"Amount": e.amount,
			"Description": e.description or "",
			"Reference": e.reference or "",
		}
		for e in entries
	]
	return to_csv_response(rows, "income")


@router.post("", response_model=schemas.IncomeOut, status_code=201)
def create_income(payload: schemas.IncomeCreate, db: Session = Depends(get_db)):
	data = payload.model_dump()
	if data["date"] is None:
		data.pop("date")
	entry = models.Income(**data)
	db.add(entry)
	db.commit()
	db.refresh(entry)
	return entry


@router.put("/{income_id}", response_model=schemas.IncomeOut)
def update_income(income_id: int, payload: schemas.IncomeUpdate, db: Session = Depends(get_db)):
	entry = db.get(models.Income, income_id)
	if not entry:
		raise HTTPException(status_code=404, detail="Income entry not found")
	data = payload.model_dump()
	if data["date"] is None:
		data.pop("date")
	for field, value in data.items():
		setattr(entry, field, value)
	db.commit()
	db.refresh(entry)
	return entry


@router.delete("/{income_id}", status_code=204)
def delete_income(income_id: int, db: Session = Depends(get_db)):
	entry = db.get(models.Income, income_id)
	if not entry:
		raise HTTPException(status_code=404, detail="Income entry not found")
	db.delete(entry)
	db.commit()
