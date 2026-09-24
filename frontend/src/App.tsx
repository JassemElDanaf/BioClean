import type { ComponentType } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Sidebar, { type NavTab } from "./components/Sidebar";
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
];

// Not in TABS/the main sidebar list on purpose - reached through the
// flyout menu on the Admin block at the bottom of the sidebar instead
// (see Sidebar.tsx). Still a real route here, so /settings itself, direct
// links, and refreshes all still work.
const SETTINGS_TAB: NavTab & { component: ComponentType } = { path: "settings", label: "Settings", icon: SettingsIcon, component: Settings };
const ALL_TABS = [...TABS, SETTINGS_TAB];

export default function App() {
	return (
		<div style={{ display: "flex", height: "100vh" }}>
			<Sidebar tabs={TABS} settingsTab={SETTINGS_TAB} />
			<div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
				<main style={{ flex: 1, padding: 24, overflowY: "auto", overflowX: "hidden", minWidth: 0 }}>
					<Routes>
						<Route path="/" element={<Navigate to="/dashboard" replace />} />
						{ALL_TABS.map((tab) => (
							<Route key={tab.path} path={`/${tab.path}`} element={<tab.component />} />
						))}
						<Route path="*" element={<Navigate to="/dashboard" replace />} />
					</Routes>
				</main>
			</div>
		</div>
	);
}
