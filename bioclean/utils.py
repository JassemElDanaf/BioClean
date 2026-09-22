"""Small internal helpers - not whitelisted API endpoints (see api.py for
those). Currently just backs the Receipt Print Format's loyalty line via a
Jinja method (wired in hooks.py)."""

import frappe


def get_loyalty_summary(customer, invoice):
	"""Returns {"points_earned": int, "balance": int} for the confirmed
	receipt line ("You earned N points! Balance: X") - only meaningful when
	the sale is tied to an identified customer with a Loyalty Program."""
	if not customer or customer == "Walk-in Customer":
		return None

	loyalty_program = frappe.db.get_value("Customer", customer, "loyalty_program")
	if not loyalty_program:
		return None

	points_earned = (
		frappe.db.get_value(
			"Loyalty Point Entry",
			{"invoice": invoice, "customer": customer},
			"loyalty_points",
		)
		or 0
	)
	balance = (
		frappe.db.sql(
			"""select coalesce(sum(loyalty_points), 0) from `tabLoyalty Point Entry`
			where customer = %s and expiry_date >= curdate()""",
			(customer,),
		)[0][0]
		or 0
	)
	return {"points_earned": points_earned, "balance": balance}
