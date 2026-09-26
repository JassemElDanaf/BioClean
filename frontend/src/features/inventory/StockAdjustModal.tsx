import { useEffect, useState } from "react";
import Modal from "../../components/Modal";
import Select from "../../components/Select";
import { ApiError } from "../../lib/api";
import { adjustStock } from "./api";
import type { Item, Supplier } from "./types";

const REASONS = [
	{ value: "purchase_receipt", label: "Received shipment (+)" },
	{ value: "correction", label: "Manual count correction" },
	{ value: "damage", label: "Damaged / expired (-)" },
	{ value: "other", label: "Other" },
];

export default function StockAdjustModal({
	item,
	onClose,
	onAdjusted,
	suppliers,
}: {
	item: Item | null;
	onClose: () => void;
	onAdjusted: () => void;
	// Who this shipment was actually bought from - optional, only asked
	// while receiving stock. Setting it records this adjustment as a real
	// received Purchase Order instead of a bare stock movement, so it
	// shows up in Purchase History and counts toward that supplier's
	// balance (see backend StockAdjustment.supplier_id's docstring).
	suppliers: Supplier[];
}) {
	const [qty, setQty] = useState(0);
	const [direction, setDirection] = useState<"add" | "remove">("add");
	const [reason, setReason] = useState(REASONS[0].value);
	const [unitCost, setUnitCost] = useState(0);
	const [supplierId, setSupplierId] = useState<number | "">("");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Pre-fill with the item's current cost whenever a different item is
	// opened - it's usually right (prices don't change every delivery),
	// but stays editable for the times it isn't.
	useEffect(() => {
		if (item) setUnitCost(item.cost_price);
		setSupplierId("");
	}, [item]);

	if (!item) return null;

	const isReceiving = reason === "purchase_receipt" && direction === "add";

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!item || qty <= 0) return;
		setSaving(true);
		setError(null);
		try {
			const delta = direction === "add" ? qty : -qty;
			await adjustStock(item.id, delta, reason, isReceiving ? unitCost : undefined, isReceiving && supplierId !== "" ? supplierId : undefined);
			setQty(0);
			onAdjusted();
			onClose();
		} catch (err) {
			setError(err instanceof ApiError ? err.message : "Couldn't adjust stock.");
		} finally {
			setSaving(false);
		}
	}

	return (
		<Modal open={!!item} onClose={onClose} title={`Adjust Stock - ${item.item_name}`}>
			<p style={{ fontSize: 13, color: "var(--neutral-500)", marginTop: 0 }}>
				Currently <strong>{item.stock_qty}</strong> {item.uom} on hand.
			</p>
			<form onSubmit={handleSubmit} style={{ display: "grid", gap: 10 }}>
				<div style={{ display: "flex", gap: 8 }}>
					<button
						type="button"
						onClick={() => setDirection("add")}
						style={direction === "add" ? toggleActiveStyle : toggleStyle}
					>
						+ Add stock
					</button>
					<button
						type="button"
						onClick={() => setDirection("remove")}
						style={direction === "remove" ? { ...toggleActiveStyle, background: "crimson" } : toggleStyle}
					>
						− Remove stock
					</button>
				</div>

				<label style={labelStyle}>
					Quantity
					<input
						type="number"
						min={0}
						step="1"
						value={qty}
						onChange={(e) => setQty(Number(e.target.value))}
						style={inputStyle}
						autoFocus
					/>
				</label>

				<label style={labelStyle}>
					Reason
					<Select value={reason} onChange={setReason} options={REASONS} />
				</label>

				{isReceiving && (
					<>
						<label style={labelStyle}>
							Price paid per {item.uom} this time
							<input
								type="number"
								step="0.01"
								min={0}
								value={unitCost}
								onChange={(e) => setUnitCost(Number(e.target.value))}
								style={inputStyle}
							/>
						</label>
						<label style={labelStyle}>
							Bought From (optional)
							<Select value={supplierId} onChange={setSupplierId} placeholder="No supplier" options={suppliers.map((s) => ({ value: s.id, label: s.name }))} />
						</label>
					</>
				)}

				{error && <div style={{ color: "crimson", fontSize: 13 }}>{error}</div>}

				<button type="submit" disabled={saving || qty <= 0} style={submitButtonStyle}>
					{saving ? "Saving..." : `${direction === "add" ? "Add" : "Remove"} ${qty || 0} ${item.uom}`}
				</button>
			</form>
		</Modal>
	);
}

const labelStyle: React.CSSProperties = { display: "grid", gap: 4, fontSize: 13, color: "var(--neutral-500)" };
const inputStyle: React.CSSProperties = {
	width: "100%",
	minWidth: 0,
	padding: "8px 10px",
	borderRadius: 8,
	border: "1px solid var(--neutral-200)",
	fontSize: 14,
	boxSizing: "border-box",
};
const toggleStyle: React.CSSProperties = {
	flex: 1,
	padding: "8px 10px",
	borderRadius: 8,
	border: "1px solid var(--neutral-200)",
	background: "#fff",
	cursor: "pointer",
	fontSize: 13,
	fontWeight: 600,
};
const toggleActiveStyle: React.CSSProperties = {
	...toggleStyle,
	border: "1px solid var(--brand)",
	background: "var(--brand)",
	color: "#fff",
};
const submitButtonStyle: React.CSSProperties = {
	marginTop: 8,
	padding: "10px 16px",
	borderRadius: 8,
	border: "none",
	background: "var(--brand)",
	color: "#fff",
	fontWeight: 600,
	cursor: "pointer",
};
