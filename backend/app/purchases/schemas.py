from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class PurchaseOrderLineIn(BaseModel):
	item_id: int
	qty: float = Field(gt=0)
	# Optional - defaults to the item's current cost_price if omitted.
	unit_cost: float | None = Field(default=None, ge=0)


class PurchaseOrderCreate(BaseModel):
	supplier_id: int
	lines: list[PurchaseOrderLineIn] = Field(min_length=1)
	notes: str | None = None
	warehouse_id: int | None = None


class PurchaseOrderLineOut(BaseModel):
	model_config = ConfigDict(from_attributes=True)

	id: int
	item_id: int | None = None
	item_name: str
	barcode: str
	qty: float
	unit_cost: float
	line_total: float


class PurchaseOrderOut(BaseModel):
	id: int
	supplier_id: int | None = None
	supplier_name: str | None = None
	warehouse_id: int
	total: float
	status: str
	payment_status: str
	notes: str | None = None
	user: str
	created_at: datetime
	received_at: datetime | None = None
	lines: list[PurchaseOrderLineOut]
