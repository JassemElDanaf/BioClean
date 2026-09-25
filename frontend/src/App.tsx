import type { ComponentType } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Sidebar, { type NavItem, type NavTab } from "./components/Sidebar";
import { SidebarProvider } from "./components/SidebarContext";
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
	WalletIcon,
} from "./components/icons";
import Dashboard from "./tabs/Dashboard";
import POS from "./tabs/POS";
import SalesHistory from "./tabs/SalesHistory";
import Invoicing from "./tabs/Invoicing";
import Quotation from "./tabs/Quotation";
import Inventory from "./tabs/Inventory";
import Customers from "./tabs/Customers";
import Purchases from "./tabs/Purchases";
import PurchaseHistory from "./tabs/PurchaseHistory";
import Expenses from "./tabs/Expenses";
import Income from "./tabs/Income";
import FinancialSummary from "./tabs/FinancialSummary";
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
// point of view, not a separate concern. Purchase History mirrors Sales
// History but for money going out on this side - every received PO plus
// every manual Expense entry (gas, whatever), not purchase orders alone.
const INVENTORY_GROUP: NavItem = {
	group: true,
	label: "Inventory",
	icon: InventoryIcon,
	children: [
		{ path: "inventory", label: "Items", icon: InventoryIcon },
		{ path: "purchases", label: "Purchasing", icon: PurchasesIcon },
		{ path: "purchase-history", label: "Purchase History", icon: ReceiptIcon },
	],
};

// Income, Expenses, and the Financial Summary figure all live under one
// "Finance" group rather than scattered across Sales/Inventory/Reports -
// they're the money-tracking side of the business, reached constantly
// enough to earn their own top-level slot instead of hiding behind the
// Admin flyout's Reports page (which now only holds occasional
// inventory-side reports - Stock Valuation, Inventory Audit).
const FINANCE_GROUP: NavItem = {
	group: true,
	label: "Finance",
	icon: WalletIcon,
	children: [
		{ path: "income", label: "Income", icon: IncomeIcon },
		{ path: "expenses", label: "Expenses", icon: ExpensesIcon },
		{ path: "financial-summary", label: "Financial Summary", icon: WalletIcon },
	],
};

const TABS: NavItem[] = [
	{ path: "dashboard", label: "Dashboard", icon: DashboardIcon },
	{ path: "pos", label: "POS", icon: POSIcon },
	{ path: "customers", label: "Customers", icon: CustomersIcon },
	SALES_GROUP,
	INVENTORY_GROUP,
	FINANCE_GROUP,
];

// Every real route, including the ones not shown in the sidebar directly
// (Settings and Reports, both reached via the Admin flyout instead) - so a
// direct link/refresh to any of them still resolves.
const ROUTABLE_TABS: (NavTab & { component: ComponentType })[] = [
	{ path: "dashboard", label: "Dashboard", icon: DashboardIcon, component: Dashboard },
	{ path: "pos", label: "POS", icon: POSIcon, component: POS },
	{ path: "quotation", label: "Quotation", icon: QuoteIcon, component: Quotation },
	{ path: "invoicing", label: "Invoicing", icon: InvoiceIcon, component: Invoicing },
	{ path: "sales-history", label: "Sales History", icon: ReceiptIcon, component: SalesHistory },
	{ path: "purchases", label: "Purchasing", icon: PurchasesIcon, component: Purchases },
	{ path: "purchase-history", label: "Purchase History", icon: ReceiptIcon, component: PurchaseHistory },
	{ path: "inventory", label: "Inventory", icon: InventoryIcon, component: Inventory },
	{ path: "customers", label: "Customers", icon: CustomersIcon, component: Customers },
	{ path: "income", label: "Income", icon: IncomeIcon, component: Income },
	{ path: "expenses", label: "Expenses", icon: ExpensesIcon, component: Expenses },
	{ path: "financial-summary", label: "Financial Summary", icon: WalletIcon, component: FinancialSummary },
	{ path: "reports", label: "Reports", icon: ReportsIcon, component: Reports },
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
					<main className="app-main" style={{ flex: 1, padding: 24, overflowY: "auto", overflowX: "hidden", minWidth: 0 }}>
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
