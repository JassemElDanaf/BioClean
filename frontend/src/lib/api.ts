// One shared fetch wrapper every feature module's api.ts calls, so the
// base URL and error handling live in exactly one place as more features
// (invoicing, customers, ...) are added.

export const API_BASE = "/api/v1";

export class ApiError extends Error {
	status: number;
	constructor(message: string, status: number) {
		super(message);
		this.status = status;
	}
}

export async function apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
	const res = await fetch(`${API_BASE}${path}`, {
		headers: { "Content-Type": "application/json" },
		...options,
	});
	if (!res.ok) {
		const body = await res.json().catch(() => null);
		throw new ApiError(body?.detail || `Request failed (${res.status})`, res.status);
	}
	if (res.status === 204) return undefined as T;
	return res.json();
}
