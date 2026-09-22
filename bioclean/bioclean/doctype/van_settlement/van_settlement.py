# Copyright (c) 2026, BioClean Chemicals, LB and contributors
# For license information, please see license.txt

"""Phase 5 — end-of-day van reconciliation. A store manager/staff member
enters this after talking to the driver and counting what came back (see
the plan's Cash Van design - drivers have no login and never touch the
system themselves). Rides entirely on native ERPNext machinery on submit:
Stock Entry for the resellable-returns transfer and the damaged/expired
write-off, and a Sales Invoice billing the driver himself (an ERPNext
Customer, not a system user) for the net-sold quantity - paid immediately
via Payment Entry or left as an ordinary driver-level receivable."""

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt


class VanSettlement(Document):
	def validate(self):
		self._compute_item_totals()

	def _compute_item_totals(self):
		total = 0.0
		for item in self.items:
			net_sold = flt(item.opening_qty) - flt(item.resellable_returned_qty) - flt(item.damaged_qty)
			if net_sold < 0:
				frappe.throw(
					_("Row {0} ({1}): returned + damaged quantity cannot exceed the loaded quantity.").format(
						item.idx, item.item_code
					)
				)
			item.net_sold_qty = net_sold
			item.amount = flt(net_sold) * flt(item.rate)
			total += item.amount

		self.total_net_sold_amount = total
		self.outstanding_amount = total - flt(self.cash_collected)

	def on_submit(self):
		store_warehouse = self._get_store_warehouse()

		updates = {}
		return_se = self._make_stock_entry(
			"Material Transfer",
			[(i.item_code, i.resellable_returned_qty) for i in self.items if flt(i.resellable_returned_qty) > 0],
			s_warehouse=self.van_warehouse,
			t_warehouse=store_warehouse,
		)
		if return_se:
			updates["return_stock_entry"] = return_se.name

		writeoff_se = self._make_stock_entry(
			"Material Issue",
			[(i.item_code, i.damaged_qty) for i in self.items if flt(i.damaged_qty) > 0],
			s_warehouse=self.van_warehouse,
		)
		if writeoff_se:
			updates["writeoff_stock_entry"] = writeoff_se.name

		si = self._create_sales_invoice()
		if si:
			updates["sales_invoice"] = si.name

		if updates:
			frappe.db.set_value("Van Settlement", self.name, updates)

		if si and flt(self.cash_collected) > 0:
			pe = self._create_payment_entry(si)
			frappe.db.set_value("Van Settlement", self.name, "payment_entry", pe.name)

	def on_cancel(self):
		# Reverse in dependency order: a Payment Entry references the Sales
		# Invoice, so it has to go first; the two Stock Entries are
		# independent of everything else and can go in any order.
		for fieldname, doctype in (
			("payment_entry", "Payment Entry"),
			("sales_invoice", "Sales Invoice"),
			("return_stock_entry", "Stock Entry"),
			("writeoff_stock_entry", "Stock Entry"),
		):
			name = self.get(fieldname)
			if name and frappe.db.exists(doctype, name):
				doc = frappe.get_doc(doctype, name)
				if doc.docstatus == 1:
					doc.cancel()

	def _get_store_warehouse(self):
		store = frappe.db.get_value("Warehouse", {"warehouse_name": "Stores", "company": self.company}, "name")
		if not store:
			frappe.throw(_("No 'Stores' warehouse found for company {0}.").format(self.company))
		return store

	def _make_stock_entry(self, stock_entry_type, item_qty_pairs, s_warehouse, t_warehouse=None):
		if not item_qty_pairs:
			return None

		se = frappe.new_doc("Stock Entry")
		se.stock_entry_type = stock_entry_type
		se.company = self.company
		se.posting_date = self.posting_date
		for item_code, qty in item_qty_pairs:
			row = {"item_code": item_code, "qty": qty, "s_warehouse": s_warehouse}
			if t_warehouse:
				row["t_warehouse"] = t_warehouse
			se.append("items", row)
		se.insert(ignore_permissions=True)
		se.submit()
		return se

	def _create_sales_invoice(self):
		rows = [item for item in self.items if flt(item.net_sold_qty) > 0]
		if not rows:
			return None

		si = frappe.new_doc("Sales Invoice")
		si.customer = self.driver
		si.company = self.company
		si.currency = "USD"
		si.selling_price_list = "Retail"
		si.posting_date = self.posting_date
		# The returns/write-off Stock Entries above only account for what
		# came *back*. The net-sold quantity itself never got a stock
		# movement yet - it needs one, or the van warehouse keeps showing
		# phantom stock for units that were actually sold on the road.
		# Letting the invoice itself deduct it (rather than a separate
		# Material Issue) is also the correct accounting: it posts real
		# Cost of Goods Sold against this sale, not a generic write-off.
		si.update_stock = 1
		si.set_warehouse = self.van_warehouse
		# This bills the driver himself for what he took out, at the rate
		# counted into this settlement - retail promotions (buy-X-get-Y-free
		# etc.) are a customer-facing thing that happens on the driver's own
		# route, not something that should also silently discount what the
		# driver owes BioClean for the stock.
		si.ignore_pricing_rule = 1
		for item in rows:
			si.append(
				"items",
				{
					"item_code": item.item_code,
					"qty": item.net_sold_qty,
					"rate": item.rate,
					"warehouse": self.van_warehouse,
				},
			)
		si.insert(ignore_permissions=True)
		si.submit()
		return si

	def _create_payment_entry(self, sales_invoice):
		from erpnext.accounts.doctype.payment_entry.payment_entry import get_payment_entry

		pe = get_payment_entry("Sales Invoice", sales_invoice.name)
		amount = flt(self.cash_collected)
		pe.paid_amount = amount
		pe.received_amount = amount
		for ref in pe.references:
			ref.allocated_amount = min(amount, flt(ref.outstanding_amount))
		pe.insert(ignore_permissions=True)
		pe.submit()
		return pe
