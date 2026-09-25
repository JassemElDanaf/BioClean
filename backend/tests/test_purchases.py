ITEMS_URL = "/api/v1/items"
SUPPLIERS_URL = "/api/v1/suppliers"
PURCHASES_URL = "/api/v1/purchases"


def make_item(client, **overrides):
	payload = {"item_name": "Widget", "barcode": "WIDGET-1", "cost_price": 3.0, "initial_stock_qty": 10}
	payload.update(overrides)
	return client.post(ITEMS_URL, json=payload).json()


def make_supplier(client, **overrides):
	payload = {"name": "Acme Supplier"}
	payload.update(overrides)
	return client.post(SUPPLIERS_URL, json=payload).json()


def test_list_filters_by_date_range(client):
	item = make_item(client)
	supplier = make_supplier(client)
	client.post(PURCHASES_URL, json={"supplier_id": supplier["id"], "lines": [{"item_id": item["id"], "qty": 1}]})

	from datetime import datetime, timedelta

	tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
	yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")

	assert client.get(f"{PURCHASES_URL}?from_date={tomorrow}").json() == []
	res = client.get(f"{PURCHASES_URL}?from_date={yesterday}")
	assert len(res.json()) == 1


def test_create_po_does_not_touch_stock(client):
	item = make_item(client)
	supplier = make_supplier(client)

	res = client.post(PURCHASES_URL, json={"supplier_id": supplier["id"], "lines": [{"item_id": item["id"], "qty": 20, "unit_cost": 2.5}]})
	assert res.status_code == 201, res.text
	po = res.json()
	assert po["status"] == "pending"
	assert po["total"] == 50.0

	assert client.get(f"{ITEMS_URL}/{item['id']}").json()["stock_qty"] == 10


def test_po_defaults_unit_cost_to_item_cost_price(client):
	item = make_item(client, cost_price=4.25)
	supplier = make_supplier(client)
	res = client.post(PURCHASES_URL, json={"supplier_id": supplier["id"], "lines": [{"item_id": item["id"], "qty": 1}]})
	assert res.json()["lines"][0]["unit_cost"] == 4.25


def test_receive_adds_stock_and_updates_cost_price(client):
	item = make_item(client, cost_price=3.0, initial_stock_qty=10)
	supplier = make_supplier(client)
	po = client.post(PURCHASES_URL, json={"supplier_id": supplier["id"], "lines": [{"item_id": item["id"], "qty": 20, "unit_cost": 2.5}]}).json()

	res = client.post(f"{PURCHASES_URL}/{po['id']}/receive")
	assert res.status_code == 200
	assert res.json()["status"] == "received"

	updated_item = client.get(f"{ITEMS_URL}/{item['id']}").json()
	assert updated_item["stock_qty"] == 30
	assert updated_item["cost_price"] == 2.5


def test_receive_after_item_deleted_does_not_crash(client):
	"""The item's own stock history goes away when it's deleted (see
	items/service.py:delete_item()) - nothing left to receive stock
	against, so this line is just skipped rather than crashing on a null
	item."""
	item = make_item(client)
	supplier = make_supplier(client)
	po = client.post(PURCHASES_URL, json={"supplier_id": supplier["id"], "lines": [{"item_id": item["id"], "qty": 5}]}).json()
	client.delete(f"{ITEMS_URL}/{item['id']}")

	res = client.post(f"{PURCHASES_URL}/{po['id']}/receive")
	assert res.status_code == 200
	assert res.json()["status"] == "received"


def test_receive_twice_is_rejected(client):
	item = make_item(client)
	supplier = make_supplier(client)
	po = client.post(PURCHASES_URL, json={"supplier_id": supplier["id"], "lines": [{"item_id": item["id"], "qty": 1}]}).json()
	client.post(f"{PURCHASES_URL}/{po['id']}/receive")

	res = client.post(f"{PURCHASES_URL}/{po['id']}/receive")
	assert res.status_code == 409


def test_cancel_pending_po(client):
	item = make_item(client)
	supplier = make_supplier(client)
	po = client.post(PURCHASES_URL, json={"supplier_id": supplier["id"], "lines": [{"item_id": item["id"], "qty": 1}]}).json()

	res = client.post(f"{PURCHASES_URL}/{po['id']}/cancel")
	assert res.status_code == 200
	assert res.json()["status"] == "cancelled"


