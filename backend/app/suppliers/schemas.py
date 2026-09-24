from pydantic import BaseModel, ConfigDict, Field


class SupplierBase(BaseModel):
	name: str = Field(min_length=1)
	phone: str | None = None
	email: str | None = None


class SupplierCreate(SupplierBase):
	pass


class SupplierUpdate(SupplierBase):
	pass


class SupplierOut(SupplierBase):
	model_config = ConfigDict(from_attributes=True)
	id: int
