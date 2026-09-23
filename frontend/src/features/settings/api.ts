import { apiRequest } from "../../lib/api";

export function getExchangeRate(): Promise<{ usd_to_lbp_rate: number }> {
	return apiRequest("/settings/exchange-rate");
}

export function updateExchangeRate(rate: number): Promise<{ usd_to_lbp_rate: number }> {
	return apiRequest("/settings/exchange-rate", {
		method: "PUT",
		body: JSON.stringify({ usd_to_lbp_rate: rate }),
	});
}
