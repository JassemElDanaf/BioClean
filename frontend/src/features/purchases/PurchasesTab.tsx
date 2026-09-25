import { useEffect, useState } from "react";
import ActionsMenu from "../../components/ActionsMenu";
import DateRangeFilter, { isoDate, todayIso, type DateRangePreset, type DateRangeValue } from "../../components/DateRangeFilter";
import DocumentCartPanel, { type DraftLine } from "../../components/DocumentCartPanel";
import Modal from "../../components/Modal";
import ProductGrid from "../../components/ProductGrid";
import Select from "../../components/Select";
import SidebarToggleButton from "../../components/SidebarToggleButton";
import { ApiError } from "../../lib/api";
import { viewPdf } from "../../lib/pdf";
import { listItems, listSuppliers } from "../inventory/api";
import type { Item, Supplier } from "../inventory/types";
import { cancelPurchaseOrder, createPurchaseOrder, listPurchaseOrders, markPurchaseOrderPaid, purchaseOrderPdfUrl, receivePurchaseOrder, type PurchaseOrder } from "./api";

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

function statusPill(status: PurchaseOrder["status"]): React.CSSProperties {
	const map: Record<PurchaseOrder["status"], [string, string]> = {
		pending: ["#fff3e0", "#b45f06"],
		received: ["var(--brand-pale)", "var(--brand)"],
		cancelled: ["var(--neutral-100)", "var(--neutral-500)"],
	};
	const [bg, fg] = map[status];
	return { fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 999, background: bg, color: fg, textTransform: "capitalize" };
}

