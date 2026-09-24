from sqlalchemy import Column, DateTime, ForeignKey, Integer, LargeBinary, Numeric, String, func
from sqlalchemy.orm import relationship

from ..core.database import Base


class Invoice(Base):
	"""One B2B sale document - structurally the same idea as pos.Sale (one
	row per finalized transaction, line snapshots, adjust_stock deducts
	stock immediately on creation - no separate draft state), but with a
	payment lifecycle POS doesn't need: goods often ship on credit terms
	before payment is collected, so `status` tracks unpaid -> paid
	separately from the stock movement, which already happened at
	creation either way.

	There's no display "invoice number" column - "INV-{id}" is generated
	wherever it's shown, same as pos.Sale does with "SALE-{id}"."""

	__tablename__ = "invoices"

	id = Column(Integer, primary_key=True, index=True)
	customer_id = Column(Integer, ForeignKey("customers.id"), nullable=True)
	warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False)
	total = Column(Numeric(12, 2), nullable=False)
	# USD->LBP rate in effect when this invoice was issued - same snapshot
	# reasoning as pos.Sale.exchange_rate. Any LBP-equivalent shown for
	# this specific invoice later must use THIS number, not whatever
	# Settings.usd_to_lbp_rate has moved to since (which could be months
	# later for a slow-paying customer).
	exchange_rate = Column(Numeric(12, 2), nullable=False, default=0)
	# unpaid -> paid (mark_paid) or unpaid/paid -> voided (void, reverses
	# stock same as pos.Sale.voided).
	status = Column(String, nullable=False, default="unpaid")
	due_date = Column(DateTime(timezone=True), nullable=True)
	notes = Column(String, nullable=True)
	user = Column(String, nullable=False, default="admin")
	created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
	paid_at = Column(DateTime(timezone=True), nullable=True)
	voided_at = Column(DateTime(timezone=True), nullable=True)
	# Cached rendered PDF - regenerated lazily (see service.get_invoice_pdf)
	# whenever it's missing, and invalidated to NULL on any status change
	# (mark_paid/void) since the document text includes status/paid date.
	pdf_data = Column(LargeBinary, nullable=True)

	customer = relationship("Customer")
	warehouse = relationship("Warehouse")
	lines = relationship("InvoiceLine", back_populates="invoice", cascade="all, delete-orphan")


class InvoiceLine(Base):
	"""item_name/barcode/unit_price snapshotted at invoice time - same
	reasoning as pos.SaleLine: a finalized invoice can't change meaning
	just because the item was later renamed or repriced."""

	__tablename__ = "invoice_lines"

	id = Column(Integer, primary_key=True, index=True)
	invoice_id = Column(Integer, ForeignKey("invoices.id"), nullable=False, index=True)
	item_id = Column(Integer, ForeignKey("items.id"), nullable=False, index=True)
	item_name = Column(String, nullable=False)
	barcode = Column(String, nullable=False)
	qty = Column(Numeric(12, 2), nullable=False)
	unit_price = Column(Numeric(12, 2), nullable=False)
	# What the item cost us at invoice time - snapshotted from
	# item.cost_price, same reasoning as unit_price above. Lets profit
	# (unit_price - unit_cost) be computed from history without needing the
	# Item row's current cost, which may have moved since.
	unit_cost = Column(Numeric(12, 2), nullable=False, default=0)
	line_total = Column(Numeric(12, 2), nullable=False)

	invoice = relationship("Invoice", back_populates="lines")
	item = relationship("Item")
