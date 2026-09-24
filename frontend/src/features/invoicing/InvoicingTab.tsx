import { useEffect, useMemo, useState } from "react";
import DocumentLineBuilder, { type DraftLine } from "../../components/DocumentLineBuilder";
import Modal from "../../components/Modal";
import { ApiError } from "../../lib/api";
import { createCustomer, listCustomers } from "../customers/api";
import CustomerFormModal from "../customers/CustomerFormModal";
import type { Customer, CustomerFormValues } from "../customers/types";
import { listItems } from "../inventory/api";
import type { Item } from "../inventory/types";
import { createInvoice, invoicePdfUrl, listInvoices, markInvoicePaid, voidInvoice, type Invoice } from "./api";

// Local YYYY-MM-DD (not toISOString, which shifts to UTC and can land on
// the wrong day depending on timezone/time-of-day) - matches what
// <input type="date"> both expects and displays.
function todayDateInput(): string {
	const d = new Date();
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function statusPill(status: Invoice["status"]): React.CSSProperties {
	const map: Record<Invoice["status"], [string, string]> = {
		unpaid: ["#fff3e0", "#b45f06"],
		paid: ["var(--brand-pale)", "var(--brand)"],
		voided: ["var(--neutral-100)", "var(--neutral-500)"],
	};
	const [bg, fg] = map[status];
	return { fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 999, background: bg, color: fg, textTransform: "capitalize" };
}

export default function InvoicingTab() {
	const [items, setItems] = useState<Item[]>([]);
	const [customers, setCustomers] = useState<Customer[]>([]);
	const [invoices, setInvoices] = useState<Invoice[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const [customerId, setCustomerId] = useState<number | "">("");
	const [dueDate, setDueDate] = useState(todayDateInput());
	const [notes, setNotes] = useState("");
	const [lines, setLines] = useState<DraftLine[]>([]);
	const [saving, setSaving] = useState(false);
	const [createError, setCreateError] = useState<string | null>(null);
	const [addingCustomer, setAddingCustomer] = useState(false);

	const [viewing, setViewing] = useState<Invoice | null>(null);
	const [actionError, setActionError] = useState<string | null>(null);

	const selectedCustomer = customers.find((c) => c.id === customerId) ?? null;

	function reloadAll() {
		setLoading(true);
		Promise.all([listItems(), listCustomers(), listInvoices()])
			.then(([itemsResult, customersResult, invoicesResult]) => {
				setItems(itemsResult.items);
				setCustomers(customersResult);
				setInvoices(invoicesResult.invoices);
				setError(null);
			})
			.catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
			.finally(() => setLoading(false));
	}

	useEffect(reloadAll, []);

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
		// No stock cap here (see DocumentLineBuilder's respectStock=false) -
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

	const total = useMemo(() => lines.reduce((sum, l) => sum + l.qty * l.unitPrice, 0), [lines]);

	async function handleCreate() {
		if (lines.length === 0) return;
		setSaving(true);
		setCreateError(null);
		try {
			await createInvoice({
				customer_id: customerId === "" ? null : customerId,
				lines: lines.map((l) => ({ item_id: l.item.id, qty: l.qty, unit_price: l.unitPrice })),
				due_date: dueDate || undefined,
				notes: notes || undefined,
			});
			setLines([]);
			setCustomerId("");
			setDueDate(todayDateInput());
			setNotes("");
			reloadAll();
		} catch (err) {
			setCreateError(err instanceof ApiError ? err.message : "Couldn't create this invoice.");
		} finally {
			setSaving(false);
		}
	}

	async function handleAddCustomer(values: CustomerFormValues) {
		const created = await createCustomer(values);
		setCustomers((prev) => [...prev, created]);
		setCustomerId(created.id);
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
		if (!confirm(`Void invoice #${invoice.id}?${stockNote}`)) return;
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

	if (loading) return <div>Loading invoicing...</div>;
	if (error) return <div style={{ color: "crimson" }}>Couldn't load invoicing: {error}</div>;

	return (
		<div>
			<h2 style={{ marginTop: 0 }}>New Invoice</h2>
			<div style={{ display: "flex", gap: 20, marginBottom: 32, alignItems: "flex-start" }}>
				<div style={{ flex: 1, background: "#fff", border: "1px solid var(--neutral-200)", borderRadius: 12, padding: 16 }}>
					<DocumentLineBuilder items={items} lines={lines} respectStock={false} onAdd={addLine} onChangeQty={changeQty} onRemove={removeLine} priceFor={priceFor} />
				</div>

				<div style={{ width: 320, flexShrink: 0, background: "#fff", border: "1px solid var(--neutral-200)", borderRadius: 12, padding: 16, display: "grid", gap: 10 }}>
					<label style={fieldLabelStyle}>
						Customer
						<div style={{ display: "flex", gap: 6 }}>
							<select value={customerId} onChange={(e) => setCustomerId(e.target.value ? Number(e.target.value) : "")} style={{ ...inputStyle, flex: 1 }}>
								<option value="">Walk-in / no customer</option>
								{customers.map((c) => (
									<option key={c.id} value={c.id}>
										{c.name} {c.is_wholesale ? "(wholesale)" : ""}
									</option>
								))}
							</select>
							<button type="button" onClick={() => setAddingCustomer(true)} style={addCustomerButtonStyle}>
								+ New
							</button>
						</div>
					</label>
					<label style={fieldLabelStyle}>
						Due Date (optional)
						<input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={inputStyle} />
					</label>
					<label style={fieldLabelStyle}>
						Notes (optional)
						<textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} style={{ ...inputStyle, resize: "vertical" }} />
					</label>

					<div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid var(--neutral-200)", paddingTop: 10, marginTop: 4 }}>
						<span style={{ fontWeight: 700 }}>Total</span>
						<span style={{ fontWeight: 800, fontSize: 18 }}>${total.toFixed(2)}</span>
					</div>

					{createError && <div style={{ color: "crimson", fontSize: 13 }}>{createError}</div>}

					<button onClick={handleCreate} disabled={lines.length === 0 || saving} style={lines.length === 0 || saving ? primaryButtonDisabledStyle : primaryButtonStyle}>
						{saving ? "Creating..." : "Create Invoice"}
					</button>
				</div>
			</div>

			<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
				<h2 style={{ margin: 0 }}>Invoice History ({invoices.length})</h2>
			</div>

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
							<tr key={inv.id} style={{ borderBottom: "1px solid var(--neutral-100)" }}>
								<td style={tdStyle}>#{inv.id}</td>
								<td style={tdStyle}>{new Date(inv.created_at).toLocaleDateString()}</td>
								<td style={tdStyle}>{inv.customer_name ?? "Walk-in"}</td>
								<td style={{ ...tdStyle, textAlign: "right", fontWeight: 700 }}>${inv.total.toFixed(2)}</td>
								<td style={tdStyle}>
									<span style={statusPill(inv.status)}>{inv.status}</span>
								</td>
								<td style={tdStyle}>
									<div style={{ display: "flex", gap: 6 }}>
										<button onClick={() => setViewing(inv)} style={smallButtonStyle}>
											View
										</button>
										<a href={invoicePdfUrl(inv.id)} target="_blank" rel="noreferrer" style={{ ...smallButtonStyle, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
											PDF
										</a>
									</div>
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
								<span>≈ {Math.round(viewing.total * viewing.exchange_rate).toLocaleString()} LBP</span>
								<span>@ {viewing.exchange_rate.toLocaleString()} LBP/$ on issue date</span>
							</div>
						)}
						{viewing.notes && <div style={{ fontSize: 13, color: "var(--neutral-500)", marginTop: 10 }}>Notes: {viewing.notes}</div>}

						{actionError && <div style={{ color: "crimson", fontSize: 13, marginTop: 10 }}>{actionError}</div>}

						<div style={{ display: "flex", gap: 8, marginTop: 14 }}>
							<a href={invoicePdfUrl(viewing.id)} target="_blank" rel="noreferrer" style={{ ...smallButtonStyle, flex: 1, textDecoration: "none", textAlign: "center" }}>
								Download PDF
							</a>
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
const primaryButtonDisabledStyle: React.CSSProperties = {
	...primaryButtonStyle,
	background: "var(--brand-pale)",
	cursor: "not-allowed",
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
