from sqlalchemy import (
	Column,
	DateTime,
	ForeignKey,
	Integer,
	Numeric,
	String,
	UniqueConstraint,
	func,
)
from sqlalchemy.orm import relationship

from ..core.database import Base


class Item(Base):
	__tablename__ = "items"

	id = Column(Integer, primary_key=True, index=True)
	item_name = Column(String, nullable=False)
	category = Column(String, nullable=True, index=True)
	uom = Column(String, nullable=False, default="PCS")
	# Physical shelf/aisle position - items get physically placed on
	# numbered shelves in-store, separate from any digital category.
	shelf_location = Column(String, nullable=True)
	# The sole identifier - what's scanned or typed to find an item.
	# There used to be a separate "item code" alongside this; merged into
	# one field (confirmed decision) since keeping two overlapping unique
	# identifiers was just confusion for a single-location store.
	barcode = Column(String, unique=True, nullable=False, index=True)
	# Placeholder until real product photos exist - stores a URL/path once
	# images are uploaded; the frontend shows a generic icon while empty.
	image_url = Column(String, nullable=True)
	# The most recent purchase cost - what the supplier is charging *now*.
	# History of what it used to cost lives in StockMovement.unit_cost on
	# each purchase_receipt row, not here - this is deliberately just the
	# current number, not a ledger.
	cost_price = Column(Numeric(12, 2), nullable=False, default=0)
	retail_price = Column(Numeric(12, 2), nullable=False, default=0)
	wholesale_price = Column(Numeric(12, 2), nullable=False, default=0)
	reorder_level = Column(Numeric(12, 2), nullable=False, default=10)
	supplier_id = Column(Integer, ForeignKey("suppliers.id"), nullable=True)
	created_at = Column(DateTime(timezone=True), server_default=func.now())
	updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

	supplier = relationship("Supplier")
	stock_levels = relationship("ItemStock", back_populates="item", cascade="all, delete-orphan")
	# Deleting an item is only allowed (see service.is_safe_to_delete) when
	# it has no real movement history and no stock on hand - this cascade
	# is what lets the one harmless initial-stock row go with it instead of
	# blocking the delete with a foreign key violation.
	movements = relationship("StockMovement", back_populates="item", cascade="all, delete-orphan")


class ItemStock(Base):
	"""Per-warehouse quantity on hand. Kept separate from Item itself so a
	second warehouse/location later is a new row here, not a schema change -
	the same pattern ERPNext (Bin) and Odoo (stock.quant) both use. Only
	one warehouse exists today (confirmed: nothing more), but this doesn't
	cost anything extra for that - it's just one row."""

	__tablename__ = "item_stock"
	__table_args__ = (UniqueConstraint("item_id", "warehouse_id", name="uq_item_warehouse"),)

	id = Column(Integer, primary_key=True, index=True)
	item_id = Column(Integer, ForeignKey("items.id"), nullable=False)
	warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False)
	qty = Column(Numeric(12, 2), nullable=False, default=0)

	item = relationship("Item", back_populates="stock_levels")
	warehouse = relationship("Warehouse")


class StockMovement(Base):
	"""Append-only ledger of every stock change - every adjust_stock() call
	writes one of these. Without this, a quantity that looks wrong has no
	way to explain itself (was it a sale, a correction, a bad count?);
	with it, every number on the shelf is traceable to a real event."""

	__tablename__ = "stock_movements"

	id = Column(Integer, primary_key=True, index=True)
	item_id = Column(Integer, ForeignKey("items.id"), nullable=False, index=True)
	warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False)
	qty_before = Column(Numeric(12, 2), nullable=False)
	delta = Column(Numeric(12, 2), nullable=False)
	qty_after = Column(Numeric(12, 2), nullable=False)
	reason = Column(String, nullable=False, default="manual")
	# What was actually paid per unit for this specific receipt - this is
	# the real fix for "if the supplier raises prices, is that audited":
	# each purchase_receipt movement keeps its own price forever, so
	# "we paid $2 last week and $2.50 this week" is a real, queryable fact
	# in the Audit Report, not something overwritten on the Item row.
	unit_cost = Column(Numeric(12, 2), nullable=True)
	# Single-operator system (confirmed: Admin only) - always "admin" today,
	# but the column exists so the audit trail already has the shape it'll
	# need if that ever changes, without another migration.
	user = Column(String, nullable=False, default="admin")
	# Points at whatever future document caused this (an Invoice #, PO #,
	# POS sale #) once those exist - nullable since most movements today
	# (manual adjustments) have no such document.
	reference = Column(String, nullable=True)
	created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)

	item = relationship("Item", back_populates="movements")
	warehouse = relationship("Warehouse")
