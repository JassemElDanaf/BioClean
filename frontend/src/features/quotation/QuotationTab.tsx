import { useEffect, useMemo, useState } from "react";
import ActionsMenu from "../../components/ActionsMenu";
import CustomerPicker from "../../components/CustomerPicker";
import DateRangeFilter, { isoDate, todayIso, type DateRangePreset, type DateRangeValue } from "../../components/DateRangeFilter";
import DocumentCartPanel, { type DraftLine } from "../../components/DocumentCartPanel";
import Modal from "../../components/Modal";
import DatePicker from "../../components/DatePicker";
import ProductGrid from "../../components/ProductGrid";
import SidebarToggleButton from "../../components/SidebarToggleButton";
import { ApiError } from "../../lib/api";
import { viewPdf } from "../../lib/pdf";
import type { Customer } from "../customers/types";
import { listItems } from "../inventory/api";
import type { Item } from "../inventory/types";
import { convertQuotation, createQuotation, deleteQuotation, listQuotations, quotationPdfUrl, type Quotation } from "./api";

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

function statusPill(status: Quotation["status"]): React.CSSProperties {
	const map: Record<Quotation["status"], [string, string]> = {
		draft: ["var(--neutral-100)", "var(--neutral-500)"],
		sent: ["#e3f2fd", "#1565c0"],
		accepted: ["var(--brand-pale)", "var(--brand)"],
		expired: ["#fff3e0", "#b45f06"],
		converted: ["var(--brand-pale)", "var(--brand)"],
	};
	const [bg, fg] = map[status];
	return { fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 999, background: bg, color: fg, textTransform: "capitalize" };
}

