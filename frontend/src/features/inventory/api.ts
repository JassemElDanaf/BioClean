import { API_BASE, apiRequest, apiRequestWithCount, apiUpload } from "../../lib/api";
import type { AuditFilters, AuditReportRow, Item, ItemFormValues, StockMovement, Supplier, SupplierFormValues, Warehouse } from "./types";

// 1000 comfortably covers a single store's real catalogue; `total` (from
// the backend's X-Total-Count header) lets the caller detect and warn on
// the rare case that isn't true, instead of silently dropping items past
// the limit the way a bare fetch would.
const ITEMS_PAGE_SIZE = 1000;

export function listItems(filters: { lowStockOnly?: boolean; outOfStockOnly?: boolean } = {}): Promise<{ items: Item[]; total: number }> {
	const params = new URLSearchParams({ limit: String(ITEMS_PAGE_SIZE) });
	if (filters.lowStockOnly) params.set("low_stock", "true");
	if (filters.outOfStockOnly) params.set("out_of_stock", "true");
	return apiRequestWithCount<Item[]>(`/items?${params.toString()}`).then(({ data, total }) => ({ items: data, total }));
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

export function createSupplier(values: SupplierFormValues): Promise<Supplier> {
	return apiRequest<Supplier>("/suppliers", { method: "POST", body: JSON.stringify(values) });
}

export function updateSupplier(id: number, values: SupplierFormValues): Promise<Supplier> {
	return apiRequest<Supplier>(`/suppliers/${id}`, { method: "PUT", body: JSON.stringify(values) });
}

export function deleteSupplier(id: number): Promise<void> {
	return apiRequest<void>(`/suppliers/${id}`, { method: "DELETE" });
}

export const exportSuppliersCsvUrl = `${API_BASE}/suppliers/export/csv`;

export function uploadItemImage(itemId: number, file: File): Promise<Item> {
	const formData = new FormData();
	formData.append("file", file);
	return apiUpload<Item>(`/items/${itemId}/image`, formData);
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

// Categories aren't a stored list of their own - just whatever value is
// currently on each item (see InventoryTab.tsx's own `categories` memo) -
// so renaming, merging into an existing category, and clearing one off
// every item that has it are all this one same reassignment. See
// backend/app/items/router.py:rename_category()'s docstring.
export function renameItemCategory(oldCategory: string, newCategory: string): Promise<{ updated: number }> {
	return apiRequest<{ updated: number }>(`/items/categories/${encodeURIComponent(oldCategory)}`, {
		method: "PUT",
		body: JSON.stringify({ new_category: newCategory }),
	});
}
