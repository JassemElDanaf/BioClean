from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, LargeBinary, Numeric, String, func
from sqlalchemy.orm import relationship

from ..core.database import Base


class Sale(Base):
	"""One POS checkout - one row per completed sale. There's no draft/held-
	cart state on the backend (same "one code path" reasoning as
	adjust_stock): the frontend owns the in-progress cart, and a Sale only
	gets created once Checkout is actually pressed - see pos/service.py.

	`total` is a snapshot, not a computed property - even if an item's
	retail_price changes later, a past receipt has to keep showing what
	was actually charged that day."""

	__tablename__ = "sales"

	id = Column(Integer, primary_key=True, index=True)
	warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False)
	# The actual amount charged/collected - subtotal (sum of line_total,
	# already net of any per-line discount) plus tax_amount. change_due is
	# computed against this, not the pre-tax subtotal, since that's what a
	# cashier actually owes change against.
	total = Column(Numeric(12, 2), nullable=False)
	# Snapshotted at checkout from Settings.tax_rate (see pos/service.py) -
	# a later tax-rate change must never alter what a past receipt showed.
	tax_amount = Column(Numeric(12, 2), nullable=False, default=0)
	# USD->LBP rate in effect at checkout time, same snapshot reasoning as
	# tax_amount above - any LBP-equivalent shown for this specific sale
	# later must use THIS number, not whatever Settings.usd_to_lbp_rate has
	# moved to since.
	exchange_rate = Column(Numeric(12, 2), nullable=False, default=0)
	payment_method = Column(String, nullable=False, default="cash")
	# Only meaningful for a cash sale (lets the register show change due) -
	# left null for card/other payment methods.
	amount_tendered = Column(Numeric(12, 2), nullable=True)
	# Whole-sale void (wrong scan, cashier mistake) - reverses every line's
	# stock deduction through the same adjust_stock() path the sale used to
	# make it, via pos/service.py:void_sale(). There's no partial/line-level
	# return yet (a real future feature) - this is just the safety valve
	# for "undo the whole thing".
	voided = Column(Boolean, nullable=False, default=False)
	voided_at = Column(DateTime(timezone=True), nullable=True)
	# Single-operator system - same reasoning as StockMovement.user.
	user = Column(String, nullable=False, default="admin")
	created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
	# Cached rendered receipt PDF - same lazy-generate/invalidate-on-status-
	# change pattern as Invoice.pdf_data (see invoicing/service.py).
	pdf_data = Column(LargeBinary, nullable=True)
	# Client-generated UUID, one per checkout attempt (POSTab.tsx keeps the
	# same key across retries of the same attempt, and only mints a new one
	# once a sale actually succeeds). A double-click, a dropped response
	# that the frontend retries, or a resubmitted request after a timeout
	# all carry the same key - checkout() below treats a second request
	# with a key that already exists as "this sale already happened" and
	# hands back the original Sale instead of creating (and re-deducting
	# stock for) a second one. Nullable/unique so it's optional but never
	# ambiguous when present.
	idempotency_key = Column(String, unique=True, nullable=True, index=True)

	warehouse = relationship("Warehouse")
	lines = relationship("SaleLine", back_populates="sale", cascade="all, delete-orphan")


class SaleLine(Base):
	"""One scanned item within a Sale. item_name/barcode/unit_price are
	snapshotted at sale time (same reasoning as StockMovement.unit_cost) -
	a receipt has to keep showing exactly what was sold and charged even
	if the item is later renamed or repriced. item_id is still kept (not
	nullable) since an item with sale history can never actually be
	deleted - Item.is_safe_to_delete() already blocks that via the
	pos_sale StockMovement rows checkout() writes."""

	__tablename__ = "sale_lines"

	id = Column(Integer, primary_key=True, index=True)
	sale_id = Column(Integer, ForeignKey("sales.id"), nullable=False, index=True)
	item_id = Column(Integer, ForeignKey("items.id"), nullable=False, index=True)
	item_name = Column(String, nullable=False)
	barcode = Column(String, nullable=False)
	qty = Column(Numeric(12, 2), nullable=False)
	unit_price = Column(Numeric(12, 2), nullable=False)
	# What the item cost us at sale time - snapshotted from item.cost_price,
	# same reasoning as unit_price above. Lets profit (unit_price -
	# unit_cost) be computed from history without needing the Item row's
	# current cost, which may have moved since.
	unit_cost = Column(Numeric(12, 2), nullable=False, default=0)
	line_total = Column(Numeric(12, 2), nullable=False)

	sale = relationship("Sale", back_populates="lines")
	item = relationship("Item")
