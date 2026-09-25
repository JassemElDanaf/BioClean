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


class CategoryRename(BaseModel):
	"""Renames a category across every expense that currently has it (or
	merges it into an existing one, which is the same "set category = X
	where category = Y" update either way - see items/schemas.py's
	CategoryRename for the full reasoning). Unlike Item.category, this one
	can't be blanked out - Expense.category is required - so merging into
	an existing category is the only way to retire one here."""

	new_category: str = Field(min_length=1)


class ExpenseUpdate(ExpenseBase):
	pass


class ExpenseOut(ExpenseBase):
	model_config = ConfigDict(from_attributes=True)

	id: int
	date: datetime
	user: str
	created_at: datetime
