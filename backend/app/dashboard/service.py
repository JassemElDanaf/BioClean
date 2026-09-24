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

from datetime import datetime

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..invoicing.models import Invoice, InvoiceLine
from ..items.models import Item, ItemStock
from ..pos.models import Sale, SaleLine


def get_summary(db: Session, from_date: datetime | None, to_date: datetime | None) -> dict:
	def date_filtered(query, date_column):
		if from_date:
			query = query.filter(date_column >= from_date)
		if to_date:
			query = query.filter(date_column <= to_date)
		return query

	sales_revenue, sales_count = date_filtered(
		db.query(func.coalesce(func.sum(Sale.total), 0), func.count(Sale.id)).filter(Sale.voided.is_(False)),
		Sale.created_at,
	).one()
	sales_revenue = float(sales_revenue)

	sales_cogs = date_filtered(
		db.query(func.coalesce(func.sum(SaleLine.qty * SaleLine.unit_cost), 0))
		.join(Sale, Sale.id == SaleLine.sale_id)
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

	total_revenue = sales_revenue + invoice_revenue
	cogs = sales_cogs + invoice_cogs
	gross_profit = total_revenue - cogs
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
		"total_revenue": total_revenue,
		"average_sale": average_sale,
		"cogs": cogs,
		"gross_profit": gross_profit,
		"low_stock_count": low_stock_count,
		"out_of_stock_count": out_of_stock_count,
		"total_items": total_items,
		"total_inventory_value": total_inventory_value,
		"unpaid_invoices_count": unpaid_count,
		"unpaid_invoices_total": float(unpaid_total),
	}
