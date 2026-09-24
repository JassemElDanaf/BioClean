from sqlalchemy import Column, DateTime, Integer, Numeric, String, func

from ..core.database import Base


class Income(Base):
	"""Manual ledger for revenue that doesn't already flow through POS
	Sales or paid Invoices (interest, a refund received, anything one-off)
	- those two already represent the bulk of real revenue automatically,
	this is just the catch-all for what they don't cover."""

	__tablename__ = "income_entries"

	id = Column(Integer, primary_key=True, index=True)
	source = Column(String, nullable=False, index=True)
	amount = Column(Numeric(12, 2), nullable=False)
	description = Column(String, nullable=True)
	date = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
	reference = Column(String, nullable=True)
	user = Column(String, nullable=False, default="admin")
	created_at = Column(DateTime(timezone=True), server_default=func.now())
