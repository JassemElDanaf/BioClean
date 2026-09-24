import { useEffect, useState } from "react";
import Modal from "../../components/Modal";
import { ApiError } from "../../lib/api";
import { createSupplier, deleteSupplier, updateSupplier } from "./api";
import type { Supplier, SupplierFormValues } from "./types";

const EMPTY: SupplierFormValues = { name: "", phone: "", email: "" };

export default function SuppliersModal({
	open,
	onClose,
	suppliers,
	onChanged,
}: {
	open: boolean;
	onClose: () => void;
	suppliers: Supplier[];
	onChanged: () => void;
}) {
	const [editing, setEditing] = useState<Supplier | null>(null);
	const [values, setValues] = useState<SupplierFormValues>(EMPTY);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Reset the small inline form whenever the modal is (re)opened or the
	// set of suppliers changes underneath it (e.g. after a delete).
	useEffect(() => {
		if (!open) {
			setEditing(null);
			setValues(EMPTY);
			setError(null);
		}
	}, [open]);

	function startEdit(supplier: Supplier) {
		setEditing(supplier);
		setValues({ name: supplier.name, phone: supplier.phone ?? "", email: supplier.email ?? "" });
		setError(null);
	}

	function startNew() {
		setEditing(null);
		setValues(EMPTY);
		setError(null);
	}

	function toPayload(v: SupplierFormValues): SupplierFormValues {
		return { name: v.name.trim(), phone: v.phone.trim(), email: v.email.trim() };
	}

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setSaving(true);
		setError(null);
		try {
			if (editing) {
				await updateSupplier(editing.id, toPayload(values));
			} else {
				await createSupplier(toPayload(values));
			}
			startNew();
			onChanged();
		} catch (err) {
			setError(err instanceof ApiError ? err.message : "Couldn't save this supplier.");
		} finally {
			setSaving(false);
		}
	}

	async function handleDelete(supplier: Supplier) {
		if (!confirm(`Delete supplier "${supplier.name}"?`)) return;
		try {
			await deleteSupplier(supplier.id);
			if (editing?.id === supplier.id) startNew();
			onChanged();
		} catch (err) {
			alert(err instanceof ApiError ? err.message : "Couldn't delete this supplier.");
		}
	}

	return (
		<Modal open={open} onClose={onClose} title="Suppliers">
			<div style={{ display: "grid", gap: 6, marginBottom: 16, maxHeight: 220, overflowY: "auto" }}>
				{suppliers.length === 0 && <div style={{ fontSize: 13, color: "var(--neutral-500)" }}>No suppliers yet.</div>}
				{suppliers.map((s) => (
					<div key={s.id} style={rowStyle}>
						<div>
							<div style={{ fontSize: 14, fontWeight: 600 }}>{s.name}</div>
							<div style={{ fontSize: 12, color: "var(--neutral-500)" }}>{[s.phone, s.email].filter(Boolean).join(" · ") || "—"}</div>
						</div>
						<div style={{ display: "flex", gap: 6 }}>
							<button type="button" onClick={() => startEdit(s)} style={smallButtonStyle}>
								Edit
							</button>
							<button type="button" onClick={() => handleDelete(s)} style={{ ...smallButtonStyle, color: "crimson" }}>
								Delete
							</button>
						</div>
					</div>
				))}
			</div>

			<form onSubmit={handleSubmit} style={{ display: "grid", gap: 10, borderTop: "1px solid var(--neutral-200)", paddingTop: 16 }}>
				<div style={{ fontSize: 13, fontWeight: 600 }}>{editing ? `Editing "${editing.name}"` : "Add supplier"}</div>
				<Field label="Name">
					<input value={values.name} onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))} required autoFocus style={inputStyle} />
				</Field>
				<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
					<Field label="Phone">
						<input value={values.phone} onChange={(e) => setValues((v) => ({ ...v, phone: e.target.value }))} style={inputStyle} />
					</Field>
					<Field label="Email">
						<input type="email" value={values.email} onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))} style={inputStyle} />
					</Field>
				</div>

				{error && <div style={{ color: "crimson", fontSize: 13 }}>{error}</div>}

				<div style={{ display: "flex", gap: 8 }}>
					<button type="submit" disabled={saving} style={submitButtonStyle}>
						{saving ? "Saving..." : editing ? "Save Changes" : "Add Supplier"}
					</button>
					{editing && (
						<button type="button" onClick={startNew} style={smallButtonStyle}>
							Cancel
						</button>
					)}
				</div>
			</form>
		</Modal>
	);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<label style={{ display: "grid", gap: 4, fontSize: 13, color: "var(--neutral-500)" }}>
			{label}
			{children}
		</label>
	);
}

const rowStyle: React.CSSProperties = {
	display: "flex",
	justifyContent: "space-between",
	alignItems: "center",
	padding: "6px 8px",
	borderRadius: 8,
	background: "var(--neutral-100)",
};
const inputStyle: React.CSSProperties = {
	width: "100%",
	minWidth: 0,
	padding: "8px 10px",
	borderRadius: 8,
	border: "1px solid var(--neutral-200)",
	fontSize: 14,
	boxSizing: "border-box",
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
const submitButtonStyle: React.CSSProperties = {
	padding: "10px 16px",
	borderRadius: 8,
	border: "none",
	background: "var(--brand)",
	color: "#fff",
	fontWeight: 600,
	cursor: "pointer",
};
