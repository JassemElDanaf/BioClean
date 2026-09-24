from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ExpenseBase(BaseModel):
	category: str = Field(min_length=1)
	amount: float = Field(gt=0)
	description: str | None = None
	date: datetime | None = None
	reference: str | None = None


class ExpenseCreate(ExpenseBase):
	pass


class ExpenseUpdate(ExpenseBase):
	pass


class ExpenseOut(ExpenseBase):
	model_config = ConfigDict(from_attributes=True)

	id: int
	date: datetime
	user: str
	created_at: datetime
