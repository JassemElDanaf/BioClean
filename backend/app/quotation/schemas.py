from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class QuotationLineIn(BaseModel):
	item_id: int
	qty: float = Field(gt=0)
	unit_price: float | None = Field(default=None, ge=0)


class QuotationCreate(BaseModel):
	customer_id: int | None = None
	lines: list[QuotationLineIn] = Field(min_length=1)
	valid_until: datetime | None = None
	notes: str | None = None


class QuotationLineOut(BaseModel):
	model_config = ConfigDict(from_attributes=True)

	id: int
	item_id: int | None = None
	item_name: str
	barcode: str
	qty: float
	unit_price: float
	line_total: float


class QuotationOut(BaseModel):
	id: int
	customer_id: int | None = None
	customer_name: str | None = None
	total: float
	status: str
	valid_until: datetime | None = None
	notes: str | None = None
	user: str
	created_at: datetime
	converted_invoice_id: int | None = None
	lines: list[QuotationLineOut]
