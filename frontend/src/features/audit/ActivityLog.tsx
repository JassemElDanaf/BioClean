import { useEffect, useState } from "react";
import DateRangeFilter, { isoDate, todayIso, type DateRangePreset } from "../../components/DateRangeFilter";
import Select from "../../components/Select";
import { auditLogExportCsvUrl, getAuditLog, type AuditLogFilters, type AuditLogRow } from "./api";

// Every user account that can log in (see backend app/core/config.py's
// `users` dict) - hardcoded here the same way, since it's the same fixed
// 3-person roster and adding this as its own API call would be more code
// for something that changes as rarely as the roster itself.
const USERS = ["Admin", "Sandy", "Jad"];

const METHOD_LABELS: Record<string, string> = {
	POST: "Created",
	PUT: "Updated",
	PATCH: "Updated",
	DELETE: "Deleted",
};

// The raw request body is JSON ({"tax_rate": 0}) - rendered as
// "tax_rate: 0, ..." rather than the raw braces/quotes, so it reads like a
// sentence fragment next to the Action/Area columns instead of a code
// dump. Falls back to the raw text for anything that isn't a flat JSON
// object (arrays, non-JSON, or an empty body).
function formatBody(body: string | null): string {
	if (!body) return "-";
	try {
		const parsed = JSON.parse(body.endsWith("...") ? body.slice(0, -3) : body);
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
			return Object.entries(parsed)
				.map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
				.join(", ");
		}
	} catch {
		// Not parseable (e.g. truncated mid-token) - show it verbatim below.
	}
	return body;
}

// "/api/v1/purchases/8/receive" -> "Purchases" - just the module name, so
// every action across every domain (POS, Invoicing, Expenses, Items, ...)
// reads as one consistent trail with no per-route label to maintain.
function moduleLabel(path: string): string {
	const segment = path.split("/")[3];
	if (!segment) return path;
	return segment.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

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

export default function ActivityLog() {
	const [rows, setRows] = useState<AuditLogRow[]>([]);
	const [loading, setLoading] = useState(true);
	const [filters, setFilters] = useState<AuditLogFilters>(() => PRESETS[0].range());

	useEffect(() => {
		setLoading(true);
		getAuditLog(filters)
			.then(setRows)
			.finally(() => setLoading(false));
	}, [filters]);

	return (
		<div>
			<h2 style={{ marginTop: 0 }}>Activity Log</h2>
			<p style={{ marginTop: -8, marginBottom: 16, color: "var(--neutral-500)", fontSize: 13 }}>
				Every change made in the app - who did it, what they touched, and when.
			</p>

			<div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16, alignItems: "flex-end" }}>
				<DateRangeFilter
					presets={PRESETS}
					value={{ from_date: filters.from_date, to_date: filters.to_date }}
					onChange={(range) => setFilters((f) => ({ ...f, ...range }))}
				/>

				<Field label="User">
					<Select
						value={filters.user ?? ""}
						onChange={(v) => setFilters((f) => ({ ...f, user: v || undefined }))}
						placeholder="All users"
						options={USERS.map((u) => ({ value: u, label: u }))}
						style={{ minWidth: 140 }}
					/>
				</Field>
				<Field label="Action">
					<Select
						value={filters.method ?? ""}
						onChange={(v) => setFilters((f) => ({ ...f, method: v || undefined }))}
						placeholder="All actions"
						options={Object.entries(METHOD_LABELS).map(([value, label]) => ({ value, label }))}
						style={{ minWidth: 140 }}
					/>
				</Field>

				<a href={auditLogExportCsvUrl(filters)} style={secondaryButtonStyle}>
					Export CSV
				</a>
			</div>

			{loading && rows.length === 0 ? (
				<div>Loading...</div>
			) : (
				<div style={{ overflowX: "auto", maxWidth: "100%" }}>
					<table style={{ width: "100%", minWidth: 600, borderCollapse: "collapse", background: "#fff" }}>
						<thead>
							<tr style={{ textAlign: "left", borderBottom: "2px solid var(--neutral-200)" }}>
								<th style={thStyle}>Date</th>
								<th style={thStyle}>User</th>
								<th style={thStyle}>Action</th>
								<th style={thStyle}>Area</th>
								<th style={thStyle}>Result</th>
								<th style={thStyle}>Details</th>
							</tr>
						</thead>
						<tbody>
							{rows.map((row) => (
								<tr key={row.id} style={{ borderBottom: "1px solid var(--neutral-100)" }}>
									<td style={tdStyle}>{new Date(row.created_at).toLocaleString()}</td>
									<td style={tdStyle}>{row.user}</td>
									<td style={tdStyle}>{METHOD_LABELS[row.method] ?? row.method}</td>
									<td style={tdStyle}>{moduleLabel(row.path)}</td>
									<td style={{ ...tdStyle, color: row.status_code < 400 ? "var(--brand)" : "crimson", fontWeight: 600 }}>
										{row.status_code < 400 ? "Success" : `Failed (${row.status_code})`}
									</td>
									<td
										style={{ ...tdStyle, maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--neutral-500)" }}
										title={formatBody(row.body)}
									>
										{formatBody(row.body)}
									</td>
								</tr>
							))}
							{rows.length === 0 && (
								<tr>
									<td colSpan={6} style={{ ...tdStyle, textAlign: "center", color: "var(--neutral-500)", padding: 24 }}>
										No activity in this range.
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
