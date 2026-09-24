import { useEffect, useState } from "react";
import DateRangeFilter, { isoDate, todayIso, type DateRangePreset, type DateRangeValue } from "../../components/DateRangeFilter";
import { getDashboardSummary, type DashboardSummary } from "../dashboard/api";

const PRESETS: DateRangePreset[] = [
	{ key: "today", label: "Today", range: () => ({ from_date: todayIso(), to_date: todayIso() }) },
	{
		key: "month",
		label: "Last Month",
		range: () => {
			const from = new Date();
			from.setMonth(from.getMonth() - 1);
			return { from_date: isoDate(from), to_date: todayIso() };
		},
	},
	{
		key: "quarter",
		label: "Last Quarter",
		range: () => {
			const from = new Date();
			from.setMonth(from.getMonth() - 3);
			return { from_date: isoDate(from), to_date: todayIso() };
		},
	},
	{
		key: "year",
		label: "Last Year",
		range: () => {
			const from = new Date();
			from.setFullYear(from.getFullYear() - 1);
			return { from_date: isoDate(from), to_date: todayIso() };
		},
	},
	{ key: "all", label: "All Time", range: () => ({}) },
];

export default function FinancialSummaryReport() {
	const [filters, setFilters] = useState<DateRangeValue>(() => PRESETS[0].range());
	const [summary, setSummary] = useState<DashboardSummary | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		setLoading(true);
		// Same backend SQL aggregation the Dashboard tab uses (dashboard/
		// service.py) - never a separately client-computed figure, which is
		// exactly what let POS returns silently go unaccounted for here
		// before this was wired up. One source of truth for "what is our
		// revenue/profit", full stop.
		getDashboardSummary(filters)
			.then((result) => {
				setSummary(result);
				setError(null);
			})
			.catch((err) => setError(err instanceof Error ? err.message : "Failed to load report"))
			.finally(() => setLoading(false));
	}, [filters.from_date, filters.to_date]);

	return (
		<div>
			<div style={{ marginBottom: 20 }}>
				<DateRangeFilter presets={PRESETS} value={filters} onChange={setFilters} />
			</div>

			{loading || !summary ? (
				<div>Loading...</div>
			) : error ? (
				<div style={{ color: "crimson" }}>{error}</div>
			) : (
				<>
					<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 24 }}>
						<StatCard label="Total Revenue" value={summary.total_revenue} tone="brand" />
						<StatCard label="Gross Profit" value={summary.gross_profit} tone={summary.gross_profit >= 0 ? "brand" : "danger"} />
						<StatCard label="Net Profit" value={summary.net_profit} tone={summary.net_profit >= 0 ? "brand" : "danger"} />
					</div>

					<div style={{ background: "#fff", border: "1px solid var(--neutral-200)", borderRadius: 12, overflow: "hidden" }}>
						<table style={{ width: "100%", borderCollapse: "collapse" }}>
							<tbody>
								<Row label="POS Sales Revenue (net of returns)" value={summary.sales_revenue} />
								<Row label="Invoice Revenue (paid only)" value={summary.invoice_revenue} />
								<Row label="Other Income" value={summary.manual_income} />
								<Row label="Total Revenue" value={summary.total_revenue} bold />
								<Row label="Cost of Goods Sold" value={-summary.cogs} negative />
								<Row label="Gross Profit" value={summary.gross_profit} bold highlight={summary.gross_profit >= 0 ? "brand" : "danger"} />
								<Row label="Expenses" value={-summary.expenses_total} negative />
								<Row label="Net Profit" value={summary.net_profit} bold highlight={summary.net_profit >= 0 ? "brand" : "danger"} />
							</tbody>
						</table>
					</div>
				</>
			)}
		</div>
	);
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: "brand" | "danger" }) {
	const color = tone === "brand" ? "var(--brand)" : "crimson";
	return (
		<div style={{ background: "#fff", border: "1px solid var(--neutral-200)", borderRadius: 12, padding: 16 }}>
			<div style={{ fontSize: 12, color: "var(--neutral-500)", marginBottom: 6 }}>{label}</div>
			<div style={{ fontSize: 24, fontWeight: 800, color }}>${value.toFixed(2)}</div>
		</div>
	);
}

function Row({ label, value, bold, negative, highlight }: { label: string; value: number; bold?: boolean; negative?: boolean; highlight?: "brand" | "danger" }) {
	const color = highlight === "brand" ? "var(--brand)" : highlight === "danger" ? "crimson" : negative ? "crimson" : "var(--neutral-900)";
	return (
		<tr style={{ borderBottom: "1px solid var(--neutral-100)" }}>
			<td style={{ padding: "10px 16px", fontSize: 14, fontWeight: bold ? 700 : 400 }}>{label}</td>
			<td style={{ padding: "10px 16px", fontSize: 14, fontWeight: bold ? 800 : 600, textAlign: "right", color }}>
				{value < 0 ? "-" : ""}${Math.abs(value).toFixed(2)}
			</td>
		</tr>
	);
}