function paymentPillStyle(paymentStatus: PurchaseOrder["payment_status"]): React.CSSProperties {
	const [bg, fg] = paymentStatus === "paid" ? ["var(--brand-pale)", "var(--brand)"] : ["#fde2e2", "#b42318"];
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
	const [dateFilters, setDateFilters] = useState<DateRangeValue>(() => PRESETS[0].range());
	const [formOpen, setFormOpen] = useState(false);
	const [highlightId, setHighlightId] = useState<number | null>(null);

	function reloadAll() {
		setLoading(true);
		Promise.all([listItems(), listSuppliers(), listPurchaseOrders(dateFilters)])
			.then(([itemsResult, suppliersResult, ordersResult]) => {
				setItems(itemsResult.items);
				setSuppliers(suppliersResult);
				setOrders(ordersResult.orders);
				setError(null);
				// Nearly every restock comes from BioClean's own factory, not an
				// outside supplier - default to it so the common case needs zero
				// clicks, while the dropdown right below stays free to pick
				// someone else for the rare order placed elsewhere.
				setSupplierId((current) => {
					if (current !== "") return current;
					const factory = suppliersResult.find((s) => s.name === "BioClean Factory");
					return factory ? factory.id : current;
				});
			})
			.catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
			.finally(() => setLoading(false));
	}

	useEffect(reloadAll, [dateFilters]);

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

	async function handleCreate() {
		if (lines.length === 0 || supplierId === "") return;
		setSaving(true);
		setCreateError(null);
		try {
			const created = await createPurchaseOrder({
				supplier_id: supplierId,
				lines: lines.map((l) => ({ item_id: l.item.id, qty: l.qty, unit_cost: l.unitPrice })),
				notes: notes || undefined,
			});
			setLines([]);
			setSupplierId("");
			setNotes("");
			setFormOpen(false);
			reloadAll();
			setHighlightId(created.id);
			setTimeout(() => setHighlightId(null), 2500);
		} catch (err) {
			setCreateError(err instanceof ApiError ? err.message : "Couldn't create this purchase order.");
		} finally {
			setSaving(false);
		}
	}

	async function handleReceive(po: PurchaseOrder) {
		setActionError(null);
		try {
			await receivePurchaseOrder(po.id);
			setViewing(null);
			reloadAll();
		} catch (err) {
			setActionError(err instanceof ApiError ? err.message : "Couldn't receive this purchase order.");
		}
	}

	async function handleMarkPaid(po: PurchaseOrder) {
		setActionError(null);
		try {
			const updated = await markPurchaseOrderPaid(po.id);
			setViewing(updated);
			reloadAll();
		} catch (err) {
			setActionError(err instanceof ApiError ? err.message : "Couldn't mark this purchase order paid.");
		}
	}

	async function handleCancel(po: PurchaseOrder) {
		try {
			await cancelPurchaseOrder(po.id);
			setViewing(null);
			reloadAll();
		} catch (err) {
			alert(err instanceof ApiError ? err.message : "Couldn't cancel this purchase order.");
		}
	}

	if (loading && orders.length === 0) return <div>Loading purchases...</div>;
	if (error) return <div style={{ color: "crimson" }}>Couldn't load purchases: {error}</div>;

	return (
		<div className={formOpen ? "doc-workspace" : undefined} style={formOpen ? workspaceStyle : undefined}>
			<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 12, flexShrink: 0 }}>
				<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
					<SidebarToggleButton />
					<h2 style={{ margin: 0 }}>Purchase Orders ({orders.length})</h2>
				</div>
				<div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
					<DateRangeFilter presets={PRESETS} value={dateFilters} onChange={setDateFilters} />
					<button onClick={() => setFormOpen((v) => !v)} style={primaryButtonStyle}>
						{formOpen ? "Cancel" : "+ New Purchase Order"}
					</button>
				</div>
			</div>

			{formOpen && (
				<div className="doc-workspace-row" style={{ display: "flex", gap: 16, flex: 1, minHeight: 0 }}>
					<div className="doc-workspace-products" style={{ flex: "0 0 68%", minWidth: 0 }}>
						<ProductGrid items={items} lines={lines} respectStock={false} onAdd={addLine} priceFor={(item) => item.cost_price} />
					</div>

					<div className="doc-workspace-cart" style={{ flex: "0 0 32%", minWidth: 300 }}>
						<DocumentCartPanel
							lines={lines}
							respectStock={false}
							onChangeQty={changeQty}
							onRemove={removeLine}
							error={createError}
							actionLabel={saving ? "Creating..." : "Create Purchase Order"}
							actionDisabled={lines.length === 0 || supplierId === "" || saving}
							onAction={handleCreate}
							header={
								<label style={fieldLabelStyle}>
									Supplier
									<Select
										value={supplierId}
										onChange={setSupplierId}
										placeholder="Select a supplier..."
										required
										options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
									/>
								</label>
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
								<th style={thStyle}>PO #</th>
								<th style={thStyle}>Date</th>
								<th style={thStyle}>Supplier</th>
								<th style={{ ...thStyle, textAlign: "right" }}>Total</th>
								<th style={thStyle}>Status</th>
								<th style={thStyle}>Payment</th>
								<th style={thStyle}></th>
							</tr>
						</thead>
						<tbody>
							{orders.map((po) => (
								<tr
									key={po.id}
									style={{
										borderBottom: "1px solid var(--neutral-100)",
										background: po.id === highlightId ? "var(--brand-pale)" : "transparent",
										transition: "background-color 1.2s ease",
									}}
								>
									<td style={tdStyle}>#{po.id}</td>
									<td style={tdStyle}>{new Date(po.created_at).toLocaleDateString()}</td>
									<td style={tdStyle}>{po.supplier_name ?? "-"}</td>
									<td style={{ ...tdStyle, textAlign: "right", fontWeight: 700 }}>${po.total.toFixed(2)}</td>
									<td style={tdStyle}>
										<span style={statusPill(po.status)}>{po.status}</span>
									</td>
									<td style={tdStyle}>
										{po.status === "received" && (
											<span style={paymentPillStyle(po.payment_status)}>{po.payment_status}</span>
										)}
									</td>
									<td style={tdStyle}>
										<ActionsMenu
											actions={[
												{ label: "View Purchase Order", onClick: () => setViewing(po) },
												{ label: "View PDF", onClick: () => viewPdf(purchaseOrderPdfUrl(po.id)) },
												...(po.status === "pending"
													? [
															{ label: "Receive", onClick: () => handleReceive(po) },
															{ label: "Cancel", onClick: () => handleCancel(po), danger: true },
														]
													: []),
												...(po.status === "received" && po.payment_status === "unpaid"
													? [{ label: "Mark Paid", onClick: () => handleMarkPaid(po) }]
													: []),
											]}
										/>
									</td>
								</tr>
							))}
							{orders.length === 0 && (
								<tr>
									<td colSpan={7} style={{ ...tdStyle, textAlign: "center", color: "var(--neutral-500)", padding: 24 }}>
										No purchase orders yet.
									</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>
			)}

			<Modal open={!!viewing} onClose={() => setViewing(null)} title={viewing ? `PO #${viewing.id}` : ""}>
				{viewing && (
					<div>
						<div style={{ fontSize: 13, color: "var(--neutral-500)", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
							<span>
								{viewing.supplier_name} · {new Date(viewing.created_at).toLocaleString()}
							</span>
							{viewing.status === "received" && <span style={paymentPillStyle(viewing.payment_status)}>{viewing.payment_status}</span>}
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
							<button
								type="button"
								onClick={() => viewPdf(purchaseOrderPdfUrl(viewing.id))}
								style={{ ...smallButtonStyle, flex: 1 }}
							>
								View PDF
							</button>
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
							{viewing.status === "received" && viewing.payment_status === "unpaid" && (
								<button onClick={() => handleMarkPaid(viewing)} style={{ ...primaryButtonStyle, flex: 1 }}>
									Mark Paid
								</button>
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
