import { apiRequest } from "../../lib/api";

export interface DashboardFilters {
	from_date?: string;
	to_date?: string;
}

export interface DashboardSummary {
	sales_revenue: number;
	sales_count: number;
	invoice_revenue: number;
	total_revenue: number;
	average_sale: number;
	cogs: number;
	gross_profit: number;
	low_stock_count: number;
	out_of_stock_count: number;
	total_items: number;
	total_inventory_value: number;
	unpaid_invoices_count: number;
	unpaid_invoices_total: number;
}

export function getDashboardSummary(filters: DashboardFilters = {}): Promise<DashboardSummary> {
	const params = new URLSearchParams();
	if (filters.from_date) params.set("from_date", filters.from_date);
	if (filters.to_date) params.set("to_date", filters.to_date);
	const qs = params.toString();
	return apiRequest<DashboardSummary>(`/dashboard/summary${qs ? `?${qs}` : ""}`);
}
