import { apiRequest } from "../../lib/api";

export interface AuditLogRow {
	id: number;
	created_at: string;
	user: string;
	method: string;
	path: string;
	status_code: number;
}

export interface AuditLogFilters {
	from_date?: string;
	to_date?: string;
	user?: string;
	method?: string;
}

export interface WhoAmI {
	username: string;
	role: string;
}

export function whoAmI(): Promise<WhoAmI> {
	return apiRequest<WhoAmI>("/audit/me");
}

export function getAuditLog(filters: AuditLogFilters): Promise<AuditLogRow[]> {
	const params = new URLSearchParams();
	if (filters.from_date) params.set("from_date", filters.from_date);
	if (filters.to_date) params.set("to_date", filters.to_date);
	if (filters.user) params.set("user", filters.user);
	if (filters.method) params.set("method", filters.method);
	return apiRequest<AuditLogRow[]>(`/audit/log?${params.toString()}`);
}

export function auditLogExportCsvUrl(filters: AuditLogFilters): string {
	const params = new URLSearchParams();
	if (filters.from_date) params.set("from_date", filters.from_date);
	if (filters.to_date) params.set("to_date", filters.to_date);
	if (filters.user) params.set("user", filters.user);
	if (filters.method) params.set("method", filters.method);
	return `/api/v1/audit/log/export/csv?${params.toString()}`;
}
