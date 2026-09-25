"""BioClean operates out of Lebanon, but every stored timestamp (created_at
on Sale/Invoice/Quotation/PurchaseOrder/StockMovement, all via the DB's own
func.now()) is UTC. Reading `created_at.strftime(...)` directly and putting
it on a PDF, a printed receipt, or a CSV shows UTC's calendar day/time, not
Beirut's - a sale made at 1am local on the 26th is ~11pm UTC on the 25th,
so the document would print the wrong date. Route every such timestamp
through `to_local()` first.

Not used for `date`-only fields (Expense.date, Invoice.due_date, and the
like) - those are plain calendar dates a person picked (already correct,
same bug class fixed on the frontend's own isoDate()), not UTC instants,
so there's no timezone to convert."""

from datetime import date, datetime, time, timezone
from zoneinfo import ZoneInfo

BUSINESS_TZ = ZoneInfo("Asia/Beirut")


def to_local(dt: datetime) -> datetime:
	"""SQLAlchemy/psycopg hand back naive datetimes for a plain TIMESTAMP
	column even though the value is UTC - assume UTC when tzinfo is
	missing, since that's how every created_at here is actually stamped."""
	if dt.tzinfo is None:
		dt = dt.replace(tzinfo=timezone.utc)
	return dt.astimezone(BUSINESS_TZ)


def parse_local_date_range(from_date: str | None, to_date: str | None) -> tuple[datetime | None, datetime | None]:
	"""Turns "YYYY-MM-DD" query params - always a calendar date the person
	picked in their own (Beirut) local time, e.g. the frontend's "Today"
	preset - into the naive UTC bounds every created_at/paid_at/date column
	here is actually compared against.

	Every router's own hand-rolled version of this (pos/router.py,
	invoicing/router.py, income/router.py, etc.) instead does
	datetime.combine(date, time.min/max) with no timezone conversion at
	all, then filters straight against a UTC column - that's correct only
	when the server happens to run in UTC+0. Beirut is UTC+2/+3, so a sale
	made at, say, 1am local on the 26th is already stamped ~10-11pm UTC on
	the 25th; the naive version's "today" bounds would miss it (or, near
	the other edge of the day, wrongly include the next day's early sales).
	This is the one place new date-range filtering should route through -
	existing callers are left as-is to keep this change scoped to the
	unified revenue feed that motivated it."""
	start = _local_midnight_to_utc(date.fromisoformat(from_date), time.min) if from_date else None
	end = _local_midnight_to_utc(date.fromisoformat(to_date), time.max) if to_date else None
	return start, end


def _local_midnight_to_utc(day: date, clock: time) -> datetime:
	local = datetime.combine(day, clock, tzinfo=BUSINESS_TZ)
	return local.astimezone(timezone.utc).replace(tzinfo=None)
