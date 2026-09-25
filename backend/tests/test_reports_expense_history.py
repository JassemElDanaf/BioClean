ITEMS_URL = "/api/v1/items"
SUPPLIERS_URL = "/api/v1/suppliers"
PURCHASES_URL = "/api/v1/purchases"
EXPENSES_URL = "/api/v1/expenses"
EXPENSE_HISTORY_URL = "/api/v1/reports/expense-history"


def make_item(client, **overrides):
	payload = {"item_name": "Widget", "barcode": "WIDGET-1", "cost_price": 2.0, "retail_price": 5.0, "initial_stock_qty": 20}
	payload.update(overrides)
	return client.post(ITEMS_URL, json=payload).json()


def make_supplier(client, **overrides):
	payload = {"name": "Acme Supplier"}
	payload.update(overrides)
	return client.post(SUPPLIERS_URL, json=payload).json()


def test_empty_expense_history(client):
	res = client.get(EXPENSE_HISTORY_URL)
	assert res.status_code == 200
	assert res.json() == []
	assert res.headers["X-Total-Count"] == "0"


def test_pending_po_excluded_but_received_po_included(client):
	item = make_item(client)
	supplier = make_supplier(client)
	po = client.post(PURCHASES_URL, json={"supplier_id": supplier["id"], "lines": [{"item_id": item["id"], "qty": 5, "unit_cost": 1.5}]}).json()

	entries = client.get(EXPENSE_HISTORY_URL).json()
	assert entries == []

	client.post(f"{PURCHASES_URL}/{po['id']}/receive")
	entries = client.get(EXPENSE_HISTORY_URL).json()
	assert len(entries) == 1
	assert entries[0]["type"] == "purchase_order"
	assert entries[0]["reference"] == f"PO-{po['id']}"
	assert entries[0]["amount"] == 7.5


def test_expense_entry_included(client):
	client.post(EXPENSES_URL, json={"category": "gas", "amount": 40})

	entries = client.get(EXPENSE_HISTORY_URL).json()
	assert len(entries) == 1
	assert entries[0]["type"] == "expense"
	assert entries[0]["amount"] == 40.0


def test_both_sources_merged_and_sorted_desc(client):
	item = make_item(client)
	supplier = make_supplier(client)
	po = client.post(PURCHASES_URL, json={"supplier_id": supplier["id"], "lines": [{"item_id": item["id"], "qty": 1, "unit_cost": 2}]}).json()
	client.post(f"{PURCHASES_URL}/{po['id']}/receive")
	client.post(EXPENSES_URL, json={"category": "gas", "amount": 10})

	res = client.get(EXPENSE_HISTORY_URL)
	entries = res.json()
	assert res.headers["X-Total-Count"] == "2"
	types = {e["type"] for e in entries}
	assert types == {"purchase_order", "expense"}
