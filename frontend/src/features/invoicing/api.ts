import { API_BASE, apiRequest, apiRequestWithCount } from "../../lib/api";

export interface InvoiceLineIn {
	item_id: number;
	qty: number;
	unit_price?: number;
}

export interface CreateInvoicePayload {
	customer_id?: number | null;
	lines: InvoiceLineIn[];
	due_date?: string;
	notes?: string;
}

export interface InvoiceLine {
	id: number;
	item_id: number;
	item_name: string;
	barcode: string;
	qty: number;
	unit_price: number;
	unit_cost: number;
	line_total: number;
}

export interface Invoice {
	id: number;
	customer_id: number | null;
	customer_name: string | null;
	warehouse_id: number;
	total: number;
	exchange_rate: number;
	status: "unpaid" | "paid" | "voided";
	due_date: string | null;
	notes: string | null;
	user: string;
	created_at: string;
	paid_at: string | null;
	voided_at: string | null;
	lines: InvoiceLine[];
}

export interface InvoiceFilters {
	from_date?: string;
	to_date?: string;
	status?: string;
	customer_id?: number;
}

function queryString(filters: InvoiceFilters, extra?: Record<string, string>): string {
	const params = new URLSearchParams({ limit: "500", ...extra });
	if (filters.from_date) params.set("from_date", filters.from_date);
	if (filters.to_date) params.set("to_date", filters.to_date);
	if (filters.status) params.set("status", filters.status);
	if (filters.customer_id) params.set("customer_id", String(filters.customer_id));
	return params.toString();
}

export function createInvoice(payload: CreateInvoicePayload): Promise<Invoice> {
	return apiRequest<Invoice>("/invoices", { method: "POST", body: JSON.stringify(payload) });
}

export function listInvoices(filters: InvoiceFilters = {}): Promise<{ invoices: Invoice[]; total: number }> {
	return apiRequestWithCount<Invoice[]>(`/invoices?${queryString(filters)}`).then(({ data, total }) => ({ invoices: data, total }));
}

export function markInvoicePaid(id: number): Promise<Invoice> {
	return apiRequest<Invoice>(`/invoices/${id}/mark-paid`, { method: "POST" });
}

export function voidInvoice(id: number): Promise<Invoice> {
	return apiRequest<Invoice>(`/invoices/${id}/void`, { method: "POST" });
}

export function invoicePdfUrl(id: number): string {
	return `${API_BASE}/invoices/${id}/pdf`;
}
