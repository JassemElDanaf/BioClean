import { useEffect, useState } from "react";
import DateRangeFilter, { isoDate, todayIso, type DateRangePreset } from "../../components/DateRangeFilter";
import { auditExportCsvUrl, getAuditReport, listItems, listWarehouses } from "./api";
import type { AuditFilters, AuditReportRow, Item, Warehouse } from "./types";

const REASON_LABELS: Record<string, string> = {
	initial_stock: "Initial stock",
	purchase_receipt: "Received shipment",
	correction: "Manual correction",
	damage: "Damaged / expired",
	pos_sale: "POS sale",
	pos_void: "POS sale voided",
	invoice: "Invoice",
	invoice_void: "Invoice voided",
	other: "Other",
	manual: "Manual adjustment",
};

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
	{ key: "all", label: "All Time", range: () => ({ from_date: undefined, to_date: undefined }) },
];

export default function AuditReport() {
	const [rows, setRows] = useState<AuditReportRow[]>([]);
	const [items, setItems] = useState<Item[]>([]);
	const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
	const [loading, setLoading] = useState(true);
	const [filters, setFilters] = useState<AuditFilters>(() => PRESETS[0].range());

	useEffect(() => {
		Promise.all([listItems(), listWarehouses()]).then(([itemsResult, warehousesData]) => {
			setItems(itemsResult.items);
			setWarehouses(warehousesData);
		});
	}, []);

	useEffect(() => {
		setLoading(true);
		getAuditReport(filters)
			.then(setRows)
			.finally(() => setLoading(false));
	}, [filters]);

	return (
		<div>
			<h2 style={{ marginTop: 0 }}>Inventory Audit Report</h2>

			<div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16, alignItems: "flex-end" }}>
				<DateRangeFilter
					presets={PRESETS}
					value={{ from_date: filters.from_date, to_date: filters.to_date }}
					onChange={(range) => setFilters((f) => ({ ...f, ...range }))}
				/>

				<Field label="Item">
					<select
						value={filters.item_id ?? ""}
						onChange={(e) => setFilters((f) => ({ ...f, item_id: e.target.value ? Number(e.target.value) : undefined }))}
						style={inputStyle}
					>
						<option value="">All items</option>
						{items.map((i) => (
							<option key={i.id} value={i.id}>
								{i.barcode} - {i.item_name}
							</option>
						))}
					</select>
				</Field>
				<Field label="Warehouse">
					<select
						value={filters.warehouse_id ?? ""}
						onChange={(e) => setFilters((f) => ({ ...f, warehouse_id: e.target.value ? Number(e.target.value) : undefined }))}
						style={inputStyle}
					>
						<option value="">All warehouses</option>
						{warehouses.map((w) => (
							<option key={w.id} value={w.id}>
								{w.name}
							</option>
						))}
					</select>
				</Field>
				<Field label="Event">
					<select
						value={filters.reason ?? ""}
						onChange={(e) => setFilters((f) => ({ ...f, reason: e.target.value || undefined }))}
						style={inputStyle}
					>
						<option value="">All events</option>
						{Object.entries(REASON_LABELS).map(([value, label]) => (
							<option key={value} value={value}>
								{label}
							</option>
						))}
					</select>
				</Field>

				<a href={auditExportCsvUrl(filters)} style={secondaryButtonStyle}>
					Export CSV
				</a>
			</div>

			{loading ? (
				<div>Loading...</div>
			) : (
				<div style={{ overflowX: "auto", maxWidth: "100%" }}>
					<table style={{ width: "100%", minWidth: 800, borderCollapse: "collapse", background: "#fff" }}>
						<thead>
							<tr style={{ textAlign: "left", borderBottom: "2px solid var(--neutral-200)" }}>
								<th style={thStyle}>Date</th>
								<th style={thStyle}>Item</th>
								<th style={thStyle}>Warehouse</th>
								<th style={thStyle}>Event</th>
								<th style={{ ...thStyle, textAlign: "right" }}>Before</th>
								<th style={{ ...thStyle, textAlign: "right" }}>Change</th>
								<th style={{ ...thStyle, textAlign: "right" }}>After</th>
								<th style={{ ...thStyle, textAlign: "right" }}>Unit Cost</th>
								<th style={thStyle}>User</th>
								<th style={thStyle}>Reference</th>
							</tr>
						</thead>
						<tbody>
							{rows.map((row) => (
								<tr key={row.id} style={{ borderBottom: "1px solid var(--neutral-100)" }}>
									<td style={tdStyle}>{new Date(row.created_at).toLocaleString()}</td>
									<td style={tdStyle}>
										{row.barcode} - {row.item_name}
									</td>
									<td style={tdStyle}>{row.warehouse_name}</td>
									<td style={tdStyle}>{REASON_LABELS[row.reason] ?? row.reason}</td>
									<td style={{ ...tdStyle, textAlign: "right" }}>{row.qty_before}</td>
									<td style={{ ...tdStyle, textAlign: "right", color: row.delta < 0 ? "crimson" : "var(--brand)", fontWeight: 600 }}>
										{row.delta > 0 ? "+" : ""}
										{row.delta}
									</td>
									<td style={{ ...tdStyle, textAlign: "right" }}>{row.qty_after}</td>
									<td style={{ ...tdStyle, textAlign: "right" }}>{row.unit_cost != null ? `$${row.unit_cost.toFixed(2)}` : "-"}</td>
									<td style={tdStyle}>{row.user}</td>
									<td style={tdStyle}>{row.reference ?? "-"}</td>
								</tr>
							))}
							{rows.length === 0 && (
								<tr>
									<td colSpan={10} style={{ ...tdStyle, textAlign: "center", color: "var(--neutral-500)", padding: 24 }}>
										No stock movements in this range.
									</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>
			)}
		</div>
	);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<label style={{ display: "grid", gap: 4, fontSize: 12, color: "var(--neutral-500)" }}>
			{label}
			{children}
		</label>
	);
}

const thStyle: React.CSSProperties = { padding: "8px 12px", fontSize: 13, color: "var(--neutral-500)" };
const tdStyle: React.CSSProperties = { padding: "8px 12px", fontSize: 14 };
const inputStyle: React.CSSProperties = {
	padding: "7px 10px",
	borderRadius: 8,
	border: "1px solid var(--neutral-200)",
	fontSize: 13,
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
	alignSelf: "flex-end",
};
