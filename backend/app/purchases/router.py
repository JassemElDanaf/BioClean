from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session, joinedload

from ..core.database import get_db
from ..shared.export import to_csv_response
from . import models, schemas, service

router = APIRouter(prefix="/purchases", tags=["purchases"])


def _to_out(po: models.PurchaseOrder) -> schemas.PurchaseOrderOut:
	return schemas.PurchaseOrderOut(
		id=po.id,
		supplier_id=po.supplier_id,
		supplier_name=po.supplier.name if po.supplier else None,
		warehouse_id=po.warehouse_id,
		total=po.total,
		status=po.status,
		notes=po.notes,
		user=po.user,
		created_at=po.created_at,
		received_at=po.received_at,
		lines=[schemas.PurchaseOrderLineOut.model_validate(line) for line in po.lines],
	)


@router.post("", response_model=schemas.PurchaseOrderOut, status_code=201)
def create_purchase_order(payload: schemas.PurchaseOrderCreate, db: Session = Depends(get_db)):
	po = service.create_purchase_order(
		db,
		supplier_id=payload.supplier_id,
		lines=[line.model_dump() for line in payload.lines],
		notes=payload.notes,
		warehouse_id=payload.warehouse_id,
	)
	return _to_out(po)


@router.get("", response_model=list[schemas.PurchaseOrderOut])
def list_purchase_orders(
	response: Response,
	skip: int = 0,
	limit: int = Query(default=100, le=1000),
	status: str | None = None,
	supplier_id: int | None = None,
	db: Session = Depends(get_db),
):
	orders, total = service.list_purchase_orders(db, skip=skip, limit=limit, status=status, supplier_id=supplier_id)
	response.headers["X-Total-Count"] = str(total)
	return [_to_out(po) for po in orders]


@router.get("/export/csv")
def export_purchase_orders_csv(db: Session = Depends(get_db)):
	orders, _ = service.list_purchase_orders(db, skip=0, limit=10_000)
	rows = [
		{
			"PO #": po.id,
			"Date": po.created_at.strftime("%Y-%m-%d %H:%M"),
			"Supplier": po.supplier.name if po.supplier else "",
			"Item": line.item_name,
			"Barcode": line.barcode,
			"Qty": line.qty,
			"Unit Cost": line.unit_cost,
			"Line Total": line.line_total,
			"Status": po.status,
		}
		for po in orders
		for line in po.lines
	]
	return to_csv_response(rows, "purchase_orders")


@router.get("/{po_id}", response_model=schemas.PurchaseOrderOut)
def get_purchase_order(po_id: int, db: Session = Depends(get_db)):
	po = db.query(models.PurchaseOrder).options(joinedload(models.PurchaseOrder.lines), joinedload(models.PurchaseOrder.supplier)).filter(models.PurchaseOrder.id == po_id).first()
	if not po:
		raise HTTPException(status_code=404, detail="Purchase order not found")
	return _to_out(po)


@router.get("/{po_id}/pdf")
def get_purchase_order_pdf(po_id: int, db: Session = Depends(get_db)):
	po = db.query(models.PurchaseOrder).options(joinedload(models.PurchaseOrder.lines), joinedload(models.PurchaseOrder.supplier)).filter(models.PurchaseOrder.id == po_id).first()
	if not po:
		raise HTTPException(status_code=404, detail="Purchase order not found")
	pdf_bytes = service.get_purchase_order_pdf(db, po)
	return Response(
		content=pdf_bytes,
		media_type="application/pdf",
		headers={"Content-Disposition": f'inline; filename="po-{po.id}.pdf"'},
	)


@router.post("/{po_id}/receive", response_model=schemas.PurchaseOrderOut)
def receive_purchase_order(po_id: int, db: Session = Depends(get_db)):
	po = db.query(models.PurchaseOrder).options(joinedload(models.PurchaseOrder.lines), joinedload(models.PurchaseOrder.supplier)).filter(models.PurchaseOrder.id == po_id).first()
	if not po:
		raise HTTPException(status_code=404, detail="Purchase order not found")
	po = service.receive_purchase_order(db, po)
	return _to_out(po)


@router.post("/{po_id}/cancel", response_model=schemas.PurchaseOrderOut)
def cancel_purchase_order(po_id: int, db: Session = Depends(get_db)):
	po = db.query(models.PurchaseOrder).options(joinedload(models.PurchaseOrder.lines), joinedload(models.PurchaseOrder.supplier)).filter(models.PurchaseOrder.id == po_id).first()
	if not po:
		raise HTTPException(status_code=404, detail="Purchase order not found")
	po = service.cancel_purchase_order(db, po)
	return _to_out(po)
