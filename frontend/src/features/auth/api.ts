import { apiRequest } from "../../lib/api";

export interface UserOut {
	username: string;
	role: string;
}

export function login(username: string, password: string): Promise<UserOut> {
	return apiRequest<UserOut>("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) });
}

export function logout(): Promise<void> {
	return apiRequest<void>("/auth/logout", { method: "POST" });
}

export function whoAmI(): Promise<UserOut> {
	return apiRequest<UserOut>("/auth/me");
}
