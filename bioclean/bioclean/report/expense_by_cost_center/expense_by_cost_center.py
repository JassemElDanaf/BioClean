"""Phase 7 — the month-end "where did the money go" view. Scoped to
manually-logged expenses (Journal Entry, per the Expenses tab's own design
- see setup.py's note on why Journal Entry rather than Expense Claim),
against real Expense-type accounts, grouped by Cost Center. Deliberately
not a general GL Entry dump: that would also pull in Cost of Goods Sold
from every sale, which isn't a discretionary expense someone logged."""

import frappe
from frappe import _


def execute(filters=None):
	filters = filters or {}
	return get_columns(), get_data(filters)


def get_columns():
	return [
		{"fieldname": "cost_center", "label": _("Cost Center"), "fieldtype": "Link", "options": "Cost Center", "width": 150},
		{"fieldname": "account", "label": _("Account"), "fieldtype": "Link", "options": "Account", "width": 200},
		{"fieldname": "count", "label": _("Entries"), "fieldtype": "Int", "width": 80},
		{"fieldname": "total", "label": _("Total (USD)"), "fieldtype": "Currency", "options": "USD", "width": 130},
	]


def get_data(filters):
	conditions = ["gle.voucher_type = 'Journal Entry'", "gle.is_cancelled = 0", "acc.root_type = 'Expense'"]
	values = {}

	if filters.get("company"):
		conditions.append("gle.company = %(company)s")
		values["company"] = filters["company"]
	if filters.get("from_date"):
		conditions.append("gle.posting_date >= %(from_date)s")
		values["from_date"] = filters["from_date"]
	if filters.get("to_date"):
		conditions.append("gle.posting_date <= %(to_date)s")
		values["to_date"] = filters["to_date"]
	if filters.get("cost_center"):
		conditions.append("gle.cost_center = %(cost_center)s")
		values["cost_center"] = filters["cost_center"]

	return frappe.db.sql(
		f"""
		select
			gle.cost_center, gle.account,
			count(distinct gle.voucher_no) as count,
			sum(gle.debit - gle.credit) as total
		from `tabGL Entry` gle
		join `tabAccount` acc on acc.name = gle.account
		where {" and ".join(conditions)}
		group by gle.cost_center, gle.account
		order by total desc
		""",
		values,
		as_dict=1,
	)
