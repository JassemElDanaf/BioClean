from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ExchangeRateOut(BaseModel):
	model_config = ConfigDict(from_attributes=True)
	usd_to_lbp_rate: float
	lbp_rounding: float


class ExchangeRateUpdate(BaseModel):
	usd_to_lbp_rate: float
	# Optional so existing callers that only ever cared about the rate
	# aren't forced to also send this - omitting it just leaves whatever
	# rounding increment is already set unchanged.
	lbp_rounding: float | None = Field(default=None, gt=0)


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


class PrinterSettingsOut(BaseModel):
	model_config = ConfigDict(from_attributes=True)
	printer_connection_type: str
	printer_target: str | None = None


class PrinterSettingsUpdate(BaseModel):
	printer_connection_type: str = Field(pattern="^(none|windows|usb|network)$")
	printer_target: str | None = None
