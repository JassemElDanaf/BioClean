import os
import uuid
from datetime import date, datetime, time

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile
from sqlalchemy.orm import Session, joinedload

from ..core.database import get_db
from ..shared.export import to_csv_response
from ..shared.timezone import to_local
from . import models, schemas, service

# Uploaded item photos land here, served back out via the /uploads static
# mount in main.py - see upload_item_image() below.
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads", "items")
MAX_IMAGE_BYTES = 5 * 1024 * 1024
ALLOWED_IMAGE_TYPES = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp"}

router = APIRouter(prefix="/items", tags=["items"])

# Human-readable column labels for exports - never raw DB field names, per
# the project's data-portability rule (a file that opens cleanly in Excel/
# Sheets and imports cleanly into any other accounting tool).
EXPORT_COLUMNS = [
	"Item Name",
	"Barcode",
	"Category",
	"UOM",
	"Cost Price",
	"Retail Price",
	"Wholesale Price",
	"Reorder Level",
	"Stock Qty",
]


def _to_out(item: models.Item) -> schemas.ItemOut:
	return schemas.ItemOut(
		**{field: getattr(item, field) for field in schemas.ItemBase.model_fields},
		id=item.id,
		stock_qty=service.total_stock(item),
		created_at=item.created_at,
		updated_at=item.updated_at,
	)


def _export_row(item: models.Item) -> dict:
	values = [
		item.item_name,
		item.barcode,
		item.category,
		item.uom,
		item.cost_price,
		item.retail_price,
		item.wholesale_price,
		item.reorder_level,
		service.total_stock(item),
	]
	return dict(zip(EXPORT_COLUMNS, values))


def _query_with_relations(db: Session):
	return db.query(models.Item).options(joinedload(models.Item.stock_levels))


@router.get("", response_model=list[schemas.ItemOut])
def list_items(
	response: Response,
	skip: int = 0,
	limit: int = Query(default=200, le=2000),
	q: str | None = None,
	category: str | None = None,
	low_stock: bool = False,
	out_of_stock: bool = False,
	db: Session = Depends(get_db),
):
	items, total = service.list_items(db, skip=skip, limit=limit, q=q, category=category, low_stock=low_stock, out_of_stock=out_of_stock)
	# Lets the frontend tell "everything fits on one page" apart from
	# "there are more than `limit` matches" without a second request.
	response.headers["X-Total-Count"] = str(total)
	return [_to_out(item) for item in items]


@router.get("/export/csv")
def export_items_csv(db: Session = Depends(get_db)):
	items = _query_with_relations(db).order_by(models.Item.item_name).all()
	return to_csv_response([_export_row(i) for i in items], "items")


AUDIT_EXPORT_COLUMNS = [
	"Date",
	"Barcode",
	"Item Name",
	"Warehouse",
	"Event",
	"Qty Before",
	"Change",
	"Qty After",
	"Unit Cost",
	"User",
	"Reference",
]


def _audit_row_out(m: models.StockMovement) -> schemas.AuditReportRow:
	return schemas.AuditReportRow(
		id=m.id,
		created_at=m.created_at,
		barcode=m.item.barcode,
		item_name=m.item.item_name,
		warehouse_name=m.warehouse.name,
		reason=m.reason,
		qty_before=m.qty_before,
		delta=m.delta,
		qty_after=m.qty_after,
		unit_cost=m.unit_cost,
		user=m.user,
		reference=m.reference,
	)


def _parse_date_range(from_date: str | None, to_date: str | None) -> tuple[datetime | None, datetime | None]:
	"""Query params arrive as plain "YYYY-MM-DD" strings - turned into real
	datetime bounds here once, rather than comparing a timestamptz column
	against a bare string in three different endpoints."""
	start = datetime.combine(date.fromisoformat(from_date), time.min) if from_date else None
	end = datetime.combine(date.fromisoformat(to_date), time.max) if to_date else None
	return start, end


def _audit_export_row(m: models.StockMovement) -> dict:
	values = [
		to_local(m.created_at).strftime("%Y-%m-%d %H:%M"),
		m.item.barcode,
		m.item.item_name,
		m.warehouse.name,
		m.reason,
		m.qty_before,
		m.delta,
		m.qty_after,
		m.unit_cost if m.unit_cost is not None else "",
		m.user,
		m.reference or "",
	]
	return dict(zip(AUDIT_EXPORT_COLUMNS, values))


@router.get("/audit/report", response_model=list[schemas.AuditReportRow])
def audit_report(
	from_date: str | None = None,
	to_date: str | None = None,
	item_id: int | None = None,
	warehouse_id: int | None = None,
	reason: str | None = None,
	db: Session = Depends(get_db),
):
	start, end = _parse_date_range(from_date, to_date)
	movements = service.query_movements_report(db, start, end, item_id, warehouse_id, reason)
	return [_audit_row_out(m) for m in movements]


@router.get("/audit/export/csv")
def audit_report_export_csv(
	from_date: str | None = None,
	to_date: str | None = None,
	item_id: int | None = None,
	warehouse_id: int | None = None,
	reason: str | None = None,
	db: Session = Depends(get_db),
):
	# Same query as the JSON view above - the screen and the download can
	# never disagree because there's only one place that decides what
	# "the audit report" actually contains.
	start, end = _parse_date_range(from_date, to_date)
	movements = service.query_movements_report(db, start, end, item_id, warehouse_id, reason)
	return to_csv_response([_audit_export_row(m) for m in movements], "stock_audit")


