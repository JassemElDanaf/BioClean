import { useEffect, useState, type ComponentType } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import Sidebar, { type NavTab } from "./components/Sidebar";
import { UserIcon } from "./components/icons";
import {
	CustomersIcon,
	DashboardIcon,
	ExpensesIcon,
	IncomeIcon,
	InventoryIcon,
	InvoiceIcon,
	POSIcon,
	PurchasesIcon,
	QuoteIcon,
	ReceiptIcon,
	ReportsIcon,
	SettingsIcon,
} from "./components/icons";
import Dashboard from "./tabs/Dashboard";
import POS from "./tabs/POS";
import SalesHistory from "./tabs/SalesHistory";
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
const TABS: (NavTab & { component: ComponentType })[] = [
	{ path: "dashboard", label: "Dashboard", icon: DashboardIcon, component: Dashboard },
	{ path: "pos", label: "POS", icon: POSIcon, component: POS },
	{ path: "sales-history", label: "Sales History", icon: ReceiptIcon, component: SalesHistory },
	{ path: "invoicing", label: "Invoicing", icon: InvoiceIcon, component: Invoicing },
	{ path: "quotation", label: "Quotation", icon: QuoteIcon, component: Quotation },
	{ path: "inventory", label: "Inventory", icon: InventoryIcon, component: Inventory },
	{ path: "customers", label: "Customers", icon: CustomersIcon, component: Customers },
	{ path: "purchases", label: "Purchases", icon: PurchasesIcon, component: Purchases },
	{ path: "expenses", label: "Expenses", icon: ExpensesIcon, component: Expenses },
	{ path: "income", label: "Income", icon: IncomeIcon, component: Income },
	{ path: "reports", label: "Reports", icon: ReportsIcon, component: Reports },
	{ path: "settings", label: "Settings", icon: SettingsIcon, component: Settings },
];

function useClock() {
	const [now, setNow] = useState(new Date());
	useEffect(() => {
		const id = setInterval(() => setNow(new Date()), 1000 * 30);
		return () => clearInterval(id);
	}, []);
	return now;
}

function TopBar() {
	const location = useLocation();
	const now = useClock();
	const active = TABS.find((t) => location.pathname === `/${t.path}`);
	const dateStr = now.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
	const timeStr = now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

	return (
		<header
			style={{
				display: "flex",
				alignItems: "center",
				justifyContent: "space-between",
				padding: "16px 24px",
				background: "#fff",
				borderBottom: "1px solid var(--neutral-200)",
				flexShrink: 0,
			}}
		>
			<h1 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>{active?.label ?? "BioClean"}</h1>
			<div style={{ display: "flex", alignItems: "center", gap: 16 }}>
				<div style={{ fontSize: 13, color: "var(--neutral-500)", display: "flex", gap: 10 }}>
					<span>{dateStr}</span>
					<span style={{ fontWeight: 700, color: "var(--neutral-900)" }}>{timeStr}</span>
				</div>
				<div
					style={{
						width: 32,
						height: 32,
						borderRadius: "50%",
						background: "var(--brand-pale)",
						color: "var(--brand)",
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
					}}
				>
					<UserIcon size={16} />
				</div>
			</div>
		</header>
	);
}

export default function App() {
	return (
		<div style={{ display: "flex", height: "100vh" }}>
			<Sidebar tabs={TABS} />
			<div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
				<TopBar />
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
		</div>
	);
}
