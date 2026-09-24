import { useEffect, useState } from "react";
import ActionsMenu from "../../components/ActionsMenu";
import DateRangeFilter, { isoDate, todayIso, type DateRangePreset } from "../../components/DateRangeFilter";
import Modal from "../../components/Modal";
import { ApiError } from "../../lib/api";
import { createReturn, listReturns, listSales, printSaleReceipt, saleReceiptPdfUrl, salesExportCsvUrl, voidSale, type Return, type Sale, type SalesFilters } from "./api";
import { useExchangeRate, usdToLbp } from "../../lib/currency";

const PRESETS: DateRangePreset[] = [
	{ key: "today", label: "Today", range: () => ({ from_date: todayIso(), to_date: todayIso() }) },
	{
		key: "week",
		label: "This Week",
		range: () => {
			const from = new Date();
			from.setDate(from.getDate() - 7);
			return { from_date: isoDate(from), to_date: todayIso() };
		},
	},
	{
		key: "month",
		label: "This Month",
		range: () => {
			const from = new Date();
			from.setMonth(from.getMonth() - 1);
			return { from_date: isoDate(from), to_date: todayIso() };
		},
	},
	{ key: "all", label: "All Time", range: () => ({}) },
];

export default function SalesHistoryTab() {
	// The sale's own stored exchange_rate (historical, immutable) does the
	// USD->LBP math; the CURRENT rounding preference (a display concern,
	// not a historical fact) decides how that figure gets rounded.
	const exchangeRate = useExchangeRate();
	const [sales, setSales] = useState<Sale[]>([]);
	const [total, setTotal] = useState(0);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [filters, setFilters] = useState<SalesFilters>(() => PRESETS[0].range());
	const [viewing, setViewing] = useState<Sale | null>(null);
	const [voidError, setVoidError] = useState<string | null>(null);
	const [printingId, setPrintingId] = useState<number | null>(null);
	const [printError, setPrintError] = useState<string | null>(null);
	const [returns, setReturns] = useState<Return[]>([]);
	const [returnFormOpen, setReturnFormOpen] = useState(false);
	const [returnQtys, setReturnQtys] = useState<Record<number, string>>({});
	const [refundMethod, setRefundMethod] = useState("cash");
	const [returnReason, setReturnReason] = useState("");
	const [returnSubmitting, setReturnSubmitting] = useState(false);
	const [returnError, setReturnError] = useState<string | null>(null);

	async function handlePrint(saleId: number) {
		setPrintingId(saleId);
		setPrintError(null);
		try {
			await printSaleReceipt(saleId);
		} catch (err) {
			setPrintError(err instanceof ApiError ? err.message : "Couldn't print - check the printer connection.");
		} finally {
			setPrintingId(null);
		}
	}

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

	useEffect(() => {
		setReturnFormOpen(false);
		setReturnQtys({});
		setRefundMethod("cash");
		setReturnReason("");
		setReturnError(null);
		if (!viewing) {
			setReturns([]);
			return;
		}
		listReturns(viewing.id)
			.then(setReturns)
			.catch(() => setReturns([]));
	}, [viewing?.id]);

	function remainingQty(lineId: number, lineQty: number): number {
		const alreadyReturned = returns.reduce((sum, ret) => sum + ret.lines.filter((l) => l.sale_line_id === lineId).reduce((s, l) => s + l.qty, 0), 0);
		return lineQty - alreadyReturned;
	}

	async function handleCreateReturn() {
		if (!viewing) return;
		const lines = Object.entries(returnQtys)
			.map(([sale_line_id, qty]) => ({ sale_line_id: Number(sale_line_id), qty: Number(qty) }))
			.filter((l) => l.qty > 0);
		if (lines.length === 0) {
			setReturnError("Enter a quantity to return for at least one item.");
			return;
		}
		setReturnSubmitting(true);
		setReturnError(null);
		try {
			await createReturn(viewing.id, { lines, refund_method: refundMethod, reason: returnReason || undefined });
			const [updatedReturns, updatedSale] = await Promise.all([listReturns(viewing.id), listSales(filters)]);
			setReturns(updatedReturns);
			const refreshed = updatedSale.sales.find((s) => s.id === viewing.id);
			if (refreshed) {
				setViewing(refreshed);
				setSales((list) => list.map((s) => (s.id === refreshed.id ? refreshed : s)));
			}
			setReturnFormOpen(false);
			setReturnQtys({});
			setReturnReason("");
		} catch (err) {
			setReturnError(err instanceof ApiError ? err.message : "Couldn't process this return.");
		} finally {
			setReturnSubmitting(false);
		}
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
					<DateRangeFilter presets={PRESETS} value={filters} onChange={setFilters} />
					<a href={salesExportCsvUrl(filters)} style={presetButtonStyle}>
						Export CSV
					</a>
				</div>
			</div>

			{(voidError || printError) && (
				<div style={{ background: "#fde2e2", color: "#b42318", padding: "10px 14px", borderRadius: 8, fontSize: 13, marginBottom: 12 }}>{voidError || printError}</div>
			)}

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
								<td style={tdStyle}>{statusPill(sale)}</td>
								<td style={tdStyle}>
									<ActionsMenu
										actions={[
											{ label: "View", onClick: () => setViewing(sale) },
											{ label: "Download PDF", onClick: () => window.open(saleReceiptPdfUrl(sale.id), "_blank") },
											{ label: "Print Receipt", onClick: () => handlePrint(sale.id) },
											...(!sale.voided ? [{ label: "Void", onClick: () => handleVoid(sale), danger: true }] : []),
										]}
									/>
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
									≈ {usdToLbp(viewing.total, viewing.exchange_rate, exchangeRate?.rounding ?? 1).toLocaleString()} LBP
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
						{returns.length > 0 && (
							<div style={{ marginTop: 14, borderTop: "1px solid var(--neutral-200)", paddingTop: 10 }}>
								<div style={{ fontSize: 12, fontWeight: 700, color: "var(--neutral-500)", marginBottom: 6 }}>Returns</div>
								<div style={{ display: "grid", gap: 6 }}>
									{returns.map((ret) => (
										<div key={ret.id} style={{ fontSize: 13, background: "var(--neutral-50)", borderRadius: 8, padding: "6px 10px" }}>
											<div style={{ display: "flex", justifyContent: "space-between" }}>
												<span>
													{new Date(ret.created_at).toLocaleString()} - {ret.refund_method}
												</span>
												<span style={{ fontWeight: 700 }}>-${ret.total_refund.toFixed(2)}</span>
											</div>
											{ret.lines.map((l) => (
												<div key={l.id} style={{ color: "var(--neutral-500)", fontSize: 12 }}>
													{l.item_name} × {l.qty}
												</div>
											))}
											{ret.reason && <div style={{ color: "var(--neutral-500)", fontSize: 12, fontStyle: "italic" }}>{ret.reason}</div>}
										</div>
									))}
								</div>
							</div>
						)}

						{returnFormOpen && !viewing.voided && (
							<div style={{ marginTop: 14, borderTop: "1px solid var(--neutral-200)", paddingTop: 10 }}>
								<div style={{ fontSize: 12, fontWeight: 700, color: "var(--neutral-500)", marginBottom: 6 }}>Return Items</div>
								<div style={{ display: "grid", gap: 8 }}>
									{viewing.lines.map((line) => {
										const remaining = remainingQty(line.id, line.qty);
										if (remaining <= 0) return null;
										return (
											<div key={line.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13 }}>
												<span>
													{line.item_name} <span style={{ color: "var(--neutral-500)" }}>({remaining} left)</span>
												</span>
												<input
													type="number"
													min={0}
													max={remaining}
													step="any"
													value={returnQtys[line.id] ?? ""}
													onChange={(e) => setReturnQtys((qtys) => ({ ...qtys, [line.id]: e.target.value }))}
													style={{ width: 70, padding: "4px 8px", borderRadius: 6, border: "1px solid var(--neutral-200)" }}
												/>
											</div>
										);
									})}
									{viewing.lines.every((line) => remainingQty(line.id, line.qty) <= 0) && (
										<div style={{ fontSize: 13, color: "var(--neutral-500)" }}>Every item on this sale has already been fully returned.</div>
									)}
								</div>
								<div style={{ display: "flex", gap: 8, marginTop: 10 }}>
									<select value={refundMethod} onChange={(e) => setRefundMethod(e.target.value)} style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid var(--neutral-200)" }}>
										<option value="cash">Cash</option>
										<option value="card">Card</option>
										<option value="store_credit">Store Credit</option>
									</select>
									<input
										type="text"
										placeholder="Reason (optional)"
										value={returnReason}
										onChange={(e) => setReturnReason(e.target.value)}
										style={{ flex: 1, padding: "6px 8px", borderRadius: 6, border: "1px solid var(--neutral-200)" }}
									/>
								</div>
								{returnError && <div style={{ color: "crimson", fontSize: 13, marginTop: 8 }}>{returnError}</div>}
								<div style={{ display: "flex", gap: 8, marginTop: 10 }}>
									<button onClick={handleCreateReturn} disabled={returnSubmitting} style={{ ...smallButtonStyle, flex: 1 }}>
										{returnSubmitting ? "Processing..." : "Confirm Return"}
									</button>
									<button onClick={() => setReturnFormOpen(false)} style={{ ...smallButtonStyle, flex: 1 }}>
										Cancel
									</button>
								</div>
							</div>
						)}

						{voidError && <div style={{ color: "crimson", fontSize: 13, marginTop: 10 }}>{voidError}</div>}
						{printError && <div style={{ color: "crimson", fontSize: 13, marginTop: 10 }}>{printError}</div>}
						<div style={{ display: "flex", gap: 8, marginTop: 14 }}>
							<a href={saleReceiptPdfUrl(viewing.id)} target="_blank" rel="noreferrer" style={{ ...smallButtonStyle, flex: 1, textDecoration: "none", textAlign: "center" }}>
								Download PDF
							</a>
							<button onClick={() => handlePrint(viewing.id)} disabled={printingId === viewing.id} style={{ ...smallButtonStyle, flex: 1 }}>
								{printingId === viewing.id ? "Printing..." : "Print Receipt"}
							</button>
							{!viewing.voided && !returnFormOpen && (
								<button onClick={() => setReturnFormOpen(true)} style={{ ...smallButtonStyle, flex: 1 }}>
									Return Items
								</button>
							)}
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

function statusPill(sale: Sale) {
	if (sale.voided) return <span style={statusPillStyle("var(--neutral-100)", "var(--neutral-500)")}>Voided</span>;
	if (sale.returned_total > 0 && sale.returned_total >= sale.total - 0.01) {
		return <span style={statusPillStyle("#fde2e2", "#b42318")}>Fully Returned</span>;
	}
	if (sale.returned_total > 0) return <span style={statusPillStyle("#fff3cd", "#8a6100")}>Partially Returned</span>;
	return <span style={statusPillStyle("var(--brand-pale)", "var(--brand)")}>Completed</span>;
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
