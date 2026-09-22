"""Phase 3a POS backend API - built and verified via direct calls (see
DEPLOY-style testing below) before any Cashier Mode UI exists, per the
plan's backend-first rule. Every function here is a whitelisted RPC method
the Phase 3b frontend will call directly.

Design notes:
- Idempotency: `checkout()` takes a client-generated `idempotency_key`.
  A unique DB constraint on Sales Invoice.bioclean_idempotency_key (see
  setup.py) means a retried request - a print retry, a network timeout, a
  double-tap - can never create a second sale, even under a race, because
  the second insert fails at the database level and we fall back to
  returning the invoice the first attempt already created.
- Mixed-currency split payment: each payment row carries its own currency
  (USD or LBP). LBP amounts convert to their USD equivalent using
  BioClean Settings' persistent rate for the invoice's own `amount` field
  (so accounting stays correct in the base currency), while the real
  tendered currency/amount is preserved on the payment row itself (via the
  custom fields) so the receipt can show exactly what was handed over.
- Customer lookup is phone-based and optional - checkout works with
  customer=None for a fast anonymous sale (confirmed decision).
"""

import frappe
from frappe import _
from frappe.utils import flt


@frappe.whitelist()
def get_my_mode():
	"""Which UI mode the current user lands in - role logic lives here, once,
	server-side, rather than duplicated in the frontend. Cashier-only users
	go straight to Cashier Mode with no way to see Boss Mode at all; anyone
	with Store Manager or System Manager lands in Boss Mode by default with
	a toggle to open Cashier Mode themselves."""
	roles = frappe.get_roles()
	if "Store Manager" in roles or "System Manager" in roles:
		return {"default_mode": "boss", "can_switch": True}
	return {"default_mode": "pos", "can_switch": False}


@frappe.whitelist()
def find_or_create_customer(phone, customer_name=None):
	"""Fast phone-number lookup/creation for Cashier Mode checkout. Optional
	step - a cashier can skip this entirely for an anonymous sale."""
	phone = (phone or "").strip()
	if not phone:
		frappe.throw(_("Phone number is required to find or create a customer."))

	existing = frappe.db.get_value("Customer", {"bioclean_phone": phone}, "name")
	if existing:
		return frappe.get_doc("Customer", existing).as_dict()

	customer = frappe.new_doc("Customer")
	customer.customer_name = customer_name or phone
	customer.customer_group = "Individual"
	customer.customer_type = "Individual"
	customer.bioclean_phone = phone
	customer.insert(ignore_permissions=True)
	frappe.db.commit()
	return customer.as_dict()


def _convert_payment_to_base_amount(amount: float, currency: str, rate: float) -> float:
	"""Converts a tendered amount into its USD equivalent using the
	persistent BioClean Settings rate. USD passes through unchanged."""
	if currency == "LBP":
		if not rate:
			frappe.throw(_("USD/LBP exchange rate is not set in BioClean Settings."))
		return amount / rate
	return amount


@frappe.whitelist()
def checkout(idempotency_key, items, payments, customer=None, warehouse="Stores - BC", price_list="Retail"):
	"""The core POS checkout call. `items` and `payments` may arrive as JSON
	strings (typical for a frontend POST) or already-parsed lists - both are
	accepted so this can be called directly (e.g. from `bench execute` during
	testing) or from the eventual frontend.

	items:    [{"item_code": "BIOMAX-3L", "qty": 2, "rate": 6.0}, ...]
	payments: [{"mode_of_payment": "Cash", "currency": "USD", "amount": 20},
	           {"mode_of_payment": "Cash", "currency": "LBP", "amount": 100000}]
	"""
	items = frappe.parse_json(items) if isinstance(items, str) else items
	payments = frappe.parse_json(payments) if isinstance(payments, str) else payments

	if not items:
		frappe.throw(_("At least one item is required to check out."))
	if not payments:
		frappe.throw(_("At least one payment is required to check out."))

	# --- Idempotency: if this exact checkout already happened, return it
	# instead of creating a duplicate. Handles both "we already committed it"
	# (fast path) and "two requests raced" (DB unique-constraint fallback).
	existing = frappe.db.get_value("Sales Invoice", {"bioclean_idempotency_key": idempotency_key}, "name")
	if existing:
		return _checkout_result(frappe.get_doc("Sales Invoice", existing))

	settings = frappe.get_single("BioClean Settings")
	rate = settings.usd_to_lbp_rate

	si = frappe.new_doc("Sales Invoice")
	si.company = "BioClean"
	si.currency = "USD"
	si.selling_price_list = price_list
	si.is_pos = 1
	si.bioclean_idempotency_key = idempotency_key
	if customer:
		si.customer = customer
	else:
		si.customer = _get_or_create_walk_in_customer()

	for item in items:
		si.append(
			"items",
			{
				"item_code": item["item_code"],
				"qty": item["qty"],
				"rate": item["rate"],
				"warehouse": item.get("warehouse", warehouse),
			},
		)

	gift_card_redemptions = []  # [(Gift Card doc, amount)] - actually redeemed only after si.insert() succeeds
	for payment in payments:
		if payment["mode_of_payment"] == "Gift Card":
			code = payment.get("gift_card_code")
			if not code:
				frappe.throw(_("A gift card code is required for a Gift Card payment."))
			card = frappe.get_doc("Gift Card", code)
			amount = flt(payment["amount"])
			if card.status != "Active":
				frappe.throw(_("Gift Card {0} is not active.").format(code))
			if amount > flt(card.current_balance):
				frappe.throw(
					_("Gift Card {0} has a balance of {1}, less than the {2} requested.").format(
						code, card.current_balance, amount
					)
				)
			gift_card_redemptions.append((card, amount))
			payment_row = si.append("payments", {"mode_of_payment": "Gift Card", "amount": amount})
			payment_row.bioclean_tendered_currency = "USD"
			payment_row.bioclean_tendered_amount = amount
			payment_row.bioclean_gift_card_code = code
			continue

		currency = payment.get("currency", "USD")
		tendered_amount = payment["amount"]
		base_amount = _convert_payment_to_base_amount(tendered_amount, currency, rate)
		payment_row = si.append(
			"payments",
			{
				"mode_of_payment": payment["mode_of_payment"],
				"amount": base_amount,
			},
		)
		payment_row.bioclean_tendered_currency = currency
		payment_row.bioclean_tendered_amount = tendered_amount

	try:
		si.insert(ignore_permissions=True)
	except frappe.DuplicateEntryError:
		# Lost a race with another request carrying the same idempotency key -
		# the other request's insert already committed. Return that one.
		frappe.db.rollback()
		winner = frappe.db.get_value("Sales Invoice", {"bioclean_idempotency_key": idempotency_key}, "name")
		return _checkout_result(frappe.get_doc("Sales Invoice", winner))

	# Only actually debit the gift card(s) once the invoice itself has a
	# name to record against - if anything above failed, nothing here runs
	# and the whole transaction (this request's own DB work) rolls back.
	for card, amount in gift_card_redemptions:
		card.redeem(amount, sales_invoice=si.name)

	si.submit()
	frappe.db.commit()
	return _checkout_result(si)


