from pydantic import BaseModel, ConfigDict


class SupplierBase(BaseModel):
	name: str
	phone: str | None = None
	email: str | None = None


class SupplierCreate(SupplierBase):
	pass


class SupplierOut(SupplierBase):
	model_config = ConfigDict(from_attributes=True)
	id: int
