from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..core.database import get_db
from ..shared.currency import get_or_create_settings
from . import schemas

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("/exchange-rate", response_model=schemas.ExchangeRateOut)
def get_exchange_rate(db: Session = Depends(get_db)):
	return get_or_create_settings(db)


@router.put("/exchange-rate", response_model=schemas.ExchangeRateOut)
def update_exchange_rate(payload: schemas.ExchangeRateUpdate, db: Session = Depends(get_db)):
	settings = get_or_create_settings(db)
	settings.usd_to_lbp_rate = payload.usd_to_lbp_rate
	db.commit()
	db.refresh(settings)
	return settings
