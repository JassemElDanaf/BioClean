from pydantic import BaseModel


class DashboardSummary(BaseModel):
	# Revenue/profit figures respect the requested date range (defaults to
	# "all time" when omitted). Inventory figures are always a live,
	# point-in-time snapshot - see service.py's docstring for why.
	sales_revenue: float
	sales_count: int
	invoice_revenue: float
	manual_income: float
	total_revenue: float
	average_sale: float
	cogs: float
	gross_profit: float
	expenses_total: float
	net_profit: float
	# Cash spent restocking this period (received POs) - shown for cash-
	# flow visibility, deliberately excluded from net_profit above since
	# it becomes COGS (already counted) only once the stock actually
	# sells. See service.py:get_summary()'s docstring.
	purchases_total: float
	low_stock_count: int
	out_of_stock_count: int
	total_items: int
	total_inventory_value: float
	unpaid_invoices_count: int
	unpaid_invoices_total: float


class TrendPoint(BaseModel):
	date: str  # YYYY-MM-DD
	revenue: float


class PaymentBreakdownRow(BaseModel):
	payment_method: str
	total: float
	count: int


class TopProductRow(BaseModel):
	item_name: str
	qty: float
	revenue: float


class DashboardInsights(BaseModel):
	# Rolling 14-day window, independent of the summary's own date filter -
	# stays meaningful (and comparable day-to-day) even when the selected
	# range is a single day. See service.py:get_insights().
	trend: list[TrendPoint]
	# Both respect the summary's date filter.
	payment_breakdown: list[PaymentBreakdownRow]
	top_products: list[TopProductRow]
