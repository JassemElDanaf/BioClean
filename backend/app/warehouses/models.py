from sqlalchemy import Boolean, Column, Integer, String

from ..core.database import Base


class Warehouse(Base):
	"""One row today ("Main Store"), but stock lives here (not directly on
	Item) specifically so a second location later is just a new row and a
	transfer, not a schema change."""

	__tablename__ = "warehouses"

	id = Column(Integer, primary_key=True, index=True)
	name = Column(String, unique=True, nullable=False)
	is_default = Column(Boolean, nullable=False, default=False)
