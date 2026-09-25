"""Every price in the system is stored in USD - this is the one place
that converts to LBP, so every domain (Inventory today; POS, Invoicing,
Purchasing later) that needs to show or accept an LBP amount uses the
same rate and the same math, not its own copy of it."""

from sqlalchemy.orm import Session

from ..settings.models import AppSettings, ExchangeRateHistory

DEFAULT_RATE = 89500  # confirmed real-world starting point


def get_or_create_settings(db: Session) -> AppSettings:
	settings = db.get(AppSettings, 1)
	if not settings:
		settings = AppSettings(id=1, usd_to_lbp_rate=DEFAULT_RATE)
		db.add(settings)
		# The very first rate this install ever had is itself a real history
		# entry - without this, a lookup for "what was the rate before the
		# first-ever change" would come back empty.
		db.add(ExchangeRateHistory(usd_to_lbp_rate=DEFAULT_RATE))
		db.commit()
		db.refresh(settings)
	return settings


def usd_to_lbp(amount_usd: float, rate: float, rounding: float = 1) -> float:
	"""rounding defaults to 1 (nearest whole lira) for any caller that
	doesn't pass Settings.lbp_rounding explicitly. LBP cash denominations
	in real circulation are large (1,000s+) - nobody can make change to
	the nearest lira - so anything actually shown to a customer (a
	receipt, an invoice) should pass the admin-configured rounding here,
	same as the frontend's own usdToLbp() (lib/currency.ts) already does."""
	raw = amount_usd * rate
	return round(raw / rounding) * rounding


def lbp_to_usd(amount_lbp: float, rate: float) -> float:
	return round(amount_lbp / rate, 2)
