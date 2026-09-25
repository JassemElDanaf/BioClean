// Unified feed of every source of money coming into the business - POS
// sales, paid invoices, and manual Income entries - backed by
// backend/app/reports/revenue_service.py. Sales History used to call
// pos/api.ts's listSales() alone, which only ever showed POS transactions.

import { API_BASE, apiRequestWithCount } from "../../lib/api";

export type RevenueEntryType = "pos_sale" | "invoice" | "income";

export interface RevenueEntry {
	type: RevenueEntryType;
	id: number;
	reference: string;
	occurred_at: string;
	method: string;
	amount: number;
	voided: boolean;
	label: string | null;
}

export interface RevenueFilters {
	from_date?: string;
	to_date?: string;
}

function revenueQueryString(filters: RevenueFilters): string {
	const params = new URLSearchParams({ limit: "500" });
	if (filters.from_date) params.set("from_date", filters.from_date);
	if (filters.to_date) params.set("to_date", filters.to_date);
	return params.toString();
}

export function listRevenueHistory(filters: RevenueFilters = {}): Promise<{ entries: RevenueEntry[]; total: number }> {
	return apiRequestWithCount<RevenueEntry[]>(`/reports/revenue-history?${revenueQueryString(filters)}`).then(({ data, total }) => ({
		entries: data,
		total,
	}));
}

export function revenueHistoryExportCsvUrl(filters: RevenueFilters = {}): string {
	return `${API_BASE}/reports/revenue-history/export/csv?${revenueQueryString(filters)}`;
}
