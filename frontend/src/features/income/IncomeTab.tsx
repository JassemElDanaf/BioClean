import { useEffect, useState } from "react";
import ActionsMenu from "../../components/ActionsMenu";
import Modal from "../../components/Modal";
import { ApiError } from "../../lib/api";
import { createIncome, deleteIncome, incomeExportCsvUrl, listIncome, updateIncome, type DateFilters, type Income, type IncomeFormValues } from "./api";

const EMPTY: IncomeFormValues = { source: "", amount: 0, description: "", date: "", reference: "" };

function todayIso(): string {
	return new Date().toISOString().slice(0, 10);
}

export default function IncomeTab() {
	const [income, setIncome] = useState<Income[]>([]);
	const [total, setTotal] = useState(0);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [filters, setFilters] = useState<DateFilters>({});
	const [formOpen, setFormOpen] = useState(false);
	const [editing, setEditing] = useState<Income | null>(null);

	function reload() {
		setLoading(true);
		listIncome(filters)
			.then(({ income, total }) => {
				setIncome(income);
				setTotal(total);
				setError(null);
			})
			.catch((err) => setError(err instanceof Error ? err.message : "Failed to load income"))
			.finally(() => setLoading(false));
	}

	useEffect(reload, [filters]);

	function setPreset(preset: "month" | "all") {
		if (preset === "all") {
			setFilters({});
			return;
		}
		const from = new Date();
		from.setMonth(from.getMonth() - 1);
		setFilters({ from_date: from.toISOString().slice(0, 10), to_date: todayIso() });
	}

	async function handleSubmit(values: IncomeFormValues) {
		if (editing) {
			await updateIncome(editing.id, values);
		} else {
			await createIncome(values);
		}
		reload();
	}

	async function handleDelete(entry: Income) {
		if (!confirm(`Delete this income entry (${entry.source}, $${entry.amount.toFixed(2)})?`)) return;
		try {
			await deleteIncome(entry.id);
			reload();
		} catch (err) {
			alert(err instanceof ApiError ? err.message : "Couldn't delete this entry.");
		}
	}

	const runningTotal = income.reduce((sum, e) => sum + e.amount, 0);

	if (loading) return <div>Loading income...</div>;
	if (error) return <div style={{ color: "crimson" }}>Couldn't load income: {error}</div>;

	return (
		<div>
			<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
				<h2 style={{ margin: 0 }}>Income ({total})</h2>
				<div style={{ display: "flex", gap: 8, alignItems: "center" }}>
					<button onClick={() => setPreset("month")} style={secondaryButtonStyle}>
						This Month
					</button>
					<button onClick={() => setPreset("all")} style={secondaryButtonStyle}>
						All Time
					</button>
					<a href={incomeExportCsvUrl(filters)} style={secondaryButtonStyle}>
						Export CSV
					</a>
					<button
						onClick={() => {
							setEditing(null);
							setFormOpen(true);
						}}
						style={primaryButtonStyle}
					>
						+ Add Income
					</button>
				</div>
			</div>

			<div style={{ background: "#fff", border: "1px solid var(--neutral-200)", borderRadius: 12, overflowX: "auto", overflowY: "hidden", maxWidth: "100%", marginBottom: 12 }}>
				<table style={{ width: "100%", minWidth: 600, borderCollapse: "collapse" }}>
					<thead>
						<tr style={{ textAlign: "left", borderBottom: "2px solid var(--neutral-200)" }}>
							<th style={thStyle}>Date</th>
							<th style={thStyle}>Source</th>
							<th style={thStyle}>Description</th>
							<th style={{ ...thStyle, textAlign: "right" }}>Amount</th>
							<th style={thStyle}></th>
						</tr>
					</thead>
					<tbody>
						{income.map((e) => (
							<tr key={e.id} style={{ borderBottom: "1px solid var(--neutral-100)" }}>
								<td style={tdStyle}>{new Date(e.date).toLocaleDateString()}</td>
								<td style={{ ...tdStyle, fontWeight: 600 }}>{e.source}</td>
								<td style={tdStyle}>{e.description ?? "-"}</td>
								<td style={{ ...tdStyle, textAlign: "right", fontWeight: 700, color: "var(--brand)" }}>+${e.amount.toFixed(2)}</td>
								<td style={tdStyle}>
									<ActionsMenu
										actions={[
											{
												label: "Edit",
												onClick: () => {
													setEditing(e);
													setFormOpen(true);
												},
											},
											{ label: "Delete", onClick: () => handleDelete(e), danger: true },
										]}
									/>
								</td>
							</tr>
						))}
						{income.length === 0 && (
							<tr>
								<td colSpan={5} style={{ ...tdStyle, textAlign: "center", color: "var(--neutral-500)", padding: 24 }}>
									No income entries in this range.
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>

			<div style={{ textAlign: "right", fontSize: 14, color: "var(--neutral-500)" }}>
				Total: <strong style={{ color: "var(--brand)" }}>${runningTotal.toFixed(2)}</strong>
			</div>

			<IncomeFormModal key={`${editing?.id ?? "new"}-${formOpen}`} open={formOpen} onClose={() => setFormOpen(false)} onSubmit={handleSubmit} editing={editing} />
		</div>
	);
}

function IncomeFormModal({
	open,
	onClose,
	onSubmit,
	editing,
}: {
	open: boolean;
	onClose: () => void;
	onSubmit: (values: IncomeFormValues) => Promise<void>;
	editing: Income | null;
}) {
	const [values, setValues] = useState<IncomeFormValues>(
		editing
			? { source: editing.source, amount: editing.amount, description: editing.description ?? "", date: editing.date.slice(0, 10), reference: editing.reference ?? "" }
			: { ...EMPTY, date: todayIso() }
	);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	function field<K extends keyof IncomeFormValues>(key: K, value: IncomeFormValues[K]) {
		setValues((v) => ({ ...v, [key]: value }));
	}

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setSaving(true);
		setError(null);
		try {
			await onSubmit(values);
			onClose();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Something went wrong");
		} finally {
			setSaving(false);
		}
	}

	return (
		<Modal open={open} onClose={onClose} title={editing ? "Edit Income" : "Add Income"}>
			<form onSubmit={handleSubmit} style={{ display: "grid", gap: 10 }}>
				<Field label="Source">
					<input value={values.source} onChange={(e) => field("source", e.target.value)} required autoFocus style={inputStyle} placeholder="Bank Interest, Refund..." />
				</Field>
				<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
					<Field label="Amount">
						<input type="number" step="0.01" min={0.01} value={values.amount || ""} onChange={(e) => field("amount", Number(e.target.value))} required style={inputStyle} />
					</Field>
					<Field label="Date">
						<input type="date" value={values.date} onChange={(e) => field("date", e.target.value)} style={inputStyle} />
					</Field>
				</div>
				<Field label="Description (optional)">
					<input value={values.description} onChange={(e) => field("description", e.target.value)} style={inputStyle} />
				</Field>
				<Field label="Reference (optional)">
					<input value={values.reference} onChange={(e) => field("reference", e.target.value)} style={inputStyle} />
				</Field>

				{error && <div style={{ color: "crimson", fontSize: 13 }}>{error}</div>}

				<button type="submit" disabled={saving} style={submitButtonStyle}>
					{saving ? "Saving..." : editing ? "Save Changes" : "Add Income"}
				</button>
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

const thStyle: React.CSSProperties = { padding: "8px 12px", fontSize: 13, color: "var(--neutral-500)" };
const tdStyle: React.CSSProperties = { padding: "8px 12px", fontSize: 14 };
const inputStyle: React.CSSProperties = {
	width: "100%",
	minWidth: 0,
	padding: "8px 10px",
	borderRadius: 8,
	border: "1px solid var(--neutral-200)",
	fontSize: 14,
	boxSizing: "border-box",
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
	cursor: "pointer",
};
const primaryButtonStyle: React.CSSProperties = {
	padding: "8px 14px",
	borderRadius: 8,
	border: "none",
	background: "var(--brand)",
	color: "#fff",
	fontSize: 13,
	fontWeight: 700,
	cursor: "pointer",
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
