import { useEffect, useMemo, useState } from "react";
import { listItems } from "./api";
import type { Item } from "./types";

interface CategoryTotal {
	category: string;
	itemCount: number;
	units: number;
	value: number;
}

export default function StockValuationReport() {
	const [items, setItems] = useState<Item[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [sortDesc, setSortDesc] = useState(true);

	useEffect(() => {
		listItems()
			.then(({ items }) => setItems(items))
			.catch((err) => setError(err instanceof Error ? err.message : "Failed to load inventory"))
			.finally(() => setLoading(false));
	}, []);

	const rows = useMemo(
		() =>
			items
				.map((item) => ({ item, value: item.stock_qty * item.cost_price }))
				.sort((a, b) => (sortDesc ? b.value - a.value : a.value - b.value)),
		[items, sortDesc]
	);

	const totalValue = useMemo(() => items.reduce((sum, i) => sum + i.stock_qty * i.cost_price, 0), [items]);
	const totalUnits = useMemo(() => items.reduce((sum, i) => sum + i.stock_qty, 0), [items]);

	const categoryTotals = useMemo(() => {
		const map = new Map<string, CategoryTotal>();
		for (const item of items) {
			const category = item.category ?? "Uncategorized";
			const existing = map.get(category) ?? { category, itemCount: 0, units: 0, value: 0 };
			existing.itemCount += 1;
			existing.units += item.stock_qty;
			existing.value += item.stock_qty * item.cost_price;
			map.set(category, existing);
		}
		return Array.from(map.values()).sort((a, b) => b.value - a.value);
	}, [items]);

	if (loading) return <div>Loading stock valuation...</div>;
	if (error) return <div style={{ color: "crimson" }}>Couldn't load stock valuation: {error}</div>;

	return (
		<div>
			<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 24 }}>
				<StatCard label="Total Inventory Value" value={`$${totalValue.toFixed(2)}`} />
				<StatCard label="Total SKUs" value={String(items.length)} />
				<StatCard label="Total Units on Hand" value={totalUnits.toLocaleString()} />
			</div>

			<h3 style={{ fontSize: 15, marginBottom: 10 }}>By Category</h3>
			<div style={{ background: "#fff", border: "1px solid var(--neutral-200)", borderRadius: 12, overflow: "hidden", marginBottom: 24 }}>
				<table style={{ width: "100%", borderCollapse: "collapse" }}>
					<thead>
						<tr style={{ textAlign: "left", borderBottom: "2px solid var(--neutral-200)" }}>
							<th style={thStyle}>Category</th>
							<th style={{ ...thStyle, textAlign: "right" }}>SKUs</th>
							<th style={{ ...thStyle, textAlign: "right" }}>Units</th>
							<th style={{ ...thStyle, textAlign: "right" }}>Value</th>
						</tr>
					</thead>
					<tbody>
						{categoryTotals.map((c) => (
							<tr key={c.category} style={{ borderBottom: "1px solid var(--neutral-100)" }}>
								<td style={tdStyle}>{c.category}</td>
								<td style={{ ...tdStyle, textAlign: "right" }}>{c.itemCount}</td>
								<td style={{ ...tdStyle, textAlign: "right" }}>{c.units.toLocaleString()}</td>
								<td style={{ ...tdStyle, textAlign: "right", fontWeight: 700 }}>${c.value.toFixed(2)}</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>

			<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
				<h3 style={{ fontSize: 15, margin: 0 }}>By Item</h3>
				<button onClick={() => setSortDesc((v) => !v)} style={sortButtonStyle}>
					Value {sortDesc ? "↓" : "↑"}
				</button>
			</div>
			<div style={{ background: "#fff", border: "1px solid var(--neutral-200)", borderRadius: 12, overflowX: "auto", maxWidth: "100%" }}>
				<table style={{ width: "100%", minWidth: 600, borderCollapse: "collapse" }}>
					<thead>
						<tr style={{ textAlign: "left", borderBottom: "2px solid var(--neutral-200)" }}>
							<th style={thStyle}>Item</th>
							<th style={thStyle}>Category</th>
							<th style={{ ...thStyle, textAlign: "right" }}>Stock Qty</th>
							<th style={{ ...thStyle, textAlign: "right" }}>Cost Price</th>
							<th style={{ ...thStyle, textAlign: "right" }}>Value</th>
						</tr>
					</thead>
					<tbody>
						{rows.map(({ item, value }) => (
							<tr key={item.id} style={{ borderBottom: "1px solid var(--neutral-100)" }}>
								<td style={tdStyle}>{item.item_name}</td>
								<td style={tdStyle}>{item.category ?? "-"}</td>
								<td style={{ ...tdStyle, textAlign: "right" }}>{item.stock_qty}</td>
								<td style={{ ...tdStyle, textAlign: "right" }}>${item.cost_price.toFixed(2)}</td>
								<td style={{ ...tdStyle, textAlign: "right", fontWeight: 700 }}>${value.toFixed(2)}</td>
							</tr>
						))}
						{rows.length === 0 && (
							<tr>
								<td colSpan={5} style={{ ...tdStyle, textAlign: "center", color: "var(--neutral-500)", padding: 24 }}>
									No items in inventory.
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>
		</div>
	);
}

function StatCard({ label, value }: { label: string; value: string }) {
	return (
		<div style={{ background: "#fff", border: "1px solid var(--neutral-200)", borderRadius: 12, padding: 16 }}>
			<div style={{ fontSize: 12, color: "var(--neutral-500)", marginBottom: 6 }}>{label}</div>
			<div style={{ fontSize: 24, fontWeight: 800, color: "var(--brand)" }}>{value}</div>
		</div>
	);
}

const thStyle: React.CSSProperties = { padding: "8px 12px", fontSize: 13, color: "var(--neutral-500)" };
const tdStyle: React.CSSProperties = { padding: "8px 12px", fontSize: 14 };
const sortButtonStyle: React.CSSProperties = {
	padding: "6px 12px",
	borderRadius: 8,
	border: "1px solid var(--neutral-200)",
	background: "#fff",
	fontSize: 13,
	fontWeight: 600,
	cursor: "pointer",
};
