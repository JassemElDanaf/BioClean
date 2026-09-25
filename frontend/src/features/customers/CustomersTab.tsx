import { useEffect, useMemo, useState } from "react";
import ActionsMenu from "../../components/ActionsMenu";
import { SearchIcon } from "../../components/icons";
import SidebarToggleButton from "../../components/SidebarToggleButton";
import { ApiError } from "../../lib/api";
import { createCustomer, customersExportCsvUrl, deleteCustomer, listCustomers, updateCustomer } from "./api";
import CustomerFormModal from "./CustomerFormModal";
import type { Customer, CustomerFormValues } from "./types";

export default function CustomersTab() {
	const [customers, setCustomers] = useState<Customer[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [search, setSearch] = useState("");
	const [formOpen, setFormOpen] = useState(false);
	const [editing, setEditing] = useState<Customer | null>(null);

	function reload() {
		setLoading(true);
		listCustomers()
			.then(setCustomers)
			.catch((err) => setError(err instanceof Error ? err.message : "Failed to load customers"))
			.finally(() => setLoading(false));
	}

	useEffect(reload, []);

	async function handleSubmit(values: CustomerFormValues) {
		if (editing) {
			await updateCustomer(editing.id, values);
		} else {
			await createCustomer(values);
		}
		reload();
	}

	async function handleDelete(customer: Customer) {
		try {
			await deleteCustomer(customer.id);
			reload();
		} catch (err) {
			alert(err instanceof ApiError ? err.message : "Couldn't delete this customer.");
		}
	}

	const visible = useMemo(() => {
		const q = search.trim().toLowerCase();
		if (!q) return customers;
		return customers.filter((c) => [c.name, c.phone, c.email].some((v) => v?.toLowerCase().includes(q)));
	}, [customers, search]);

	if (loading && customers.length === 0) return <div>Loading customers...</div>;
	if (error) return <div style={{ color: "crimson" }}>Couldn't load customers: {error}</div>;

	return (
		<div>
			<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
				<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
					<SidebarToggleButton />
					<h2 style={{ margin: 0 }}>Customers ({visible.length})</h2>
				</div>
				<div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
					<div style={{ position: "relative", flex: "1 1 180px" }}>
						<span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--neutral-500)", pointerEvents: "none" }}>
							<SearchIcon size={15} />
						</span>
						<input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, phone, email..." style={searchInputStyle} />
					</div>
					<a href={customersExportCsvUrl()} style={secondaryButtonStyle}>
						Export CSV
					</a>
					<button
						onClick={() => {
							setEditing(null);
							setFormOpen(true);
						}}
						style={primaryButtonStyle}
					>
						+ Add Customer
					</button>
				</div>
			</div>

			<div style={{ background: "#fff", border: "1px solid var(--neutral-200)", borderRadius: 12, overflowX: "auto", overflowY: "hidden", maxWidth: "100%" }}>
				<table style={{ width: "100%", minWidth: 600, borderCollapse: "collapse" }}>
					<thead>
						<tr style={{ textAlign: "left", borderBottom: "2px solid var(--neutral-200)" }}>
							<th style={thStyle}>Name</th>
							<th style={thStyle}>Phone</th>
							<th style={thStyle}>Email</th>
							<th style={thStyle}>Pricing</th>
							<th style={{ ...thStyle, textAlign: "right" }}>Balance (AR)</th>
							<th style={thStyle}></th>
						</tr>
					</thead>
					<tbody>
						{visible.map((c) => (
							<tr key={c.id} style={{ borderBottom: "1px solid var(--neutral-100)" }}>
								<td style={{ ...tdStyle, fontWeight: 600 }}>{c.name}</td>
								<td style={tdStyle}>{c.phone ?? "-"}</td>
								<td style={tdStyle}>{c.email ?? "-"}</td>
								<td style={tdStyle}>
									{c.is_wholesale ? (
										<span style={pillStyle("var(--brand-pale)", "var(--brand)")}>Wholesale</span>
									) : (
										<span style={pillStyle("var(--neutral-100)", "var(--neutral-500)")}>Retail</span>
									)}
								</td>
								<td style={{ ...tdStyle, textAlign: "right", fontWeight: c.balance > 0 ? 700 : 400, color: c.balance > 0 ? "#b45f06" : "var(--neutral-500)" }}>
									{c.balance > 0 ? `$${c.balance.toFixed(2)}` : "-"}
								</td>
								<td style={tdStyle}>
									<ActionsMenu
										actions={[
											{
												label: "Edit",
												onClick: () => {
													setEditing(c);
													setFormOpen(true);
												},
											},
											{ label: "Delete", onClick: () => handleDelete(c), danger: true },
										]}
									/>
								</td>
							</tr>
						))}
						{visible.length === 0 && (
							<tr>
								<td colSpan={6} style={{ ...tdStyle, textAlign: "center", color: "var(--neutral-500)", padding: 24 }}>
									{search ? `No customers match "${search}".` : "No customers yet."}
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>

			<CustomerFormModal key={`${editing?.id ?? "new"}-${formOpen}`} open={formOpen} onClose={() => setFormOpen(false)} onSubmit={handleSubmit} editing={editing} />
		</div>
	);
}

function pillStyle(bg: string, fg: string): React.CSSProperties {
	return { fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 999, background: bg, color: fg };
}

const thStyle: React.CSSProperties = { padding: "8px 12px", fontSize: 13, color: "var(--neutral-500)" };
const tdStyle: React.CSSProperties = { padding: "8px 12px", fontSize: 14 };
const searchInputStyle: React.CSSProperties = {
	padding: "8px 12px 8px 32px",
	borderRadius: 8,
	border: "1px solid var(--neutral-200)",
	fontSize: 13,
	width: "100%",
	maxWidth: 240,
	boxSizing: "border-box",
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
