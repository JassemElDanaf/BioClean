from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from ..core.database import get_db
from ..shared.export import to_csv_response
from ..shared.timezone import parse_local_date_range, to_local
from . import revenue_service, schemas

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/revenue-history", response_model=list[schemas.RevenueEntryOut])
def list_revenue_history(
	response: Response,
	skip: int = 0,
	limit: int = Query(default=200, le=2000),
	from_date: str | None = None,
	to_date: str | None = None,
	db: Session = Depends(get_db),
):
	start, end = parse_local_date_range(from_date, to_date)
	entries, total = revenue_service.list_revenue_entries(db, skip=skip, limit=limit, from_date=start, to_date=end)
	response.headers["X-Total-Count"] = str(total)
	return entries


@router.get("/revenue-history/export/csv")
def export_revenue_history_csv(from_date: str | None = None, to_date: str | None = None, db: Session = Depends(get_db)):
	start, end = parse_local_date_range(from_date, to_date)
	entries, _ = revenue_service.list_revenue_entries(db, skip=0, limit=10_000, from_date=start, to_date=end)
	rows = [
		{
			"Date": to_local(entry["occurred_at"]).strftime("%Y-%m-%d %H:%M"),
			"Type": entry["type"],
			"Reference": entry["reference"],
			"Method": entry["method"],
			"Amount": entry["amount"],
			"Voided": "Yes" if entry["voided"] else "No",
			"Note": entry["label"] or "",
		}
		for entry in entries
	]
	return to_csv_response(rows, "revenue_history")
