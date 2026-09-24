import { useEffect, useMemo, useState } from "react";
import DocumentLineBuilder, { type DraftLine } from "../../components/DocumentLineBuilder";
import Modal from "../../components/Modal";
import { ApiError } from "../../lib/api";
import { listItems, listSuppliers } from "../inventory/api";
import type { Item, Supplier } from "../inventory/types";
import { cancelPurchaseOrder, createPurchaseOrder, listPurchaseOrders, purchaseOrderPdfUrl, purchasesExportCsvUrl, receivePurchaseOrder, type PurchaseOrder } from "./api";

function statusPill(status: PurchaseOrder["status"]): React.CSSProperties {
	const map: Record<PurchaseOrder["status"], [string, string]> = {
		pending: ["#fff3e0", "#b45f06"],
		received: ["var(--brand-pale)", "var(--brand)"],
		cancelled: ["var(--neutral-100)", "var(--neutral-500)"],
	};
	const [bg, fg] = map[status];
	return { fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 999, background: bg, color: fg, textTransform: "capitalize" };
}

export default function PurchasesTab() {
	const [items, setItems] = useState<Item[]>([]);
	const [suppliers, setSuppliers] = useState<Supplier[]>([]);
	const [orders, setOrders] = useState<PurchaseOrder[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const [supplierId, setSupplierId] = useState<number | "">("");
	const [notes, setNotes] = useState("");
	const [lines, setLines] = useState<DraftLine[]>([]);
	const [saving, setSaving] = useState(false);
	const [createError, setCreateError] = useState<string | null>(null);

	const [viewing, setViewing] = useState<PurchaseOrder | null>(null);
	const [actionError, setActionError] = useState<string | null>(null);

	function reloadAll() {
		setLoading(true);
		Promise.all([listItems(), listSuppliers(), listPurchaseOrders()])
			.then(([itemsResult, suppliersResult, ordersResult]) => {
				setItems(itemsResult.items);
				setSuppliers(suppliersResult);
				setOrders(ordersResult.orders);
				setError(null);
			})
			.catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
			.finally(() => setLoading(false));
	}

	useEffect(reloadAll, []);

	function addLine(item: Item) {
		setLines((prev) => {
			const existing = prev.find((l) => l.item.id === item.id);
			if (existing) return prev.map((l) => (l.item.id === item.id ? { ...l, qty: l.qty + 1 } : l));
			return [...prev, { item, qty: 1, unitPrice: item.cost_price }];
		});
	}

	function changeQty(itemId: number, delta: number) {
		// No stock cap - receiving stock is what ADDS to inventory, so
		// there's no upper bound tied to current stock_qty here.
		setLines((prev) => prev.map((l) => (l.item.id === itemId ? { ...l, qty: Math.max(l.qty + delta, 1) } : l)).filter((l) => l.qty > 0));
	}

	function removeLine(itemId: number) {
		setLines((prev) => prev.filter((l) => l.item.id !== itemId));
	}

	const total = useMemo(() => lines.reduce((sum, l) => sum + l.qty * l.unitPrice, 0), [lines]);

	async function handleCreate() {
		if (lines.length === 0 || supplierId === "") return;
		setSaving(true);
		setCreateError(null);
		try {
			await createPurchaseOrder({
				supplier_id: supplierId,
				lines: lines.map((l) => ({ item_id: l.item.id, qty: l.qty, unit_cost: l.unitPrice })),
				notes: notes || undefined,
			});
			setLines([]);
			setSupplierId("");
			setNotes("");
			reloadAll();
		} catch (err) {
			setCreateError(err instanceof ApiError ? err.message : "Couldn't create this purchase order.");
		} finally {
			setSaving(false);
		}
	}

	async function handleReceive(po: PurchaseOrder) {
		if (!confirm(`Receive PO #${po.id}? This adds all line items to stock and updates their cost price.`)) return;
		setActionError(null);
		try {
			await receivePurchaseOrder(po.id);
			setViewing(null);
			reloadAll();
		} catch (err) {
			setActionError(err instanceof ApiError ? err.message : "Couldn't receive this purchase order.");
		}
	}

	async function handleCancel(po: PurchaseOrder) {
		if (!confirm(`Cancel PO #${po.id}?`)) return;
		try {
			await cancelPurchaseOrder(po.id);
			setViewing(null);
			reloadAll();
		} catch (err) {
			alert(err instanceof ApiError ? err.message : "Couldn't cancel this purchase order.");
		}
	}

	if (loading) return <div>Loading purchases...</div>;
	if (error) return <div style={{ color: "crimson" }}>Couldn't load purchases: {error}</div>;

	return (
		<div>
			<h2 style={{ marginTop: 0 }}>New Purchase Order</h2>
			<div style={{ display: "flex", gap: 20, marginBottom: 32, alignItems: "flex-start" }}>
				<div style={{ flex: 1, background: "#fff", border: "1px solid var(--neutral-200)", borderRadius: 12, padding: 16 }}>
					<DocumentLineBuilder items={items} lines={lines} respectStock={false} onAdd={addLine} onChangeQty={changeQty} onRemove={removeLine} priceFor={(item) => item.cost_price} />
				</div>

				<div style={{ width: 320, flexShrink: 0, background: "#fff", border: "1px solid var(--neutral-200)", borderRadius: 12, padding: 16, display: "grid", gap: 10 }}>
					<label style={fieldLabelStyle}>
						Supplier
						<select value={supplierId} onChange={(e) => setSupplierId(e.target.value ? Number(e.target.value) : "")} style={inputStyle} required>
							<option value="">Select a supplier...</option>
							{suppliers.map((s) => (
								<option key={s.id} value={s.id}>
									{s.name}
								</option>
							))}
						</select>
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

					<button
						onClick={handleCreate}
						disabled={lines.length === 0 || supplierId === "" || saving}
						style={lines.length === 0 || supplierId === "" || saving ? primaryButtonDisabledStyle : primaryButtonStyle}
					>
						{saving ? "Creating..." : "Create Purchase Order"}
					</button>
				</div>
			</div>

			<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
				<h2 style={{ margin: 0 }}>Purchase Orders ({orders.length})</h2>
				<a href={purchasesExportCsvUrl} style={secondaryButtonStyle}>
					Export CSV
				</a>
			</div>

			<div style={{ background: "#fff", border: "1px solid var(--neutral-200)", borderRadius: 12, overflowX: "auto", overflowY: "hidden", maxWidth: "100%" }}>
				<table style={{ width: "100%", minWidth: 700, borderCollapse: "collapse" }}>
					<thead>
						<tr style={{ textAlign: "left", borderBottom: "2px solid var(--neutral-200)" }}>
							<th style={thStyle}>PO #</th>
							<th style={thStyle}>Date</th>
							<th style={thStyle}>Supplier</th>
							<th style={{ ...thStyle, textAlign: "right" }}>Total</th>
							<th style={thStyle}>Status</th>
							<th style={thStyle}></th>
						</tr>
					</thead>
					<tbody>
						{orders.map((po) => (
							<tr key={po.id} style={{ borderBottom: "1px solid var(--neutral-100)" }}>
								<td style={tdStyle}>#{po.id}</td>
								<td style={tdStyle}>{new Date(po.created_at).toLocaleDateString()}</td>
								<td style={tdStyle}>{po.supplier_name ?? "-"}</td>
								<td style={{ ...tdStyle, textAlign: "right", fontWeight: 700 }}>${po.total.toFixed(2)}</td>
								<td style={tdStyle}>
									<span style={statusPill(po.status)}>{po.status}</span>
								</td>
								<td style={tdStyle}>
									<div style={{ display: "flex", gap: 6 }}>
										<button onClick={() => setViewing(po)} style={smallButtonStyle}>
											View
										</button>
										<a href={purchaseOrderPdfUrl(po.id)} target="_blank" rel="noreferrer" style={{ ...smallButtonStyle, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
											PDF
										</a>
									</div>
								</td>
							</tr>
						))}
						{orders.length === 0 && (
							<tr>
								<td colSpan={6} style={{ ...tdStyle, textAlign: "center", color: "var(--neutral-500)", padding: 24 }}>
									No purchase orders yet.
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>

			<Modal open={!!viewing} onClose={() => setViewing(null)} title={viewing ? `PO #${viewing.id}` : ""}>
				{viewing && (
					<div>
						<div style={{ fontSize: 13, color: "var(--neutral-500)", marginBottom: 12 }}>
							{viewing.supplier_name} · {new Date(viewing.created_at).toLocaleString()}
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

						{actionError && <div style={{ color: "crimson", fontSize: 13, marginTop: 10 }}>{actionError}</div>}

						<div style={{ display: "flex", gap: 8, marginTop: 14 }}>
							<a href={purchaseOrderPdfUrl(viewing.id)} target="_blank" rel="noreferrer" style={{ ...smallButtonStyle, flex: 1, textDecoration: "none", textAlign: "center" }}>
								Download PDF
							</a>
							{viewing.status === "pending" && (
								<>
									<button onClick={() => handleReceive(viewing)} style={{ ...primaryButtonStyle, flex: 1 }}>
										Receive
									</button>
									<button onClick={() => handleCancel(viewing)} style={{ ...smallButtonStyle, color: "crimson", flex: 1 }}>
										Cancel
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
const secondaryButtonStyle: React.CSSProperties = {
	padding: "8px 14px",
	borderRadius: 8,
	border: "1px solid var(--neutral-200)",
	background: "#fff",
	fontSize: 13,
	fontWeight: 600,
	color: "var(--neutral-900)",
	textDecoration: "none",
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
