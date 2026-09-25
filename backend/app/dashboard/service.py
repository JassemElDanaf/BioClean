"""Real SQL aggregation for the Dashboard's headline numbers - Postgres
does the SUM/COUNT work, so this never pulls whole tables of sales or
invoices into Python (let alone into the frontend) just to add them up.
That was the old DashboardTab's approach (fetch up to 500 rows via the
general list endpoints, reduce() in the browser); this endpoint replaces
it with one query per figure, each doing the arithmetic in the database.

Revenue/COGS/profit respect the given date range. Inventory figures
(stock levels, valuation) are always "right now" - a warehouse doesn't
have a meaningful date range the way a period's sales do, and every other
inventory view in the app (Inventory tab, StockBadge) is point-in-time
too, so the Dashboard has to agree with them rather than show a stale
range-filtered stock count."""

from datetime import datetime, time, timedelta, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..expenses.models import Expense
from ..income.models import Income
from ..invoicing.models import Invoice, InvoiceLine
from ..items.models import Item, ItemStock
from ..pos.models import ReturnLine, Sale, SaleLine
from ..purchases.models import PurchaseOrder


def get_summary(db: Session, from_date: datetime | None, to_date: datetime | None) -> dict:
	def date_filtered(query, date_column):
		if from_date:
			query = query.filter(date_column >= from_date)
		if to_date:
			query = query.filter(date_column <= to_date)
		return query

	# Net of returns - a partially/fully returned sale isn't real revenue
	# for the returned portion any more (see pos/service.py:create_return()
	# and Sale.returned_total's docstring). Attributed back to the
	# original sale's own date, not the return's - "sales that happened in
	# this period" should show their current, up-to-date net total
	# regardless of when a later return against them happened.
	sales_revenue, sales_count = date_filtered(
		db.query(func.coalesce(func.sum(Sale.total - Sale.returned_total), 0), func.count(Sale.id)).filter(Sale.voided.is_(False)),
		Sale.created_at,
	).one()
	sales_revenue = float(sales_revenue)

	returned_qty_by_line = (
		db.query(ReturnLine.sale_line_id, func.sum(ReturnLine.qty).label("returned_qty")).group_by(ReturnLine.sale_line_id).subquery()
	)
	sales_cogs = date_filtered(
		db.query(func.coalesce(func.sum((SaleLine.qty - func.coalesce(returned_qty_by_line.c.returned_qty, 0)) * SaleLine.unit_cost), 0))
		.join(Sale, Sale.id == SaleLine.sale_id)
		.outerjoin(returned_qty_by_line, returned_qty_by_line.c.sale_line_id == SaleLine.id)
		.filter(Sale.voided.is_(False)),
		Sale.created_at,
	).scalar()
	sales_cogs = float(sales_cogs)

	# Unpaid invoices are pending commitments, not real sales - only "paid"
	# ones count as revenue, matching the backend's own invoice lifecycle
	# (see invoicing/service.py) and the Financial Summary report.
	invoice_revenue = date_filtered(
		db.query(func.coalesce(func.sum(Invoice.total), 0)).filter(Invoice.status == "paid"),
		Invoice.created_at,
	).scalar()
	invoice_revenue = float(invoice_revenue)

	invoice_cogs = date_filtered(
		db.query(func.coalesce(func.sum(InvoiceLine.qty * InvoiceLine.unit_cost), 0))
		.join(Invoice, Invoice.id == InvoiceLine.invoice_id)
		.filter(Invoice.status == "paid"),
		Invoice.created_at,
	).scalar()
	invoice_cogs = float(invoice_cogs)

	manual_income = date_filtered(db.query(func.coalesce(func.sum(Income.amount), 0)), Income.date).scalar()
	manual_income = float(manual_income)

	expenses_total = date_filtered(db.query(func.coalesce(func.sum(Expense.amount), 0)), Expense.date).scalar()
	expenses_total = float(expenses_total)

	# Cash spent restocking this period - goods actually received
	# (received_at), regardless of whether the supplier's own invoice has
	# been paid yet (that's tracked separately as accounts payable, see
	# suppliers/router.py). Deliberately NOT folded into net_profit below:
	# a purchase is inventory (an asset) until it sells, at which point it
	# already shows up as COGS above - counting it again here would double
	# it. This is purely a cash-outflow figure for the accountant, shown
	# alongside profit, not subtracted from it.
	purchases_total = date_filtered(
		db.query(func.coalesce(func.sum(PurchaseOrder.total), 0)).filter(PurchaseOrder.status == "received"),
		PurchaseOrder.received_at,
	).scalar()
	purchases_total = float(purchases_total)

	total_revenue = sales_revenue + invoice_revenue + manual_income
	cogs = sales_cogs + invoice_cogs
	gross_profit = total_revenue - cogs
	net_profit = gross_profit - expenses_total
	average_sale = sales_revenue / sales_count if sales_count else 0.0

	unpaid_count, unpaid_total = (
		db.query(func.count(Invoice.id), func.coalesce(func.sum(Invoice.total), 0)).filter(Invoice.status == "unpaid").one()
	)

	total_items = db.query(func.count(Item.id)).scalar() or 0

	# Per-item stock is a sum across warehouses (ItemStock rows), so it has
	# to be grouped before the low/out-of-stock/valuation checks below can
	# run per item - same reasoning as items.service.total_stock(), just
	# done once here for every item instead of once per item in Python.
	stock_rows = (
		db.query(Item.reorder_level, Item.cost_price, func.coalesce(func.sum(ItemStock.qty), 0).label("qty"))
		.outerjoin(ItemStock, ItemStock.item_id == Item.id)
		.group_by(Item.id, Item.reorder_level, Item.cost_price)
		.all()
	)
	low_stock_count = sum(1 for row in stock_rows if 0 < row.qty <= row.reorder_level)
	out_of_stock_count = sum(1 for row in stock_rows if row.qty <= 0)
	total_inventory_value = float(sum(row.qty * row.cost_price for row in stock_rows))

	return {
		"sales_revenue": sales_revenue,
		"sales_count": sales_count,
		"invoice_revenue": invoice_revenue,
		"manual_income": manual_income,
		"total_revenue": total_revenue,
		"average_sale": average_sale,
		"cogs": cogs,
		"gross_profit": gross_profit,
		"expenses_total": expenses_total,
		"net_profit": net_profit,
		"purchases_total": purchases_total,
		"low_stock_count": low_stock_count,
		"out_of_stock_count": out_of_stock_count,
		"total_items": total_items,
		"total_inventory_value": total_inventory_value,
		"unpaid_invoices_count": unpaid_count,
		"unpaid_invoices_total": float(unpaid_total),
	}


