from sqlalchemy import Column, DateTime, ForeignKey, Integer, LargeBinary, Numeric, String, func
from sqlalchemy.orm import relationship

from ..core.database import Base


class Quotation(Base):
	"""A quote is deliberately lighter than Invoice/Sale - no warehouse_id,
	no stock movement, because nothing is committed until it's actually
	converted. draft -> sent -> accepted/expired is just a status label
	the front desk sets by hand; the one status change with real backend
	logic is "converted", which happens through convert_to_invoice() in
	quotation/service.py (creates a real Invoice, deducts stock through
	the same path Invoice/Sale both use, and stamps
	converted_invoice_id here so a quote can never be converted twice)."""

	__tablename__ = "quotations"

	id = Column(Integer, primary_key=True, index=True)
	customer_id = Column(Integer, ForeignKey("customers.id"), nullable=True)
	# Snapshotted from customer.name at creation time - see
	# Invoice.customer_name's docstring for why.
	customer_name = Column(String, nullable=True)
	total = Column(Numeric(12, 2), nullable=False)
	status = Column(String, nullable=False, default="draft")
	valid_until = Column(DateTime(timezone=True), nullable=True)
	notes = Column(String, nullable=True)
	user = Column(String, nullable=False, default="admin")
	created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
	converted_invoice_id = Column(Integer, ForeignKey("invoices.id"), nullable=True)
	# Cached rendered PDF - same lazy-generate/invalidate-on-status-change
	# pattern as Invoice.pdf_data (see invoicing/service.py).
	pdf_data = Column(LargeBinary, nullable=True)

	customer = relationship("Customer")
	invoice = relationship("Invoice")
	lines = relationship("QuotationLine", back_populates="quotation", cascade="all, delete-orphan")


class QuotationLine(Base):
	__tablename__ = "quotation_lines"

	id = Column(Integer, primary_key=True, index=True)
	quotation_id = Column(Integer, ForeignKey("quotations.id"), nullable=False, index=True)
	# Nullable so the underlying Item can be deleted without destroying
	# this quotation's own history - item_name/barcode/unit_price below
	# are already a full snapshot.
	item_id = Column(Integer, ForeignKey("items.id"), nullable=True, index=True)
	item_name = Column(String, nullable=False)
	barcode = Column(String, nullable=False)
	qty = Column(Numeric(12, 2), nullable=False)
	unit_price = Column(Numeric(12, 2), nullable=False)
	line_total = Column(Numeric(12, 2), nullable=False)

	quotation = relationship("Quotation", back_populates="lines")
	item = relationship("Item")
