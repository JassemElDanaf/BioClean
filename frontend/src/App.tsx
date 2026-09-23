import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import Dashboard from "./tabs/Dashboard";
import POS from "./tabs/POS";
import Invoicing from "./tabs/Invoicing";
import Quotation from "./tabs/Quotation";
import Inventory from "./tabs/Inventory";
import Customers from "./tabs/Customers";
import Purchases from "./tabs/Purchases";
import Expenses from "./tabs/Expenses";
import Income from "./tabs/Income";
import Reports from "./tabs/Reports";
import Settings from "./tabs/Settings";

// Each tab is a real route (/inventory, /pos, ...) rather than just local
// component-swap state - addressable, bookmarkable, and survives a
// refresh, which matters as more tabs/sub-pages get added later.
const TABS = [
	{ path: "dashboard", label: "Dashboard", component: Dashboard },
	{ path: "pos", label: "POS", component: POS },
	{ path: "invoicing", label: "Invoicing", component: Invoicing },
	{ path: "quotation", label: "Quotation", component: Quotation },
	{ path: "inventory", label: "Inventory", component: Inventory },
	{ path: "customers", label: "Customers", component: Customers },
	{ path: "purchases", label: "Purchases", component: Purchases },
	{ path: "expenses", label: "Expenses", component: Expenses },
	{ path: "income", label: "Income", component: Income },
	{ path: "reports", label: "Reports", component: Reports },
	{ path: "settings", label: "Settings", component: Settings },
];

export default function App() {
	return (
		<div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
			<header
				style={{
					display: "flex",
					alignItems: "center",
					gap: 4,
					padding: "0 16px",
					background: "#fff",
					borderBottom: "1px solid var(--neutral-200)",
					overflowX: "auto",
					whiteSpace: "nowrap",
				}}
			>
				<span style={{ fontWeight: 700, color: "var(--brand)", marginRight: 24, flexShrink: 0 }}>BioClean</span>
				{TABS.map((tab) => (
					<NavLink
						key={tab.path}
						to={`/${tab.path}`}
						style={({ isActive }) => ({
							flexShrink: 0,
							padding: "14px 16px",
							textDecoration: "none",
							fontSize: 14,
							fontWeight: 600,
							color: isActive ? "var(--brand)" : "var(--neutral-500)",
							borderBottom: isActive ? "2px solid var(--brand)" : "2px solid transparent",
						})}
					>
						{tab.label}
					</NavLink>
				))}
			</header>
			<main style={{ flex: 1, padding: 24, overflowY: "auto", overflowX: "hidden", minWidth: 0 }}>
				<Routes>
					<Route path="/" element={<Navigate to="/dashboard" replace />} />
					{TABS.map((tab) => (
						<Route key={tab.path} path={`/${tab.path}`} element={<tab.component />} />
					))}
					<Route path="*" element={<Navigate to="/dashboard" replace />} />
				</Routes>
			</main>
		</div>
	);
}
