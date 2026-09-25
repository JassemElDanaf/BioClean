import { API_BASE, apiRequest } from "../../lib/api";
import type { Customer, CustomerFormValues } from "./types";

export function listCustomers(q?: string, limit?: number): Promise<Customer[]> {
	const params = new URLSearchParams();
	if (q) params.set("q", q);
	if (limit) params.set("limit", String(limit));
	const qs = params.toString();
	return apiRequest<Customer[]>(`/customers${qs ? `?${qs}` : ""}`);
}

export function createCustomer(values: CustomerFormValues): Promise<Customer> {
	return apiRequest<Customer>("/customers", { method: "POST", body: JSON.stringify(values) });
}

export function updateCustomer(id: number, values: CustomerFormValues): Promise<Customer> {
	return apiRequest<Customer>(`/customers/${id}`, { method: "PUT", body: JSON.stringify(values) });
}

export function deleteCustomer(id: number): Promise<void> {
	return apiRequest<void>(`/customers/${id}`, { method: "DELETE" });
}

export function customersExportCsvUrl(): string {
	return `${API_BASE}/customers/export/csv`;
}
