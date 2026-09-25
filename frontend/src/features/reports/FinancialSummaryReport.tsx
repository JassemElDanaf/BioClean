import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import DateRangeFilter, { isoDate, todayIso, type DateRangePreset, type DateRangeValue } from "../../components/DateRangeFilter";
import SidebarToggleButton from "../../components/SidebarToggleButton";
import {
	AlertIcon,
	ChevronRightIcon,
	ExpensesIcon,
	IncomeIcon,
	InvoiceIcon,
	PurchasesIcon,
	ReceiptIcon,
	WalletIcon,
} from "../../components/icons";
import { viewPdf } from "../../lib/pdf";
import { dashboardSummaryCsvUrl, dashboardSummaryPdfUrl, getDashboardSummary, type DashboardSummary } from "../dashboard/api";

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

function money(value: number): string {
	return `${value < 0 ? "-" : ""}$${Math.abs(value).toFixed(2)}`;
}

// Gross/Net margin as a % of revenue - the same figure a bank or
// accountant reads a P&L for, shown right on the KPI card instead of
// making them do total_revenue/gross_profit math themselves.
function marginPct(part: number, whole: number): string | null {
	if (whole <= 0) return null;
	return `${((part / whole) * 100).toFixed(1)}% margin`;
}

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
			<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
				<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
					<SidebarToggleButton />
					<h2 style={{ margin: 0 }}>Financial Summary</h2>
				</div>
				<div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
					<DateRangeFilter presets={PRESETS} value={filters} onChange={setFilters} />
					<a href={dashboardSummaryCsvUrl(filters)} style={exportButtonStyle}>
						Export CSV
					</a>
					<button type="button" onClick={() => viewPdf(dashboardSummaryPdfUrl(filters))} style={exportButtonStyle}>
						Export PDF
					</button>
				</div>
			</div>

			{loading && !summary ? (
				<div>Loading...</div>
			) : error ? (
				<div style={{ color: "crimson" }}>{error}</div>
			) : summary ? (
				<>
					<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 24 }}>
						<KpiCard icon={ReceiptIcon} label="Total Income" value={summary.total_revenue} tone="brand" />
						<KpiCard
							icon={WalletIcon}
							label="Gross Profit"
							value={summary.gross_profit}
							tone={summary.gross_profit >= 0 ? "brand" : "danger"}
							sub={marginPct(summary.gross_profit, summary.total_revenue)}
						/>
						<KpiCard
							icon={WalletIcon}
							label="Net Profit"
							value={summary.net_profit}
							tone={summary.net_profit >= 0 ? "brand" : "danger"}
							sub={marginPct(summary.net_profit, summary.total_revenue)}
						/>
					</div>

					<div className="grid-2col" style={{ alignItems: "start" }}>
						<div>
							<SectionCard title="Profit &amp; Loss">
								<Row icon={ReceiptIcon} label="POS Sales (net of returns)" value={summary.sales_revenue} />
								<Row icon={InvoiceIcon} label="Invoices (paid only)" value={summary.invoice_revenue} />
								<Row label="Sales" value={summary.sales_revenue + summary.invoice_revenue} bold total />
								<Row icon={IncomeIcon} label="Other" value={summary.manual_income} />
								<Row label="Total Income" value={summary.total_revenue} bold total />
								<Row label="Cost of Goods Sold" value={-summary.cogs} negative />
								<Row label="Gross Profit" value={summary.gross_profit} bold highlight={summary.gross_profit >= 0 ? "brand" : "danger"} total />
								<Row icon={ExpensesIcon} label="Expenses" value={-summary.expenses_total} negative />
								<Row label="Net Profit" value={summary.net_profit} bold highlight={summary.net_profit >= 0 ? "brand" : "danger"} total />
							</SectionCard>
						</div>

						<div>
							<SectionCard
								title="Cash Flow"
								note="Cash spent restocking this period - not included in Net Profit above. A purchase only becomes Cost of Goods Sold once the stock actually sells, so counting it here too would double it."
							>
								<Row icon={PurchasesIcon} label="Inventory Purchases (cash out)" value={summary.purchases_total} />
							</SectionCard>

							<SectionCard title="Receivables">
								{summary.unpaid_invoices_count > 0 ? (
									<Link
										to="/invoicing?status=unpaid"
										style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", textDecoration: "none", color: "inherit" }}
									>
										<span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "#b45f06" }}>
											<AlertIcon size={15} color="#b45f06" />
											Unpaid Invoices ({summary.unpaid_invoices_count})
										</span>
										<span style={{ display: "flex", alignItems: "center", gap: 4 }}>
											<span style={{ fontSize: 14, fontWeight: 700, color: "#b45f06" }}>{money(summary.unpaid_invoices_total)}</span>
											<ChevronRightIcon size={14} color="var(--neutral-300)" />
										</span>
									</Link>
								) : (
									<div style={{ padding: "12px 16px", fontSize: 14, color: "var(--neutral-500)" }}>No unpaid invoices outstanding.</div>
								)}
							</SectionCard>
						</div>
					</div>
				</>
			) : null}
		</div>
	);
}

