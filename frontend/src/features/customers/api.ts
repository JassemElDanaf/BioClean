import { API_BASE, apiRequest } from "../../lib/api";
import type { Customer, CustomerFormValues } from "./types";

export function listCustomers(q?: string): Promise<Customer[]> {
	return apiRequest<Customer[]>(q ? `/customers?q=${encodeURIComponent(q)}` : "/customers");
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
