from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ItemBase(BaseModel):
	item_name: str = Field(min_length=1)
	category: str | None = None
	uom: str = "PCS"
	barcode: str = Field(min_length=1)
	image_url: str | None = None
	cost_price: float = Field(default=0, ge=0)
	retail_price: float = Field(default=0, ge=0)
	wholesale_price: float = Field(default=0, ge=0)
	reorder_level: float = Field(default=10, ge=0)


class ItemCreate(ItemBase):
	# Initial stock qty at creation time, written into the default
	# warehouse - the only place a caller ever sets stock directly. Every
	# change after that goes through the stock-adjustment service, so
	# there's one code path for "how does stock change", not many.
	initial_stock_qty: float = Field(default=0, ge=0)


class ItemUpdate(ItemBase):
	pass


class ItemOut(ItemBase):
	model_config = ConfigDict(from_attributes=True)

	id: int
	stock_qty: float  # sum across all warehouses - populated by the router, not a DB column
	created_at: datetime
	updated_at: datetime


class StockAdjustment(BaseModel):
	"""What POS/Invoicing will call once built: negative delta for a sale,
	positive for a return or a purchase receipt."""

	delta: float
	warehouse_id: int | None = None  # defaults to the default warehouse
	reason: str | None = None
	reference: str | None = None  # e.g. a future Invoice #/PO #/Sale # this movement belongs to
	# What was actually paid per unit this time - only meaningful for a
	# purchase_receipt, but accepted generically since this is the one
	# endpoint every kind of stock change goes through.
	unit_cost: float | None = Field(default=None, ge=0)


class StockMovementOut(BaseModel):
	model_config = ConfigDict(from_attributes=True)

	id: int
	qty_before: float
	delta: float
	qty_after: float
	reason: str
	unit_cost: float | None = None
	user: str
	reference: str | None = None
	created_at: datetime


class AuditReportRow(BaseModel):
	"""One row of the Audit Report - richer than StockMovementOut since the
	cross-item report needs to show which item/warehouse each row is
	about, not just imply it from an already-known context like the
	per-item History modal does."""

	id: int
	created_at: datetime
	barcode: str
	item_name: str
	warehouse_name: str
	reason: str
	qty_before: float
	delta: float
	qty_after: float
	unit_cost: float | None = None
	user: str
	reference: str | None = None
