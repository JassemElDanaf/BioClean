from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class CustomerBase(BaseModel):
	name: str = Field(min_length=1)
	phone: str | None = None
	email: str | None = None
	address: str | None = None
	is_wholesale: bool = False


class CustomerCreate(CustomerBase):
	pass


class CustomerUpdate(CustomerBase):
	pass


class CustomerOut(CustomerBase):
	model_config = ConfigDict(from_attributes=True)

	id: int
	created_at: datetime
	# Accounts receivable - sum of this customer's unpaid invoice totals.
	# Computed, never stored (see customers/router.py) so it can never drift
	# from what Invoicing actually shows.
	balance: float = 0.0
