from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class IncomeBase(BaseModel):
	source: str = Field(min_length=1)
	amount: float = Field(gt=0)
	description: str | None = None
	date: datetime | None = None
	reference: str | None = None


class IncomeCreate(IncomeBase):
	pass


class IncomeUpdate(IncomeBase):
	pass


class IncomeOut(IncomeBase):
	model_config = ConfigDict(from_attributes=True)

	id: int
	date: datetime
	user: str
	created_at: datetime
