import { useEffect, useState } from "react";
import ActionsMenu from "../../components/ActionsMenu";
import DateRangeFilter, { isoDate, todayIso, type DateRangePreset } from "../../components/DateRangeFilter";
import Modal from "../../components/Modal";
import { ApiError } from "../../lib/api";
import { createExpense, deleteExpense, expensesExportCsvUrl, listExpenses, updateExpense, type DateFilters, type Expense, type ExpenseFormValues } from "./api";

const EMPTY: ExpenseFormValues = { category: "", amount: 0, description: "", date: "", reference: "" };

const PRESETS: DateRangePreset[] = [
	{ key: "today", label: "Today", range: () => ({ from_date: todayIso(), to_date: todayIso() }) },
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

export default function ExpensesTab() {
	const [expenses, setExpenses] = useState<Expense[]>([]);
	const [total, setTotal] = useState(0);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [filters, setFilters] = useState<DateFilters>(() => PRESETS[0].range());
	const [formOpen, setFormOpen] = useState(false);
	const [editing, setEditing] = useState<Expense | null>(null);

	function reload() {
		setLoading(true);
		listExpenses(filters)
			.then(({ expenses, total }) => {
				setExpenses(expenses);
				setTotal(total);
				setError(null);
			})
			.catch((err) => setError(err instanceof Error ? err.message : "Failed to load expenses"))
			.finally(() => setLoading(false));
	}

	useEffect(reload, [filters]);

	async function handleSubmit(values: ExpenseFormValues) {
		if (editing) {
			await updateExpense(editing.id, values);
		} else {
			await createExpense(values);
		}
		reload();
	}

	async function handleDelete(expense: Expense) {
		if (!confirm(`Delete this expense (${expense.category}, $${expense.amount.toFixed(2)})?`)) return;
		try {
			await deleteExpense(expense.id);
			reload();
		} catch (err) {
			alert(err instanceof ApiError ? err.message : "Couldn't delete this expense.");
		}
	}

	const runningTotal = expenses.reduce((sum, e) => sum + e.amount, 0);

	if (loading) return <div>Loading expenses...</div>;
	if (error) return <div style={{ color: "crimson" }}>Couldn't load expenses: {error}</div>;

	return (
		<div>
			<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
				<h2 style={{ margin: 0 }}>Expenses ({total})</h2>
				<div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
					<DateRangeFilter presets={PRESETS} value={filters} onChange={setFilters} />
					<a href={expensesExportCsvUrl(filters)} style={secondaryButtonStyle}>
						Export CSV
					</a>
					<button
						onClick={() => {
							setEditing(null);
							setFormOpen(true);
						}}
						style={primaryButtonStyle}
					>
						+ Add Expense
					</button>
				</div>
			</div>

			<div style={{ background: "#fff", border: "1px solid var(--neutral-200)", borderRadius: 12, overflowX: "auto", overflowY: "hidden", maxWidth: "100%", marginBottom: 12 }}>
				<table style={{ width: "100%", minWidth: 600, borderCollapse: "collapse" }}>
					<thead>
						<tr style={{ textAlign: "left", borderBottom: "2px solid var(--neutral-200)" }}>
							<th style={thStyle}>Date</th>
							<th style={thStyle}>Category</th>
							<th style={thStyle}>Description</th>
							<th style={{ ...thStyle, textAlign: "right" }}>Amount</th>
							<th style={thStyle}></th>
						</tr>
					</thead>
					<tbody>
						{expenses.map((e) => (
							<tr key={e.id} style={{ borderBottom: "1px solid var(--neutral-100)" }}>
								<td style={tdStyle}>{new Date(e.date).toLocaleDateString()}</td>
								<td style={{ ...tdStyle, fontWeight: 600 }}>{e.category}</td>
								<td style={tdStyle}>{e.description ?? "-"}</td>
								<td style={{ ...tdStyle, textAlign: "right", fontWeight: 700, color: "crimson" }}>-${e.amount.toFixed(2)}</td>
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
						{expenses.length === 0 && (
							<tr>
								<td colSpan={5} style={{ ...tdStyle, textAlign: "center", color: "var(--neutral-500)", padding: 24 }}>
									No expenses in this range.
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>

			<div style={{ textAlign: "right", fontSize: 14, color: "var(--neutral-500)" }}>
				Total: <strong style={{ color: "var(--neutral-900)" }}>${runningTotal.toFixed(2)}</strong>
			</div>

			<ExpenseFormModal key={`${editing?.id ?? "new"}-${formOpen}`} open={formOpen} onClose={() => setFormOpen(false)} onSubmit={handleSubmit} editing={editing} />
		</div>
	);
}

function ExpenseFormModal({
	open,
	onClose,
	onSubmit,
	editing,
}: {
	open: boolean;
	onClose: () => void;
	onSubmit: (values: ExpenseFormValues) => Promise<void>;
	editing: Expense | null;
}) {
	const [values, setValues] = useState<ExpenseFormValues>(
		editing
			? { category: editing.category, amount: editing.amount, description: editing.description ?? "", date: editing.date.slice(0, 10), reference: editing.reference ?? "" }
			: { ...EMPTY, date: todayIso() }
	);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	function field<K extends keyof ExpenseFormValues>(key: K, value: ExpenseFormValues[K]) {
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
		<Modal open={open} onClose={onClose} title={editing ? "Edit Expense" : "Add Expense"}>
			<form onSubmit={handleSubmit} style={{ display: "grid", gap: 10 }}>
				<Field label="Category">
					<input value={values.category} onChange={(e) => field("category", e.target.value)} required autoFocus style={inputStyle} placeholder="Rent, Utilities, Salaries..." />
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
					{saving ? "Saving..." : editing ? "Save Changes" : "Add Expense"}
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
