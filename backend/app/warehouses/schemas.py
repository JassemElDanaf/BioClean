from pydantic import BaseModel, ConfigDict


class WarehouseOut(BaseModel):
	model_config = ConfigDict(from_attributes=True)
	id: int
	name: str
	is_default: bool
