import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import ActionsMenu from "../../components/ActionsMenu";
import CustomerPicker from "../../components/CustomerPicker";
import DocumentCartPanel, { type DraftLine } from "../../components/DocumentCartPanel";
import Modal from "../../components/Modal";
import DatePicker from "../../components/DatePicker";
import ProductGrid from "../../components/ProductGrid";
import Select from "../../components/Select";
import SidebarToggleButton from "../../components/SidebarToggleButton";
import { ApiError } from "../../lib/api";
import { viewPdf } from "../../lib/pdf";
import { createCustomer } from "../customers/api";
import CustomerFormModal from "../customers/CustomerFormModal";
import type { Customer, CustomerFormValues } from "../customers/types";
import { listItems } from "../inventory/api";
import type { Item } from "../inventory/types";
import DateRangeFilter, { isoDate, todayIso, type DateRangePreset, type DateRangeValue } from "../../components/DateRangeFilter";
import { useExchangeRate, usdToLbp } from "../../lib/currency";
import { createInvoice, invoicePdfUrl, listInvoices, markInvoicePaid, voidInvoice, type Invoice } from "./api";

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

function statusPill(status: Invoice["status"]): React.CSSProperties {
	const map: Record<Invoice["status"], [string, string]> = {
		unpaid: ["#fff3e0", "#b45f06"],
		paid: ["var(--brand-pale)", "var(--brand)"],
		voided: ["var(--neutral-100)", "var(--neutral-500)"],
	};
	const [bg, fg] = map[status];
	return { fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 999, background: bg, color: fg, textTransform: "capitalize" };
}

const STATUS_OPTIONS: { value: "" | Invoice["status"]; label: string }[] = [
	{ value: "", label: "All" },
	{ value: "unpaid", label: "Unpaid" },
	{ value: "paid", label: "Paid" },
	{ value: "voided", label: "Voided" },
];

