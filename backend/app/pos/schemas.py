from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class SaleLineIn(BaseModel):
	item_id: int
	qty: float = Field(gt=0)
	# Optional - defaults to the item's current retail_price if omitted.
	# Accepted explicitly so a cashier can charge the wholesale_price or
	# apply a one-off discount without a schema change.
	unit_price: float | None = Field(default=None, ge=0)


class CheckoutRequest(BaseModel):
	lines: list[SaleLineIn] = Field(min_length=1)
	payment_method: str = "cash"
	amount_tendered: float | None = Field(default=None, ge=0)
	warehouse_id: int | None = None  # defaults to the default warehouse
	# One UUID per checkout attempt from the frontend - see Sale.
	# idempotency_key's docstring. Optional so direct API/test callers
	# aren't forced to supply one.
	idempotency_key: str | None = None


class SaleLineOut(BaseModel):
	model_config = ConfigDict(from_attributes=True)

	id: int
	item_id: int
	item_name: str
	barcode: str
	qty: float
	unit_price: float
	unit_cost: float
	line_total: float


class SaleOut(BaseModel):
	id: int
	warehouse_id: int
	subtotal: float
	tax_amount: float
	exchange_rate: float
	total: float
	payment_method: str
	amount_tendered: float | None = None
	change_due: float | None = None  # computed by the router, not a DB column
	voided: bool
	voided_at: datetime | None = None
	user: str
	created_at: datetime
	lines: list[SaleLineOut]
