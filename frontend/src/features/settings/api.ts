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

export function getTaxRate(): Promise<{ tax_rate: number }> {
	return apiRequest("/settings/tax-rate");
}

export function updateTaxRate(rate: number): Promise<{ tax_rate: number }> {
	return apiRequest("/settings/tax-rate", {
		method: "PUT",
		body: JSON.stringify({ tax_rate: rate }),
	});
}

export interface ExchangeRateHistoryEntry {
	id: number;
	usd_to_lbp_rate: number;
	effective_at: string;
}

export function getExchangeRateHistory(): Promise<ExchangeRateHistoryEntry[]> {
	return apiRequest("/settings/exchange-rate/history");
}
