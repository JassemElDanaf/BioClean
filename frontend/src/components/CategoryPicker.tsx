import { useState } from "react";
import Select from "./Select";

// A closed dropdown of every category already in use, with an explicit
// "+ New" escape hatch to type a brand-new one - same two-part pattern as
// picking a customer elsewhere in the app (a Select plus a "+ New" button
// next to it, see CustomerFormModal/QuotationTab/InvoicingTab). Replaces a
// plain free-text input with a <datalist> - a native datalist quietly lets
// you type anything, but nothing about it visibly says "you can add a new
// one", which is exactly what this makes explicit.
export default function CategoryPicker({
	value,
	onChange,
	categories,
	placeholder = "Select a category...",
}: {
	value: string;
	onChange: (value: string) => void;
	categories: string[];
	placeholder?: string;
}) {
	// Starts in "typing a new one" mode whenever there's nothing to pick
	// from yet, or the current value doesn't match any known category
	// (editing an item whose category was renamed/removed elsewhere, or a
	// value just typed in this same session before categories reloaded).
	const [addingNew, setAddingNew] = useState(() => categories.length === 0 || (value !== "" && !categories.includes(value)));

	if (addingNew) {
		return (
			<div style={{ display: "flex", gap: 6 }}>
				<input value={value} onChange={(e) => onChange(e.target.value)} placeholder="New category name" autoFocus style={inputStyle} />
				{categories.length > 0 && (
					<button
						type="button"
						onClick={() => {
							setAddingNew(false);
							onChange("");
						}}
						style={cancelButtonStyle}
					>
						Cancel
					</button>
				)}
			</div>
		);
	}

	return (
		<div style={{ display: "flex", gap: 6 }}>
			<div style={{ flex: 1, minWidth: 0 }}>
				<Select value={value} onChange={onChange} options={categories.map((c) => ({ value: c, label: c }))} placeholder={placeholder} />
			</div>
			<button type="button" onClick={() => setAddingNew(true)} style={addButtonStyle}>
				+ New
			</button>
		</div>
	);
}

const inputStyle: React.CSSProperties = {
	flex: 1,
	minWidth: 0,
	padding: "8px 10px",
	borderRadius: 8,
	border: "1px solid var(--neutral-200)",
	fontSize: 14,
	boxSizing: "border-box",
};
const addButtonStyle: React.CSSProperties = {
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
const cancelButtonStyle: React.CSSProperties = {
	padding: "0 12px",
	borderRadius: 8,
	border: "1px solid var(--neutral-200)",
	background: "#fff",
	fontSize: 13,
	fontWeight: 600,
	color: "var(--neutral-500)",
	cursor: "pointer",
	whiteSpace: "nowrap",
};
