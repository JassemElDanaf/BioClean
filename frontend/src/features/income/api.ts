import { API_BASE, apiRequest, apiRequestWithCount } from "../../lib/api";

export interface Income {
	id: number;
	source: string;
	amount: number;
	description: string | null;
	date: string;
	reference: string | null;
	user: string;
	created_at: string;
}

export interface IncomeFormValues {
	source: string;
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

export function listIncome(filters: DateFilters = {}): Promise<{ income: Income[]; total: number }> {
	return apiRequestWithCount<Income[]>(`/income?${queryString(filters)}`).then(({ data, total }) => ({ income: data, total }));
}

export function createIncome(values: IncomeFormValues): Promise<Income> {
	return apiRequest<Income>("/income", { method: "POST", body: JSON.stringify(toPayload(values)) });
}

export function updateIncome(id: number, values: IncomeFormValues): Promise<Income> {
	return apiRequest<Income>(`/income/${id}`, { method: "PUT", body: JSON.stringify(toPayload(values)) });
}

export function deleteIncome(id: number): Promise<void> {
	return apiRequest<void>(`/income/${id}`, { method: "DELETE" });
}

export function incomeExportCsvUrl(filters: DateFilters = {}): string {
	return `${API_BASE}/income/export/csv?${queryString(filters)}`;
}

function toPayload(values: IncomeFormValues) {
	return {
		source: values.source,
		amount: values.amount,
		description: values.description || null,
		date: values.date ? new Date(values.date).toISOString() : undefined,
		reference: values.reference || null,
	};
}
