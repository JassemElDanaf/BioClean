import { useEffect, useState } from "react";
import { getExchangeRate, getTaxRate } from "../features/settings/api";

export interface ExchangeRateInfo {
	rate: number;
	// LBP cash denominations in real circulation are large - nobody can
	// make exact change to the nearest lira - so every LBP amount rounds
	// to the nearest multiple of this (admin-configurable in Settings,
	// default 1,000) rather than the raw nearest-lira math.
	rounding: number;
}

// Every price everywhere is stored/entered in USD. This is the one hook
// any feature (Inventory, POS, Sales History, ...) uses to get the
// current admin-set rate (and its rounding rule) and convert on the fly -
// never a second copy of the rate or the math living inside a feature.
export function useExchangeRate(): ExchangeRateInfo | null {
	const [info, setInfo] = useState<ExchangeRateInfo | null>(null);

	useEffect(() => {
		getExchangeRate().then((r) => setInfo({ rate: r.usd_to_lbp_rate, rounding: r.lbp_rounding }));
	}, []);

	return info;
}

// Percentage (7 means 7%) - zero for any install that hasn't set one in
// Settings, so nothing charges tax nobody configured.
export function useTaxRate() {
	const [rate, setRate] = useState<number>(0);

	useEffect(() => {
		getTaxRate().then((r) => setRate(r.tax_rate));
	}, []);

	return rate;
}

export function usdToLbp(amountUsd: number, rate: number, rounding = 1): number {
	const raw = amountUsd * rate;
	return Math.round(raw / rounding) * rounding;
}

export function formatLbp(amountUsd: number, rate: number, rounding = 1): string {
	return `${usdToLbp(amountUsd, rate, rounding).toLocaleString()} LBP`;
}
