import { useEffect, useState } from "react";
import ActionsMenu from "../../components/ActionsMenu";
import DateRangeFilter, { isoDate, todayIso, type DateRangePreset } from "../../components/DateRangeFilter";
import SidebarToggleButton from "../../components/SidebarToggleButton";
import { viewPdf } from "../../lib/pdf";
import { purchaseOrderPdfUrl } from "./api";
import { expenseHistoryExportCsvUrl, listExpenseHistory, type ExpenseEntry, type ExpenseHistoryFilters } from "../reports/expenseApi";

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

export default function PurchaseHistoryTab() {
	const [entries, setEntries] = useState<ExpenseEntry[]>([]);
	const [total, setTotal] = useState(0);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [filters, setFilters] = useState<ExpenseHistoryFilters>(() => PRESETS[0].range());

	function reload() {
		setLoading(true);
		listExpenseHistory(filters)
			.then(({ entries, total }) => {
				setEntries(entries);
				setTotal(total);
				setError(null);
			})
			.catch((err) => setError(err instanceof Error ? err.message : "Failed to load purchase history"))
			.finally(() => setLoading(false));
	}

	useEffect(reload, [filters]);

	const truncated = total > entries.length;

	if (loading && entries.length === 0) return <div>Loading purchase history...</div>;
	if (error) return <div style={{ color: "crimson" }}>Couldn't load purchase history: {error}</div>;

	function sourceLabel(entry: ExpenseEntry): string {
		return entry.type === "purchase_order" ? "Purchase Order" : "Expense";
	}

	function formatEntryDate(entry: ExpenseEntry): string {
		// Expense.date is a plain calendar date the person picked (see
		// expenses/models.py), not a real moment in time - see the same
		// fix on Sales History's income rows for why this can't use
		// toLocaleString() the way purchase_order's real received_at can.
		if (entry.type === "expense") return new Date(entry.occurred_at).toLocaleDateString();
		return new Date(entry.occurred_at).toLocaleString();
	}

	function entryActions(entry: ExpenseEntry) {
		if (entry.type === "purchase_order") {
			return [{ label: "View PO PDF", onClick: () => viewPdf(purchaseOrderPdfUrl(entry.id)) }];
		}
		return [];
	}

	return (
		<div>
			{truncated && (
				<div style={{ background: "#fff8e1", color: "#8a6100", padding: "8px 12px", borderRadius: 8, fontSize: 13, marginBottom: 12 }}>
					Showing the first {entries.length.toLocaleString()} of {total.toLocaleString()} entries - narrow the date range to see the rest.
				</div>
			)}

			<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
				<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
					<SidebarToggleButton />
					<h2 style={{ margin: 0 }}>Purchase History ({total.toLocaleString()})</h2>
				</div>
				<div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
					<DateRangeFilter presets={PRESETS} value={filters} onChange={setFilters} />
					<a href={expenseHistoryExportCsvUrl(filters)} style={presetButtonStyle}>
						Export CSV
					</a>
				</div>
			</div>

			<div style={{ background: "#fff", border: "1px solid var(--neutral-200)", borderRadius: 12, overflowX: "auto", overflowY: "hidden", maxWidth: "100%" }}>
				<table style={{ width: "100%", minWidth: 700, borderCollapse: "collapse" }}>
					<thead>
						<tr style={{ textAlign: "left", borderBottom: "2px solid var(--neutral-200)" }}>
							<th style={thStyle}>Reference</th>
							<th style={thStyle}>Date</th>
							<th style={thStyle}>Source</th>
							<th style={{ ...thStyle, textAlign: "right" }}>Amount</th>
							<th style={thStyle}></th>
						</tr>
					</thead>
					<tbody>
						{entries.map((entry) => (
							<tr key={`${entry.type}-${entry.id}`} style={{ borderBottom: "1px solid var(--neutral-100)" }}>
								<td style={tdStyle}>
									{entry.reference}
									{entry.label && <div style={{ fontSize: 12, color: "var(--neutral-500)" }}>{entry.label}</div>}
								</td>
								<td style={tdStyle}>{formatEntryDate(entry)}</td>
								<td style={tdStyle}>{sourceLabel(entry)}</td>
								<td style={{ ...tdStyle, textAlign: "right", fontWeight: 700 }}>${entry.amount.toFixed(2)}</td>
								<td style={tdStyle}>
									<ActionsMenu actions={entryActions(entry)} />
								</td>
							</tr>
						))}
						{entries.length === 0 && (
							<tr>
								<td colSpan={5} style={{ ...tdStyle, textAlign: "center", color: "var(--neutral-500)", padding: 24 }}>
									No spending in this range.
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>
		</div>
	);
}

const thStyle: React.CSSProperties = { padding: "8px 12px", fontSize: 13, color: "var(--neutral-500)" };
const tdStyle: React.CSSProperties = { padding: "8px 12px", fontSize: 14 };
const presetButtonStyle: React.CSSProperties = {
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
