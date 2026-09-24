from pydantic import BaseModel


class DashboardSummary(BaseModel):
	# Revenue/profit figures respect the requested date range (defaults to
	# "all time" when omitted). Inventory figures are always a live,
	# point-in-time snapshot - see service.py's docstring for why.
	sales_revenue: float
	sales_count: int
	invoice_revenue: float
	total_revenue: float
	average_sale: float
	cogs: float
	gross_profit: float
	low_stock_count: int
	out_of_stock_count: int
	total_items: int
	total_inventory_value: float
	unpaid_invoices_count: int
	unpaid_invoices_total: float
