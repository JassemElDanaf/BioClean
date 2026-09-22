"""Phase 7 — cash vs card vs mobile vs bank vs credit totals per period,
across every revenue channel (matches the plan's Income tab: in-store POS,
B2B invoice payments, van settlement collections - "all pulled from the
same underlying Sales Invoice/Payment Entry records"). POS payments live
directly on the Sales Invoice's own payments table (no separate Payment
Entry is ever created for those - see bioclean/api.py's checkout()), while
B2B and van-settlement collections are real Payment Entry documents - this
report unions both sources rather than reading just one and silently
missing most of the business's actual revenue."""

import frappe
from frappe import _


def execute(filters=None):
	filters = filters or {}
	return get_columns(), get_data(filters)


def get_columns():
	return [
		{"fieldname": "mode_of_payment", "label": _("Payment Method"), "fieldtype": "Link", "options": "Mode of Payment", "width": 160},
		{"fieldname": "count", "label": _("Transactions"), "fieldtype": "Int", "width": 100},
		{"fieldname": "total", "label": _("Total (USD)"), "fieldtype": "Currency", "options": "USD", "width": 140},
	]


def get_data(filters):
	values = {}
	pos_conditions = ["si.docstatus = 1", "si.is_pos = 1"]
	pe_conditions = ["pe.docstatus = 1", "pe.payment_type = 'Receive'"]

	if filters.get("company"):
		pos_conditions.append("si.company = %(company)s")
		pe_conditions.append("pe.company = %(company)s")
		values["company"] = filters["company"]
	if filters.get("from_date"):
		pos_conditions.append("si.posting_date >= %(from_date)s")
		pe_conditions.append("pe.posting_date >= %(from_date)s")
		values["from_date"] = filters["from_date"]
	if filters.get("to_date"):
		pos_conditions.append("si.posting_date <= %(to_date)s")
		pe_conditions.append("pe.posting_date <= %(to_date)s")
		values["to_date"] = filters["to_date"]

	return frappe.db.sql(
		f"""
		select mode_of_payment, count(*) as count, sum(amount) as total
		from (
			select sip.mode_of_payment as mode_of_payment, sip.amount as amount
			from `tabSales Invoice Payment` sip
			join `tabSales Invoice` si on si.name = sip.parent
			where {" and ".join(pos_conditions)}

			union all

			select pe.mode_of_payment as mode_of_payment, pe.paid_amount as amount
			from `tabPayment Entry` pe
			where {" and ".join(pe_conditions)}
		) combined
		group by mode_of_payment
		order by total desc
		""",
		values,
		as_dict=1,
	)
