import { useState } from "react";
import Modal from "./Modal";
import { ApiError } from "../lib/api";
import { TrashIcon } from "./icons";

// Categories aren't a stored list anywhere - each one exists only because
// at least one item/expense currently has it (see the callers' own
// `categories` derivation). So this is the one place to rename a category
// everywhere at once, merge it into another existing one, or (items only -
// Expense.category is required) clear it off everything and make it
// disappear. "Add a new category" has no separate action here: it already
// happens the moment you type a new name into an item/expense's own
// Category field (see CategoryPicker) - there's nothing to "add" ahead of
// that first use.
export default function ManageCategoriesModal({
	open,
	onClose,
	categories,
	onRename,
	allowClear,
}: {
	open: boolean;
	onClose: () => void;
	categories: string[];
	// Renames/merges `oldCategory` into `newCategory` everywhere it's used.
	// The caller reloads its own category list off this resolving.
	onRename: (oldCategory: string, newCategory: string) => Promise<void>;
	// Items can clear a category to blank; Expense.category is required,
	// so Expenses can only merge into another existing category, never
	// clear outright.
	allowClear: boolean;
}) {
	const [edits, setEdits] = useState<Record<string, string>>({});
	const [savingRow, setSavingRow] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	function valueFor(category: string): string {
		return edits[category] ?? category;
	}

	async function handleSave(category: string, newValue: string) {
		const trimmed = newValue.trim();
		if (trimmed === category) return;
		if (!allowClear && trimmed === "") {
			setError("This category can't be left blank - merge it into another category instead.");
			return;
		}
		setSavingRow(category);
		setError(null);
		try {
			await onRename(category, trimmed);
			setEdits((prev) => {
				const next = { ...prev };
				delete next[category];
				return next;
			});
		} catch (err) {
			setError(err instanceof ApiError ? err.message : "Couldn't update this category.");
		} finally {
			setSavingRow(null);
		}
	}

	return (
		<Modal open={open} onClose={onClose} title="Manage Categories">
			<div style={{ fontSize: 13, color: "var(--neutral-500)", marginBottom: 12 }}>
				Rename a category to update it everywhere at once. Renaming it to match another category merges the two.
				{allowClear && " Clear the name and save to remove a category entirely."}
			</div>
			{error && <div style={{ color: "crimson", fontSize: 13, marginBottom: 10 }}>{error}</div>}
			<div style={{ display: "grid", gap: 8, maxHeight: 360, overflowY: "auto" }}>
				{categories.map((category) => {
					const value = valueFor(category);
					const dirty = value.trim() !== category;
					return (
						<div key={category} style={{ display: "flex", gap: 8, alignItems: "center" }}>
							<input
								value={value}
								onChange={(e) => setEdits((prev) => ({ ...prev, [category]: e.target.value }))}
								style={inputStyle}
							/>
							<button
								type="button"
								onClick={() => handleSave(category, value)}
								disabled={!dirty || savingRow === category}
								style={dirty ? saveButtonStyle : saveButtonDisabledStyle}
							>
								{savingRow === category ? "Saving..." : "Save"}
							</button>
							{allowClear && (
								<button type="button" onClick={() => handleSave(category, "")} disabled={savingRow === category} title="Remove this category" style={deleteButtonStyle}>
									<TrashIcon size={14} color="crimson" />
								</button>
							)}
						</div>
					);
				})}
				{categories.length === 0 && <div style={{ fontSize: 13, color: "var(--neutral-500)" }}>No categories yet.</div>}
			</div>
		</Modal>
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
const saveButtonStyle: React.CSSProperties = {
	padding: "8px 14px",
	borderRadius: 8,
	border: "none",
	background: "var(--brand)",
	color: "#fff",
	fontSize: 13,
	fontWeight: 700,
	cursor: "pointer",
	whiteSpace: "nowrap",
};
const saveButtonDisabledStyle: React.CSSProperties = {
	...saveButtonStyle,
	background: "var(--neutral-100)",
	color: "var(--neutral-500)",
	cursor: "default",
};
const deleteButtonStyle: React.CSSProperties = {
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	width: 34,
	height: 34,
	borderRadius: 8,
	border: "1px solid var(--neutral-200)",
	background: "#fff",
	cursor: "pointer",
	flexShrink: 0,
};
