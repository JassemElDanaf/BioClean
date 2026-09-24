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
	item_id: number;
	item_name: string;
	barcode: string;
	qty: number;
	unit_cost: number;
	line_total: number;
}

export interface PurchaseOrder {
	id: number;
	supplier_id: number;
	supplier_name: string | null;
	warehouse_id: number;
	total: number;
	status: "pending" | "received" | "cancelled";
	notes: string | null;
	user: string;
	created_at: string;
	received_at: string | null;
	lines: PurchaseOrderLine[];
}

export function createPurchaseOrder(payload: CreatePurchaseOrderPayload): Promise<PurchaseOrder> {
	return apiRequest<PurchaseOrder>("/purchases", { method: "POST", body: JSON.stringify(payload) });
}

export function listPurchaseOrders(): Promise<{ orders: PurchaseOrder[]; total: number }> {
	return apiRequestWithCount<PurchaseOrder[]>("/purchases?limit=500").then(({ data, total }) => ({ orders: data, total }));
}

export function receivePurchaseOrder(id: number): Promise<PurchaseOrder> {
	return apiRequest<PurchaseOrder>(`/purchases/${id}/receive`, { method: "POST" });
}

export function cancelPurchaseOrder(id: number): Promise<PurchaseOrder> {
	return apiRequest<PurchaseOrder>(`/purchases/${id}/cancel`, { method: "POST" });
}

export const purchasesExportCsvUrl = `${API_BASE}/purchases/export/csv`;

export function purchaseOrderPdfUrl(id: number): string {
	return `${API_BASE}/purchases/${id}/pdf`;
}
