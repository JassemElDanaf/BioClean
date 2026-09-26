from sqlalchemy import Column, DateTime, Integer, String, func

from ..core.database import Base


class AuditLog(Base):
	"""One row per state-changing request (every POST/PUT/PATCH/DELETE that
	reaches the API - see main.py's audit middleware, the only writer of
	this table). Deliberately generic (method/path/status rather than a
	per-domain schema) so every module's actions land here automatically
	as new ones are added, with no per-feature wiring to remember. Stock
	movements keep their own richer ledger (items/models.py:StockMovement,
	behind the existing Inventory Audit Report) since qty before/after
	needs its own shape; this table is the catch-all covering everything
	else - POS sales, purchase orders, invoices, quotations, customers,
	expenses, income, settings changes, item edits, etc."""

	__tablename__ = "audit_log"

	id = Column(Integer, primary_key=True, index=True)
	created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
	user = Column(String, nullable=False, index=True)
	method = Column(String, nullable=False)
	# e.g. "/api/v1/purchases/8/receive" - the frontend resolves this back
	# into a human label (see frontend AuditLog page's ACTION_LABELS).
	path = Column(String, nullable=False)
	status_code = Column(Integer, nullable=False)
