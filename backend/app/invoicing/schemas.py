from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class InvoiceLineIn(BaseModel):
	item_id: int
	qty: float = Field(gt=0)
	# Optional - defaults to the customer's price tier (wholesale_price if
	# the customer is marked wholesale, else retail_price) if omitted.
	unit_price: float | None = Field(default=None, ge=0)


class InvoiceCreate(BaseModel):
	customer_id: int | None = None
	lines: list[InvoiceLineIn] = Field(min_length=1)
	due_date: datetime | None = None
	notes: str | None = None
	warehouse_id: int | None = None


class InvoiceLineOut(BaseModel):
	model_config = ConfigDict(from_attributes=True)

	id: int
	item_id: int
	item_name: str
	barcode: str
	qty: float
	unit_price: float
	# What the item cost us at invoice time - snapshotted the same way
	# unit_price is, so profit (unit_price - unit_cost) stays computable
	# from history even after item.cost_price later changes.
	unit_cost: float
	line_total: float


class InvoiceOut(BaseModel):
	id: int
	customer_id: int | None = None
	customer_name: str | None = None
	warehouse_id: int
	total: float
	exchange_rate: float
	status: str
	due_date: datetime | None = None
	notes: str | None = None
	user: str
	created_at: datetime
	paid_at: datetime | None = None
	voided_at: datetime | None = None
	lines: list[InvoiceLineOut]
