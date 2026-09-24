SUPPLIERS_URL = "/api/v1/suppliers"
ITEMS_URL = "/api/v1/items"


def test_create_and_list_supplier(client):
	res = client.post(SUPPLIERS_URL, json={"name": "Acme Co", "phone": "71000000"})
	assert res.status_code == 201
	assert res.json()["name"] == "Acme Co"

	res = client.get(SUPPLIERS_URL)
	assert [s["name"] for s in res.json()] == ["Acme Co"]


def test_create_duplicate_name_rejected(client):
	client.post(SUPPLIERS_URL, json={"name": "Acme Co"})
	res = client.post(SUPPLIERS_URL, json={"name": "Acme Co"})
	assert res.status_code == 409


def test_update_supplier(client):
	created = client.post(SUPPLIERS_URL, json={"name": "Acme Co"}).json()
	res = client.put(f"{SUPPLIERS_URL}/{created['id']}", json={"name": "Acme Corp", "phone": "71111111"})
	assert res.status_code == 200
	assert res.json() == {"id": created["id"], "name": "Acme Corp", "phone": "71111111", "email": None}


def test_update_supplier_to_existing_name_rejected(client):
	client.post(SUPPLIERS_URL, json={"name": "Acme Co"})
	other = client.post(SUPPLIERS_URL, json={"name": "Other Co"}).json()
	res = client.put(f"{SUPPLIERS_URL}/{other['id']}", json={"name": "Acme Co"})
	assert res.status_code == 409


def test_delete_unused_supplier(client):
	created = client.post(SUPPLIERS_URL, json={"name": "Acme Co"}).json()
	res = client.delete(f"{SUPPLIERS_URL}/{created['id']}")
	assert res.status_code == 204
	assert client.get(SUPPLIERS_URL).json() == []


def test_delete_supplier_in_use_is_blocked(client):
	supplier = client.post(SUPPLIERS_URL, json={"name": "Acme Co"}).json()
	item = client.post(ITEMS_URL, json={"item_name": "Widget", "barcode": "W-1"}).json()
	client.post("/api/v1/purchases", json={"supplier_id": supplier["id"], "lines": [{"item_id": item["id"], "qty": 1}]})

	res = client.delete(f"{SUPPLIERS_URL}/{supplier['id']}")
	assert res.status_code == 409
	assert client.get(SUPPLIERS_URL).json() != []
