"""Phase 1 master-data setup: Company, Fiscal Year, currency, Warehouses,
Cost Centers, Price Lists, Naming Series, Loyalty Program.

Runs automatically via hooks.py's `after_install` on a fresh install, and can
be re-run safely any time (`bench execute bioclean.setup.after_install`) -
every step checks for an existing record before creating one, so running it
twice is a no-op, not a duplicate-record error. This is what makes a fresh
install on a new PC come up with the right master data automatically instead
of requiring the same manual clicks to be repeated in Desk.
"""

import frappe

COMPANY_NAME = "BioClean"
COMPANY_ABBR = "BC"
DEFAULT_CURRENCY = "USD"
DEFAULT_USD_TO_LBP_RATE = 89500

# ERPNext auto-creates "All Warehouses - BC" (root group) and a "Stores - BC"
# leaf warehouse the moment the Company is inserted (see
# erpnext.setup.doctype.company.company.create_default_warehouses). We treat
# that "Stores" warehouse as our Main Store directly rather than creating a
# colliding one - only "Vans" is ours to add, as a sibling group for growth.
EXTRA_WAREHOUSE_GROUPS = ["Vans"]

COST_CENTER_GROUPS = ["Store Ops", "Drivers", "Admin"]

PRICE_LISTS = ["Retail", "Wholesale"]

SALES_INVOICE_NAMING_SERIES = "BC-.YYYY.-.#####"


def after_install():
	ensure_erpnext_fixtures()
	set_up_company_and_fiscal_year()
	set_up_global_defaults()
	enable_lbp_currency()
	set_up_bioclean_settings()
	set_up_warehouses()
	set_up_cost_centers()
	set_up_price_lists()
	set_up_item_groups()
	set_up_sales_invoice_naming_series()
	set_up_loyalty_program()
	set_up_item_custom_fields()
	set_up_roles()
	frappe.db.commit()


def ensure_erpnext_fixtures():
	"""We create the site via `bench new-site --install-app erpnext` directly,
	bypassing ERPNext's interactive Setup Wizard entirely - which means the
	fixtures the wizard normally seeds (Warehouse Types incl. "Transit",
	Designations, Industry Types, UOM data, etc.) never get created, and
	Company creation fails without them (create_default_warehouses() needs
	Warehouse Type "Transit" to exist). Call the exact same installer the
	wizard would have called, once, idempotently."""
	if frappe.db.exists("Warehouse Type", "Transit"):
		return
	from erpnext.setup.setup_wizard.operations.install_fixtures import install

	install(country="Lebanon")


def set_up_company_and_fiscal_year():
	if not frappe.db.exists("Company", COMPANY_NAME):
		company = frappe.new_doc("Company")
		company.company_name = COMPANY_NAME
		company.abbr = COMPANY_ABBR
		company.default_currency = DEFAULT_CURRENCY
		company.country = "Lebanon"
		company.insert(ignore_permissions=True)

	# Calendar-year fiscal years (confirmed decision) for the current year and
	# a couple either side, so new documents never get stuck without one.
	from datetime import date

	current_year = date.today().year
	for year in range(current_year - 1, current_year + 3):
		fy_name = str(year)
		if not frappe.db.exists("Fiscal Year", fy_name):
			fy = frappe.new_doc("Fiscal Year")
			fy.year = fy_name
			fy.year_start_date = date(year, 1, 1)
			fy.year_end_date = date(year, 12, 31)
			fy.insert(ignore_permissions=True)


def set_up_global_defaults():
	"""Another Setup-Wizard gap: without it, Global Defaults' default_currency
	stays Frappe's own out-of-the-box default (INR) and default_company stays
	unset. That's not just cosmetic - any document created without an
	explicit currency (e.g. via the API, where Desk's client-side "populate
	from party" JS never runs) silently defaults to INR instead of USD. Found
	this the hard way validating the Phase 2 Purchase Receipt flow - a real
	example of why backend flows get validated before UI is built on them."""
	defaults = frappe.get_single("Global Defaults")
	defaults.default_currency = DEFAULT_CURRENCY
	defaults.country = "Lebanon"
	if frappe.db.exists("Company", COMPANY_NAME):
		defaults.default_company = COMPANY_NAME
	defaults.save(ignore_permissions=True)


def enable_lbp_currency():
	# LBP ships in Frappe's currency master but disabled by default.
	if frappe.db.exists("Currency", "LBP"):
		currency = frappe.get_doc("Currency", "LBP")
		if not currency.enabled:
			currency.enabled = 1
			currency.save(ignore_permissions=True)


def set_up_bioclean_settings():
	settings = frappe.get_single("BioClean Settings")
	if not settings.usd_to_lbp_rate:
		settings.usd_to_lbp_rate = DEFAULT_USD_TO_LBP_RATE
		settings.save(ignore_permissions=True)
	sync_currency_exchange_from_settings(settings.usd_to_lbp_rate)


