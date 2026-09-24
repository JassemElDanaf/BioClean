import { useEffect, useState } from "react";
import { listExpenses } from "../expenses/api";
import { listIncome } from "../income/api";
import { listInvoices } from "../invoicing/api";
import { listSales } from "../pos/api";

interface Filters {
	from_date?: string;
	to_date?: string;
}

interface Summary {
	posRevenue: number;
	invoiceRevenue: number;
	manualIncome: number;
	// Cost basis (unit_cost * qty) of everything sold/invoiced in this
	// range - unpaid invoices are excluded from all four of these figures
	// the same way they're excluded from revenue: nothing about them is
	// real yet (see backend invoicing/service.py) until they're paid.
	cogs: number;
	expenses: number;
}

function todayIso(): string {
	return new Date().toISOString().slice(0, 10);
}

const EMPTY_SUMMARY: Summary = { posRevenue: 0, invoiceRevenue: 0, manualIncome: 0, cogs: 0, expenses: 0 };

export default function FinancialSummaryReport() {
	const [filters, setFilters] = useState<Filters>(() => {
		const from = new Date();
		from.setMonth(from.getMonth() - 1);
		return { from_date: from.toISOString().slice(0, 10), to_date: todayIso() };
	});
	const [summary, setSummary] = useState<Summary>(EMPTY_SUMMARY);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		setLoading(true);
		Promise.all([listSales(filters), listInvoices(filters), listExpenses(filters), listIncome(filters)])
			.then(([salesResult, invoicesResult, expensesResult, incomeResult]) => {
				const liveSales = salesResult.sales.filter((s) => !s.voided);
				// Unpaid invoices are pending commitments, not real sales yet -
				// only "paid" ones count as revenue (matches the backend, which
				// only deducts their stock once paid too).
				const paidInvoices = invoicesResult.invoices.filter((i) => i.status === "paid");
				const cogs =
					liveSales.flatMap((s) => s.lines).reduce((sum, l) => sum + l.qty * l.unit_cost, 0) +
					paidInvoices.flatMap((i) => i.lines).reduce((sum, l) => sum + l.qty * l.unit_cost, 0);

				setSummary({
					posRevenue: liveSales.reduce((sum, s) => sum + s.total, 0),
					invoiceRevenue: paidInvoices.reduce((sum, i) => sum + i.total, 0),
					manualIncome: incomeResult.income.reduce((sum, i) => sum + i.amount, 0),
					cogs,
					expenses: expensesResult.expenses.reduce((sum, e) => sum + e.amount, 0),
				});
				setError(null);
			})
			.catch((err) => setError(err instanceof Error ? err.message : "Failed to load report"))
			.finally(() => setLoading(false));
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [filters.from_date, filters.to_date]);

	function setPreset(preset: "month" | "quarter" | "year" | "all") {
		if (preset === "all") {
			setFilters({});
			return;
		}
		const from = new Date();
		if (preset === "month") from.setMonth(from.getMonth() - 1);
		if (preset === "quarter") from.setMonth(from.getMonth() - 3);
		if (preset === "year") from.setFullYear(from.getFullYear() - 1);
		setFilters({ from_date: from.toISOString().slice(0, 10), to_date: todayIso() });
	}

	const totalRevenue = summary.posRevenue + summary.invoiceRevenue + summary.manualIncome;
	const grossProfit = totalRevenue - summary.cogs;
	const net = grossProfit - summary.expenses;

	return (
		<div>
			<div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
				<button onClick={() => setPreset("month")} style={presetButtonStyle}>
					Last Month
				</button>
				<button onClick={() => setPreset("quarter")} style={presetButtonStyle}>
					Last Quarter
				</button>
				<button onClick={() => setPreset("year")} style={presetButtonStyle}>
					Last Year
				</button>
				<button onClick={() => setPreset("all")} style={presetButtonStyle}>
					All Time
				</button>
				<input type="date" value={filters.from_date ?? ""} onChange={(e) => setFilters((f) => ({ ...f, from_date: e.target.value || undefined }))} style={dateInputStyle} />
				<span style={{ color: "var(--neutral-500)" }}>to</span>
				<input type="date" value={filters.to_date ?? ""} onChange={(e) => setFilters((f) => ({ ...f, to_date: e.target.value || undefined }))} style={dateInputStyle} />
			</div>

			{loading ? (
				<div>Loading...</div>
			) : error ? (
				<div style={{ color: "crimson" }}>{error}</div>
			) : (
				<>
					<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 24 }}>
						<StatCard label="Total Revenue" value={totalRevenue} tone="brand" />
						<StatCard label="Gross Profit" value={grossProfit} tone={grossProfit >= 0 ? "brand" : "danger"} />
						<StatCard label="Net Profit" value={net} tone={net >= 0 ? "brand" : "danger"} />
					</div>

					<div style={{ background: "#fff", border: "1px solid var(--neutral-200)", borderRadius: 12, overflow: "hidden" }}>
						<table style={{ width: "100%", borderCollapse: "collapse" }}>
							<tbody>
								<Row label="POS Sales Revenue" value={summary.posRevenue} />
								<Row label="Invoice Revenue (paid only)" value={summary.invoiceRevenue} />
								<Row label="Other Income" value={summary.manualIncome} />
								<Row label="Total Revenue" value={totalRevenue} bold />
								<Row label="Cost of Goods Sold" value={-summary.cogs} negative />
								<Row label="Gross Profit" value={grossProfit} bold highlight={grossProfit >= 0 ? "brand" : "danger"} />
								<Row label="Expenses" value={-summary.expenses} negative />
								<Row label="Net Profit" value={net} bold highlight={net >= 0 ? "brand" : "danger"} />
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

const presetButtonStyle: React.CSSProperties = {
	padding: "8px 12px",
	borderRadius: 8,
	border: "1px solid var(--neutral-200)",
	background: "#fff",
	fontSize: 13,
	fontWeight: 600,
	cursor: "pointer",
};
const dateInputStyle: React.CSSProperties = {
	padding: "7px 10px",
	borderRadius: 8,
	border: "1px solid var(--neutral-200)",
	fontSize: 13,
};
