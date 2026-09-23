from sqlalchemy import Column, Integer, String

from ..core.database import Base


class Supplier(Base):
	__tablename__ = "suppliers"

	id = Column(Integer, primary_key=True, index=True)
	name = Column(String, unique=True, nullable=False)
	phone = Column(String, nullable=True)
	email = Column(String, nullable=True)
