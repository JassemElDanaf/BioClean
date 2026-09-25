import { useEffect, useState } from "react";
import ActionsMenu from "../../components/ActionsMenu";
import DateRangeFilter, { isoDate, todayIso, type DateRangePreset } from "../../components/DateRangeFilter";
import Modal from "../../components/Modal";
import Select from "../../components/Select";
import SidebarToggleButton from "../../components/SidebarToggleButton";
import { ApiError } from "../../lib/api";
import { viewPdf } from "../../lib/pdf";
import { createReturn, getSale, listReturns, printSaleReceipt, saleReceiptPdfUrl, voidSale, type Return, type Sale } from "./api";
import { invoicePdfUrl } from "../invoicing/api";
import { listRevenueHistory, revenueHistoryExportCsvUrl, type RevenueEntry, type RevenueFilters } from "../reports/revenueApi";
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
	const [entries, setEntries] = useState<RevenueEntry[]>([]);
	const [total, setTotal] = useState(0);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [filters, setFilters] = useState<RevenueFilters>(() => PRESETS[0].range());
	const [viewing, setViewing] = useState<Sale | null>(null);
	const [viewSaleError, setViewSaleError] = useState<string | null>(null);
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

	async function handleViewSale(saleId: number) {
		setViewSaleError(null);
		try {
			setViewing(await getSale(saleId));
		} catch (err) {
			setViewSaleError(err instanceof ApiError ? err.message : "Couldn't load this sale.");
		}
	}

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
		listRevenueHistory(filters)
			.then(({ entries, total }) => {
				setEntries(entries);
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
			const [updatedReturns, refreshed] = await Promise.all([listReturns(viewing.id), getSale(viewing.id)]);
			setReturns(updatedReturns);
			setViewing(refreshed);
			reload();
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
		setVoidError(null);
		try {
			const updated = await voidSale(sale.id);
			setViewing((v) => (v?.id === updated.id ? updated : v));
			reload();
		} catch (err) {
			setVoidError(err instanceof ApiError ? err.message : "Couldn't void this sale.");
		}
	}

	const truncated = total > entries.length;

	if (loading && entries.length === 0) return <div>Loading sales history...</div>;
	if (error) return <div style={{ color: "crimson" }}>Couldn't load sales history: {error}</div>;

	function sourceLabel(entry: RevenueEntry): string {
		if (entry.type === "pos_sale") return `POS - ${entry.method}`;
		if (entry.type === "invoice") return "Invoice";
		return "Income";
	}

	function entryStatusPill(entry: RevenueEntry) {
		if (entry.type === "pos_sale" && entry.voided) {
			return <span style={statusPillStyle("var(--neutral-100)", "var(--neutral-500)")}>Voided</span>;
		}
		if (entry.type === "invoice") return <span style={statusPillStyle("var(--brand-pale)", "var(--brand)")}>Paid</span>;
		if (entry.type === "income") return <span style={statusPillStyle("var(--brand-pale)", "var(--brand)")}>Recorded</span>;
		return <span style={statusPillStyle("var(--brand-pale)", "var(--brand)")}>Completed</span>;
	}

	function entryActions(entry: RevenueEntry) {
		if (entry.type === "pos_sale") {
			return [
				{ label: "View Sale", onClick: () => handleViewSale(entry.id) },
				{ label: "View PDF", onClick: () => viewPdf(saleReceiptPdfUrl(entry.id)) },
				{ label: "Print Receipt", onClick: () => handlePrint(entry.id) },
			];
		}
		if (entry.type === "invoice") {
			return [{ label: "View Invoice PDF", onClick: () => viewPdf(invoicePdfUrl(entry.id)) }];
		}
		return [];
	}

	return (
		<div>
			{truncated && (
				<div style={{ background: "#fff8e1", color: "#8a6100", padding: "8px 12px", borderRadius: 8, fontSize: 13, marginBottom: 12 }}>
					Showing the first {entries.length.toLocaleString()} of {total.toLocaleString()} entries - narrow the date range to see the rest.
				</div>
			)}

			<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
				<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
					<SidebarToggleButton />
					<h2 style={{ margin: 0 }}>Sales History ({total.toLocaleString()})</h2>
				</div>
				<div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
					<DateRangeFilter presets={PRESETS} value={filters} onChange={setFilters} />
					<a href={revenueHistoryExportCsvUrl(filters)} style={presetButtonStyle}>
						Export CSV
					</a>
				</div>
			</div>

			{(voidError || printError || viewSaleError) && (
				<div style={{ background: "#fde2e2", color: "#b42318", padding: "10px 14px", borderRadius: 8, fontSize: 13, marginBottom: 12 }}>
					{voidError || printError || viewSaleError}
				</div>
			)}

			<div style={{ background: "#fff", border: "1px solid var(--neutral-200)", borderRadius: 12, overflowX: "auto", overflowY: "hidden", maxWidth: "100%" }}>
				<table style={{ width: "100%", minWidth: 700, borderCollapse: "collapse" }}>
					<thead>
						<tr style={{ textAlign: "left", borderBottom: "2px solid var(--neutral-200)" }}>
							<th style={thStyle}>Reference</th>
							<th style={thStyle}>Date</th>
							<th style={thStyle}>Source</th>
							<th style={{ ...thStyle, textAlign: "right" }}>Amount</th>
							<th style={thStyle}>Status</th>
							<th style={thStyle}></th>
						</tr>
					</thead>
					<tbody>
						{entries.map((entry) => (
							<tr key={`${entry.type}-${entry.id}`} style={{ borderBottom: "1px solid var(--neutral-100)" }}>
								<td style={tdStyle}>
									{entry.reference}
									{entry.label && <div style={{ fontSize: 12, color: "var(--neutral-500)" }}>{entry.label}</div>}
								</td>
								<td style={tdStyle}>{new Date(entry.occurred_at).toLocaleString()}</td>
								<td style={{ ...tdStyle, textTransform: "capitalize" }}>{sourceLabel(entry)}</td>
								<td style={{ ...tdStyle, textAlign: "right", fontWeight: 700 }}>${entry.amount.toFixed(2)}</td>
								<td style={tdStyle}>{entryStatusPill(entry)}</td>
								<td style={tdStyle}>
									<ActionsMenu actions={entryActions(entry)} />
								</td>
							</tr>
						))}
						{entries.length === 0 && (
							<tr>
								<td colSpan={6} style={{ ...tdStyle, textAlign: "center", color: "var(--neutral-500)", padding: 24 }}>
									No revenue in this range.
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
									<Select
										value={refundMethod}
										onChange={setRefundMethod}
										style={{ width: 150 }}
										options={[
											{ value: "cash", label: "Cash" },
											{ value: "card", label: "Card" },
											{ value: "store_credit", label: "Store Credit" },
										]}
									/>
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
							<button
								type="button"
								onClick={() => viewPdf(saleReceiptPdfUrl(viewing.id))}
								style={{ ...smallButtonStyle, flex: 1 }}
							>
								View PDF
							</button>
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
