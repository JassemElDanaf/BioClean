"""Phase 7 — Boss Mode's whitelisted API surface: dashboard aggregation,
quick expense logging, and the Expenses/Income tabs' daily feeds. Kept
separate from api.py (the Cashier Mode / checkout surface) since the two
have different audiences and are growing independently.

Every number here reads off documents other phases already produce
(Sales Invoice, Journal Entry, Van Settlement, GL Entry) - nothing is
tracked in a parallel ledger."""

import frappe
from frappe import _
from frappe.utils import add_days, flt, today


def _require_boss_role():
	"""Every function below reads via raw SQL for aggregation, which
	bypasses Frappe's row-level DocType permissions entirely - unlike
	api.py's checkout() surface, these expose financial totals a Cashier
	should never see, so the role check has to happen explicitly here."""
	roles = frappe.get_roles()
	if "Store Manager" not in roles and "System Manager" not in roles:
		frappe.throw(_("Not permitted"), frappe.PermissionError)


@frappe.whitelist()
def get_dashboard_summary(from_date=None, to_date=None, company="BioClean"):
	_require_boss_role()
	from_date = from_date or add_days(today(), -6)
	to_date = to_date or today()

	return {
		"total_sales": _total_sales(company, from_date, to_date),
		"total_expenses": _total_expenses(company, from_date, to_date),
		"transaction_count": _transaction_count(company, from_date, to_date),
		"sales_by_day": _sales_by_day(company, from_date, to_date),
		"top_items": _top_items(company, from_date, to_date),
		"low_stock_items": _low_stock_items(company),
		"van_settlements": _recent_van_settlements(company, from_date, to_date),
	}


def _total_sales(company, from_date, to_date):
	return flt(
		frappe.db.sql(
			"""select sum(grand_total) from `tabSales Invoice`
			where docstatus = 1 and company = %s and posting_date between %s and %s""",
			(company, from_date, to_date),
		)[0][0]
	)


def _total_expenses(company, from_date, to_date):
	return flt(
		frappe.db.sql(
			"""select sum(gle.debit - gle.credit)
			from `tabGL Entry` gle
			join `tabAccount` acc on acc.name = gle.account
			where gle.voucher_type = 'Journal Entry' and gle.is_cancelled = 0
				and acc.root_type = 'Expense' and gle.company = %s
				and gle.posting_date between %s and %s""",
			(company, from_date, to_date),
		)[0][0]
	)


def _transaction_count(company, from_date, to_date):
	return frappe.db.count(
		"Sales Invoice",
		filters={"docstatus": 1, "company": company, "posting_date": ["between", [from_date, to_date]]},
	)


def _sales_by_day(company, from_date, to_date):
	return frappe.db.sql(
		"""select posting_date, sum(grand_total) as total
		from `tabSales Invoice`
		where docstatus = 1 and company = %s and posting_date between %s and %s
		group by posting_date order by posting_date""",
		(company, from_date, to_date),
		as_dict=1,
	)


def _top_items(company, from_date, to_date, limit=5):
	return frappe.db.sql(
		"""select sii.item_code, sii.item_name, sum(sii.qty) as qty, sum(sii.amount) as amount
		from `tabSales Invoice Item` sii
		join `tabSales Invoice` si on si.name = sii.parent
		where si.docstatus = 1 and si.company = %s and si.posting_date between %s and %s
		group by sii.item_code order by amount desc limit %s""",
		(company, from_date, to_date, limit),
		as_dict=1,
	)


def _low_stock_items(company):
	return frappe.db.sql(
		"""select ir.parent as item_code, ir.warehouse, bin.actual_qty, ir.warehouse_reorder_level
		from `tabItem Reorder` ir
		join `tabBin` bin on bin.item_code = ir.parent and bin.warehouse = ir.warehouse
		join `tabItem` item on item.name = ir.parent
		where item.disabled = 0 and bin.actual_qty <= ir.warehouse_reorder_level""",
		as_dict=1,
	)


def _recent_van_settlements(company, from_date, to_date):
	return frappe.get_all(
		"Van Settlement",
		filters={"docstatus": 1, "company": company, "posting_date": ["between", [from_date, to_date]]},
		fields=["name", "posting_date", "driver", "total_net_sold_amount", "cash_collected", "outstanding_amount"],
		order_by="posting_date desc",
	)


@frappe.whitelist()
def log_expense(amount, expense_account, cost_center, description=None, paid_from="Cash - BC", company="BioClean", date=None):
	"""Expenses tab's quick daily-logging action - a Journal Entry, per the
	plan's own design (not Expense Claim, see setup.py's note), tagged to a
	Cost Center so Expense by Cost Center picks it up. No approval gate,
	per the confirmed decision to log expenses freely."""
	_require_boss_role()
	amount = flt(amount)
	if amount <= 0:
		frappe.throw(_("Expense amount must be greater than zero."))

	je = frappe.new_doc("Journal Entry")
	je.voucher_type = "Journal Entry"
	je.company = company
	je.posting_date = date or today()
	je.user_remark = description or ""
	je.append("accounts", {"account": expense_account, "debit_in_account_currency": amount, "cost_center": cost_center})
	je.append("accounts", {"account": paid_from, "credit_in_account_currency": amount})
	je.insert(ignore_permissions=True)
	je.submit()
	frappe.db.commit()
	return {"name": je.name, "amount": amount}


@frappe.whitelist()
def get_expense_feed(date=None, company="BioClean"):
	_require_boss_role()
	date = date or today()
	return frappe.db.sql(
		"""select je.name as journal_entry, je.posting_date, je.user_remark as description,
			gle.account, gle.cost_center, gle.debit as amount
		from `tabGL Entry` gle
		join `tabJournal Entry` je on je.name = gle.voucher_no
		join `tabAccount` acc on acc.name = gle.account
		where gle.voucher_type = 'Journal Entry' and gle.is_cancelled = 0
			and acc.root_type = 'Expense' and gle.company = %s and gle.posting_date = %s
		order by je.creation desc""",
		(company, date),
		as_dict=1,
	)


@frappe.whitelist()
def get_income_feed(date=None, company="BioClean"):
	_require_boss_role()
	date = date or today()
	return frappe.db.sql(
		"""select * from (
			select si.name as reference, 'POS Sale' as source, sip.mode_of_payment, sip.amount, si.posting_date
			from `tabSales Invoice Payment` sip
			join `tabSales Invoice` si on si.name = sip.parent
			where si.docstatus = 1 and si.is_pos = 1 and si.company = %(company)s and si.posting_date = %(date)s

			union all

			select pe.name as reference,
				case when pe.party_type = 'Customer' then 'Payment Received' else 'Payment' end as source,
				pe.mode_of_payment, pe.paid_amount as amount, pe.posting_date
			from `tabPayment Entry` pe
			where pe.docstatus = 1 and pe.payment_type = 'Receive' and pe.company = %(company)s
				and pe.posting_date = %(date)s
		) combined
		order by amount desc""",
		{"company": company, "date": date},
		as_dict=1,
	)


@frappe.whitelist()
def get_expense_accounts(company="BioClean"):
	_require_boss_role()
	return frappe.get_all(
		"Account",
		filters={"company": company, "root_type": "Expense", "is_group": 0},
		fields=["name"],
		order_by="name",
	)


@frappe.whitelist()
def get_cost_centers(company="BioClean"):
	_require_boss_role()
	return frappe.get_all(
		"Cost Center",
		filters={"company": company, "is_group": 0},
		fields=["name"],
		order_by="name",
	)
