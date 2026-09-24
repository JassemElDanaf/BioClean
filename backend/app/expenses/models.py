from sqlalchemy import Column, DateTime, Integer, Numeric, String, func

from ..core.database import Base


class Expense(Base):
	"""A manual bookkeeping ledger - unlike Purchases (which moves stock)
	this never touches inventory at all, it's purely "money went out".
	`date` is when the expense actually happened (rent for last month,
	entered today) - kept separate from `created_at` (when the record was
	typed in), same distinction Invoice.due_date makes from created_at."""

	__tablename__ = "expenses"

	id = Column(Integer, primary_key=True, index=True)
	category = Column(String, nullable=False, index=True)
	amount = Column(Numeric(12, 2), nullable=False)
	description = Column(String, nullable=True)
	date = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
	reference = Column(String, nullable=True)
	user = Column(String, nullable=False, default="admin")
	created_at = Column(DateTime(timezone=True), server_default=func.now())
