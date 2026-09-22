"""Phase 4 — how much every Pricing Rule promotion (buy-X-get-Y-free or a
straight price discount) actually cost in forgone revenue, and how often it
fired. Reads straight off Sales Invoice Item, which is where ERPNext records
the applied rule and the free/discounted result — no separate usage counter
to maintain."""

import json

import frappe
from frappe import _
from frappe.utils import flt


def execute(filters=None):
	filters = filters or {}
	return get_columns(), get_data(filters)


def get_columns():
	return [
		{"fieldname": "posting_date", "label": _("Date"), "fieldtype": "Date", "width": 100},
		{"fieldname": "invoice", "label": _("Invoice"), "fieldtype": "Link", "options": "Sales Invoice", "width": 140},
		{"fieldname": "pricing_rule", "label": _("Promotion"), "fieldtype": "Link", "options": "Pricing Rule", "width": 160},
		{"fieldname": "promotion_title", "label": _("Promotion Title"), "fieldtype": "Data", "width": 220},
		{"fieldname": "item_code", "label": _("Item"), "fieldtype": "Link", "options": "Item", "width": 140},
		{"fieldname": "type", "label": _("Type"), "fieldtype": "Data", "width": 110},
		{"fieldname": "qty", "label": _("Qty"), "fieldtype": "Float", "width": 80},
		{"fieldname": "discount_value", "label": _("Discount Value (USD)"), "fieldtype": "Currency", "options": "USD", "width": 150},
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

	rows = frappe.db.sql(
		f"""
		select
			si.posting_date, si.name as invoice, si.selling_price_list, sii.item_code,
			sii.is_free_item, sii.qty, sii.price_list_rate, sii.rate,
			sii.pricing_rules
		from `tabSales Invoice Item` sii
		join `tabSales Invoice` si on si.name = sii.parent
		where {" and ".join(conditions)}
			and sii.pricing_rules is not null and sii.pricing_rules != ''
		order by si.posting_date, si.name
		""",
		values,
		as_dict=1,
	)

	titles = dict(frappe.get_all("Pricing Rule", fields=["name", "title"], as_list=1))
	pricing_rule_filter = filters.get("pricing_rule")
	list_rate_cache = {}

	data = []
	for row in rows:
		for rule in _parse_pricing_rules(row.pricing_rules):
			if pricing_rule_filter and rule != pricing_rule_filter:
				continue

			if row.is_free_item:
				# ERPNext zeroes price_list_rate on the free row itself, so
				# the forgone value has to come from the item's real listed
				# price, not this row's own (blanked-out) fields.
				list_rate = _get_list_rate(row.item_code, row.selling_price_list, list_rate_cache)
				discount_value = list_rate * flt(row.qty)
				kind = _("Free Item")
			elif flt(row.rate) < flt(row.price_list_rate):
				discount_value = (flt(row.price_list_rate) - flt(row.rate)) * flt(row.qty)
				kind = _("Price Discount")
			else:
				continue

			data.append(
				{
					"posting_date": row.posting_date,
					"invoice": row.invoice,
					"pricing_rule": rule,
					"promotion_title": titles.get(rule, rule),
					"item_code": row.item_code,
					"type": kind,
					"qty": row.qty,
					"discount_value": discount_value,
				}
			)

	return data


def _get_list_rate(item_code, price_list, cache):
	key = (item_code, price_list)
	if key not in cache:
		cache[key] = flt(
			frappe.db.get_value("Item Price", {"item_code": item_code, "price_list": price_list}, "price_list_rate")
		)
	return cache[key]


def _parse_pricing_rules(raw):
	"""`pricing_rules` is stored as a bare rule name on a free-item row, but
	as a JSON list string on the paid row a discount applied to - handle
	both without assuming which one we're looking at."""
	if not raw:
		return []
	try:
		parsed = json.loads(raw)
		return parsed if isinstance(parsed, list) else [parsed]
	except (ValueError, TypeError):
		return [raw]
