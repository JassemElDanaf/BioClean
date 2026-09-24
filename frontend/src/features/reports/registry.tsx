import type { ComponentType } from "react";
import InventoryAuditReport from "../inventory/AuditReport";
import StockValuationReport from "../inventory/StockValuationReport";
import FinancialSummaryReport from "./FinancialSummaryReport";

export interface ReportDefinition {
	key: string;
	label: string;
	component: ComponentType;
}

// Each domain owns its own report component (Inventory's lives in
// features/inventory/, a future Sales report would live in
// features/sales/, etc.) - this registry is just the index the Reports
// tab uses to list and switch between whichever reports exist. Adding a
// new report later means adding one line here, not restructuring the tab.
export const REPORTS: ReportDefinition[] = [
	{ key: "financial-summary", label: "Financial Summary", component: FinancialSummaryReport },
	{ key: "stock-valuation", label: "Stock Valuation", component: StockValuationReport },
	{ key: "inventory-audit", label: "Inventory Audit", component: InventoryAuditReport },
];