export default function QuotationTab() {
	const [items, setItems] = useState<Item[]>([]);
	const [quotations, setQuotations] = useState<Quotation[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
	const [validUntil, setValidUntil] = useState("");
	const [notes, setNotes] = useState("");
	const [lines, setLines] = useState<DraftLine[]>([]);
	const [saving, setSaving] = useState(false);
	const [createError, setCreateError] = useState<string | null>(null);

	const [viewing, setViewing] = useState<Quotation | null>(null);
	const [actionError, setActionError] = useState<string | null>(null);
	const [dateFilters, setDateFilters] = useState<DateRangeValue>(() => PRESETS[0].range());
	const [formOpen, setFormOpen] = useState(false);
	// Briefly tints the row for the quotation just created, so landing back
	// on the list after "Create Quotation" doesn't feel like it silently
	// dumped you somewhere - it fades on its own via the row's own CSS
	// transition once this clears.
	const [highlightId, setHighlightId] = useState<number | null>(null);

	function reloadAll() {
		setLoading(true);
		Promise.all([listItems(), listQuotations(dateFilters)])
			.then(([itemsResult, quotationsResult]) => {
				setItems(itemsResult.items);
				setQuotations(quotationsResult.quotations);
				setError(null);
			})
			.catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
			.finally(() => setLoading(false));
	}

	useEffect(reloadAll, [dateFilters]);

	function priceFor(item: Item): number {
		return selectedCustomer?.is_wholesale ? item.wholesale_price : item.retail_price;
	}

	function addLine(item: Item) {
		setLines((prev) => {
			const existing = prev.find((l) => l.item.id === item.id);
			if (existing) return prev.map((l) => (l.item.id === item.id ? { ...l, qty: l.qty + 1 } : l));
			return [...prev, { item, qty: 1, unitPrice: priceFor(item) }];
		});
	}

	function changeQty(itemId: number, delta: number) {
		// No stock cap here (see DocumentCartPanel's respectStock=false) -
		// a quote is allowed to ask for more than what's currently on hand.
		setLines((prev) => prev.map((l) => (l.item.id === itemId ? { ...l, qty: Math.max(l.qty + delta, 1) } : l)).filter((l) => l.qty > 0));
	}

	function removeLine(itemId: number) {
		setLines((prev) => prev.filter((l) => l.item.id !== itemId));
	}

	async function handleCreate() {
		if (lines.length === 0) return;
		setSaving(true);
		setCreateError(null);
		try {
			const created = await createQuotation({
				customer_id: selectedCustomer?.id ?? null,
				lines: lines.map((l) => ({ item_id: l.item.id, qty: l.qty, unit_price: l.unitPrice })),
				valid_until: validUntil || undefined,
				notes: notes || undefined,
			});
			setLines([]);
			setSelectedCustomer(null);
			setValidUntil("");
			setNotes("");
			setFormOpen(false);
			reloadAll();
			setHighlightId(created.id);
			setTimeout(() => setHighlightId(null), 2500);
		} catch (err) {
			setCreateError(err instanceof ApiError ? err.message : "Couldn't create this quotation.");
		} finally {
			setSaving(false);
		}
	}

	async function handleConvert(quotation: Quotation) {
		setActionError(null);
		try {
			await convertQuotation(quotation.id);
			setViewing(null);
			reloadAll();
		} catch (err) {
			setActionError(err instanceof ApiError ? err.message : "Couldn't convert this quotation.");
		}
	}

	async function handleDelete(quotation: Quotation) {
		if (!confirm(`Delete quote #${quotation.id}?`)) return;
		try {
			await deleteQuotation(quotation.id);
			setViewing(null);
			reloadAll();
		} catch (err) {
			alert(err instanceof ApiError ? err.message : "Couldn't delete this quotation.");
		}
	}

	if (loading && quotations.length === 0) return <div>Loading quotations...</div>;
	if (error) return <div style={{ color: "crimson" }}>Couldn't load quotations: {error}</div>;

	return (
		<div style={formOpen ? workspaceStyle : undefined}>
			<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 12, flexShrink: 0 }}>
				<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
					<SidebarToggleButton />
					<h2 style={{ margin: 0 }}>Quotations ({quotations.length})</h2>
				</div>
				<div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
					<DateRangeFilter presets={PRESETS} value={dateFilters} onChange={setDateFilters} />
					<button onClick={() => setFormOpen((v) => !v)} style={primaryButtonStyle}>
						{formOpen ? "Cancel" : "+ New Quotation"}
					</button>
				</div>
			</div>

			{/* flex:1 in a height-constrained page root (see workspaceStyle) -
			    fills exactly what's left below the header above, whatever that
			    header's real height turns out to be, rather than guessing at a
			    viewport-relative number from outside it. */}
			{formOpen && (
				<div style={{ display: "flex", gap: 16, flex: 1, minHeight: 0 }}>
					<div style={{ flex: "0 0 68%", minWidth: 0 }}>
						<ProductGrid items={items} lines={lines} respectStock={false} onAdd={addLine} priceFor={priceFor} />
					</div>

					<div style={{ flex: "0 0 32%", minWidth: 300 }}>
						<DocumentCartPanel
							lines={lines}
							respectStock={false}
							onChangeQty={changeQty}
							onRemove={removeLine}
							error={createError}
							actionLabel={saving ? "Creating..." : "Create Quotation"}
							actionDisabled={lines.length === 0 || saving}
							onAction={handleCreate}
							header={
								<>
									<label style={fieldLabelStyle}>
										Customer
										<CustomerPicker value={selectedCustomer} onChange={setSelectedCustomer} noneLabel="No customer yet" />
									</label>
									<label style={fieldLabelStyle}>
										Valid Until (optional)
										<DatePicker value={validUntil} onChange={setValidUntil} placeholder="No expiry" />
									</label>
								</>
							}
							secondary={
								<label style={fieldLabelStyle}>
									Notes
									<textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} style={{ ...inputStyle, resize: "vertical" }} />
								</label>
							}
						/>
					</div>
				</div>
			)}

			{actionError && (
				<div style={{ background: "#fde2e2", color: "#b42318", padding: "10px 14px", borderRadius: 8, fontSize: 13, marginBottom: 12 }}>{actionError}</div>
			)}

			{!formOpen && (
				<div style={{ background: "#fff", border: "1px solid var(--neutral-200)", borderRadius: 12, overflowX: "auto", overflowY: "hidden", maxWidth: "100%" }}>
					<table style={{ width: "100%", minWidth: 700, borderCollapse: "collapse" }}>
						<thead>
							<tr style={{ textAlign: "left", borderBottom: "2px solid var(--neutral-200)" }}>
								<th style={thStyle}>Quote #</th>
								<th style={thStyle}>Date</th>
								<th style={thStyle}>Customer</th>
								<th style={{ ...thStyle, textAlign: "right" }}>Total</th>
								<th style={thStyle}>Status</th>
								<th style={thStyle}></th>
							</tr>
						</thead>
						<tbody>
							{quotations.map((q) => (
								<tr
									key={q.id}
									style={{
										borderBottom: "1px solid var(--neutral-100)",
										background: q.id === highlightId ? "var(--brand-pale)" : "transparent",
										transition: "background-color 1.2s ease",
									}}
								>
									<td style={tdStyle}>#{q.id}</td>
									<td style={tdStyle}>{new Date(q.created_at).toLocaleDateString()}</td>
									<td style={tdStyle}>{q.customer_name ?? "-"}</td>
									<td style={{ ...tdStyle, textAlign: "right", fontWeight: 700 }}>${q.total.toFixed(2)}</td>
									<td style={tdStyle}>
										<span style={statusPill(q.status)}>{q.status}</span>
									</td>
									<td style={tdStyle}>
										<ActionsMenu
											actions={[
												{ label: "View Quotation", onClick: () => setViewing(q) },
												{ label: "View PDF", onClick: () => viewPdf(quotationPdfUrl(q.id)) },
												...(q.status !== "converted"
													? [
															{ label: "Convert to Invoice", onClick: () => handleConvert(q) },
															{ label: "Delete", onClick: () => handleDelete(q), danger: true },
														]
													: []),
											]}
										/>
									</td>
								</tr>
							))}
							{quotations.length === 0 && (
								<tr>
									<td colSpan={6} style={{ ...tdStyle, textAlign: "center", color: "var(--neutral-500)", padding: 24 }}>
										No quotations yet.
									</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>
			)}

			<Modal open={!!viewing} onClose={() => setViewing(null)} title={viewing ? `Quotation #${viewing.id}` : ""}>
				{viewing && (
					<div>
						<div style={{ fontSize: 13, color: "var(--neutral-500)", marginBottom: 12 }}>
							{viewing.customer_name ?? "No customer"} · {new Date(viewing.created_at).toLocaleString()}
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
						{viewing.notes && <div style={{ fontSize: 13, color: "var(--neutral-500)", marginTop: 10 }}>Notes: {viewing.notes}</div>}
						{viewing.status === "converted" && (
							<div style={{ fontSize: 13, color: "var(--brand)", marginTop: 10, fontWeight: 600 }}>Converted to Invoice #{viewing.converted_invoice_id}</div>
						)}

						{actionError && <div style={{ color: "crimson", fontSize: 13, marginTop: 10 }}>{actionError}</div>}

						<div style={{ display: "flex", gap: 8, marginTop: 14 }}>
							<button
								type="button"
								onClick={() => viewPdf(quotationPdfUrl(viewing.id))}
								style={{ ...smallButtonStyle, flex: 1 }}
							>
								View PDF
							</button>
							{viewing.status !== "converted" && (
								<>
									<button onClick={() => handleConvert(viewing)} style={{ ...primaryButtonStyle, flex: 1 }}>
										Convert to Invoice
									</button>
									<button onClick={() => handleDelete(viewing)} style={{ ...smallButtonStyle, color: "crimson", flex: 1 }}>
										Delete
									</button>
								</>
							)}
						</div>
					</div>
				)}
			</Modal>
		</div>
	);
}

