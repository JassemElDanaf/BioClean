from pydantic import BaseModel, ConfigDict


class ExchangeRateOut(BaseModel):
	model_config = ConfigDict(from_attributes=True)
	usd_to_lbp_rate: float


class ExchangeRateUpdate(BaseModel):
	usd_to_lbp_rate: float
