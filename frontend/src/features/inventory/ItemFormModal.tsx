import { useState } from "react";
import Modal from "../../components/Modal";
import type { Item, ItemFormValues } from "./types";

const EMPTY: ItemFormValues = {
	item_name: "",
	category: "",
	uom: "PCS",
	shelf_location: "",
	barcode: "",
	cost_price: 0,
	retail_price: 0,
	wholesale_price: 0,
	reorder_level: 10,
	supplier_id: null,
	initial_stock_qty: 0,
};

export default function ItemFormModal({
	open,
	onClose,
	onSubmit,
	editing,
}: {
	open: boolean;
	onClose: () => void;
	onSubmit: (values: ItemFormValues) => Promise<void>;
	editing: Item | null;
}) {
	// The parent passes a `key` that changes per edited item, which forces
	// React to fully remount this component whenever a different item (or
	// "new") is being edited - the reliable way to reset state cleanly
	// (a previous version tried to detect this from inside the component
	// and kept stale values from the last item edited under certain
	// open/close sequences).
	const [values, setValues] = useState<ItemFormValues>(editing ? toFormValues(editing) : EMPTY);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	function field<K extends keyof ItemFormValues>(key: K, value: ItemFormValues[K]) {
		setValues((v) => ({ ...v, [key]: value }));
	}

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setSaving(true);
		setError(null);
		try {
			await onSubmit(values);
			setValues(EMPTY);
			onClose();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Something went wrong");
		} finally {
			setSaving(false);
		}
	}

	return (
		<Modal open={open} onClose={onClose} title={editing ? "Edit Item" : "Add Item"}>
			<form onSubmit={handleSubmit} style={{ display: "grid", gap: 10 }}>
				<Field label="Item Name">
					<input value={values.item_name} onChange={(e) => field("item_name", e.target.value)} required autoFocus style={inputStyle} />
				</Field>
				<Field label="Barcode">
					<input value={values.barcode} onChange={(e) => field("barcode", e.target.value)} required style={inputStyle} />
				</Field>
				<div style={gridStyle(2)}>
					<Field label="Category">
						<input value={values.category} onChange={(e) => field("category", e.target.value)} style={inputStyle} />
					</Field>
					<Field label="Unit of Measure">
						<select value={values.uom} onChange={(e) => field("uom", e.target.value)} style={inputStyle}>
							<option value="PCS">PCS (pieces)</option>
							<option value="L">Liter</option>
							<option value="Kg">Kg</option>
							<option value="Box">Box</option>
							<option value="Carton">Carton</option>
						</select>
					</Field>
				</div>
				<Field label="Shelf Location">
					<input value={values.shelf_location} onChange={(e) => field("shelf_location", e.target.value)} style={inputStyle} />
				</Field>
				<div style={gridStyle(3)}>
					<Field label="Cost Price">
						<input type="number" step="0.01" value={values.cost_price} onChange={(e) => field("cost_price", Number(e.target.value))} style={inputStyle} />
					</Field>
					<Field label="Retail Price">
						<input type="number" step="0.01" value={values.retail_price} onChange={(e) => field("retail_price", Number(e.target.value))} style={inputStyle} />
					</Field>
					<Field label="Wholesale Price">
						<input type="number" step="0.01" value={values.wholesale_price} onChange={(e) => field("wholesale_price", Number(e.target.value))} style={inputStyle} />
					</Field>
				</div>
				{!editing && (
					<Field label="Initial Stock Qty">
						<input type="number" step="1" value={values.initial_stock_qty} onChange={(e) => field("initial_stock_qty", Number(e.target.value))} style={inputStyle} />
					</Field>
				)}

				{error && <div style={{ color: "crimson", fontSize: 13 }}>{error}</div>}

				<button type="submit" disabled={saving} style={submitButtonStyle}>
					{saving ? "Saving..." : editing ? "Save Changes" : "Add Item"}
				</button>
			</form>
		</Modal>
	);
}

export function toFormValues(item: Item): ItemFormValues {
	return {
		item_name: item.item_name,
		category: item.category ?? "",
		uom: item.uom,
		shelf_location: item.shelf_location ?? "",
		barcode: item.barcode,
		cost_price: item.cost_price,
		retail_price: item.retail_price,
		wholesale_price: item.wholesale_price,
		// Not editable in this form (confirmed: don't need per-item
		// reorder tuning or a supplier picker right now) - carried through
		// silently so saving an edit doesn't reset them to a default.
		reorder_level: item.reorder_level,
		supplier_id: item.supplier_id,
		initial_stock_qty: 0,
	};
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<label style={{ display: "grid", gap: 4, fontSize: 13, color: "var(--neutral-500)" }}>
			{label}
			{children}
		</label>
	);
}

// CSS Grid's `1fr` columns don't shrink below their content's natural
// width by default (a well-known grid-blowout gotcha) - minmax(0, 1fr)
// is what actually lets them shrink to fit, which is what made the
// Cost/Retail/Wholesale row push the whole modal wider than the screen.
function gridStyle(columns: number): React.CSSProperties {
	return { display: "grid", gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: 10 };
}

const inputStyle: React.CSSProperties = {
	width: "100%",
	minWidth: 0,
	padding: "8px 10px",
	borderRadius: 6,
	border: "1px solid var(--neutral-200)",
	fontSize: 14,
	boxSizing: "border-box",
};

const submitButtonStyle: React.CSSProperties = {
	marginTop: 8,
	padding: "10px 16px",
	borderRadius: 6,
	border: "none",
	background: "var(--brand)",
	color: "#fff",
	fontWeight: 600,
	cursor: "pointer",
};
