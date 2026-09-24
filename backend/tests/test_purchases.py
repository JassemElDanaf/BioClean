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
