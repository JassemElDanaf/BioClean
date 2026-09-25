from datetime import date, datetime, time

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session

from ..core.database import get_db
from ..shared.export import to_csv_response
from . import models, schemas

router = APIRouter(prefix="/expenses", tags=["expenses"])

EXPORT_COLUMNS = ["Date", "Category", "Amount", "Description", "Reference"]


def _parse_date_range(from_date: str | None, to_date: str | None) -> tuple[datetime | None, datetime | None]:
	start = datetime.combine(date.fromisoformat(from_date), time.min) if from_date else None
	end = datetime.combine(date.fromisoformat(to_date), time.max) if to_date else None
	return start, end


def _query(db: Session, from_date: str | None, to_date: str | None, category: str | None):
	start, end = _parse_date_range(from_date, to_date)
	query = db.query(models.Expense)
	if start:
		query = query.filter(models.Expense.date >= start)
	if end:
		query = query.filter(models.Expense.date <= end)
	if category:
		query = query.filter(models.Expense.category == category)
	return query.order_by(models.Expense.date.desc())


@router.get("", response_model=list[schemas.ExpenseOut])
def list_expenses(
	response: Response,
	skip: int = 0,
	limit: int = Query(default=200, le=2000),
	from_date: str | None = None,
	to_date: str | None = None,
	category: str | None = None,
	db: Session = Depends(get_db),
):
	query = _query(db, from_date, to_date, category)
	total = query.count()
	response.headers["X-Total-Count"] = str(total)
	return query.offset(skip).limit(limit).all()


@router.get("/export/csv")
def export_expenses_csv(from_date: str | None = None, to_date: str | None = None, category: str | None = None, db: Session = Depends(get_db)):
	expenses = _query(db, from_date, to_date, category).all()
	rows = [
		{
			"Date": e.date.strftime("%Y-%m-%d"),
			"Category": e.category,
			"Amount": e.amount,
			"Description": e.description or "",
			"Reference": e.reference or "",
		}
		for e in expenses
	]
	return to_csv_response(rows, "expenses")


@router.post("", response_model=schemas.ExpenseOut, status_code=201)
def create_expense(payload: schemas.ExpenseCreate, db: Session = Depends(get_db)):
	data = payload.model_dump()
	if data["date"] is None:
		data.pop("date")
	expense = models.Expense(**data)
	db.add(expense)
	db.commit()
	db.refresh(expense)
	return expense


@router.put("/categories/{old_category}")
def rename_category(old_category: str, payload: schemas.CategoryRename, db: Session = Depends(get_db)):
	"""See items/router.py's rename_category() for the full reasoning -
	categories aren't a stored list, just whatever value is currently on
	Expense.category, so renaming and merging are the same reassignment.
	Unlike items, this can't clear a category to blank (Expense.category
	is required - see CategoryRename's own docstring)."""
	updated = db.query(models.Expense).filter(models.Expense.category == old_category).update({"category": payload.new_category.strip()})
	db.commit()
	return {"updated": updated}


@router.put("/{expense_id}", response_model=schemas.ExpenseOut)
def update_expense(expense_id: int, payload: schemas.ExpenseUpdate, db: Session = Depends(get_db)):
	expense = db.get(models.Expense, expense_id)
	if not expense:
		raise HTTPException(status_code=404, detail="Expense not found")
	data = payload.model_dump()
	if data["date"] is None:
		data.pop("date")
	for field, value in data.items():
		setattr(expense, field, value)
	db.commit()
	db.refresh(expense)
	return expense


@router.delete("/{expense_id}", status_code=204)
def delete_expense(expense_id: int, db: Session = Depends(get_db)):
	expense = db.get(models.Expense, expense_id)
	if not expense:
		raise HTTPException(status_code=404, detail="Expense not found")
	db.delete(expense)
	db.commit()