def on_bioclean_settings_update(doc, method=None):
	"""Wired to BioClean Settings' on_update hook (see hooks.py) so changing
	the rate in Settings immediately updates the native Currency Exchange
	record every other part of the system (Price Lists, POS, Sales Invoice)
	reads from - one place to change the rate, not two."""
	if doc.usd_to_lbp_rate:
		sync_currency_exchange_from_settings(doc.usd_to_lbp_rate)


def sync_currency_exchange_from_settings(rate: float):
	"""Keep a native Currency Exchange record in sync with the persistent
	BioClean Settings rate, so native multi-currency Price Lists/Sales
	Invoices/Payment Entries pick it up automatically. Called again whenever
	the rate is changed (see BioClean Settings' on_update, wired below)."""
	from datetime import date

	existing = frappe.db.exists(
		"Currency Exchange",
		{"from_currency": "USD", "to_currency": "LBP", "date": date.today()},
	)
	if existing:
		doc = frappe.get_doc("Currency Exchange", existing)
	else:
		doc = frappe.new_doc("Currency Exchange")
		doc.date = date.today()
		doc.from_currency = "USD"
		doc.to_currency = "LBP"
	doc.exchange_rate = rate
	doc.for_buying = 1
	doc.for_selling = 1
	doc.save(ignore_permissions=True)


def set_up_warehouses():
	if not frappe.db.exists("Company", COMPANY_NAME):
		return

	root_group = f"All Warehouses - {COMPANY_ABBR}"
	if not frappe.db.exists("Warehouse", root_group):
		# Company was inserted but its default-warehouse creation hasn't run
		# yet in this transaction (shouldn't normally happen) - nothing to
		# attach "Vans" to, bail out rather than creating an orphan group.
		return

	for group_name in EXTRA_WAREHOUSE_GROUPS:
		full_name = f"{group_name} - {COMPANY_ABBR}"
		if not frappe.db.exists("Warehouse", full_name):
			wh = frappe.new_doc("Warehouse")
			wh.warehouse_name = group_name
			wh.company = COMPANY_NAME
			wh.is_group = 1
			wh.parent_warehouse = root_group
			wh.insert(ignore_permissions=True)


def set_up_cost_centers():
	if not frappe.db.exists("Company", COMPANY_NAME):
		return

	root_cost_center = frappe.db.get_value(
		"Cost Center", {"company": COMPANY_NAME, "is_group": 1, "parent_cost_center": ["is", "not set"]}, "name"
	)
	if not root_cost_center:
		return

	for group_name in COST_CENTER_GROUPS:
		full_name = f"{group_name} - {COMPANY_ABBR}"
		if not frappe.db.exists("Cost Center", full_name):
			cc = frappe.new_doc("Cost Center")
			cc.cost_center_name = group_name
			cc.company = COMPANY_NAME
			cc.parent_cost_center = root_cost_center
			cc.insert(ignore_permissions=True)


def set_up_price_lists():
	for pl_name in PRICE_LISTS:
		if not frappe.db.exists("Price List", pl_name):
			pl = frappe.new_doc("Price List")
			pl.price_list_name = pl_name
			pl.selling = 1
			pl.currency = DEFAULT_CURRENCY
			pl.insert(ignore_permissions=True)


def set_up_sales_invoice_naming_series():
	"""Adds our branded naming series (BC-2026-00001 style) as an option on
	Sales Invoice and makes it the default, via a Property Setter - the
	native way to extend a core DocType's field options without touching
	core code."""
	from frappe.custom.doctype.property_setter.property_setter import make_property_setter

	meta = frappe.get_meta("Sales Invoice")
	field = meta.get_field("naming_series")
	existing_options = (field.options or "").split("\n") if field else []
	if SALES_INVOICE_NAMING_SERIES not in existing_options:
		existing_options.insert(0, SALES_INVOICE_NAMING_SERIES)
		make_property_setter(
			"Sales Invoice",
			"naming_series",
			"options",
			"\n".join([o for o in existing_options if o]),
			"Text",
		)
		make_property_setter(
			"Sales Invoice",
			"naming_series",
			"default",
			SALES_INVOICE_NAMING_SERIES,
			"Text",
		)


def set_up_loyalty_program():
	if not frappe.db.exists("Company", COMPANY_NAME):
		return
	if frappe.db.exists("Loyalty Program", "BioClean Loyalty"):
		return

	program = frappe.new_doc("Loyalty Program")
	program.loyalty_program_name = "BioClean Loyalty"
	program.loyalty_program_type = "Single Tier Program"
	program.from_date = frappe.utils.today()
	program.company = COMPANY_NAME
	program.customer_group = None
	program.customer_territory = None
	program.expiry_duration = 365
	program.conversion_factor = 1
	program.append(
		"collection_rules",
		{
			"tier_name": "Standard",
			"min_spent": 0,
			"collection_factor": 1,  # 1 point per unit of base currency spent
		},
	)
	program.insert(ignore_permissions=True)


