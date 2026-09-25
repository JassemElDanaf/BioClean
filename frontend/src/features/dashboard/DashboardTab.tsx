import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
	Area,
	AreaChart,
	Cell,
	Pie,
	PieChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import DateRangeFilter, { isoDate, todayIso, type DateRangePreset, type DateRangeValue } from "../../components/DateRangeFilter";
import SidebarToggleButton from "../../components/SidebarToggleButton";
import {
	AlertIcon,
	CardIcon,
	CashIcon,
	ChevronRightIcon,
	InventoryIcon,
	OtherPaymentIcon,
	ReceiptIcon,
	TrendDownIcon,
	TrendUpIcon,
	WalletIcon,
} from "../../components/icons";
import StockBadge from "../../components/StockBadge";
import { listItems } from "../inventory/api";
import type { Item } from "../inventory/types";
import { listSales } from "../pos/api";
import type { Sale } from "../pos/api";
import { getDashboardInsights, getDashboardSummary, type DashboardFilters, type DashboardInsights, type DashboardSummary } from "./api";

const PRESETS: DateRangePreset[] = [
	{ key: "today", label: "Today", range: () => ({ from_date: todayIso(), to_date: todayIso() }) },
	{
		key: "yesterday",
		label: "Yesterday",
		range: () => {
			const y = new Date();
			y.setDate(y.getDate() - 1);
			return { from_date: isoDate(y), to_date: isoDate(y) };
		},
	},
	{
		key: "week",
		label: "Last 7 Days",
		range: () => {
			const from = new Date();
			from.setDate(from.getDate() - 7);
			return { from_date: isoDate(from), to_date: todayIso() };
		},
	},
	{
		key: "month",
		label: "Last Month",
		range: () => {
			const from = new Date();
			from.setMonth(from.getMonth() - 1);
			return { from_date: isoDate(from), to_date: todayIso() };
		},
	},
	{ key: "all", label: "All Time", range: () => ({}) },
];

// If both ends of the current filter are set, the immediately preceding
// span of equal length - what a KPI card's "+12% vs last period" badge
// compares against. "All Time" (no bounds) has no natural previous
// period, so comparisons are simply omitted rather than faked.
function previousPeriod(filters: DashboardFilters): DashboardFilters | null {
	if (!filters.from_date || !filters.to_date) return null;
	const from = new Date(filters.from_date);
	const to = new Date(filters.to_date);
	const spanMs = to.getTime() - from.getTime();
	const prevTo = new Date(from.getTime() - 86_400_000);
	const prevFrom = new Date(prevTo.getTime() - spanMs);
	return { from_date: isoDate(prevFrom), to_date: isoDate(prevTo) };
}

// null = no comparison available (previous period had nothing to compare
// against, or wasn't requested at all).
function percentChange(current: number, previous: number): number | null {
	if (previous === 0) return null;
	return ((current - previous) / Math.abs(previous)) * 100;
}

const PAYMENT_META: Record<string, { label: string; icon: typeof CashIcon; color: string }> = {
	cash: { label: "Cash", icon: CashIcon, color: "#1e5f36" },
	whish: { label: "Whish", icon: CardIcon, color: "#2e8b57" },
	other: { label: "Other", icon: OtherPaymentIcon, color: "#8fbc94" },
};

