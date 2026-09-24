from sqlalchemy import Column, DateTime, Integer, Numeric, func

from ..core.database import Base


class ExchangeRateHistory(Base):
	"""Append-only log of every rate that has ever been live, and when it
	became so - AppSettings.usd_to_lbp_rate only ever holds the *current*
	number, so without this there would be no way to answer "what was the
	rate on such-and-such date" once it's changed again. Sale.exchange_rate
	and Invoice.exchange_rate (snapshotted at creation) are what actually
	protect historical documents from a later rate change - this table is
	the audit trail of the rate itself, not of any one transaction."""

	__tablename__ = "exchange_rate_history"

	id = Column(Integer, primary_key=True, index=True)
	usd_to_lbp_rate = Column(Numeric(12, 2), nullable=False)
	effective_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)


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
	# Percentage (7 means 7%), applied in POS/Invoicing on top of the
	# subtotal-after-discount. Zero by default - most of this app's history
	# ran with no tax concept at all, so a fresh install shouldn't suddenly
	# start charging tax nobody configured.
	tax_rate = Column(Numeric(5, 2), nullable=False, default=0)
	updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
