from datetime import datetime

from pydantic import BaseModel


class RevenueEntryOut(BaseModel):
	"""One row of money coming in, from whichever source produced it - see
	revenue_service.py for what "type" can be and how each is dated."""

	type: str
	id: int
	reference: str
	occurred_at: datetime
	method: str
	amount: float
	voided: bool
	label: str | None = None
