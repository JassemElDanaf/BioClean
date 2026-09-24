import { apiRequest } from "../../lib/api";

export interface ExchangeRateSettings {
	usd_to_lbp_rate: number;
	lbp_rounding: number;
}

export function getExchangeRate(): Promise<ExchangeRateSettings> {
	return apiRequest("/settings/exchange-rate");
}

export function updateExchangeRate(rate: number, rounding?: number): Promise<ExchangeRateSettings> {
	return apiRequest("/settings/exchange-rate", {
		method: "PUT",
		body: JSON.stringify({ usd_to_lbp_rate: rate, lbp_rounding: rounding }),
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

export type PrinterConnectionType = "none" | "windows" | "network";

export interface PrinterSettings {
	printer_connection_type: PrinterConnectionType;
	printer_target: string | null;
}

export function getPrinterSettings(): Promise<PrinterSettings> {
	return apiRequest("/settings/printer");
}

export function updatePrinterSettings(settings: PrinterSettings): Promise<PrinterSettings> {
	return apiRequest("/settings/printer", { method: "PUT", body: JSON.stringify(settings) });
}

export function testPrinter(): Promise<{ printed: boolean }> {
	return apiRequest("/settings/printer/test", { method: "POST" });
}
