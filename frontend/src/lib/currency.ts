import { useEffect, useState } from "react";
import { getExchangeRate } from "../features/settings/api";

// Every price everywhere is stored/entered in USD. This is the one hook
// any feature (Inventory today; POS/Invoicing later) uses to get the
// current admin-set rate and convert on the fly - never a second copy of
// the rate or the math living inside a feature.
export function useExchangeRate() {
	const [rate, setRate] = useState<number | null>(null);

	useEffect(() => {
		getExchangeRate().then((r) => setRate(r.usd_to_lbp_rate));
	}, []);

	return rate;
}

export function usdToLbp(amountUsd: number, rate: number): number {
	return Math.round(amountUsd * rate);
}

export function formatLbp(amountUsd: number, rate: number): string {
	return `${usdToLbp(amountUsd, rate).toLocaleString()} LBP`;
}
