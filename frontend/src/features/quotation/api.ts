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
	item_id: number;
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

export function listQuotations(): Promise<{ quotations: Quotation[]; total: number }> {
	return apiRequestWithCount<Quotation[]>("/quotations?limit=500").then(({ data, total }) => ({ quotations: data, total }));
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