const fieldLabelStyle: React.CSSProperties = { display: "grid", gap: 4, fontSize: 13, color: "var(--neutral-500)" };
const inputStyle: React.CSSProperties = {
	width: "100%",
	padding: "8px 10px",
	borderRadius: 8,
	border: "1px solid var(--neutral-200)",
	fontSize: 14,
	boxSizing: "border-box",
};
// Same trick POS's own layout already relies on: `main` (App.tsx) is a
// flex:1 child of a height:100vh column, so its own computed height is
// definite even though nothing sets it directly - "height: 100%" here
// resolves against that, filling exactly main's content box (minus its
// padding) with zero guessed pixel offsets. Only applied while the
// workspace (product grid + cart) is open; the plain table view below
// flows normally and lets <main> scroll as usual.
const workspaceStyle: React.CSSProperties = { height: "100%", display: "flex", flexDirection: "column" };
const thStyle: React.CSSProperties = { padding: "8px 12px", fontSize: 13, color: "var(--neutral-500)" };
const tdStyle: React.CSSProperties = { padding: "8px 12px", fontSize: 14 };
const primaryButtonStyle: React.CSSProperties = {
	padding: "10px 16px",
	borderRadius: 8,
	border: "none",
	background: "var(--brand)",
	color: "#fff",
	fontWeight: 700,
	fontSize: 14,
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