export default function DashboardTab() {
	const [filters, setFilters] = useState<DashboardFilters>(() => PRESETS[0].range());
	const [summary, setSummary] = useState<DashboardSummary | null>(null);
	const [prevSummary, setPrevSummary] = useState<DashboardSummary | null>(null);
	const [insights, setInsights] = useState<DashboardInsights | null>(null);
	const [lowStockItems, setLowStockItems] = useState<Item[]>([]);
	const [recentSales, setRecentSales] = useState<Sale[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	function reload() {
		setLoading(true);
		const prev = previousPeriod(filters);
		// Every number here comes straight from the backend's own SQL
		// aggregation (dashboard/service.py) or the same list endpoints
		// Inventory/Sales History use - never a separate client-computed
		// figure that could drift from what those tabs show.
		Promise.all([
			getDashboardSummary(filters),
			prev ? getDashboardSummary(prev) : Promise.resolve(null),
			getDashboardInsights(filters),
			listItems({ lowStockOnly: true }),
			listSales(),
		])
			.then(([summaryResult, prevResult, insightsResult, lowStock, recent]) => {
				setSummary(summaryResult);
				setPrevSummary(prevResult);
				setInsights(insightsResult);
				setLowStockItems(lowStock.items);
				setRecentSales(recent.sales.slice(0, 8));
				setError(null);
			})
			.catch((err) => setError(err instanceof Error ? err.message : "Failed to load dashboard"))
			.finally(() => setLoading(false));
	}

	useEffect(reload, [filters]);

	if (error) return <div style={{ color: "crimson" }}>Couldn't load dashboard: {error}</div>;

	return (
		<div>
			<div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
				<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
					<SidebarToggleButton />
					<h2 style={{ margin: 0, fontSize: 22 }}>Dashboard</h2>
				</div>
				<div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
					<DateRangeFilter presets={PRESETS} value={filters} onChange={setFilters} />
					<button onClick={reload} style={refreshButtonStyle}>
						Refresh
					</button>
				</div>
			</div>

			{!summary || !insights ? (
				<div>Loading dashboard...</div>
			) : (
				<>
					<div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 12, marginBottom: 20 }}>
						<KpiCard
							icon={ReceiptIcon}
							label="Total Revenue"
							value={`$${summary.total_revenue.toFixed(2)}`}
							changePct={prevSummary ? percentChange(summary.total_revenue, prevSummary.total_revenue) : null}
						/>
						<KpiCard
							icon={WalletIcon}
							label="Net Profit"
							value={`$${summary.net_profit.toFixed(2)}`}
							tone={summary.net_profit >= 0 ? "brand" : "danger"}
							changePct={prevSummary ? percentChange(summary.net_profit, prevSummary.net_profit) : null}
						/>
						<KpiCard
							icon={TrendUpIcon}
							label="Transactions"
							value={String(summary.sales_count)}
							sub={`avg $${summary.average_sale.toFixed(2)}`}
							changePct={prevSummary ? percentChange(summary.sales_count, prevSummary.sales_count) : null}
						/>
						<KpiCard
							icon={AlertIcon}
							label="Unpaid Invoices"
							value={String(summary.unpaid_invoices_count)}
							sub={`$${summary.unpaid_invoices_total.toFixed(2)} outstanding`}
							tone={summary.unpaid_invoices_count > 0 ? "warn" : "brand"}
							to={summary.unpaid_invoices_count > 0 ? "/invoicing?status=unpaid" : undefined}
						/>
						<KpiCard
							icon={AlertIcon}
							label="Out of Stock"
							value={String(summary.out_of_stock_count)}
							sub={`of ${summary.total_items} items`}
							tone={summary.out_of_stock_count > 0 ? "warn" : "brand"}
							to={summary.out_of_stock_count > 0 ? "/inventory?stock=out" : undefined}
						/>
						<KpiCard
							icon={AlertIcon}
							label="Low Stock"
							value={String(summary.low_stock_count)}
							sub="needs reordering soon"
							tone={summary.low_stock_count > 0 ? "warn" : "brand"}
							to={summary.low_stock_count > 0 ? "/inventory?stock=low" : undefined}
						/>
					</div>

					<div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, marginBottom: 16, alignItems: "stretch" }}>
						<RevenueTrendCard trend={insights.trend} />
						<PaymentBreakdownCard rows={insights.payment_breakdown} />
					</div>

					<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16, alignItems: "stretch" }}>
						<TopProductsCard products={insights.top_products} />
						<LowStockCard items={lowStockItems} />
					</div>

					<RecentSalesCard sales={recentSales} />
				</>
			)}
		</div>
	);
}

function KpiCard({
	icon: Icon,
	label,
	value,
	sub,
	tone,
	changePct,
	to,
}: {
	icon: (props: { size?: number; color?: string }) => React.ReactElement;
	label: string;
	value: string;
	sub?: string;
	tone?: "brand" | "warn" | "danger";
	changePct?: number | null;
	// When set, the whole card becomes a link (e.g. an "Out of Stock" card
	// with a nonzero count points at Inventory) - same underlying signal
	// the old separate yellow alert chips gave, just surfaced in place
	// instead of as a second banner above the KPI row.
	to?: string;
}) {
	const valueColor = tone === "warn" ? "#b45f06" : tone === "danger" ? "#b42318" : "var(--neutral-900)";
	const content = (
		<>
			<div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
				<div style={{ width: 34, height: 34, borderRadius: 9, background: tone === "warn" ? "#fff3e0" : "var(--brand-pale)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
					<Icon size={17} color={tone === "warn" ? "#b45f06" : "var(--brand)"} />
				</div>
				{changePct != null && (
					<span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 12, fontWeight: 700, color: changePct >= 0 ? "var(--brand)" : "#b42318" }}>
						{changePct >= 0 ? <TrendUpIcon size={12} /> : <TrendDownIcon size={12} />}
						{Math.abs(changePct).toFixed(0)}%
					</span>
				)}
				{to && <ChevronRightIcon size={15} color="var(--neutral-300)" />}
			</div>
			<div style={{ fontSize: 12, color: "var(--neutral-500)", marginTop: 12 }}>{label}</div>
			<div style={{ fontSize: 22, fontWeight: 800, color: valueColor, marginTop: 2 }}>{value}</div>
			{sub && <div style={{ fontSize: 12, color: "var(--neutral-500)", marginTop: 3 }}>{sub}</div>}
		</>
	);
	if (to) {
		return (
			<Link to={to} style={{ ...cardStyle, display: "block", textDecoration: "none", color: "inherit" }}>
				{content}
			</Link>
		);
	}
	return <div style={cardStyle}>{content}</div>;
}

