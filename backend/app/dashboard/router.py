from datetime import date, datetime, time

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..core.database import get_db
from . import schemas, service

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def _parse_date_range(from_date: str | None, to_date: str | None) -> tuple[datetime | None, datetime | None]:
	"""Same "YYYY-MM-DD" query param -> real datetime bounds conversion used
	throughout the app (items/router.py, pos/router.py, invoicing/router.py)."""
	start = datetime.combine(date.fromisoformat(from_date), time.min) if from_date else None
	end = datetime.combine(date.fromisoformat(to_date), time.max) if to_date else None
	return start, end


@router.get("/summary", response_model=schemas.DashboardSummary)
def get_dashboard_summary(from_date: str | None = None, to_date: str | None = None, db: Session = Depends(get_db)):
	start, end = _parse_date_range(from_date, to_date)
	return service.get_summary(db, start, end)


@router.get("/insights", response_model=schemas.DashboardInsights)
def get_dashboard_insights(from_date: str | None = None, to_date: str | None = None, db: Session = Depends(get_db)):
	start, end = _parse_date_range(from_date, to_date)
	return service.get_insights(db, start, end)
