from datetime import date, datetime, time

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session, joinedload

from ..core.database import get_db
from ..shared.export import to_csv_response
from . import models, schemas, service

router = APIRouter(prefix="/pos", tags=["pos"])

EXPORT_COLUMNS = ["Date", "Sale #", "Item", "Barcode", "Qty", "Unit Price", "Line Total", "Payment Method", "Voided"]


def _to_out(sale: models.Sale) -> schemas.SaleOut:
	change_due = None
	if sale.payment_method == "cash" and sale.amount_tendered is not None:
		change_due = float(sale.amount_tendered) - float(sale.total)
	return schemas.SaleOut(
		id=sale.id,
		warehouse_id=sale.warehouse_id,
		subtotal=float(sale.total) - float(sale.tax_amount),
		tax_amount=sale.tax_amount,
		exchange_rate=sale.exchange_rate,
		total=sale.total,
		payment_method=sale.payment_method,
		amount_tendered=sale.amount_tendered,
		change_due=change_due,
		voided=sale.voided,
		voided_at=sale.voided_at,
		user=sale.user,
		created_at=sale.created_at,
		returned_total=sale.returned_total,
		lines=[schemas.SaleLineOut.model_validate(line) for line in sale.lines],
	)


def _return_to_out(ret: models.Return) -> schemas.ReturnOut:
	return schemas.ReturnOut(
		id=ret.id,
		sale_id=ret.sale_id,
		refund_method=ret.refund_method,
		total_refund=ret.total_refund,
		reason=ret.reason,
		user=ret.user,
		created_at=ret.created_at,
		lines=[schemas.ReturnLineOut.model_validate(line) for line in ret.lines],
	)


def _parse_date_range(from_date: str | None, to_date: str | None) -> tuple[datetime | None, datetime | None]:
	"""Same "YYYY-MM-DD" query param -> real datetime bounds conversion as
	items/router.py's audit report - kept local rather than imported since
	that one's a module-private helper, and this is three lines."""
	start = datetime.combine(date.fromisoformat(from_date), time.min) if from_date else None
	end = datetime.combine(date.fromisoformat(to_date), time.max) if to_date else None
	return start, end


def _export_rows(sale: models.Sale) -> list[dict]:
	return [
		{
			"Date": sale.created_at.strftime("%Y-%m-%d %H:%M"),
			"Sale #": sale.id,
			"Item": line.item_name,
			"Barcode": line.barcode,
			"Qty": line.qty,
			"Unit Price": line.unit_price,
			"Line Total": line.line_total,
			"Payment Method": sale.payment_method,
			"Voided": "Yes" if sale.voided else "No",
		}
		for line in sale.lines
	]


@router.post("/sales", response_model=schemas.SaleOut, status_code=201)
def checkout(payload: schemas.CheckoutRequest, db: Session = Depends(get_db)):
	sale = service.checkout(
		db,
		lines=[line.model_dump() for line in payload.lines],
		payment_method=payload.payment_method,
		amount_tendered=payload.amount_tendered,
		warehouse_id=payload.warehouse_id,
		idempotency_key=payload.idempotency_key,
	)
	return _to_out(sale)


@router.get("/sales", response_model=list[schemas.SaleOut])
def list_sales(
	response: Response,
	skip: int = 0,
	limit: int = Query(default=100, le=1000),
	from_date: str | None = None,
	to_date: str | None = None,
	db: Session = Depends(get_db),
):
	start, end = _parse_date_range(from_date, to_date)
	sales, total = service.list_sales(db, skip=skip, limit=limit, from_date=start, to_date=end)
	response.headers["X-Total-Count"] = str(total)
	return [_to_out(sale) for sale in sales]


@router.get("/sales/export/csv")
def export_sales_csv(from_date: str | None = None, to_date: str | None = None, db: Session = Depends(get_db)):
	start, end = _parse_date_range(from_date, to_date)
	sales, _ = service.list_sales(db, skip=0, limit=10_000, from_date=start, to_date=end)
	rows = [row for sale in sales for row in _export_rows(sale)]
	return to_csv_response(rows, "pos_sales")


@router.get("/sales/{sale_id}", response_model=schemas.SaleOut)
def get_sale(sale_id: int, db: Session = Depends(get_db)):
	sale = db.query(models.Sale).options(joinedload(models.Sale.lines)).filter(models.Sale.id == sale_id).first()
	if not sale:
		raise HTTPException(status_code=404, detail="Sale not found")
	return _to_out(sale)


@router.get("/sales/{sale_id}/pdf")
def get_sale_receipt_pdf(sale_id: int, db: Session = Depends(get_db)):
	sale = db.query(models.Sale).options(joinedload(models.Sale.lines)).filter(models.Sale.id == sale_id).first()
	if not sale:
		raise HTTPException(status_code=404, detail="Sale not found")
	pdf_bytes = service.get_sale_receipt_pdf(db, sale)
	return Response(
		content=pdf_bytes,
		media_type="application/pdf",
		headers={"Content-Disposition": f'inline; filename="receipt-{sale.id}.pdf"'},
	)


@router.post("/sales/{sale_id}/void", response_model=schemas.SaleOut)
def void_sale(sale_id: int, db: Session = Depends(get_db)):
	sale = db.query(models.Sale).options(joinedload(models.Sale.lines)).filter(models.Sale.id == sale_id).first()
	if not sale:
		raise HTTPException(status_code=404, detail="Sale not found")
	sale = service.void_sale(db, sale)
	return _to_out(sale)


@router.post("/sales/{sale_id}/return", response_model=schemas.ReturnOut, status_code=201)
def create_return(sale_id: int, payload: schemas.ReturnCreate, db: Session = Depends(get_db)):
	sale = db.query(models.Sale).options(joinedload(models.Sale.lines)).filter(models.Sale.id == sale_id).first()
	if not sale:
		raise HTTPException(status_code=404, detail="Sale not found")
	ret = service.create_return(
		db,
		sale,
		lines=[line.model_dump() for line in payload.lines],
		refund_method=payload.refund_method,
		reason=payload.reason,
	)
	return _return_to_out(ret)


@router.get("/sales/{sale_id}/returns", response_model=list[schemas.ReturnOut])
def list_returns(sale_id: int, db: Session = Depends(get_db)):
	sale = db.query(models.Sale).filter(models.Sale.id == sale_id).first()
	if not sale:
		raise HTTPException(status_code=404, detail="Sale not found")
	returns = service.list_returns(db, sale)
	return [_return_to_out(ret) for ret in returns]


@router.post("/sales/{sale_id}/print")
def print_sale_receipt(sale_id: int, db: Session = Depends(get_db)):
	from .escpos_receipt import PrinterError

	sale = db.query(models.Sale).options(joinedload(models.Sale.lines)).filter(models.Sale.id == sale_id).first()
	if not sale:
		raise HTTPException(status_code=404, detail="Sale not found")
	try:
		service.print_sale_receipt(db, sale)
	except PrinterError as exc:
		# 502: the *request* to print failed, not the sale - the sale
		# itself is untouched and this is safely retryable on its own.
		raise HTTPException(status_code=502, detail=str(exc))
	return {"printed": True}
