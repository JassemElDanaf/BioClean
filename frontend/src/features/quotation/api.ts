import { API_BASE, apiRequest, apiRequestWithCount } from "../../lib/api";
import type { Invoice } from "../invoicing/api";

export interface QuotationLineIn {
	item_id: number;
	qty: number;
	unit_price?: number;
}

export interface CreateQuotationPayload {
	customer_id?: number | null;
	lines: QuotationLineIn[];
	valid_until?: string;
	notes?: string;
}

export interface QuotationLine {
	id: number;
	item_id: number | null;
	item_name: string;
	barcode: string;
	qty: number;
	unit_price: number;
	line_total: number;
}

export interface Quotation {
	id: number;
	customer_id: number | null;
	customer_name: string | null;
	total: number;
	status: "draft" | "sent" | "accepted" | "expired" | "converted";
	valid_until: string | null;
	notes: string | null;
	user: string;
	created_at: string;
	converted_invoice_id: number | null;
	lines: QuotationLine[];
}

export function createQuotation(payload: CreateQuotationPayload): Promise<Quotation> {
	return apiRequest<Quotation>("/quotations", { method: "POST", body: JSON.stringify(payload) });
}

export interface QuotationFilters {
	from_date?: string;
	to_date?: string;
}

export function listQuotations(filters: QuotationFilters = {}): Promise<{ quotations: Quotation[]; total: number }> {
	const params = new URLSearchParams({ limit: "500" });
	if (filters.from_date) params.set("from_date", filters.from_date);
	if (filters.to_date) params.set("to_date", filters.to_date);
	return apiRequestWithCount<Quotation[]>(`/quotations?${params.toString()}`).then(({ data, total }) => ({ quotations: data, total }));
}

export function deleteQuotation(id: number): Promise<void> {
	return apiRequest<void>(`/quotations/${id}`, { method: "DELETE" });
}

export function convertQuotation(id: number): Promise<Invoice> {
	return apiRequest<Invoice>(`/quotations/${id}/convert`, { method: "POST" });
}

export function quotationPdfUrl(id: number): string {
	return `${API_BASE}/quotations/${id}/pdf`;
}
