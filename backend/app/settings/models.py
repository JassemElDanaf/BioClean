from sqlalchemy import Column, DateTime, Integer, Numeric, func

from ..core.database import Base


class AppSettings(Base):
	"""A single row (id=1) holding admin-editable settings that need to
	change at runtime - unlike app/core/config.py, which is fixed at
	startup from the environment. usd_to_lbp_rate is the first of these:
	prices are stored in USD everywhere, but the market rate moves, so
	every USD amount in the app needs to be convertible to LBP at
	whatever rate Admin currently has set here."""

	__tablename__ = "app_settings"

	id = Column(Integer, primary_key=True)
	usd_to_lbp_rate = Column(Numeric(12, 2), nullable=False, default=89500)
	updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