CASHIER_ROLE = "Cashier"
STORE_MANAGER_ROLE = "Store Manager"

# Only two roles are actually new. "Accountant" reuses ERPNext's native
# Accounts Manager role, and "Owner/Admin" is Frappe's own System Manager -
# native-first, per the project rule, rather than inventing parallel roles
# for things that already exist.
CASHIER_PERMISSIONS = {
	# doctype: (read, write, create, submit, cancel, delete)
	"Sales Invoice": (1, 1, 1, 1, 1, 0),  # full discretion on discounts/returns - confirmed decision
	"Customer": (1, 1, 1, 0, 0, 0),  # find-or-create at checkout
	"Item": (1, 0, 0, 0, 0, 0),  # browse the catalog, not edit it
	"POS Opening Entry": (1, 1, 1, 1, 0, 0),
	"POS Closing Entry": (1, 1, 1, 1, 0, 0),
}

STORE_MANAGER_PERMISSIONS = {
	**CASHIER_PERMISSIONS,
	"Item": (1, 1, 1, 0, 0, 0),  # manages the catalog/pricing (Inventory tab)
	"Purchase Order": (1, 1, 1, 1, 1, 0),
	"Purchase Receipt": (1, 1, 1, 1, 1, 0),
	"Purchase Invoice": (1, 1, 1, 1, 1, 0),
	"Supplier": (1, 1, 1, 0, 0, 0),
	"Stock Reconciliation": (1, 1, 1, 1, 1, 0),
	"Delivery Note": (1, 1, 1, 1, 1, 0),
	# Expenses tab backend: Journal Entry, not Expense Claim - Expense Claim
	# lives in the separate `hrms` app, which we're not installing (avoids an
	# extra app + a lot of unrelated HR/payroll scope for one confirmed
	# decision: log expenses freely, no approval gate). Journal Entry is
	# native to core Accounts and can be tagged to a Cost Center just as well.
	"Journal Entry": (1, 1, 1, 1, 0, 0),
}


def set_up_roles():
	"""Cashier and Store Manager are the only genuinely new roles - Accountant
	reuses ERPNext's native Accounts Manager, Owner/Admin is System Manager.
	Deliberately excludes BioClean Settings (the persistent exchange rate) -
	that stays System-Manager-only (see the DocType's own permissions),
	matching the plan's call to explicitly decide who can change the rate."""
	for role_name in (CASHIER_ROLE, STORE_MANAGER_ROLE):
		if not frappe.db.exists("Role", role_name):
			role = frappe.new_doc("Role")
			role.role_name = role_name
			role.desk_access = 1
			role.insert(ignore_permissions=True)

	_apply_role_permissions(CASHIER_ROLE, CASHIER_PERMISSIONS)
	_apply_role_permissions(STORE_MANAGER_ROLE, STORE_MANAGER_PERMISSIONS)


def _apply_role_permissions(role_name, permissions):
	from frappe.permissions import add_permission, update_permission_property

	for doctype, (read, write, create, submit, cancel, delete) in permissions.items():
		if not frappe.db.exists("Custom DocPerm", {"parent": doctype, "role": role_name}):
			add_permission(doctype, role_name, 0)
		for prop, value in (
			("read", read),
			("write", write),
			("create", create),
			("submit", submit),
			("cancel", cancel),
			("delete", delete),
		):
			update_permission_property(doctype, role_name, 0, prop, value)


ITEM_GROUPS = ["Disposables", "Hygiene Paper", "Cleaning Tools", "Bags & Containers"]


def set_up_item_groups():
	"""Catalog taxonomy beyond the default "Products" group - BioClean carries
	more than its own-brand chemicals (confirmed: disposables, hygiene paper/
	dispensers, cleaning tools, bags & containers, per the fuller factory
	catalogue). Structural, like the Warehouse/Cost Center trees, so it
	belongs in after_install rather than being seeded per-item catalog data."""
	for group_name in ITEM_GROUPS:
		if not frappe.db.exists("Item Group", group_name):
			ig = frappe.new_doc("Item Group")
			ig.item_group_name = group_name
			ig.parent_item_group = "All Item Groups"
			ig.insert(ignore_permissions=True)


def set_up_item_custom_fields():
	from frappe.custom.doctype.custom_field.custom_field import create_custom_field

	if not frappe.db.exists("Custom Field", "Item-shelf_location"):
		create_custom_field(
			"Item",
			{
				"fieldname": "shelf_location",
				"label": "Shelf Location",
				"fieldtype": "Data",
				"insert_after": "item_group",
				"description": "Where this item sits in-store (aisle/shelf) - ERPNext's Warehouse is store-level, not shelf-level.",
			},
		)