function KpiCard({
	icon: Icon,
	label,
	value,
	sub,
	tone,
}: {
	icon: (props: { size?: number; color?: string }) => React.ReactElement;
	label: string;
	value: number;
	sub?: string | null;
	tone: "brand" | "danger";
}) {
	const color = tone === "brand" ? "var(--brand)" : "crimson";
	return (
		<div style={{ background: "#fff", border: "1px solid var(--neutral-200)", borderRadius: 12, padding: 16 }}>
			<div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
				<div style={{ width: 34, height: 34, borderRadius: 9, background: "var(--brand-pale)", display: "flex", alignItems: "center", justifyContent: "center" }}>
					<Icon size={17} color="var(--brand)" />
				</div>
			</div>
			<div style={{ fontSize: 12, color: "var(--neutral-500)", marginTop: 12 }}>{label}</div>
			<div style={{ fontSize: 24, fontWeight: 800, color, marginTop: 2 }}>{money(value)}</div>
			{sub && <div style={{ fontSize: 12, color: "var(--neutral-500)", marginTop: 3 }}>{sub}</div>}
		</div>
	);
}

function SectionCard({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
	return (
		<div style={{ background: "#fff", border: "1px solid var(--neutral-200)", borderRadius: 12, overflow: "hidden", marginBottom: 16 }}>
			<div style={{ padding: "10px 16px", fontSize: 12, fontWeight: 700, color: "var(--neutral-500)", textTransform: "uppercase", letterSpacing: 0.5, borderBottom: "1px solid var(--neutral-100)" }}>
				{title}
			</div>
			<table style={{ width: "100%", borderCollapse: "collapse" }}>
				<tbody>{children}</tbody>
			</table>
			{note && <div style={{ padding: "0 16px 12px", fontSize: 12, color: "var(--neutral-500)", lineHeight: 1.5 }}>{note}</div>}
		</div>
	);
}

function Row({
	icon: Icon,
	label,
	value,
	bold,
	negative,
	highlight,
	total,
}: {
	icon?: (props: { size?: number; color?: string }) => React.ReactElement;
	label: string;
	value: number;
	bold?: boolean;
	negative?: boolean;
	highlight?: "brand" | "danger";
	total?: boolean;
}) {
	const color = highlight === "brand" ? "var(--brand)" : highlight === "danger" ? "crimson" : negative ? "crimson" : "var(--neutral-900)";
	return (
		<tr style={{ borderTop: total ? "1.5px solid var(--neutral-900)" : "none", borderBottom: total ? "none" : "1px solid var(--neutral-100)" }}>
			<td style={{ padding: "10px 16px", fontSize: 14, fontWeight: bold ? 700 : 400 }}>
				<span style={{ display: "flex", alignItems: "center", gap: 8 }}>
					{Icon && <Icon size={14} color="var(--neutral-500)" />}
					{label}
				</span>
			</td>
			<td style={{ padding: "10px 16px", fontSize: 14, fontWeight: bold ? 800 : 600, textAlign: "right", color }}>{money(value)}</td>
		</tr>
	);
}

const exportButtonStyle: React.CSSProperties = {
	padding: "8px 14px",
	borderRadius: 8,
	border: "1px solid var(--neutral-200)",
	background: "#fff",
	fontSize: 13,
	fontWeight: 600,
	color: "var(--neutral-900)",
	textDecoration: "none",
	cursor: "pointer",
};
