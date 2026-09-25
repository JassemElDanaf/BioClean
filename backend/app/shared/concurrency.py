"""One helper for a pattern that repeats across every status-transition
endpoint (mark an invoice paid, receive a PO, convert a quotation, void a
sale): fetch a row, check its current status, then mutate it. Without a
row lock, two near-simultaneous requests for the *same* transition (a
double-click, a dropped response the frontend retries, two browser tabs)
can both read the pre-mutation status before either commits, and both
proceed - e.g. two "Convert to Invoice" clicks on one quotation creating
two Invoices and deducting stock twice, even though the code has an
explicit `if quotation.status == "converted": raise` guard. The guard
alone only prevents a *second, later* request; it does nothing for two
requests that overlap in time.
"""

from typing import TypeVar

from sqlalchemy.orm import Session

T = TypeVar("T")


def lock_row(db: Session, model: type[T], id_: int) -> T | None:
	"""Acquires a row-level lock (SELECT ... FOR UPDATE) on a single row by
	primary key before a status-check-then-mutate sequence. On Postgres
	(production), a second transaction's FOR UPDATE on the same row blocks
	until the first commits or rolls back - the two requests are
	serialized, and the second one then sees the already-updated status
	and takes its own guard's 409 path instead of repeating the mutation.
	SQLite (this project's test DB) doesn't support row locking, so this
	is a harmless plain read there - fine, since a single-threaded test
	run can't actually produce the race this guards against.

	Deliberately a bare, unloaded lookup - combining FOR UPDATE with a
	joinedload across a one-to-many relationship (e.g. Invoice.lines)
	isn't valid on Postgres (a locked row can't sit on the nullable side
	of an outer join). Call this first to take the lock, then run whatever
	normal (unlocked) query the caller needs for its actual eager-loads -
	SQLAlchemy's identity map returns the same, now-locked instance
	either way, so the second query's loads land on the locked row."""
	return db.query(model).filter(model.id == id_).with_for_update().first()
