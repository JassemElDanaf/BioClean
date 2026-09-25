import { apiRequest } from "../../lib/api";

export interface DashboardFilters {
	from_date?: string;
	to_date?: string;
}

export interface DashboardSummary {
	sales_revenue: number;
	sales_count: number;
	invoice_revenue: number;
	manual_income: number;
	total_revenue: number;
	average_sale: number;
	cogs: number;
	gross_profit: number;
	expenses_total: number;
	net_profit: number;
	// Cash spent restocking this period (received POs) - a cash-flow
	// figure, deliberately NOT part of net_profit above (see backend
	// dashboard/service.py's docstring - it would double-count against
	// COGS once the stock actually sells).
	purchases_total: number;
	low_stock_count: number;
	out_of_stock_count: number;
	total_items: number;
	total_inventory_value: number;
	unpaid_invoices_count: number;
	unpaid_invoices_total: number;
}

export interface TrendPoint {
	date: string;
	revenue: number;
}

export interface PaymentBreakdownRow {
	payment_method: string;
	total: number;
	count: number;
}

export interface TopProductRow {
	item_name: string;
	qty: number;
	revenue: number;
}

export interface DashboardInsights {
	trend: TrendPoint[];
	payment_breakdown: PaymentBreakdownRow[];
	top_products: TopProductRow[];
}

function filtersQueryString(filters: DashboardFilters): string {
	const params = new URLSearchParams();
	if (filters.from_date) params.set("from_date", filters.from_date);
	if (filters.to_date) params.set("to_date", filters.to_date);
	return params.toString();
}

export function getDashboardSummary(filters: DashboardFilters = {}): Promise<DashboardSummary> {
	const qs = filtersQueryString(filters);
	return apiRequest<DashboardSummary>(`/dashboard/summary${qs ? `?${qs}` : ""}`);
}

export function getDashboardInsights(filters: DashboardFilters = {}): Promise<DashboardInsights> {
	const qs = filtersQueryString(filters);
	return apiRequest<DashboardInsights>(`/dashboard/insights${qs ? `?${qs}` : ""}`);
}
