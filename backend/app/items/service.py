"""Stock-change logic lives here, in one place, so POS (scan -> sold ->
remove from stock) and Invoicing (add line -> reduce stock on finalize)
both call the same function instead of each hand-rolling their own qty
math against ItemStock. Neither of those tabs exists yet, but the
mechanism is ready for them to call into."""

from fastapi import HTTPException
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from ..core.config import settings
from ..warehouses.models import Warehouse
from .models import Item, ItemStock, StockMovement


def get_default_warehouse(db: Session) -> Warehouse:
	warehouse = db.query(Warehouse).filter(Warehouse.is_default.is_(True)).first()
	if not warehouse:
		raise HTTPException(status_code=500, detail="No default warehouse configured")
	return warehouse


def total_stock(item: Item) -> float:
	return float(sum(level.qty for level in item.stock_levels))


def list_items(
	db: Session,
	skip: int = 0,
	limit: int = 100,
	q: str | None = None,
	category: str | None = None,
	low_stock: bool = False,
) -> tuple[list[Item], int]:
	"""Backs GET /items. `low_stock` is evaluated in Python (stock is a sum
	across ItemStock rows, not a column SQL can filter on directly) - fine
	at this app's real scale (one store's catalogue), same tradeoff
	total_stock() already makes. `q`/`category` filter in SQL since those
	are plain column matches. Returns (page, total_matching) so the caller
	can tell the difference between "20 items exist" and "20 of 500 items
	fit on this page"."""
	# Counted and filtered *before* the joinedload below is applied -
	# joinedload turns stock_levels into a LEFT JOIN, and counting or
	# slicing on top of that would double-count/paginate wrong the moment
	# an item has stock rows in more than one warehouse.
	base = db.query(Item)
	if q:
		like = f"%{q}%"
		base = base.filter(or_(Item.item_name.ilike(like), Item.barcode.ilike(like), Item.category.ilike(like)))
	if category:
		base = base.filter(Item.category == category)

	with_relations = base.options(joinedload(Item.stock_levels)).order_by(Item.item_name)

	if low_stock:
		# Excludes zero-stock items on purpose - "Low Stock" and "Out of
		# Stock" are mutually exclusive everywhere else this app shows them
		# (see frontend StockBadge), so this filter has to agree or the
		# Inventory "Low Stock" toggle would silently include items that are
		# actually shown with an "Out of Stock" badge.
		matching = [item for item in with_relations.all() if 0 < total_stock(item) <= float(item.reorder_level)]
		return matching[skip : skip + limit], len(matching)

	total = base.count()
	return with_relations.offset(skip).limit(limit).all(), total


def _get_or_create_stock_row(db: Session, item_id: int, warehouse_id: int) -> ItemStock:
	"""Row-locked fetch (SELECT ... FOR UPDATE) so two concurrent
	adjust_stock() calls against the same item/warehouse serialize instead
	of both reading the same starting quantity and racing each other to
	write - the exact scenario that would let two simultaneous POS sales
	both succeed against stock that only covers one of them."""
	level = (
		db.query(ItemStock)
		.filter(ItemStock.item_id == item_id, ItemStock.warehouse_id == warehouse_id)
		.with_for_update()
		.first()
	)
	if level:
		return level

	# No row yet for this item/warehouse - create it. A concurrent request
	# could be creating the same row at the same instant; the unique
	# constraint on (item_id, warehouse_id) is the real guard, this just
	# falls back to the now-existing row instead of crashing if we lose
	# that race.
	level = ItemStock(item_id=item_id, warehouse_id=warehouse_id, qty=0)
	db.add(level)
	try:
		db.flush()
	except IntegrityError:
		db.rollback()
		level = (
			db.query(ItemStock)
			.filter(ItemStock.item_id == item_id, ItemStock.warehouse_id == warehouse_id)
			.with_for_update()
			.first()
		)
	return level


