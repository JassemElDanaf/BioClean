import type { ComponentType } from "react";
import ExpensesTab from "../expenses/ExpensesTab";
import IncomeTab from "../income/IncomeTab";
import InventoryAuditReport from "../inventory/AuditReport";
import StockValuationReport from "../inventory/StockValuationReport";
import FinancialSummaryReport from "./FinancialSummaryReport";

export interface ReportDefinition {
	key: string;
	label: string;
	component: ComponentType;
	// Groups the side-rail into labeled sections (Reports vs Finance) -
	// Expenses/Income moved in here off the main sidebar (see App.tsx) per
	// the nav restructure: they're operational ledgers, not reports, but
	// belong in the same "money" area rather than their own top-level tabs.
	group: "Reports" | "Finance";
}

// Each domain owns its own report/ledger component (Inventory's lives in
// features/inventory/, Expenses/Income in their own feature folders) -
// this registry is just the index the Reports hub uses to list and switch
// between whichever pages exist. Adding a new one later means adding one
// line here, not restructuring the hub.
export const REPORTS: ReportDefinition[] = [
	{ key: "financial-summary", label: "Financial Summary", component: FinancialSummaryReport, group: "Reports" },
	{ key: "stock-valuation", label: "Stock Valuation", component: StockValuationReport, group: "Reports" },
	{ key: "inventory-audit", label: "Inventory Audit", component: InventoryAuditReport, group: "Reports" },
	{ key: "expenses", label: "Expenses", component: ExpensesTab, group: "Finance" },
	{ key: "income", label: "Income", component: IncomeTab, group: "Finance" },
];
