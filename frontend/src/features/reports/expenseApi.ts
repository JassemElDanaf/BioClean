// Unified feed of every source of money leaving the business - received
// Purchase Orders and manual Expense entries - backed by
// backend/app/reports/expense_service.py. Mirrors revenueApi.ts on the
// money-out side.

import { API_BASE, apiRequestWithCount } from "../../lib/api";

export type ExpenseEntryType = "purchase_order" | "expense";

export interface ExpenseEntry {
	type: ExpenseEntryType;
	id: number;
	reference: string;
	occurred_at: string;
	method: string;
	amount: number;
	label: string | null;
}

export interface ExpenseHistoryFilters {
	from_date?: string;
	to_date?: string;
}

function queryString(filters: ExpenseHistoryFilters): string {
	const params = new URLSearchParams({ limit: "500" });
	if (filters.from_date) params.set("from_date", filters.from_date);
	if (filters.to_date) params.set("to_date", filters.to_date);
	return params.toString();
}

export function listExpenseHistory(filters: ExpenseHistoryFilters = {}): Promise<{ entries: ExpenseEntry[]; total: number }> {
	return apiRequestWithCount<ExpenseEntry[]>(`/reports/expense-history?${queryString(filters)}`).then(({ data, total }) => ({
		entries: data,
		total,
	}));
}

export function expenseHistoryExportCsvUrl(filters: ExpenseHistoryFilters = {}): string {
	return `${API_BASE}/reports/expense-history/export/csv?${queryString(filters)}`;
}