def adjust_stock(
	db: Session,
	item: Item,
	delta: float,
	warehouse_id: int | None = None,
	reason: str = "manual",
	reference: str | None = None,
	unit_cost: float | None = None,
	commit: bool = True,
) -> ItemStock:
	"""Applies `delta` to an item's quantity in the given warehouse (or the
	default one). Negative delta = sold/removed (POS sale, invoice line,
	damage write-off); positive = received/returned (purchase receipt,
	customer return). Refuses to take a warehouse negative - a sale can't
	remove stock that isn't there. Every call writes a StockMovement row
	(before/change/after, reason, user, and an optional reference to
	whatever document caused it), so the resulting quantity is always
	traceable to a real event.

	`unit_cost`, when given, is recorded on this specific movement (real
	price history - "what did we pay *this time*") and also becomes the
	item's new current cost_price, so the shelf price reflects the latest
	purchase while the ledger keeps every price that came before it.

	`commit=False` lets a caller (item creation, and later any multi-step
	workflow like a purchase receipt) fold this into its own transaction
	instead of committing twice - so a failure partway through can't leave
	an item that exists with no matching stock record."""
	warehouse_id = warehouse_id or get_default_warehouse(db).id
	level = _get_or_create_stock_row(db, item.id, warehouse_id)

	qty_before = float(level.qty)
	new_qty = qty_before + delta
	if new_qty < 0:
		raise HTTPException(
			status_code=409,
			detail=f"Not enough stock for '{item.barcode}': {level.qty} on hand, {abs(delta)} requested.",
		)

	level.qty = new_qty
	db.add(
		StockMovement(
			item_id=item.id,
			warehouse_id=warehouse_id,
			qty_before=qty_before,
			delta=delta,
			qty_after=new_qty,
			reason=reason,
			unit_cost=unit_cost,
			user=settings.current_user,
			reference=reference,
		)
	)
	if unit_cost is not None:
		item.cost_price = unit_cost

	if commit:
		db.commit()
		db.refresh(level)
	else:
		db.flush()
	return level


def delete_item(db: Session, item: Item) -> None:
	"""Always allowed, regardless of history - every document that ever
	referenced this item (SaleLine, InvoiceLine, PurchaseOrderLine,
	QuotationLine, ReturnLine) already snapshotted its own item_name/
	barcode/price at the time, so it renders correctly forever with no
	live Item row to point at. Deleting just detaches those references
	(item_id -> NULL) instead of destroying the documents themselves -
	a real Sale/Invoice/PO is an accounting record and must never
	disappear just because its catalog entry did.

	This item's OWN stock history (ItemStock/StockMovement) has no
	independent meaning once the item is gone, so those rows cascade-
	delete for real (see Item.movements/.stock_levels relationships)."""
	from ..invoicing.models import InvoiceLine
	from ..pos.models import ReturnLine, SaleLine
	from ..purchases.models import PurchaseOrderLine
	from ..quotation.models import QuotationLine

	for model in (SaleLine, ReturnLine, InvoiceLine, PurchaseOrderLine, QuotationLine):
		db.query(model).filter(model.item_id == item.id).update({"item_id": None})
	db.delete(item)
	db.commit()


def get_movements(db: Session, item_id: int) -> list[StockMovement]:
	return (
		db.query(StockMovement)
		.filter(StockMovement.item_id == item_id)
		.order_by(StockMovement.created_at.desc())
		.all()
	)


def query_movements_report(
	db: Session,
	from_date=None,
	to_date=None,
	item_id: int | None = None,
	warehouse_id: int | None = None,
	reason: str | None = None,
):
	"""The one query behind the Audit Report - both the on-screen table and
	the CSV export call exactly this, so what you see on screen and what
	you download can never disagree (a real requirement, not just
	tidiness: an accountant reconciling a downloaded file against what the
	screen showed them has to get the same numbers)."""
	from sqlalchemy.orm import joinedload

	query = db.query(StockMovement).options(
		joinedload(StockMovement.item), joinedload(StockMovement.warehouse)
	)
	if from_date:
		query = query.filter(StockMovement.created_at >= from_date)
	if to_date:
		query = query.filter(StockMovement.created_at <= to_date)
	if item_id:
		query = query.filter(StockMovement.item_id == item_id)
	if warehouse_id:
		query = query.filter(StockMovement.warehouse_id == warehouse_id)
	if reason:
		query = query.filter(StockMovement.reason == reason)
	return query.order_by(StockMovement.created_at.desc()).all()
