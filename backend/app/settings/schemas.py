from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ExchangeRateOut(BaseModel):
	model_config = ConfigDict(from_attributes=True)
	usd_to_lbp_rate: float


class ExchangeRateUpdate(BaseModel):
	usd_to_lbp_rate: float


class ExchangeRateHistoryOut(BaseModel):
	model_config = ConfigDict(from_attributes=True)
	id: int
	usd_to_lbp_rate: float
	effective_at: datetime


class TaxRateOut(BaseModel):
	model_config = ConfigDict(from_attributes=True)
	tax_rate: float


class TaxRateUpdate(BaseModel):
	tax_rate: float = Field(ge=0, le=100)
