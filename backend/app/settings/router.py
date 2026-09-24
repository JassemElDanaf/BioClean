from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..core.database import get_db
from ..shared.currency import get_or_create_settings
from . import models, schemas

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("/exchange-rate", response_model=schemas.ExchangeRateOut)
def get_exchange_rate(db: Session = Depends(get_db)):
	return get_or_create_settings(db)


@router.put("/exchange-rate", response_model=schemas.ExchangeRateOut)
def update_exchange_rate(payload: schemas.ExchangeRateUpdate, db: Session = Depends(get_db)):
	settings = get_or_create_settings(db)
	settings.usd_to_lbp_rate = payload.usd_to_lbp_rate
	# Every rate that's ever been live gets its own row, timestamped - see
	# ExchangeRateHistory's docstring. Sales/Invoices already created keep
	# whichever rate they snapshotted at the time; this only affects what
	# counts as "the rate" from this moment forward.
	db.add(models.ExchangeRateHistory(usd_to_lbp_rate=payload.usd_to_lbp_rate))
	db.commit()
	db.refresh(settings)
	return settings


@router.get("/exchange-rate/history", response_model=list[schemas.ExchangeRateHistoryOut])
def list_exchange_rate_history(db: Session = Depends(get_db)):
	get_or_create_settings(db)  # ensures the bootstrap history row exists
	return db.query(models.ExchangeRateHistory).order_by(models.ExchangeRateHistory.effective_at.desc()).all()


@router.get("/tax-rate", response_model=schemas.TaxRateOut)
def get_tax_rate(db: Session = Depends(get_db)):
	return get_or_create_settings(db)


@router.put("/tax-rate", response_model=schemas.TaxRateOut)
def update_tax_rate(payload: schemas.TaxRateUpdate, db: Session = Depends(get_db)):
	settings = get_or_create_settings(db)
	settings.tax_rate = payload.tax_rate
	db.commit()
	db.refresh(settings)
	return settings
