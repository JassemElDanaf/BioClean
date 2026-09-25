import { useState } from "react";
import Modal from "../../components/Modal";
import type { Customer, CustomerFormValues } from "./types";

const EMPTY: CustomerFormValues = { name: "", phone: "", email: "", address: "", is_wholesale: false };

export default function CustomerFormModal({
	open,
	onClose,
	onSubmit,
	editing,
}: {
	open: boolean;
	onClose: () => void;
	onSubmit: (values: CustomerFormValues) => Promise<void>;
	editing: Customer | null;
}) {
	const [values, setValues] = useState<CustomerFormValues>(editing ? toFormValues(editing) : EMPTY);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	function field<K extends keyof CustomerFormValues>(key: K, value: CustomerFormValues[K]) {
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
		<Modal open={open} onClose={onClose} title={editing ? "Edit Customer" : "Add Customer"}>
			<form onSubmit={handleSubmit} style={{ display: "grid", gap: 10 }}>
				<Field label="Name">
					<input value={values.name} onChange={(e) => field("name", e.target.value)} required autoFocus style={inputStyle} />
				</Field>
				<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
					<Field label="Phone">
						<input value={values.phone} onChange={(e) => field("phone", e.target.value)} style={inputStyle} />
					</Field>
					<Field label="Email">
						<input type="email" value={values.email} onChange={(e) => field("email", e.target.value)} style={inputStyle} />
					</Field>
				</div>
				<Field label="Address">
					<input value={values.address} onChange={(e) => field("address", e.target.value)} style={inputStyle} />
				</Field>
				<Field label="Customer Type">
					<div style={{ display: "flex", gap: 16, marginTop: 2 }}>
						<label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--neutral-900)", fontWeight: 400 }}>
							<input type="radio" name="customer-type" checked={!values.is_wholesale} onChange={() => field("is_wholesale", false)} />
							Retail Customer
						</label>
						<label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--neutral-900)", fontWeight: 400 }}>
							<input type="radio" name="customer-type" checked={values.is_wholesale} onChange={() => field("is_wholesale", true)} />
							Wholesale Customer
						</label>
					</div>
				</Field>

				{error && <div style={{ color: "crimson", fontSize: 13 }}>{error}</div>}

				<button type="submit" disabled={saving} style={submitButtonStyle}>
					{saving ? "Saving..." : editing ? "Save Changes" : "Add Customer"}
				</button>
			</form>
		</Modal>
	);
}

function toFormValues(customer: Customer): CustomerFormValues {
	return {
		name: customer.name,
		phone: customer.phone ?? "",
		email: customer.email ?? "",
		address: customer.address ?? "",
		is_wholesale: customer.is_wholesale,
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
	fontWeight: 700,
	cursor: "pointer",
};