def test_cancel_received_po_is_rejected(client):
	item = make_item(client)
	supplier = make_supplier(client)
	po = client.post(PURCHASES_URL, json={"supplier_id": supplier["id"], "lines": [{"item_id": item["id"], "qty": 1}]}).json()
	client.post(f"{PURCHASES_URL}/{po['id']}/receive")

	res = client.post(f"{PURCHASES_URL}/{po['id']}/cancel")
	assert res.status_code == 409


def test_create_po_rejects_unknown_supplier(client):
	item = make_item(client)
	res = client.post(PURCHASES_URL, json={"supplier_id": 999999, "lines": [{"item_id": item["id"], "qty": 1}]})
	assert res.status_code == 404


def test_new_po_is_unpaid(client):
	item = make_item(client)
	supplier = make_supplier(client)
	po = client.post(PURCHASES_URL, json={"supplier_id": supplier["id"], "lines": [{"item_id": item["id"], "qty": 1}]}).json()
	assert po["payment_status"] == "unpaid"


def test_mark_paid_requires_received_status(client):
	item = make_item(client)
	supplier = make_supplier(client)
	po = client.post(PURCHASES_URL, json={"supplier_id": supplier["id"], "lines": [{"item_id": item["id"], "qty": 1}]}).json()

	res = client.post(f"{PURCHASES_URL}/{po['id']}/mark-paid")
	assert res.status_code == 409


def test_mark_paid_after_receive(client):
	item = make_item(client)
	supplier = make_supplier(client)
	po = client.post(PURCHASES_URL, json={"supplier_id": supplier["id"], "lines": [{"item_id": item["id"], "qty": 1}]}).json()
	client.post(f"{PURCHASES_URL}/{po['id']}/receive")

	res = client.post(f"{PURCHASES_URL}/{po['id']}/mark-paid")
	assert res.status_code == 200
	assert res.json()["payment_status"] == "paid"


def test_mark_paid_twice_rejected(client):
	item = make_item(client)
	supplier = make_supplier(client)
	po = client.post(PURCHASES_URL, json={"supplier_id": supplier["id"], "lines": [{"item_id": item["id"], "qty": 1}]}).json()
	client.post(f"{PURCHASES_URL}/{po['id']}/receive")
	client.post(f"{PURCHASES_URL}/{po['id']}/mark-paid")

	res = client.post(f"{PURCHASES_URL}/{po['id']}/mark-paid")
	assert res.status_code == 409


def test_supplier_balance_reflects_received_unpaid_pos_only(client):
	item = make_item(client, cost_price=5.0)
	supplier = make_supplier(client)

	pending = client.post(PURCHASES_URL, json={"supplier_id": supplier["id"], "lines": [{"item_id": item["id"], "qty": 2, "unit_cost": 5.0}]}).json()
	received_unpaid = client.post(PURCHASES_URL, json={"supplier_id": supplier["id"], "lines": [{"item_id": item["id"], "qty": 3, "unit_cost": 5.0}]}).json()
	client.post(f"{PURCHASES_URL}/{received_unpaid['id']}/receive")
	received_paid = client.post(PURCHASES_URL, json={"supplier_id": supplier["id"], "lines": [{"item_id": item["id"], "qty": 4, "unit_cost": 5.0}]}).json()
	client.post(f"{PURCHASES_URL}/{received_paid['id']}/receive")
	client.post(f"{PURCHASES_URL}/{received_paid['id']}/mark-paid")

	suppliers = client.get(SUPPLIERS_URL).json()
	acme = next(s for s in suppliers if s["id"] == supplier["id"])
	assert acme["balance"] == 15.0  # only received_unpaid: 3 * 5.0
	assert pending["status"] == "pending"


def test_suppliers_export_csv_includes_balance(client):
	item = make_item(client, cost_price=5.0)
	supplier = make_supplier(client)
	po = client.post(PURCHASES_URL, json={"supplier_id": supplier["id"], "lines": [{"item_id": item["id"], "qty": 2, "unit_cost": 5.0}]}).json()
	client.post(f"{PURCHASES_URL}/{po['id']}/receive")

	res = client.get(f"{SUPPLIERS_URL}/export/csv")
	assert res.status_code == 200
	body = res.content.decode("utf-8-sig")
	assert "Acme Supplier" in body
	assert "10" in body  # 2 * 5.0 balance owed