@frappe.whitelist()
def get_exchange_rate():
	"""The persistent USD/LBP rate (BioClean Settings) - not a daily value,
	just whatever's currently set, for the Cashier Mode currency toggle and
	mixed-currency payment math."""
	return frappe.get_single("BioClean Settings").usd_to_lbp_rate


@frappe.whitelist()
def get_gift_card_balance(code):
	"""Looked up at checkout before a Gift Card payment row is accepted -
	lets the frontend show the balance and reject an inactive/unknown code
	before the cashier tries to apply it."""
	if not frappe.db.exists("Gift Card", code):
		frappe.throw(_("Gift Card {0} was not found.").format(code))
	card = frappe.db.get_value("Gift Card", code, ["status", "current_balance"], as_dict=True)
	return {"code": code, "status": card.status, "balance": card.current_balance}


@frappe.whitelist()
def issue_gift_card(amount, issued_to=None):
	"""Store Manager action (Boss Mode) - hands out a brand-new gift card,
	auto-generating its code."""
	from bioclean.bioclean.doctype.gift_card.gift_card import issue

	card = issue(amount=amount, issued_to=issued_to)
	return {"code": card.name, "balance": card.current_balance}


@frappe.whitelist()
def get_pos_items(item_group=None, price_list="Retail", search=None):
	"""Photo-grid data for Cashier Mode: item code/name/image + the price
	from the given Price List, joined in one call rather than making the
	frontend stitch together separate Item and Item Price REST calls."""
	filters = {"disabled": 0}
	if item_group:
		filters["item_group"] = item_group
	if search:
		filters["item_name"] = ["like", f"%{search}%"]

	items = frappe.get_all(
		"Item",
		filters=filters,
		fields=["item_code", "item_name", "item_group", "image", "stock_uom"],
		order_by="item_name",
		limit_page_length=200,
	)
	prices = {
		p.item_code: p.price_list_rate
		for p in frappe.get_all(
			"Item Price",
			filters={"price_list": price_list, "item_code": ["in", [i.item_code for i in items]]},
			fields=["item_code", "price_list_rate"],
		)
	}
	for item in items:
		item["rate"] = prices.get(item.item_code)
	return items


@frappe.whitelist()
def lookup_by_barcode(barcode):
	"""Checks the native Item barcode child table first (proper manufacturer
	barcodes), then falls back to treating the scanned code as the item_code
	itself (the confirmed 'item number = the barcode' path for
	BioClean-generated labels)."""
	barcode = (barcode or "").strip()
	via_barcode_table = frappe.db.get_value("Item Barcode", {"barcode": barcode}, "parent")
	item_code = via_barcode_table or (barcode if frappe.db.exists("Item", barcode) else None)
	if not item_code:
		return None
	item = frappe.db.get_value(
		"Item", item_code, ["item_code", "item_name", "item_group", "image", "stock_uom"], as_dict=True
	)
	item["rate"] = frappe.db.get_value(
		"Item Price", {"item_code": item_code, "price_list": "Retail"}, "price_list_rate"
	)
	return item


def _get_or_create_walk_in_customer():
	name = "Walk-in Customer"
	if not frappe.db.exists("Customer", name):
		customer = frappe.new_doc("Customer")
		customer.customer_name = name
		customer.customer_group = "Individual"
		customer.customer_type = "Individual"
		customer.insert(ignore_permissions=True)
	return name


def _checkout_result(sales_invoice):
	return {
		"name": sales_invoice.name,
		"customer": sales_invoice.customer,
		"grand_total": sales_invoice.grand_total,
		"currency": sales_invoice.currency,
		"payments": [
			{
				"mode_of_payment": p.mode_of_payment,
				"amount": p.amount,
				"tendered_currency": p.bioclean_tendered_currency,
				"tendered_amount": p.bioclean_tendered_amount,
			}
			for p in sales_invoice.payments
		],
	}
