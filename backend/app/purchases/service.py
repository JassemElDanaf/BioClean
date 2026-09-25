from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy.orm import Session, joinedload

from ..items import service as items_service
from ..items.models import Item
from ..suppliers.models import Supplier
from .models import PurchaseOrder, PurchaseOrderLine


def create_purchase_order(db: Session, supplier_id: int, lines: list[dict], notes: str | None, warehouse_id: int | None) -> PurchaseOrder:
	supplier = db.get(Supplier, supplier_id)
	if not supplier:
		raise HTTPException(status_code=404, detail=f"Supplier {supplier_id} not found")
	warehouse_id = warehouse_id or items_service.get_default_warehouse(db).id

	po = PurchaseOrder(supplier_id=supplier_id, supplier_name=supplier.name, warehouse_id=warehouse_id, total=0, notes=notes)
	db.add(po)
	db.flush()

	total = 0.0
	for line in lines:
		item = db.get(Item, line["item_id"])
		if not item:
			raise HTTPException(status_code=404, detail=f"Item {line['item_id']} not found")
		unit_cost = line["unit_cost"] if line["unit_cost"] is not None else float(item.cost_price)
		qty = line["qty"]
		line_total = qty * unit_cost
		db.add(
			PurchaseOrderLine(
				purchase_order_id=po.id,
				item_id=item.id,
				item_name=item.item_name,
				barcode=item.barcode,
				qty=qty,
				unit_cost=unit_cost,
				line_total=line_total,
			)
		)
		total += line_total

	po.total = total
	db.commit()
	db.refresh(po)
	return po


def receive_purchase_order(db: Session, po: PurchaseOrder) -> PurchaseOrder:
	"""Stock only ever moves here - see PurchaseOrder's docstring. Each
	line's unit_cost is passed straight through to adjust_stock(), which
	both logs it on the StockMovement and updates the item's current
	cost_price - exactly what a real shipment arriving should do."""
	if po.status != "pending":
		raise HTTPException(status_code=409, detail=f"Purchase order is '{po.status}', not pending - can't receive it")

	for line in po.lines:
		if line.item_id is None:
			continue
		item = db.get(Item, line.item_id)
		if item is None:
			continue
		items_service.adjust_stock(
			db,
			item,
			float(line.qty),
			warehouse_id=po.warehouse_id,
			reason="purchase_receipt",
			reference=f"PO-{po.id}",
			unit_cost=float(line.unit_cost),
			commit=False,
		)

	po.status = "received"
	po.received_at = datetime.now(timezone.utc)
	po.pdf_data = None  # stale - cached PDF still shows "PENDING"
	db.commit()
	db.refresh(po)
	return po


def mark_paid(db: Session, po: PurchaseOrder) -> PurchaseOrder:
	"""Settles the accounts-payable liability for this order - only valid
	once goods have actually been received (see PurchaseOrder.payment_status's
	docstring); a pending order has nothing owed yet, and a cancelled one
	never will."""
	if po.status != "received":
		raise HTTPException(status_code=409, detail=f"Purchase order is '{po.status}', not received - nothing owed to mark paid yet")
	if po.payment_status == "paid":
		raise HTTPException(status_code=409, detail="Purchase order is already marked paid")
	po.payment_status = "paid"
	db.commit()
	db.refresh(po)
	return po


def cancel_purchase_order(db: Session, po: PurchaseOrder) -> PurchaseOrder:
	if po.status != "pending":
		raise HTTPException(status_code=409, detail=f"Purchase order is '{po.status}', not pending - can't cancel it")
	po.status = "cancelled"
	po.pdf_data = None  # stale - cached PDF still shows "PENDING"
	db.commit()
	db.refresh(po)
	return po


def list_purchase_orders(
	db: Session,
	skip: int = 0,
	limit: int = 100,
	status: str | None = None,
	supplier_id: int | None = None,
	from_date=None,
	to_date=None,
):
	base = db.query(PurchaseOrder)
	if status:
		base = base.filter(PurchaseOrder.status == status)
	if supplier_id:
		base = base.filter(PurchaseOrder.supplier_id == supplier_id)
	if from_date:
		base = base.filter(PurchaseOrder.created_at >= from_date)
	if to_date:
		base = base.filter(PurchaseOrder.created_at <= to_date)

	total = base.count()
	orders = (
		base.options(joinedload(PurchaseOrder.lines), joinedload(PurchaseOrder.supplier))
		.order_by(PurchaseOrder.created_at.desc())
		.offset(skip)
		.limit(limit)
		.all()
	)
	return orders, total


def get_purchase_order_pdf(db: Session, po: PurchaseOrder) -> bytes:
	"""Lazily renders and caches the PDF in po.pdf_data. receive/cancel
	null this out on status change, so a cache hit here always matches the
	PO's current state."""
	if po.pdf_data is not None:
		return bytes(po.pdf_data)

	from ..shared.archive import archive_document
	from .pdf import generate_purchase_order_pdf

	pdf_bytes = generate_purchase_order_pdf(po)
	po.pdf_data = pdf_bytes
	archive_document("Purchase Orders", po.created_at, f"po-{po.id}.pdf", pdf_bytes)
	db.commit()
	return pdf_bytes
