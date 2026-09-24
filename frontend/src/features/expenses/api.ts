import { API_BASE, apiRequest, apiRequestWithCount } from "../../lib/api";

export interface Expense {
	id: number;
	category: string;
	amount: number;
	description: string | null;
	date: string;
	reference: string | null;
	user: string;
	created_at: string;
}

export interface ExpenseFormValues {
	category: string;
	amount: number;
	description: string;
	date: string;
	reference: string;
}

export interface DateFilters {
	from_date?: string;
	to_date?: string;
}

function queryString(filters: DateFilters): string {
	const params = new URLSearchParams({ limit: "500" });
	if (filters.from_date) params.set("from_date", filters.from_date);
	if (filters.to_date) params.set("to_date", filters.to_date);
	return params.toString();
}

export function listExpenses(filters: DateFilters = {}): Promise<{ expenses: Expense[]; total: number }> {
	return apiRequestWithCount<Expense[]>(`/expenses?${queryString(filters)}`).then(({ data, total }) => ({ expenses: data, total }));
}

export function createExpense(values: ExpenseFormValues): Promise<Expense> {
	return apiRequest<Expense>("/expenses", { method: "POST", body: JSON.stringify(toPayload(values)) });
}

export function updateExpense(id: number, values: ExpenseFormValues): Promise<Expense> {
	return apiRequest<Expense>(`/expenses/${id}`, { method: "PUT", body: JSON.stringify(toPayload(values)) });
}

export function deleteExpense(id: number): Promise<void> {
	return apiRequest<void>(`/expenses/${id}`, { method: "DELETE" });
}

export function expensesExportCsvUrl(filters: DateFilters = {}): string {
	return `${API_BASE}/expenses/export/csv?${queryString(filters)}`;
}

function toPayload(values: ExpenseFormValues) {
	return {
		category: values.category,
		amount: values.amount,
		description: values.description || null,
		date: values.date ? new Date(values.date).toISOString() : undefined,
		reference: values.reference || null,
	};
}
