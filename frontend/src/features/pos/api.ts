import { API_BASE, apiRequest, apiRequestWithCount } from "../../lib/api";

export interface CheckoutLine {
	item_id: number;
	qty: number;
	unit_price?: number;
}

export interface CheckoutPayload {
	lines: CheckoutLine[];
	payment_method: string;
	amount_tendered?: number;
	idempotency_key?: string;
}

export interface SaleLine {
	id: number;
	// Null once the underlying Item has been deleted - item_name/barcode/
	// unit_price below are already a full snapshot either way.
	item_id: number | null;
	item_name: string;
	barcode: string;
	qty: number;
	unit_price: number;
	unit_cost: number;
	line_total: number;
}

export interface Sale {
	id: number;
	warehouse_id: number;
	subtotal: number;
	tax_amount: number;
	exchange_rate: number;
	total: number;
	payment_method: string;
	amount_tendered: number | null;
	change_due: number | null;
	voided: boolean;
	voided_at: string | null;
	user: string;
	created_at: string;
	returned_total: number;
	lines: SaleLine[];
}

export interface ReturnLineIn {
	sale_line_id: number;
	qty: number;
}

export interface ReturnPayload {
	lines: ReturnLineIn[];
	refund_method: string;
	reason?: string;
}

export interface ReturnLine {
	id: number;
	sale_line_id: number;
	item_id: number | null;
	item_name: string;
	barcode: string;
	qty: number;
	unit_price: number;
	line_refund: number;
}

export interface Return {
	id: number;
	sale_id: number;
	refund_method: string;
	total_refund: number;
	reason: string | null;
	user: string;
	created_at: string;
	lines: ReturnLine[];
}

export function checkout(payload: CheckoutPayload): Promise<Sale> {
	return apiRequest<Sale>("/pos/sales", { method: "POST", body: JSON.stringify(payload) });
}

export interface SalesFilters {
	from_date?: string;
	to_date?: string;
}

function salesQueryString(filters: SalesFilters, extra?: Record<string, string>): string {
	const params = new URLSearchParams({ limit: "500", ...extra });
	if (filters.from_date) params.set("from_date", filters.from_date);
	if (filters.to_date) params.set("to_date", filters.to_date);
	return params.toString();
}

export function listSales(filters: SalesFilters = {}): Promise<{ sales: Sale[]; total: number }> {
	return apiRequestWithCount<Sale[]>(`/pos/sales?${salesQueryString(filters)}`).then(({ data, total }) => ({ sales: data, total }));
}

export function voidSale(id: number): Promise<Sale> {
	return apiRequest<Sale>(`/pos/sales/${id}/void`, { method: "POST" });
}

export function salesExportCsvUrl(filters: SalesFilters = {}): string {
	return `${API_BASE}/pos/sales/export/csv?${salesQueryString(filters)}`;
}

export function saleReceiptPdfUrl(id: number): string {
	return `${API_BASE}/pos/sales/${id}/pdf`;
}

// Sends the sale to the physical thermal receipt printer configured in
// Settings - separate from saleReceiptPdfUrl above, which is the Letter-
// size PDF for download/email/backup, not what prints on the roll.
export function printSaleReceipt(id: number): Promise<{ printed: boolean }> {
	return apiRequest(`/pos/sales/${id}/print`, { method: "POST" });
}

export function createReturn(saleId: number, payload: ReturnPayload): Promise<Return> {
	return apiRequest<Return>(`/pos/sales/${saleId}/return`, { method: "POST", body: JSON.stringify(payload) });
}

export function listReturns(saleId: number): Promise<Return[]> {
	return apiRequest<Return[]>(`/pos/sales/${saleId}/returns`);
}
