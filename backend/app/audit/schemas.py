from datetime import datetime

from pydantic import BaseModel, ConfigDict


class AuditLogRow(BaseModel):
	model_config = ConfigDict(from_attributes=True)

	id: int
	created_at: datetime
	user: str
	method: str
	path: str
	status_code: int