export default function InvoicingTab() {
	// The invoice's own stored exchange_rate (historical, immutable) does
	// the USD->LBP math; the CURRENT rounding preference (a display
	// concern, not a historical fact) decides how that figure rounds.
	const exchangeRate = useExchangeRate();
	const [searchParams, setSearchParams] = useSearchParams();
	const initialStatus = searchParams.get("status");
	const [items, setItems] = useState<Item[]>([]);
	const [invoices, setInvoices] = useState<Invoice[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
	const [dueDate, setDueDate] = useState("");
	const [notes, setNotes] = useState("");
	const [lines, setLines] = useState<DraftLine[]>([]);
	const [saving, setSaving] = useState(false);
	const [createError, setCreateError] = useState<string | null>(null);
	const [addingCustomer, setAddingCustomer] = useState(false);

	const [viewing, setViewing] = useState<Invoice | null>(null);
	const [actionError, setActionError] = useState<string | null>(null);
	// Deep-linkable (?status=unpaid) so a Dashboard alert card can jump
	// straight into the right filtered view. Arriving that way also
	// defaults the date range to "All Time" instead of "Today" - "how
	// many unpaid invoices do we have" means all of them, not just today's.
	const [dateFilters, setDateFilters] = useState<DateRangeValue>(() => (initialStatus ? {} : PRESETS[0].range()));
	const [statusFilter, setStatusFilter] = useState<"" | Invoice["status"]>(initialStatus === "unpaid" || initialStatus === "paid" || initialStatus === "voided" ? initialStatus : "");
	const [formOpen, setFormOpen] = useState(false);
	const [highlightId, setHighlightId] = useState<number | null>(null);

	function reloadAll() {
		setLoading(true);
		Promise.all([listItems(), listInvoices({ ...dateFilters, status: statusFilter || undefined })])
			.then(([itemsResult, invoicesResult]) => {
				setItems(itemsResult.items);
				setInvoices(invoicesResult.invoices);
				setError(null);
			})
			.catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
			.finally(() => setLoading(false));
	}

	useEffect(reloadAll, [dateFilters, statusFilter]);

	function changeStatusFilter(next: "" | Invoice["status"]) {
		setStatusFilter(next);
		setSearchParams(
			(prev) => {
				const params = new URLSearchParams(prev);
				if (next) params.set("status", next);
				else params.delete("status");
				return params;
			},
			{ replace: true }
		);
	}

	function priceFor(item: Item): number {
		return selectedCustomer?.is_wholesale ? item.wholesale_price : item.retail_price;
	}

	// unitPrice is never hand-edited (DocumentCartPanel only ever displays
	// it, see its own file) - it's purely a snapshot of priceFor() taken
	// the moment a line was added. Without this, picking a wholesale
	// customer *after* already adding lines left every one of them stuck
	// at whatever tier was active when it was added - only lines added
	// afterward got the new price, silently invoicing part of the cart at
	// the wrong tier. Re-snapshotting all of them here on every customer
	// change keeps the whole cart in sync with whoever is now selected.
	useEffect(() => {
		setLines((prev) => prev.map((l) => ({ ...l, unitPrice: priceFor(l.item) })));
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [selectedCustomer?.is_wholesale]);

	function addLine(item: Item) {
		setLines((prev) => {
			const existing = prev.find((l) => l.item.id === item.id);
			if (existing) return prev.map((l) => (l.item.id === item.id ? { ...l, qty: l.qty + 1 } : l));
			return [...prev, { item, qty: 1, unitPrice: priceFor(item) }];
		});
	}

	function changeQty(itemId: number, delta: number) {
		// No stock cap here (see DocumentCartPanel's respectStock=false) -
		// an unpaid invoice doesn't touch stock at all (see backend
		// invoicing/service.py), so it can't overcommit inventory the way a
		// POS sale could. The real stock check happens once it's marked paid.
		setLines((prev) =>
			prev.map((l) => (l.item.id === itemId ? { ...l, qty: Math.max(l.qty + delta, 1) } : l)).filter((l) => l.qty > 0)
		);
	}

	function removeLine(itemId: number) {
		setLines((prev) => prev.filter((l) => l.item.id !== itemId));
	}

	async function handleCreate() {
		if (lines.length === 0) return;
		setSaving(true);
		setCreateError(null);
		try {
			const created = await createInvoice({
				customer_id: selectedCustomer?.id ?? null,
				lines: lines.map((l) => ({ item_id: l.item.id, qty: l.qty, unit_price: l.unitPrice })),
				due_date: dueDate || undefined,
				notes: notes || undefined,
			});
			setLines([]);
			setSelectedCustomer(null);
			setDueDate("");
			setNotes("");
			setFormOpen(false);
			reloadAll();
			setHighlightId(created.id);
			setTimeout(() => setHighlightId(null), 2500);
		} catch (err) {
			setCreateError(err instanceof ApiError ? err.message : "Couldn't create this invoice.");
		} finally {
			setSaving(false);
		}
	}

	async function handleAddCustomer(values: CustomerFormValues) {
		const created = await createCustomer(values);
		setSelectedCustomer(created);
	}

	async function handleMarkPaid(invoice: Invoice) {
		setActionError(null);
		try {
			const updated = await markInvoicePaid(invoice.id);
			setInvoices((list) => list.map((i) => (i.id === updated.id ? updated : i)));
			setViewing((v) => (v?.id === updated.id ? updated : v));
		} catch (err) {
			setActionError(err instanceof ApiError ? err.message : "Couldn't mark this invoice paid.");
		}
	}

	async function handleVoid(invoice: Invoice) {
		// Stock was only ever deducted once this invoice was actually marked
		// paid (see backend invoicing/service.py) - an unpaid one never
		// touched inventory, so voiding it has nothing to restore.
		const stockNote = invoice.status === "paid" ? " This restores stock for all line items." : "";
		setActionError(null);
		try {
			const updated = await voidInvoice(invoice.id);
			setInvoices((list) => list.map((i) => (i.id === updated.id ? updated : i)));
			setViewing((v) => (v?.id === updated.id ? updated : v));
			reloadAll();
		} catch (err) {
			setActionError(err instanceof ApiError ? err.message : "Couldn't void this invoice.");
		}
	}

	if (loading && invoices.length === 0) return <div>Loading invoicing...</div>;
	if (error) return <div style={{ color: "crimson" }}>Couldn't load invoicing: {error}</div>;

	return (
		<div className={formOpen ? "doc-workspace" : undefined} style={formOpen ? workspaceStyle : undefined}>
			<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 12, flexShrink: 0 }}>
				<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
					<SidebarToggleButton />
					<h2 style={{ margin: 0 }}>Invoice History ({invoices.length})</h2>
				</div>
				<div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
					<Select value={statusFilter} onChange={changeStatusFilter} options={STATUS_OPTIONS} style={{ width: 140 }} />
					<DateRangeFilter presets={PRESETS} value={dateFilters} onChange={setDateFilters} />
					<button onClick={() => setFormOpen((v) => !v)} style={primaryButtonStyle}>
						{formOpen ? "Cancel" : "+ New Invoice"}
					</button>
				</div>
			</div>

			{formOpen && (
				<div className="doc-workspace-row" style={{ display: "flex", gap: 16, flex: 1, minHeight: 0 }}>
					<div className="doc-workspace-products" style={{ flex: "0 0 68%", minWidth: 0 }}>
						<ProductGrid items={items} lines={lines} respectStock={false} onAdd={addLine} priceFor={priceFor} />
					</div>

					<div className="doc-workspace-cart" style={{ flex: "0 0 32%", minWidth: 300 }}>
						<DocumentCartPanel
							lines={lines}
							respectStock={false}
							onChangeQty={changeQty}
							onRemove={removeLine}
							error={createError}
							actionLabel={saving ? "Creating..." : "Create Invoice"}
							actionDisabled={lines.length === 0 || saving}
							onAction={handleCreate}
							header={
								<>
									<label style={fieldLabelStyle}>
										Customer
										<div style={{ display: "flex", gap: 6 }}>
											<div style={{ flex: 1, minWidth: 0 }}>
												<CustomerPicker value={selectedCustomer} onChange={setSelectedCustomer} noneLabel="Walk-in / no customer" />
											</div>
											<button type="button" onClick={() => setAddingCustomer(true)} style={addCustomerButtonStyle}>
												+ New
											</button>
										</div>
									</label>
									<label style={fieldLabelStyle}>
										Due Date (optional)
										<DatePicker value={dueDate} onChange={setDueDate} placeholder="No due date" />
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
								<th style={thStyle}>Invoice #</th>
								<th style={thStyle}>Date</th>
								<th style={thStyle}>Customer</th>
								<th style={{ ...thStyle, textAlign: "right" }}>Total</th>
								<th style={thStyle}>Status</th>
								<th style={thStyle}></th>
							</tr>
						</thead>
						<tbody>
							{invoices.map((inv) => (
								<tr
									key={inv.id}
									style={{
										borderBottom: "1px solid var(--neutral-100)",
										background: inv.id === highlightId ? "var(--brand-pale)" : "transparent",
										transition: "background-color 1.2s ease",
									}}
								>
									<td style={tdStyle}>#{inv.id}</td>
									<td style={tdStyle}>{new Date(inv.created_at).toLocaleDateString()}</td>
									<td style={tdStyle}>{inv.customer_name ?? "Walk-in"}</td>
									<td style={{ ...tdStyle, textAlign: "right", fontWeight: 700 }}>${inv.total.toFixed(2)}</td>
									<td style={tdStyle}>
										<span style={statusPill(inv.status)}>{inv.status}</span>
									</td>
									<td style={tdStyle}>
										<ActionsMenu
											actions={[
												{ label: "View Invoice", onClick: () => setViewing(inv) },
												{ label: "View PDF", onClick: () => viewPdf(invoicePdfUrl(inv.id)) },
												...(inv.status === "unpaid" ? [{ label: "Mark Paid", onClick: () => handleMarkPaid(inv) }] : []),
												...(inv.status !== "voided" ? [{ label: "Void", onClick: () => handleVoid(inv), danger: true }] : []),
											]}
										/>
									</td>
								</tr>
							))}
							{invoices.length === 0 && (
								<tr>
									<td colSpan={6} style={{ ...tdStyle, textAlign: "center", color: "var(--neutral-500)", padding: 24 }}>
										No invoices yet.
									</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>
			)}

			<Modal open={!!viewing} onClose={() => setViewing(null)} title={viewing ? `Invoice #${viewing.id}` : ""}>
				{viewing && (
					<div>
						<div style={{ fontSize: 13, color: "var(--neutral-500)", marginBottom: 12 }}>
							{viewing.customer_name ?? "Walk-in"} · {new Date(viewing.created_at).toLocaleString()}
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
								<span>≈ {usdToLbp(viewing.total, viewing.exchange_rate, exchangeRate?.rounding ?? 1).toLocaleString()} LBP</span>
								<span>@ {viewing.exchange_rate.toLocaleString()} LBP/$ on issue date</span>
							</div>
						)}
						{viewing.notes && <div style={{ fontSize: 13, color: "var(--neutral-500)", marginTop: 10 }}>Notes: {viewing.notes}</div>}

						{actionError && <div style={{ color: "crimson", fontSize: 13, marginTop: 10 }}>{actionError}</div>}

						<div style={{ display: "flex", gap: 8, marginTop: 14 }}>
							<button
								type="button"
								onClick={() => viewPdf(invoicePdfUrl(viewing.id))}
								style={{ ...smallButtonStyle, flex: 1 }}
							>
								View PDF
							</button>
							{viewing.status === "unpaid" && (
								<button onClick={() => handleMarkPaid(viewing)} style={{ ...primaryButtonStyle, flex: 1 }}>
									Mark Paid
								</button>
							)}
							{viewing.status !== "voided" && (
								<button onClick={() => handleVoid(viewing)} style={{ ...smallButtonStyle, color: "crimson", flex: 1 }}>
									Void
								</button>
							)}
						</div>
					</div>
				)}
			</Modal>

			<CustomerFormModal open={addingCustomer} onClose={() => setAddingCustomer(false)} onSubmit={handleAddCustomer} editing={null} />
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
const addCustomerButtonStyle: React.CSSProperties = {
	padding: "0 12px",
	borderRadius: 8,
	border: "1px solid var(--neutral-200)",
	background: "#fff",
	fontSize: 13,
	fontWeight: 600,
	color: "var(--brand)",
	cursor: "pointer",
	whiteSpace: "nowrap",
};
// Same as POS's own layout: `main` (App.tsx) is a flex:1 child of a
// height:100vh column, so its computed height is definite - "height:100%"
// resolves against that, filling main's content box exactly. Only applied
// while the workspace (product grid + cart) is open.
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