@router.get("/by-barcode/{code}", response_model=schemas.ItemOut)
def get_item_by_barcode(code: str, db: Session = Depends(get_db)):
	"""What the barcode scanner calls once it's connected: barcode is now
	the sole identifier, so this is a direct lookup - no fallback needed."""
	item = _query_with_relations(db).filter(models.Item.barcode == code).first()
	if not item:
		raise HTTPException(status_code=404, detail=f"No item found for barcode '{code}'")
	return _to_out(item)


@router.get("/{item_id}", response_model=schemas.ItemOut)
def get_item(item_id: int, db: Session = Depends(get_db)):
	item = _query_with_relations(db).filter(models.Item.id == item_id).first()
	if not item:
		raise HTTPException(status_code=404, detail="Item not found")
	return _to_out(item)


@router.post("", response_model=schemas.ItemOut, status_code=201)
def create_item(payload: schemas.ItemCreate, db: Session = Depends(get_db)):
	if db.query(models.Item).filter(models.Item.barcode == payload.barcode).first():
		raise HTTPException(status_code=409, detail=f"Barcode '{payload.barcode}' already exists")

	data = payload.model_dump(exclude={"initial_stock_qty"})
	item = models.Item(**data)
	db.add(item)
	# flush (not commit) assigns item.id without ending the transaction -
	# the item and its opening stock movement commit together as one unit,
	# so a failure in adjust_stock can't leave an item that exists with no
	# matching stock record.
	db.flush()

	if payload.initial_stock_qty:
		service.adjust_stock(db, item, payload.initial_stock_qty, reason="initial_stock", commit=False)

	db.commit()
	db.refresh(item)
	return _to_out(item)


@router.put("/{item_id}", response_model=schemas.ItemOut)
def update_item(item_id: int, payload: schemas.ItemUpdate, db: Session = Depends(get_db)):
	item = db.get(models.Item, item_id)
	if not item:
		raise HTTPException(status_code=404, detail="Item not found")
	if payload.barcode != item.barcode:
		existing = db.query(models.Item).filter(models.Item.barcode == payload.barcode).first()
		if existing and existing.id != item_id:
			raise HTTPException(status_code=409, detail=f"Barcode '{payload.barcode}' is already used by another item")

	# image_url is deliberately excluded - it's managed exclusively by
	# upload_item_image() below, never by this general edit form. The
	# frontend's ItemFormValues never carries a photo (see
	# ItemFormModal.tsx: uploads go straight to that endpoint, independent
	# of the rest of the form), so every PUT here always sent image_url as
	# Pydantic's bare default of None, silently wiping out whatever photo
	# was already set the moment anything else on the item was edited.
	for field, value in payload.model_dump(exclude={"image_url"}).items():
		setattr(item, field, value)
	db.commit()
	db.refresh(item)
	return _to_out(item)


@router.post("/{item_id}/image", response_model=schemas.ItemOut)
async def upload_item_image(item_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
	item = db.get(models.Item, item_id)
	if not item:
		raise HTTPException(status_code=404, detail="Item not found")

	ext = ALLOWED_IMAGE_TYPES.get(file.content_type)
	if not ext:
		raise HTTPException(status_code=400, detail="Unsupported image type - use PNG, JPEG, or WEBP")

	content = await file.read()
	if len(content) > MAX_IMAGE_BYTES:
		raise HTTPException(status_code=400, detail="Image too large (max 5MB)")

	os.makedirs(UPLOAD_DIR, exist_ok=True)
	filename = f"{item_id}-{uuid.uuid4().hex[:8]}{ext}"
	with open(os.path.join(UPLOAD_DIR, filename), "wb") as f:
		f.write(content)

	# Old file is no longer referenced by anything once image_url moves on -
	# clean it up rather than letting replaced photos pile up on disk forever.
	old_url = item.image_url
	item.image_url = f"/uploads/items/{filename}"
	db.commit()
	db.refresh(item)

	if old_url and old_url.startswith("/uploads/items/"):
		old_path = os.path.join(UPLOAD_DIR, os.path.basename(old_url))
		if os.path.exists(old_path):
			try:
				os.remove(old_path)
			except OSError:
				pass

	return _to_out(item)


@router.post("/{item_id}/adjust-stock", response_model=schemas.ItemOut)
def adjust_item_stock(item_id: int, payload: schemas.StockAdjustment, db: Session = Depends(get_db)):
	"""The endpoint POS (on sale/scan) and Invoicing (on line add/finalize)
	will call once built - negative delta removes stock, positive adds it
	back (return, purchase receipt). Not wired to either yet since neither
	screen exists, but the mechanism is ready."""
	item = db.get(models.Item, item_id)
	if not item:
		raise HTTPException(status_code=404, detail="Item not found")
	service.adjust_stock(
		db,
		item,
		payload.delta,
		payload.warehouse_id,
		reason=payload.reason or "manual",
		reference=payload.reference,
		unit_cost=payload.unit_cost,
	)
	db.refresh(item)
	return _to_out(item)


@router.get("/{item_id}/stock-movements", response_model=list[schemas.StockMovementOut])
def list_stock_movements(item_id: int, db: Session = Depends(get_db)):
	if not db.get(models.Item, item_id):
		raise HTTPException(status_code=404, detail="Item not found")
	return service.get_movements(db, item_id)


@router.delete("/{item_id}", status_code=204)
def delete_item(item_id: int, db: Session = Depends(get_db)):
	item = db.get(models.Item, item_id)
	if not item:
		raise HTTPException(status_code=404, detail="Item not found")
	service.delete_item(db, item)
