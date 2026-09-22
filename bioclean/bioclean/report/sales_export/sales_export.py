"""Phase 7 — line-item-level sales export (item numbers, quantities,
prices, totals, date range) for the accountant's own tools - kept as
plain, portable columns per the plan's data-portability rule (real labels,
real item codes, no internal Frappe IDs)."""

import frappe
from frappe import _


def execute(filters=None):
	filters = filters or {}
	return get_columns(), get_data(filters)


def get_columns():
	return [
		{"fieldname": "posting_date", "label": _("Date"), "fieldtype": "Date", "width": 100},
		{"fieldname": "invoice", "label": _("Invoice"), "fieldtype": "Link", "options": "Sales Invoice", "width": 130},
		{"fieldname": "customer", "label": _("Customer"), "fieldtype": "Link", "options": "Customer", "width": 160},
		{"fieldname": "item_code", "label": _("Item Code"), "fieldtype": "Link", "options": "Item", "width": 130},
		{"fieldname": "item_name", "label": _("Item Name"), "fieldtype": "Data", "width": 200},
		{"fieldname": "qty", "label": _("Qty"), "fieldtype": "Float", "width": 80},
		{"fieldname": "rate", "label": _("Rate (USD)"), "fieldtype": "Currency", "options": "USD", "width": 100},
		{"fieldname": "amount", "label": _("Amount (USD)"), "fieldtype": "Currency", "options": "USD", "width": 120},
	]


def get_data(filters):
	conditions = ["si.docstatus = 1"]
	values = {}

	if filters.get("company"):
		conditions.append("si.company = %(company)s")
		values["company"] = filters["company"]
	if filters.get("from_date"):
		conditions.append("si.posting_date >= %(from_date)s")
		values["from_date"] = filters["from_date"]
	if filters.get("to_date"):
		conditions.append("si.posting_date <= %(to_date)s")
		values["to_date"] = filters["to_date"]
	if filters.get("customer"):
		conditions.append("si.customer = %(customer)s")
		values["customer"] = filters["customer"]
	if filters.get("item_code"):
		conditions.append("sii.item_code = %(item_code)s")
		values["item_code"] = filters["item_code"]

	return frappe.db.sql(
		f"""
		select
			si.posting_date, si.name as invoice, si.customer,
			sii.item_code, sii.item_name, sii.qty, sii.rate, sii.amount
		from `tabSales Invoice Item` sii
		join `tabSales Invoice` si on si.name = sii.parent
		where {" and ".join(conditions)}
		order by si.posting_date, si.name
		""",
		values,
		as_dict=1,
	)
