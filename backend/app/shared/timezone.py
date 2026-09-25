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

from datetime import datetime, timezone
from zoneinfo import ZoneInfo

BUSINESS_TZ = ZoneInfo("Asia/Beirut")


def to_local(dt: datetime) -> datetime:
	"""SQLAlchemy/psycopg hand back naive datetimes for a plain TIMESTAMP
	column even though the value is UTC - assume UTC when tzinfo is
	missing, since that's how every created_at here is actually stamped."""
	if dt.tzinfo is None:
		dt = dt.replace(tzinfo=timezone.utc)
	return dt.astimezone(BUSINESS_TZ)
