import { useState } from "react";
import Modal from "../../components/Modal";
import Select from "../../components/Select";
import { ApiError } from "../../lib/api";
import { uploadItemImage } from "./api";
import type { Item, ItemFormValues } from "./types";

const EMPTY: ItemFormValues = {
	item_name: "",
	category: "",
	uom: "PCS",
	barcode: "",
	cost_price: 0,
	retail_price: 0,
	wholesale_price: 0,
	reorder_level: 10,
	initial_stock_qty: 0,
};

export default function ItemFormModal({
	open,
	onClose,
	onSubmit,
	onImageChanged,
	editing,
	categories,
}: {
	open: boolean;
	onClose: () => void;
	// Returns the created/updated item - needed on create so a picked-but-
	// not-yet-uploaded photo has an item id to upload against once this
	// resolves (a new item has no id to upload to beforehand).
	onSubmit: (values: ItemFormValues) => Promise<Item>;
	// Image upload saves independently of the rest of the form. The parent
	// reloads its list off this rather than off onSubmit.
	onImageChanged: () => void;
	editing: Item | null;
	// Every distinct category already in use, from the parent's own (full,
	// unfiltered) item list - lets the Category field suggest picking one
	// of these instead of free-typing a near-duplicate ("Cleaning" vs
	// "cleaning" vs "Clean Supplies"), while still allowing a genuinely
	// new category by just typing it.
	categories: string[];
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
	const [imageUrl, setImageUrl] = useState<string | null>(editing?.image_url ?? null);
	// Only meaningful while creating (no item id yet to upload to) - picked
	// now, uploaded right after the item is created in handleSubmit below.
	const [pendingFile, setPendingFile] = useState<File | null>(null);
	const [pendingPreview, setPendingPreview] = useState<string | null>(null);
	const [uploading, setUploading] = useState(false);
	const [imageError, setImageError] = useState<string | null>(null);

	function field<K extends keyof ItemFormValues>(key: K, value: ItemFormValues[K]) {
		setValues((v) => ({ ...v, [key]: value }));
	}

	async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
		const file = e.target.files?.[0];
		e.target.value = "";
		if (!file) return;
		setImageError(null);

		if (editing) {
			setUploading(true);
			try {
				const updated = await uploadItemImage(editing.id, file);
				setImageUrl(updated.image_url);
				onImageChanged();
			} catch (err) {
				setImageError(err instanceof ApiError ? err.message : "Couldn't upload this image.");
			} finally {
				setUploading(false);
			}
		} else {
			setPendingFile(file);
			setPendingPreview((prev) => {
				if (prev) URL.revokeObjectURL(prev);
				return URL.createObjectURL(file);
			});
		}
	}

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setSaving(true);
		setError(null);
		try {
			const item = await onSubmit(values);
			if (pendingFile) {
				try {
					await uploadItemImage(item.id, pendingFile);
					onImageChanged();
				} catch (err) {
					// The item itself was created successfully - only the photo
					// failed, so don't block the modal from closing over this.
					setImageError(err instanceof ApiError ? err.message : "Item saved, but the photo upload failed.");
				}
			}
			setValues(EMPTY);
			setPendingFile(null);
			setPendingPreview(null);
			onClose();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Something went wrong");
		} finally {
			setSaving(false);
		}
	}

	const photoSrc = editing ? imageUrl : pendingPreview;

	return (
		<Modal open={open} onClose={onClose} title={editing ? "Edit Item" : "Add Item"}>
			<form onSubmit={handleSubmit} style={{ display: "grid", gap: 10 }}>
				<Field label="Item Name">
					<input value={values.item_name} onChange={(e) => field("item_name", e.target.value)} required autoFocus style={inputStyle} />
				</Field>
				<Field label="Barcode">
					{/* inputMode (not type="number") - the value stays a plain
					    string (see ItemFormValues.barcode: string), which keeps
					    leading zeros and letter-containing SKUs intact; this
					    only asks a phone/tablet to show its numeric keypad, and
					    a real barcode scanner types into it exactly the same
					    either way (see lib/useBarcodeScanner.ts). */}
					<input
						value={values.barcode}
						onChange={(e) => field("barcode", e.target.value)}
						required
						inputMode="numeric"
						autoComplete="off"
						style={inputStyle}
					/>
				</Field>
				<div style={gridStyle(2)}>
					<Field label="Category">
						{/* A <datalist> rather than a closed dropdown (like the UOM
						    Select next to it) - existing categories show up as
						    suggestions while typing, but the field stays free text
						    so the first item of a brand-new category isn't blocked
						    on that category already existing somewhere. */}
						<input value={values.category} onChange={(e) => field("category", e.target.value)} list="item-category-options" style={inputStyle} />
						<datalist id="item-category-options">
							{categories.map((c) => (
								<option key={c} value={c} />
							))}
						</datalist>
					</Field>
					<Field label="Unit of Measure">
						<Select
							value={values.uom}
							onChange={(v) => field("uom", v)}
							options={[
								{ value: "PCS", label: "PCS (pieces)" },
								{ value: "L", label: "Liter" },
								{ value: "Kg", label: "Kg" },
								{ value: "Box", label: "Box" },
								{ value: "Carton", label: "Carton" },
							]}
						/>
					</Field>
				</div>

				<Field label="Photo">
					<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
						{photoSrc ? (
							<img src={photoSrc} alt="" style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 6 }} />
						) : (
							<div style={{ width: 40, height: 40, borderRadius: 6, background: "var(--neutral-100)", display: "flex", alignItems: "center", justifyContent: "center" }}>
								📦
							</div>
						)}
						<input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleImageChange} disabled={uploading} style={{ fontSize: 13 }} />
						{uploading && <span style={{ fontSize: 12, color: "var(--neutral-500)" }}>Uploading...</span>}
					</div>
					{imageError && <div style={{ color: "crimson", fontSize: 13, marginTop: 4 }}>{imageError}</div>}
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
		barcode: item.barcode,
		cost_price: item.cost_price,
		retail_price: item.retail_price,
		wholesale_price: item.wholesale_price,
		// reorder_level isn't editable in this form (confirmed: don't need
		// per-item reorder tuning right now) - carried through silently so
		// saving an edit doesn't reset it to a default.
		reorder_level: item.reorder_level,
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
	borderRadius: 8,
	border: "1px solid var(--neutral-200)",
	fontSize: 14,
	boxSizing: "border-box",
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
