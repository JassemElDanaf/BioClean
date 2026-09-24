from sqlalchemy import Column, DateTime, ForeignKey, Integer, LargeBinary, Numeric, String, func
from sqlalchemy.orm import relationship

from ..core.database import Base


class PurchaseOrder(Base):
	"""Unlike Invoice/Sale, creating a PO does NOT move stock - a PO is a
	commitment to buy, not a receipt of goods. Stock only moves in
	receive_purchase_order() (purchases/service.py), which is also where
	each line's unit_cost actually reaches items.service.adjust_stock() as
	"what we paid this time" - the same mechanism StockAdjustModal's manual
	"Received shipment" already uses, just formalized with a PO number
	behind it instead of an ad-hoc adjustment."""

	__tablename__ = "purchase_orders"

	id = Column(Integer, primary_key=True, index=True)
	# Nullable so a Supplier can be deleted without destroying this order's
	# own history - supplier_name is shown via the live relationship where
	# still present, and falls back to None once the supplier is gone.
	supplier_id = Column(Integer, ForeignKey("suppliers.id"), nullable=True)
	# Snapshotted from supplier.name at creation time - see
	# Invoice.customer_name's docstring for why.
	supplier_name = Column(String, nullable=True)
	warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False)
	total = Column(Numeric(12, 2), nullable=False)
	# pending -> received (adjust_stock runs) or pending -> cancelled
	# (nothing to reverse, since nothing moved yet).
	status = Column(String, nullable=False, default="pending")
	# unpaid -> paid, tracked separately from `status` - goods can be
	# received (stock already moved) well before the supplier's invoice is
	# actually settled. Only meaningful once status == "received" (see
	# purchases/service.py:mark_paid()); a pending/cancelled order carries
	# no payable liability yet, same "not real until it happened" reasoning
	# as Invoice.status.
	payment_status = Column(String, nullable=False, default="unpaid")
	notes = Column(String, nullable=True)
	user = Column(String, nullable=False, default="admin")
	created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
	received_at = Column(DateTime(timezone=True), nullable=True)
	# Cached rendered PDF - same lazy-generate/invalidate-on-status-change
	# pattern as Invoice.pdf_data (see invoicing/service.py).
	pdf_data = Column(LargeBinary, nullable=True)

	supplier = relationship("Supplier")
	warehouse = relationship("Warehouse")
	lines = relationship("PurchaseOrderLine", back_populates="purchase_order", cascade="all, delete-orphan")


class PurchaseOrderLine(Base):
	__tablename__ = "purchase_order_lines"

	id = Column(Integer, primary_key=True, index=True)
	purchase_order_id = Column(Integer, ForeignKey("purchase_orders.id"), nullable=False, index=True)
	# Nullable so the underlying Item can be deleted without destroying
	# this order's own history - item_name/barcode/unit_cost below are
	# already a full snapshot.
	item_id = Column(Integer, ForeignKey("items.id"), nullable=True, index=True)
	item_name = Column(String, nullable=False)
	barcode = Column(String, nullable=False)
	qty = Column(Numeric(12, 2), nullable=False)
	unit_cost = Column(Numeric(12, 2), nullable=False)
	line_total = Column(Numeric(12, 2), nullable=False)

	purchase_order = relationship("PurchaseOrder", back_populates="lines")
	item = relationship("Item")
