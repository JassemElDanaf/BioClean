import { API_BASE, apiRequest, apiRequestWithCount } from "../../lib/api";

export interface PurchaseLineIn {
	item_id: number;
	qty: number;
	unit_cost?: number;
}

export interface CreatePurchaseOrderPayload {
	supplier_id: number;
	lines: PurchaseLineIn[];
	notes?: string;
}

export interface PurchaseOrderLine {
	id: number;
	item_id: number | null;
	item_name: string;
	barcode: string;
	qty: number;
	unit_cost: number;
	line_total: number;
}

export interface PurchaseOrder {
	id: number;
	supplier_id: number | null;
	supplier_name: string | null;
	warehouse_id: number;
	total: number;
	status: "pending" | "received" | "cancelled";
	payment_status: "unpaid" | "paid";
	notes: string | null;
	user: string;
	created_at: string;
	received_at: string | null;
	lines: PurchaseOrderLine[];
}

export function createPurchaseOrder(payload: CreatePurchaseOrderPayload): Promise<PurchaseOrder> {
	return apiRequest<PurchaseOrder>("/purchases", { method: "POST", body: JSON.stringify(payload) });
}

export interface PurchaseOrderFilters {
	from_date?: string;
	to_date?: string;
}

function purchasesQueryString(filters: PurchaseOrderFilters, extra?: Record<string, string>): string {
	const params = new URLSearchParams({ limit: "500", ...extra });
	if (filters.from_date) params.set("from_date", filters.from_date);
	if (filters.to_date) params.set("to_date", filters.to_date);
	return params.toString();
}

export function listPurchaseOrders(filters: PurchaseOrderFilters = {}): Promise<{ orders: PurchaseOrder[]; total: number }> {
	return apiRequestWithCount<PurchaseOrder[]>(`/purchases?${purchasesQueryString(filters)}`).then(({ data, total }) => ({ orders: data, total }));
}

export function receivePurchaseOrder(id: number): Promise<PurchaseOrder> {
	return apiRequest<PurchaseOrder>(`/purchases/${id}/receive`, { method: "POST" });
}

export function cancelPurchaseOrder(id: number): Promise<PurchaseOrder> {
	return apiRequest<PurchaseOrder>(`/purchases/${id}/cancel`, { method: "POST" });
}

export function markPurchaseOrderPaid(id: number): Promise<PurchaseOrder> {
	return apiRequest<PurchaseOrder>(`/purchases/${id}/mark-paid`, { method: "POST" });
}

export function purchasesExportCsvUrl(filters: PurchaseOrderFilters = {}): string {
	return `${API_BASE}/purchases/export/csv?${purchasesQueryString(filters)}`;
}

export function purchaseOrderPdfUrl(id: number): string {
	return `${API_BASE}/purchases/${id}/pdf`;
}
