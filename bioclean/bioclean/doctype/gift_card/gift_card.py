# Copyright (c) 2026, BioClean Chemicals, LB and contributors
# For license information, please see license.txt

"""Phase 6 — transferable, anonymous gift cards: redeemable by whoever
holds the code, distinct from native Customer Advance store credit (which
is tied to a known Customer record). Wired into POS checkout as a payment
method (see bioclean/api.py's checkout())."""

import secrets

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt, now_datetime


def _generate_code():
	while True:
		code = "GC-" + secrets.token_hex(4).upper()
		if not frappe.db.exists("Gift Card", code):
			return code


class GiftCard(Document):
	def autoname(self):
		if not self.gift_card_code:
			self.gift_card_code = _generate_code()
		self.name = self.gift_card_code

	def validate(self):
		if self.is_new() and not self.current_balance:
			self.current_balance = self.initial_balance

	def redeem(self, amount, sales_invoice=None):
		amount = flt(amount)
		if self.status != "Active":
			frappe.throw(_("Gift Card {0} is not active.").format(self.name))
		if amount > flt(self.current_balance):
			frappe.throw(
				_("Gift Card {0} has a balance of {1}, which is less than the {2} requested.").format(
					self.name, self.current_balance, amount
				)
			)
		self.current_balance = flt(self.current_balance) - amount
		self.append(
			"transactions",
			{
				"transaction_type": "Redeem",
				"amount": amount,
				"balance_after": self.current_balance,
				"sales_invoice": sales_invoice,
				"date": now_datetime(),
			},
		)
		self.save(ignore_permissions=True)

	def refund(self, amount, sales_invoice=None):
		"""Reverses a prior redemption - wired to Sales Invoice's on_cancel
		(see hooks.py + reverse_redemptions_on_cancel below) so voiding a
		POS sale that was partly paid by gift card gives that balance back,
		instead of it just vanishing."""
		amount = flt(amount)
		self.current_balance = flt(self.current_balance) + amount
		self.append(
			"transactions",
			{
				"transaction_type": "Refund",
				"amount": amount,
				"balance_after": self.current_balance,
				"sales_invoice": sales_invoice,
				"date": now_datetime(),
			},
		)
		self.save(ignore_permissions=True)

	def top_up(self, amount):
		amount = flt(amount)
		self.current_balance = flt(self.current_balance) + amount
		self.append(
			"transactions",
			{
				"transaction_type": "Top-up",
				"amount": amount,
				"balance_after": self.current_balance,
				"date": now_datetime(),
			},
		)
		self.save(ignore_permissions=True)


def reverse_redemptions_on_cancel(doc, method=None):
	"""Sales Invoice on_cancel hook (see hooks.py) - a cancelled/voided POS
	sale that was paid in part by gift card should give that balance back,
	the same way cancelling a Cash/Card payment just un-does it."""
	for payment in doc.payments:
		if payment.mode_of_payment == "Gift Card" and payment.bioclean_gift_card_code:
			card = frappe.get_doc("Gift Card", payment.bioclean_gift_card_code)
			card.refund(payment.bioclean_tendered_amount or payment.amount, sales_invoice=doc.name)


def issue(amount, issued_to=None, company="BioClean", code=None, received_account=None):
	"""Creates a brand-new Gift Card with an opening "Issue" transaction -
	the Store Manager action for handing out a new card, for cash (or
	other) received at the register right now. Also posts the real
	accounting for it: the cash received is genuine income today, but the
	goods haven't gone out yet, so it's booked as a liability
	(Gift Card Liability) until the card is actually redeemed - not
	revenue up front."""
	amount = flt(amount)
	card = frappe.new_doc("Gift Card")
	if code:
		card.gift_card_code = code
	card.initial_balance = amount
	card.current_balance = amount
	card.issued_to = issued_to
	card.company = company
	card.append(
		"transactions",
		{"transaction_type": "Issue", "amount": amount, "balance_after": amount, "date": now_datetime()},
	)
	card.insert(ignore_permissions=True)
	_post_issue_journal_entry(card, received_account or f"Cash - {frappe.db.get_value('Company', company, 'abbr')}")
	return card


def _post_issue_journal_entry(card, received_account):
	liability_account = frappe.db.get_value(
		"Mode of Payment Account", {"parent": "Gift Card", "company": card.company}, "default_account"
	)
	if not liability_account:
		frappe.throw(_("No default account configured for the Gift Card Mode of Payment."))

	je = frappe.new_doc("Journal Entry")
	je.voucher_type = "Journal Entry"
	je.company = card.company
	je.posting_date = card.issued_date
	je.append("accounts", {"account": received_account, "debit_in_account_currency": card.initial_balance})
	je.append("accounts", {"account": liability_account, "credit_in_account_currency": card.initial_balance})
	# Journal Entry's Reference Type is a fixed list of core doctypes and
	# doesn't include our custom Gift Card - traceability instead lives on
	# the Gift Card's own transaction history (see redeem()/append above).
	je.user_remark = _("Gift Card {0} issued").format(card.name)
	je.insert(ignore_permissions=True)
	je.submit()
	return je
