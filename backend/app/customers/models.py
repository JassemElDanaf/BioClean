from sqlalchemy import Boolean, Column, DateTime, Integer, String, func

from ..core.database import Base


class Customer(Base):
	"""Unlike Supplier.name, deliberately not unique - two real customers
	sharing a name (or a generic "Cash Customer" entry used more than
	once) is normal, not a data error.

	is_wholesale connects two things that already existed independently -
	Item.wholesale_price (set on every item, never actually applied
	anywhere) and the free-form unit_price override Invoicing/POS both
	accept - so invoicing a wholesale customer can default to charging
	wholesale_price instead of retail_price without a schema change on
	either side."""

	__tablename__ = "customers"

	id = Column(Integer, primary_key=True, index=True)
	name = Column(String, nullable=False, index=True)
	phone = Column(String, nullable=True)
	email = Column(String, nullable=True)
	address = Column(String, nullable=True)
	is_wholesale = Column(Boolean, nullable=False, default=False)
	created_at = Column(DateTime(timezone=True), server_default=func.now())