def get_insights(db: Session, from_date: datetime | None, to_date: datetime | None) -> dict:
	"""Supporting data for the dashboard's chart/breakdown widgets -
	trend/payment-breakdown/top-products - kept as a second endpoint
	rather than folded into get_summary() so the cheap headline numbers
	never pay for these heavier group-by queries on every summary poll."""

	def date_filtered(query, date_column):
		if from_date:
			query = query.filter(date_column >= from_date)
		if to_date:
			query = query.filter(date_column <= to_date)
		return query

	# Rolling 14-day trend, deliberately independent of the from/to filter
	# above - a single-day KPI selection ("Today") would otherwise collapse
	# this into a one-point chart with nothing to show a trend against.
	# Bucketed in Python rather than SQL (func.date()/date_trunc) since
	# that truncation isn't portable across the Postgres used in
	# production and the SQLite used in tests (see conftest.py) - 14 days
	# of raw rows is nothing to pull client-side.
	#
	# UTC, not local server time - created_at is stamped by the DB's own
	# func.now() (UTC), same as every other timestamp in the app (see
	# invoicing/service.py's paid_at, pos/service.py's voided_at, etc.);
	# anchoring "today" to the app server's local clock instead would
	# silently misbucket rows near midnight whenever the server isn't
	# itself running in UTC.
	trend_start_date = (datetime.now(timezone.utc) - timedelta(days=13)).date()
	trend_start = datetime.combine(trend_start_date, time.min)
	trend_sales = (
		db.query(Sale.created_at, Sale.total, Sale.returned_total)
		.filter(Sale.voided.is_(False), Sale.created_at >= trend_start)
		.all()
	)
	revenue_by_day: dict[str, float] = {}
	for created_at, total, returned_total in trend_sales:
		key = created_at.date().isoformat()
		revenue_by_day[key] = revenue_by_day.get(key, 0.0) + float(total) - float(returned_total)
	trend = []
	for offset in range(14):
		d = trend_start_date + timedelta(days=offset)
		trend.append({"date": d.isoformat(), "revenue": revenue_by_day.get(str(d), 0.0)})

	# Payment breakdown is POS-only - invoices/quotations have no
	# payment_method column (they're settled on credit terms, not at a
	# till), so there's nothing meaningful to add in from those.
	payment_rows = date_filtered(
		db.query(Sale.payment_method, func.coalesce(func.sum(Sale.total - Sale.returned_total), 0), func.count(Sale.id))
		.filter(Sale.voided.is_(False))
		.group_by(Sale.payment_method),
		Sale.created_at,
	).all()
	payment_breakdown = [{"payment_method": row[0], "total": float(row[1]), "count": row[2]} for row in payment_rows]

	# Top products combine POS sales (net of returns, same subquery
	# get_summary() uses) and paid invoice lines - grouped by item_name
	# rather than item_id since a deleted item's lines still carry their
	# own name snapshot (see items/service.py:delete_item()) and should
	# still count toward what actually sold in this period.
	returned_qty_by_line = (
		db.query(ReturnLine.sale_line_id, func.sum(ReturnLine.qty).label("returned_qty")).group_by(ReturnLine.sale_line_id).subquery()
	)
	net_qty = SaleLine.qty - func.coalesce(returned_qty_by_line.c.returned_qty, 0)
	sale_product_rows = date_filtered(
		db.query(SaleLine.item_name, func.sum(net_qty), func.sum(net_qty * SaleLine.unit_price))
		.join(Sale, Sale.id == SaleLine.sale_id)
		.outerjoin(returned_qty_by_line, returned_qty_by_line.c.sale_line_id == SaleLine.id)
		.filter(Sale.voided.is_(False))
		.group_by(SaleLine.item_name),
		Sale.created_at,
	).all()
	invoice_product_rows = date_filtered(
		db.query(InvoiceLine.item_name, func.sum(InvoiceLine.qty), func.sum(InvoiceLine.qty * InvoiceLine.unit_price))
		.join(Invoice, Invoice.id == InvoiceLine.invoice_id)
		.filter(Invoice.status == "paid")
		.group_by(InvoiceLine.item_name),
		Invoice.created_at,
	).all()

	merged: dict[str, list[float]] = {}
	for name, qty, revenue in [*sale_product_rows, *invoice_product_rows]:
		row = merged.setdefault(name, [0.0, 0.0])
		row[0] += float(qty or 0)
		row[1] += float(revenue or 0)

	top_products = sorted(
		({"item_name": name, "qty": qty, "revenue": revenue} for name, (qty, revenue) in merged.items()),
		key=lambda r: -r["revenue"],
	)[:5]

	return {"trend": trend, "payment_breakdown": payment_breakdown, "top_products": top_products}
