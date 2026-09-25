import type { ComponentType } from "react";
import InventoryAuditReport from "../inventory/AuditReport";
import StockValuationReport from "../inventory/StockValuationReport";

export interface ReportDefinition {
	key: string;
	label: string;
	component: ComponentType;
	group: "Reports";
}

// Each domain owns its own report/ledger component (Inventory's lives in
// features/inventory/) - this registry is just the index the Reports hub
// uses to list and switch between whichever pages exist. Income, Expenses,
// and Financial Summary all moved out of here onto their own routes under
// a dedicated "Finance" sidebar group (see App.tsx) - they're operational
// ledgers/figures people reach constantly, not occasional reports someone
// digs for via the Admin flyout.
export const REPORTS: ReportDefinition[] = [
	{ key: "stock-valuation", label: "Stock Valuation", component: StockValuationReport, group: "Reports" },
	{ key: "inventory-audit", label: "Inventory Audit", component: InventoryAuditReport, group: "Reports" },
];
