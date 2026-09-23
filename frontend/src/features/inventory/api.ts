import { API_BASE, apiRequest } from "../../lib/api";
import type { AuditFilters, AuditReportRow, Item, ItemFormValues, StockMovement, Supplier, Warehouse } from "./types";

export function listItems(): Promise<Item[]> {
	return apiRequest<Item[]>("/items?limit=500");
}

export function createItem(values: ItemFormValues): Promise<Item> {
	return apiRequest<Item>("/items", { method: "POST", body: JSON.stringify(values) });
}

export function updateItem(id: number, values: ItemFormValues): Promise<Item> {
	return apiRequest<Item>(`/items/${id}`, { method: "PUT", body: JSON.stringify(values) });
}

export function deleteItem(id: number): Promise<void> {
	return apiRequest<void>(`/items/${id}`, { method: "DELETE" });
}

export function listSuppliers(): Promise<Supplier[]> {
	return apiRequest<Supplier[]>("/suppliers");
}

export function adjustStock(itemId: number, delta: number, reason: string, unitCost?: number): Promise<Item> {
	return apiRequest<Item>(`/items/${itemId}/adjust-stock`, {
		method: "POST",
		body: JSON.stringify({ delta, reason, unit_cost: unitCost ?? null }),
	});
}

export function getStockMovements(itemId: number): Promise<StockMovement[]> {
	return apiRequest<StockMovement[]>(`/items/${itemId}/stock-movements`);
}

export const exportItemsCsvUrl = `${API_BASE}/items/export/csv`;

export function listWarehouses(): Promise<Warehouse[]> {
	return apiRequest<Warehouse[]>("/warehouses");
}

function auditQueryString(filters: AuditFilters): string {
	const params = new URLSearchParams();
	if (filters.from_date) params.set("from_date", filters.from_date);
	if (filters.to_date) params.set("to_date", filters.to_date);
	if (filters.item_id) params.set("item_id", String(filters.item_id));
	if (filters.warehouse_id) params.set("warehouse_id", String(filters.warehouse_id));
	if (filters.reason) params.set("reason", filters.reason);
	return params.toString();
}

export function getAuditReport(filters: AuditFilters): Promise<AuditReportRow[]> {
	return apiRequest<AuditReportRow[]>(`/items/audit/report?${auditQueryString(filters)}`);
}

export function auditExportCsvUrl(filters: AuditFilters): string {
	return `${API_BASE}/items/audit/export/csv?${auditQueryString(filters)}`;
}
