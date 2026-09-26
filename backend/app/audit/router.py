from datetime import date, datetime, time

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..core.auth import get_current_user
from ..core.config import settings
from ..core.database import get_db
from ..shared.export import to_csv_response
from ..shared.timezone import to_local
from . import service
from .schemas import AuditLogRow

router = APIRouter(prefix="/audit", tags=["audit"])

EXPORT_COLUMNS = ["Date", "User", "Method", "Path", "Status"]


def _parse_date_range(from_date: str | None, to_date: str | None) -> tuple[datetime | None, datetime | None]:
	start = datetime.combine(date.fromisoformat(from_date), time.min) if from_date else None
	end = datetime.combine(date.fromisoformat(to_date), time.max) if to_date else None
	return start, end


def _export_row(entry) -> dict:
	values = [
		to_local(entry.created_at).strftime("%Y-%m-%d %H:%M"),
		entry.user,
		entry.method,
		entry.path,
		entry.status_code,
	]
	return dict(zip(EXPORT_COLUMNS, values))


@router.get("/me")
def whoami():
	"""Tells the frontend who's logged in (name + role) so the sidebar can
	show the real signed-in user instead of a hardcoded "Admin" - reads the
	username the auth middleware already resolved for this request."""
	username = get_current_user()
	role = settings.users.get(username, (None, "User"))[1]
	return {"username": username, "role": role}


@router.get("/log", response_model=list[AuditLogRow])
def audit_log(
	from_date: str | None = None,
	to_date: str | None = None,
	user: str | None = None,
	method: str | None = None,
	db: Session = Depends(get_db),
):
	start, end = _parse_date_range(from_date, to_date)
	return service.query_audit_log(db, start, end, user, method)


@router.get("/log/export/csv")
def audit_log_export_csv(
	from_date: str | None = None,
	to_date: str | None = None,
	user: str | None = None,
	method: str | None = None,
	db: Session = Depends(get_db),
):
	start, end = _parse_date_range(from_date, to_date)
	entries = service.query_audit_log(db, start, end, user, method)
	return to_csv_response([_export_row(e) for e in entries], "activity_log")
