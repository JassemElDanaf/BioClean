import { useEffect, useState } from "react";
import Modal from "../../components/Modal";
import { ApiError } from "../../lib/api";
import { listSales, saleReceiptPdfUrl, salesExportCsvUrl, voidSale, type Sale, type SalesFilters } from "./api";
import { usdToLbp } from "../../lib/currency";

function todayIso(): string {
	return new Date().toISOString().slice(0, 10);
}

export default function SalesHistoryTab() {
	const [sales, setSales] = useState<Sale[]>([]);
	const [total, setTotal] = useState(0);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [filters, setFilters] = useState<SalesFilters>({});
	const [viewing, setViewing] = useState<Sale | null>(null);
	const [voidError, setVoidError] = useState<string | null>(null);

	function reload() {
		setLoading(true);
		listSales(filters)
			.then(({ sales, total }) => {
				setSales(sales);
				setTotal(total);
				setError(null);
			})
			.catch((err) => setError(err instanceof Error ? err.message : "Failed to load sales"))
			.finally(() => setLoading(false));
	}

	useEffect(reload, [filters]);

	function setPreset(preset: "today" | "week" | "month" | "all") {
		if (preset === "all") {
			setFilters({});
			return;
		}
		const from = new Date();
		if (preset === "week") from.setDate(from.getDate() - 7);
		if (preset === "month") from.setMonth(from.getMonth() - 1);
		setFilters({ from_date: from.toISOString().slice(0, 10), to_date: todayIso() });
	}

	async function handleVoid(sale: Sale) {
		if (!confirm(`Void sale #${sale.id}? This restores all ${sale.lines.length} line item(s) to stock.`)) return;
		setVoidError(null);
		try {
			const updated = await voidSale(sale.id);
			setSales((list) => list.map((s) => (s.id === updated.id ? updated : s)));
			setViewing((v) => (v?.id === updated.id ? updated : v));
		} catch (err) {
			setVoidError(err instanceof ApiError ? err.message : "Couldn't void this sale.");
		}
	}

	const truncated = total > sales.length;

	if (loading && sales.length === 0) return <div>Loading sales history...</div>;
	if (error) return <div style={{ color: "crimson" }}>Couldn't load sales history: {error}</div>;

	return (
		<div>
			{truncated && (
				<div style={{ background: "#fff8e1", color: "#8a6100", padding: "8px 12px", borderRadius: 8, fontSize: 13, marginBottom: 12 }}>
					Showing the first {sales.length.toLocaleString()} of {total.toLocaleString()} sales - narrow the date range to see the rest.
				</div>
			)}

			<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
				<h2 style={{ margin: 0 }}>Sales History ({total.toLocaleString()})</h2>
				<div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
					<button onClick={() => setPreset("today")} style={presetButtonStyle}>
						Today
					</button>
					<button onClick={() => setPreset("week")} style={presetButtonStyle}>
						This Week
					</button>
					<button onClick={() => setPreset("month")} style={presetButtonStyle}>
						This Month
					</button>
					<button onClick={() => setPreset("all")} style={presetButtonStyle}>
						All Time
					</button>
					<a href={salesExportCsvUrl(filters)} style={presetButtonStyle}>
						Export CSV
					</a>
				</div>
			</div>

			<div style={{ background: "#fff", border: "1px solid var(--neutral-200)", borderRadius: 12, overflowX: "auto", overflowY: "hidden", maxWidth: "100%" }}>
				<table style={{ width: "100%", minWidth: 700, borderCollapse: "collapse" }}>
					<thead>
						<tr style={{ textAlign: "left", borderBottom: "2px solid var(--neutral-200)" }}>
							<th style={thStyle}>Sale #</th>
							<th style={thStyle}>Date</th>
							<th style={thStyle}>Items</th>
							<th style={thStyle}>Payment</th>
							<th style={{ ...thStyle, textAlign: "right" }}>Total</th>
							<th style={thStyle}>Status</th>
							<th style={thStyle}></th>
						</tr>
					</thead>
					<tbody>
						{sales.map((sale) => (
							<tr key={sale.id} style={{ borderBottom: "1px solid var(--neutral-100)" }}>
								<td style={tdStyle}>#{sale.id}</td>
								<td style={tdStyle}>{new Date(sale.created_at).toLocaleString()}</td>
								<td style={tdStyle}>
									{sale.lines.length} item{sale.lines.length === 1 ? "" : "s"}
								</td>
								<td style={{ ...tdStyle, textTransform: "capitalize" }}>{sale.payment_method}</td>
								<td style={{ ...tdStyle, textAlign: "right", fontWeight: 700 }}>${sale.total.toFixed(2)}</td>
								<td style={tdStyle}>
									{sale.voided ? (
										<span style={statusPillStyle("var(--neutral-100)", "var(--neutral-500)")}>Voided</span>
									) : (
										<span style={statusPillStyle("var(--brand-pale)", "var(--brand)")}>Completed</span>
									)}
								</td>
								<td style={tdStyle}>
									<div style={{ display: "flex", gap: 6 }}>
										<button onClick={() => setViewing(sale)} style={smallButtonStyle}>
											View
										</button>
										<a href={saleReceiptPdfUrl(sale.id)} target="_blank" rel="noreferrer" style={{ ...smallButtonStyle, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
											PDF
										</a>
										{!sale.voided && (
											<button onClick={() => handleVoid(sale)} style={{ ...smallButtonStyle, color: "crimson" }}>
												Void
											</button>
										)}
									</div>
								</td>
							</tr>
						))}
						{sales.length === 0 && (
							<tr>
								<td colSpan={7} style={{ ...tdStyle, textAlign: "center", color: "var(--neutral-500)", padding: 24 }}>
									No sales in this range.
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>

			<Modal open={!!viewing} onClose={() => setViewing(null)} title={viewing ? `Sale #${viewing.id}` : ""}>
				{viewing && (
					<div>
						<div style={{ fontSize: 13, color: "var(--neutral-500)", marginBottom: 12 }}>
							{new Date(viewing.created_at).toLocaleString()} - {viewing.payment_method}
							{viewing.voided && <span style={{ color: "crimson", fontWeight: 700 }}> - VOIDED</span>}
						</div>
						<div style={{ display: "grid", gap: 8, marginBottom: 14 }}>
							{viewing.lines.map((line) => (
								<div key={line.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
									<span>
										{line.item_name} × {line.qty}
									</span>
									<span style={{ fontWeight: 600 }}>${line.line_total.toFixed(2)}</span>
								</div>
							))}
						</div>
						<div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid var(--neutral-200)", paddingTop: 10, fontWeight: 700 }}>
							<span>Total</span>
							<span>${viewing.total.toFixed(2)}</span>
						</div>
						{viewing.exchange_rate > 0 && (
							<div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--neutral-500)", marginTop: 2 }}>
								<span>
									≈ {usdToLbp(viewing.total, viewing.exchange_rate).toLocaleString()} LBP
								</span>
								<span>@ {viewing.exchange_rate.toLocaleString()} LBP/$ on sale date</span>
							</div>
						)}
						{viewing.payment_method === "cash" && viewing.amount_tendered != null && (
							<div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--neutral-500)", marginTop: 6 }}>
								<span>Tendered / Change</span>
								<span>
									${viewing.amount_tendered.toFixed(2)} / ${(viewing.change_due ?? 0).toFixed(2)}
								</span>
							</div>
						)}
						{voidError && <div style={{ color: "crimson", fontSize: 13, marginTop: 10 }}>{voidError}</div>}
						<div style={{ display: "flex", gap: 8, marginTop: 14 }}>
							<a href={saleReceiptPdfUrl(viewing.id)} target="_blank" rel="noreferrer" style={{ ...smallButtonStyle, flex: 1, textDecoration: "none", textAlign: "center" }}>
								Download PDF
							</a>
							{!viewing.voided && (
								<button onClick={() => handleVoid(viewing)} style={{ ...smallButtonStyle, color: "crimson", flex: 1 }}>
									Void This Sale
								</button>
							)}
						</div>
					</div>
				)}
			</Modal>
		</div>
	);
}

function statusPillStyle(bg: string, fg: string): React.CSSProperties {
	return { fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 999, background: bg, color: fg };
}

const thStyle: React.CSSProperties = { padding: "8px 12px", fontSize: 13, color: "var(--neutral-500)" };
const tdStyle: React.CSSProperties = { padding: "8px 12px", fontSize: 14 };
const presetButtonStyle: React.CSSProperties = {
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
const smallButtonStyle: React.CSSProperties = {
	padding: "6px 10px",
	borderRadius: 8,
	border: "1px solid var(--neutral-200)",
	background: "#fff",
	fontSize: 12,
	fontWeight: 600,
	cursor: "pointer",
};
