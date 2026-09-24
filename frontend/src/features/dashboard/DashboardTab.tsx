import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import DateRangeFilter, { isoDate, todayIso, type DateRangePreset } from "../../components/DateRangeFilter";
import StockBadge from "../../components/StockBadge";
import { listItems } from "../inventory/api";
import type { Item } from "../inventory/types";
import { listSales } from "../pos/api";
import type { Sale } from "../pos/api";
import { getDashboardSummary, type DashboardFilters, type DashboardSummary } from "./api";

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

export default function DashboardTab() {
	const [filters, setFilters] = useState<DashboardFilters>(() => PRESETS[0].range());
	const [summary, setSummary] = useState<DashboardSummary | null>(null);
	const [lowStockItems, setLowStockItems] = useState<Item[]>([]);
	const [recentSales, setRecentSales] = useState<Sale[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	function reload() {
		setLoading(true);
		// Every number here comes straight from the backend's own SQL
		// aggregation (dashboard/service.py) or the same list endpoints
		// Inventory/Sales History use - never a separate client-computed
		// figure that could drift from what those tabs show.
		Promise.all([getDashboardSummary(filters), listItems({ lowStockOnly: true }), listSales()])
			.then(([summaryResult, lowStock, recent]) => {
				setSummary(summaryResult);
				setLowStockItems(lowStock.items);
				setRecentSales(recent.sales.slice(0, 5));
				setError(null);
			})
			.catch((err) => setError(err instanceof Error ? err.message : "Failed to load dashboard"))
			.finally(() => setLoading(false));
	}

	useEffect(reload, [filters]);

	if (error) return <div style={{ color: "crimson" }}>Couldn't load dashboard: {error}</div>;

	return (
		<div>
			<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
				<h2 style={{ margin: 0 }}>Dashboard</h2>
				<div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
					<DateRangeFilter presets={PRESETS} value={filters} onChange={setFilters} />
					<button onClick={reload} style={presetStyle}>
						Refresh
					</button>
				</div>
			</div>

			{loading || !summary ? (
				<div>Loading dashboard...</div>
			) : (
				<>
					<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 16 }}>
						<StatCard label="Total Revenue" value={`$${summary.total_revenue.toFixed(2)}`} />
						<StatCard label="Transactions" value={String(summary.sales_count)} sub={`avg $${summary.average_sale.toFixed(2)}`} />
						<StatCard label="Gross Profit" value={`$${summary.gross_profit.toFixed(2)}`} tone={summary.gross_profit >= 0 ? undefined : "warn"} />
						<StatCard label="Net Profit" value={`$${summary.net_profit.toFixed(2)}`} sub={`after $${summary.expenses_total.toFixed(2)} expenses`} tone={summary.net_profit >= 0 ? undefined : "warn"} />
						<StatCard
							label="Unpaid Invoices"
							value={String(summary.unpaid_invoices_count)}
							sub={`$${summary.unpaid_invoices_total.toFixed(2)} outstanding`}
							tone={summary.unpaid_invoices_count > 0 ? "warn" : undefined}
						/>
					</div>
					<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 24 }}>
						<StatCard label="Low Stock Items" value={String(summary.low_stock_count)} sub={`of ${summary.total_items} total`} tone={summary.low_stock_count > 0 ? "warn" : undefined} />
						<StatCard label="Out of Stock" value={String(summary.out_of_stock_count)} tone={summary.out_of_stock_count > 0 ? "warn" : undefined} />
						<StatCard label="Inventory Value" value={`$${summary.total_inventory_value.toFixed(2)}`} />
						<StatCard label="Total Items" value={String(summary.total_items)} sub="in catalogue" />
					</div>

					<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
						<div style={{ background: "#fff", border: "1px solid var(--neutral-200)", borderRadius: 12, padding: 16 }}>
							<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
								<h3 style={{ margin: 0, fontSize: 15 }}>Recent Sales</h3>
								<Link to="/sales-history" style={linkStyle}>
									View all
								</Link>
							</div>
							{recentSales.length === 0 ? (
								<div style={{ color: "var(--neutral-500)", fontSize: 13 }}>No sales yet.</div>
							) : (
								<div style={{ display: "grid", gap: 8 }}>
									{recentSales.map((sale) => (
										<div key={sale.id} style={rowStyle}>
											<span style={{ fontSize: 13 }}>
												#{sale.id} · {new Date(sale.created_at).toLocaleDateString()}
												{sale.voided && <span style={{ color: "crimson" }}> (voided)</span>}
											</span>
											<span style={{ fontSize: 13, fontWeight: 700 }}>${sale.total.toFixed(2)}</span>
										</div>
									))}
								</div>
							)}
						</div>

						<div style={{ background: "#fff", border: "1px solid var(--neutral-200)", borderRadius: 12, padding: 16 }}>
							<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
								<h3 style={{ margin: 0, fontSize: 15 }}>Low Stock</h3>
								<Link to="/inventory" style={linkStyle}>
									View all
								</Link>
							</div>
							{lowStockItems.length === 0 ? (
								<div style={{ color: "var(--neutral-500)", fontSize: 13 }}>Nothing is low on stock.</div>
							) : (
								<div style={{ display: "grid", gap: 8 }}>
									{lowStockItems.slice(0, 5).map((item) => (
										<div key={item.id} style={rowStyle}>
											<span style={{ fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.item_name}</span>
											<StockBadge stockQty={item.stock_qty} reorderLevel={item.reorder_level} />
										</div>
									))}
								</div>
							)}
						</div>
					</div>
				</>
			)}
		</div>
	);
}

function StatCard({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "warn" }) {
	return (
		<div style={{ background: "#fff", border: "1px solid var(--neutral-200)", borderRadius: 12, padding: 16 }}>
			<div style={{ fontSize: 12, color: "var(--neutral-500)", marginBottom: 6 }}>{label}</div>
			<div style={{ fontSize: 24, fontWeight: 800, color: tone === "warn" ? "#b45f06" : "var(--neutral-900)" }}>{value}</div>
			{sub && <div style={{ fontSize: 12, color: "var(--neutral-500)", marginTop: 2 }}>{sub}</div>}
		</div>
	);
}

const rowStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 };
const linkStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "var(--brand)", textDecoration: "none" };
const presetStyle: React.CSSProperties = {
	padding: "10px 16px",
	borderRadius: 8,
	border: "1px solid var(--neutral-200)",
	background: "#fff",
	fontSize: 14,
	fontWeight: 700,
	color: "var(--neutral-900)",
	cursor: "pointer",
};
