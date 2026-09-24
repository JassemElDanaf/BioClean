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

// Separate from apiRequest because a multipart body needs the browser to
// set its own Content-Type (with the multipart boundary) - forcing
// application/json like every other request here would break the upload.
export async function apiUpload<T>(path: string, formData: FormData): Promise<T> {
	const res = await fetch(`${API_BASE}${path}`, { method: "POST", body: formData });
	if (!res.ok) {
		const body = await res.json().catch(() => null);
		throw new ApiError(body?.detail || `Request failed (${res.status})`, res.status);
	}
	return res.json();
}

// Exposes the X-Total-Count header alongside the parsed body - apiRequest
// alone can't, since it only ever returns the decoded JSON.
export async function apiRequestWithCount<T>(path: string): Promise<{ data: T; total: number }> {
	const res = await fetch(`${API_BASE}${path}`);
	if (!res.ok) {
		const body = await res.json().catch(() => null);
		throw new ApiError(body?.detail || `Request failed (${res.status})`, res.status);
	}
	const data = await res.json();
	const total = Number(res.headers.get("X-Total-Count") ?? (Array.isArray(data) ? data.length : 0));
	return { data, total };
}
