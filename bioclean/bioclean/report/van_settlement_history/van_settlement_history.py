"""Phase 5 — net sold per driver, cash-vs-credit split, and outstanding
driver balances, straight off the Van Settlement doctype itself (unlike
Promotion Usage, nothing here has to be reconstructed from child-table
side effects - Van Settlement already stores the totals it computed)."""

import frappe
from frappe import _


def execute(filters=None):
	filters = filters or {}
	return get_columns(), get_data(filters)


def get_columns():
	return [
		{"fieldname": "posting_date", "label": _("Date"), "fieldtype": "Date", "width": 100},
		{"fieldname": "name", "label": _("Settlement"), "fieldtype": "Link", "options": "Van Settlement", "width": 130},
		{"fieldname": "driver", "label": _("Driver"), "fieldtype": "Link", "options": "Customer", "width": 150},
		{"fieldname": "van_warehouse", "label": _("Van"), "fieldtype": "Link", "options": "Warehouse", "width": 130},
		{"fieldname": "total_net_sold_amount", "label": _("Net Sold (USD)"), "fieldtype": "Currency", "options": "USD", "width": 130},
		{"fieldname": "cash_collected", "label": _("Cash Collected (USD)"), "fieldtype": "Currency", "options": "USD", "width": 150},
		{"fieldname": "outstanding_amount", "label": _("Outstanding (USD)"), "fieldtype": "Currency", "options": "USD", "width": 140},
		{"fieldname": "sales_invoice", "label": _("Sales Invoice"), "fieldtype": "Link", "options": "Sales Invoice", "width": 130},
		{"fieldname": "payment_entry", "label": _("Payment Entry"), "fieldtype": "Link", "options": "Payment Entry", "width": 130},
	]


def get_data(filters):
	conditions = {"docstatus": 1}
	if filters.get("company"):
		conditions["company"] = filters["company"]
	if filters.get("driver"):
		conditions["driver"] = filters["driver"]
	if filters.get("from_date") and filters.get("to_date"):
		conditions["posting_date"] = ["between", [filters["from_date"], filters["to_date"]]]
	elif filters.get("from_date"):
		conditions["posting_date"] = [">=", filters["from_date"]]
	elif filters.get("to_date"):
		conditions["posting_date"] = ["<=", filters["to_date"]]

	return frappe.get_all(
		"Van Settlement",
		filters=conditions,
		fields=[
			"name",
			"posting_date",
			"driver",
			"van_warehouse",
			"total_net_sold_amount",
			"cash_collected",
			"outstanding_amount",
			"sales_invoice",
			"payment_entry",
		],
		order_by="posting_date desc, name desc",
	)
