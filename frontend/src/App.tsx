import type { ComponentType } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Sidebar, { type NavItem, type NavTab } from "./components/Sidebar";
import { SidebarProvider } from "./components/SidebarContext";
import {
	CustomersIcon,
	DashboardIcon,
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
//
// Grouped into ~7-8 top-level sidebar slots rather than one per module
// (confirmed nav restructure) - Quotation/Invoicing/Sales History collapse
// under one expandable "Sales" entry (see Sidebar.tsx's NavGroup), since
// they're all "documents about a sale" from the cashier's point of view.
// Every route below still exists and still works standalone (a bookmark
// to /expenses or /income, say) even though only Sales' own children and
// the top-level items appear in the sidebar itself.
const SALES_GROUP: NavItem = {
	group: true,
	label: "Sales",
	icon: ReceiptIcon,
	children: [
		{ path: "quotation", label: "Quotations", icon: QuoteIcon },
		{ path: "invoicing", label: "Invoicing", icon: InvoiceIcon },
		{ path: "sales-history", label: "Sales History", icon: ReceiptIcon },
	],
};

// Purchasing collapses under "Inventory" the same way Sales' own documents
// do above - buying stock is part of managing stock from the cashier's
// point of view, not a separate concern.
const INVENTORY_GROUP: NavItem = {
	group: true,
	label: "Inventory",
	icon: InventoryIcon,
	children: [
		{ path: "inventory", label: "Items", icon: InventoryIcon },
		{ path: "purchases", label: "Purchasing", icon: PurchasesIcon },
	],
};

const TABS: NavItem[] = [
	{ path: "dashboard", label: "Dashboard", icon: DashboardIcon },
	{ path: "pos", label: "POS", icon: POSIcon },
	SALES_GROUP,
	INVENTORY_GROUP,
	{ path: "customers", label: "Customers", icon: CustomersIcon },
	// Expenses/Income moved off the sidebar entirely - both live inside
	// Reports now, under its own "Finance" section (see
	// features/reports/registry.tsx), reachable without a dedicated
	// top-level slot. Their routes stay registered below so a direct link
	// still works, same treatment Settings already got.
];

// Every real route, including the ones not shown in the sidebar directly
// (Settings via the Admin flyout, Expenses/Income via Reports' Finance
// section) - so a direct link/refresh to any of them still resolves.
const ROUTABLE_TABS: (NavTab & { component: ComponentType })[] = [
	{ path: "dashboard", label: "Dashboard", icon: DashboardIcon, component: Dashboard },
	{ path: "pos", label: "POS", icon: POSIcon, component: POS },
	{ path: "quotation", label: "Quotation", icon: QuoteIcon, component: Quotation },
	{ path: "invoicing", label: "Invoicing", icon: InvoiceIcon, component: Invoicing },
	{ path: "sales-history", label: "Sales History", icon: ReceiptIcon, component: SalesHistory },
	{ path: "purchases", label: "Purchasing", icon: PurchasesIcon, component: Purchases },
	{ path: "inventory", label: "Inventory", icon: InventoryIcon, component: Inventory },
	{ path: "customers", label: "Customers", icon: CustomersIcon, component: Customers },
	{ path: "reports", label: "Reports", icon: ReportsIcon, component: Reports },
	{ path: "expenses", label: "Expenses", icon: ReportsIcon, component: Expenses },
	{ path: "income", label: "Income", icon: ReportsIcon, component: Income },
];

// Not in TABS/the main sidebar list on purpose - reached through the
// flyout menu on the Admin block at the bottom of the sidebar instead
// (see Sidebar.tsx). Still a real route here, so /reports and /settings
// direct links and refreshes all still work.
const REPORTS_TAB: NavTab = { path: "reports", label: "Reports", icon: ReportsIcon };
const SETTINGS_TAB: NavTab & { component: ComponentType } = { path: "settings", label: "Settings", icon: SettingsIcon, component: Settings };
const ALL_TABS = [...ROUTABLE_TABS, SETTINGS_TAB];

export default function App() {
	return (
		<SidebarProvider>
			<div style={{ display: "flex", height: "100vh" }}>
				<Sidebar tabs={TABS} flyoutTabs={[REPORTS_TAB, SETTINGS_TAB]} />
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
		</SidebarProvider>
	);
}
