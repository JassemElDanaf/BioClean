"""Phase 6 — issued, redeemed, and outstanding balance per gift card."""

import frappe
from frappe import _
from frappe.utils import flt


def execute(filters=None):
	filters = filters or {}
	return get_columns(), get_data(filters)


def get_columns():
	return [
		{"fieldname": "name", "label": _("Code"), "fieldtype": "Link", "options": "Gift Card", "width": 130},
		{"fieldname": "status", "label": _("Status"), "fieldtype": "Data", "width": 90},
		{"fieldname": "issued_date", "label": _("Issued Date"), "fieldtype": "Date", "width": 100},
		{"fieldname": "issued_to", "label": _("Issued To"), "fieldtype": "Data", "width": 150},
		{"fieldname": "initial_balance", "label": _("Issued (USD)"), "fieldtype": "Currency", "options": "USD", "width": 110},
		{"fieldname": "redeemed", "label": _("Redeemed (USD)"), "fieldtype": "Currency", "options": "USD", "width": 120},
		{"fieldname": "current_balance", "label": _("Outstanding (USD)"), "fieldtype": "Currency", "options": "USD", "width": 130},
	]


def get_data(filters):
	conditions = {}
	if filters.get("company"):
		conditions["company"] = filters["company"]
	if filters.get("status"):
		conditions["status"] = filters["status"]

	cards = frappe.get_all(
		"Gift Card",
		filters=conditions,
		fields=["name", "status", "issued_date", "issued_to", "initial_balance", "current_balance"],
		order_by="issued_date desc, name",
	)
	for card in cards:
		card["redeemed"] = flt(card.initial_balance) - flt(card.current_balance)
	return cards