function RevenueTrendCard({ trend }: { trend: DashboardInsights["trend"] }) {
	const data = trend.map((p) => ({ ...p, label: new Date(p.date + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" }) }));
	const total = trend.reduce((sum, p) => sum + p.revenue, 0);
	return (
		<div style={{ ...cardStyle, padding: "18px 20px" }}>
			<div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
				<div>
					<h3 style={{ margin: 0, fontSize: 15 }}>Revenue Trend</h3>
					<div style={{ fontSize: 12, color: "var(--neutral-500)", marginTop: 2 }}>Last 14 days</div>
				</div>
				<div style={{ fontSize: 18, fontWeight: 800, color: "var(--brand)" }}>${total.toFixed(2)}</div>
			</div>
			<div style={{ height: 220, marginTop: 8 }}>
				<ResponsiveContainer width="100%" height="100%">
					<AreaChart data={data} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
						<defs>
							<linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
								<stop offset="0%" stopColor="#1e5f36" stopOpacity={0.28} />
								<stop offset="100%" stopColor="#1e5f36" stopOpacity={0.02} />
							</linearGradient>
						</defs>
						<XAxis dataKey="label" tick={{ fontSize: 11, fill: "#757575" }} axisLine={{ stroke: "#e0e0e0" }} tickLine={false} interval={1} />
						<YAxis tick={{ fontSize: 11, fill: "#757575" }} axisLine={false} tickLine={false} width={44} tickFormatter={(v) => `$${v}`} />
						<Tooltip
							formatter={(value) => [`$${Number(value).toFixed(2)}`, "Revenue"]}
							contentStyle={{ borderRadius: 10, border: "1px solid #e0e0e0", fontSize: 13 }}
							labelStyle={{ fontWeight: 700, marginBottom: 2 }}
						/>
						<Area type="monotone" dataKey="revenue" stroke="#1e5f36" strokeWidth={2.5} fill="url(#revenueFill)" activeDot={{ r: 4 }} />
					</AreaChart>
				</ResponsiveContainer>
			</div>
		</div>
	);
}

function PaymentBreakdownCard({ rows }: { rows: DashboardInsights["payment_breakdown"] }) {
	const total = rows.reduce((sum, r) => sum + r.total, 0);
	const data = rows.map((r) => ({ ...r, meta: PAYMENT_META[r.payment_method] ?? { label: r.payment_method, color: "#9e9e9e" } }));

	return (
		<div style={{ ...cardStyle, padding: "18px 20px" }}>
			<h3 style={{ margin: 0, fontSize: 15, marginBottom: 12 }}>Payment Breakdown</h3>
			{total === 0 ? (
				<div style={{ color: "var(--neutral-500)", fontSize: 13, padding: "24px 0", textAlign: "center" }}>No sales in this range.</div>
			) : (
				<>
					<div style={{ height: 150 }}>
						<ResponsiveContainer width="100%" height="100%">
							<PieChart>
								<Pie data={data} dataKey="total" nameKey="payment_method" innerRadius={40} outerRadius={62} paddingAngle={3} strokeWidth={0}>
									{data.map((row) => (
										<Cell key={row.payment_method} fill={row.meta.color} />
									))}
								</Pie>
								<Tooltip formatter={(value) => `$${Number(value).toFixed(2)}`} contentStyle={{ borderRadius: 10, border: "1px solid #e0e0e0", fontSize: 13 }} />
							</PieChart>
						</ResponsiveContainer>
					</div>
					<div style={{ display: "grid", gap: 8, marginTop: 8 }}>
						{data.map((row) => {
							const Icon = "icon" in row.meta ? row.meta.icon : OtherPaymentIcon;
							const pct = total > 0 ? (row.total / total) * 100 : 0;
							return (
								<div key={row.payment_method} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
									<span style={{ width: 8, height: 8, borderRadius: 99, background: row.meta.color, flexShrink: 0 }} />
									<Icon size={14} color="var(--neutral-500)" />
									<span style={{ flex: 1 }}>{row.meta.label}</span>
									<span style={{ color: "var(--neutral-500)" }}>{pct.toFixed(0)}%</span>
									<span style={{ fontWeight: 700, width: 64, textAlign: "right" }}>${row.total.toFixed(2)}</span>
								</div>
							);
						})}
					</div>
				</>
			)}
		</div>
	);
}

function TopProductsCard({ products }: { products: DashboardInsights["top_products"] }) {
	const maxRevenue = Math.max(...products.map((p) => p.revenue), 1);
	return (
		<div style={cardStyle}>
			<h3 style={{ margin: 0, fontSize: 15, marginBottom: 12 }}>Top Selling Products</h3>
			{products.length === 0 ? (
				<div style={{ color: "var(--neutral-500)", fontSize: 13 }}>Nothing sold in this range yet.</div>
			) : (
				<div style={{ display: "grid", gap: 12 }}>
					{products.map((p, i) => (
						<div key={p.item_name}>
							<div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
								<span style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "flex", gap: 8 }}>
									<span style={{ color: "var(--neutral-300)", fontWeight: 800 }}>{i + 1}</span>
									{p.item_name}
								</span>
								<span style={{ color: "var(--neutral-500)", flexShrink: 0, marginLeft: 8 }}>
									{p.qty}× · ${p.revenue.toFixed(2)}
								</span>
							</div>
							<div style={{ height: 6, borderRadius: 99, background: "var(--neutral-100)", overflow: "hidden" }}>
								<div style={{ height: "100%", width: `${(p.revenue / maxRevenue) * 100}%`, background: "var(--brand)", borderRadius: 99 }} />
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
}

function LowStockCard({ items }: { items: Item[] }) {
	return (
		<div style={cardStyle}>
			<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
				<h3 style={{ margin: 0, fontSize: 15 }}>Inventory Alerts</h3>
				<Link to="/inventory" style={linkStyle}>
					View all <ChevronRightIcon size={12} />
				</Link>
			</div>
			{items.length === 0 ? (
				<div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 0", color: "var(--neutral-500)", gap: 8 }}>
					<InventoryIcon size={28} color="var(--neutral-300)" />
					<span style={{ fontSize: 13 }}>Nothing is low on stock.</span>
				</div>
			) : (
				<div style={{ display: "grid", gap: 4 }}>
					{items.slice(0, 6).map((item) => (
						<div key={item.id} style={rowStyle}>
							<span style={{ fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.item_name}</span>
							<span style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
								<span style={{ fontSize: 12, color: "var(--neutral-500)" }}>{item.stock_qty} left</span>
								<StockBadge stockQty={item.stock_qty} reorderLevel={item.reorder_level} />
							</span>
						</div>
					))}
				</div>
			)}
		</div>
	);
}

function RecentSalesCard({ sales }: { sales: Sale[] }) {
	return (
		<div style={cardStyle}>
			<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
				<h3 style={{ margin: 0, fontSize: 15 }}>Recent Sales</h3>
				<Link to="/sales-history" style={linkStyle}>
					View all <ChevronRightIcon size={12} />
				</Link>
			</div>
			{sales.length === 0 ? (
				<div style={{ color: "var(--neutral-500)", fontSize: 13, padding: "12px 0" }}>No sales yet.</div>
			) : (
				<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8 }}>
					{sales.map((sale) => {
						const meta = PAYMENT_META[sale.payment_method] ?? { label: sale.payment_method, icon: OtherPaymentIcon, color: "#9e9e9e" };
						const Icon = meta.icon;
						return (
							<div key={sale.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 8, background: "var(--neutral-50)" }}>
								<div style={{ width: 28, height: 28, borderRadius: 8, background: "#fff", border: "1px solid var(--neutral-200)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
									<Icon size={13} color="var(--neutral-500)" />
								</div>
								<div style={{ flex: 1, minWidth: 0 }}>
									<div style={{ fontSize: 13, fontWeight: 600 }}>
										#{sale.id}
										{sale.voided && <span style={{ color: "crimson", fontWeight: 500 }}> · voided</span>}
									</div>
									<div style={{ fontSize: 11, color: "var(--neutral-500)" }}>{new Date(sale.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</div>
								</div>
								<span style={{ fontSize: 13, fontWeight: 700, flexShrink: 0 }}>${sale.total.toFixed(2)}</span>
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}

const cardStyle: React.CSSProperties = { background: "#fff", border: "1px solid var(--neutral-200)", borderRadius: 14, padding: 16 };
const rowStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "5px 0" };
const linkStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "var(--brand)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 2 };
const refreshButtonStyle: React.CSSProperties = {
	padding: "10px 16px",
	borderRadius: 8,
	border: "1px solid var(--neutral-200)",
	background: "#fff",
	fontSize: 14,
	fontWeight: 700,
	color: "var(--neutral-900)",
	cursor: "pointer",
};
