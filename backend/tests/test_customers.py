CUSTOMERS_URL = "/api/v1/customers"
ITEMS_URL = "/api/v1/items"
INVOICES_URL = "/api/v1/invoices"


def make_item(client, **overrides):
	payload = {"item_name": "Widget", "barcode": "WIDGET-1", "retail_price": 10.0, "wholesale_price": 7.0, "initial_stock_qty": 20}
	payload.update(overrides)
	return client.post(ITEMS_URL, json=payload).json()


def test_list_customers_respects_limit(client):
	for i in range(5):
		client.post(CUSTOMERS_URL, json={"name": f"Customer {i}"})
	res = client.get(f"{CUSTOMERS_URL}?limit=3")
	assert len(res.json()) == 3


def test_create_and_list_customer(client):
	res = client.post(CUSTOMERS_URL, json={"name": "Acme Hotel", "is_wholesale": True})
	assert res.status_code == 201
	assert res.json()["is_wholesale"] is True

	res = client.get(CUSTOMERS_URL)
	assert [c["name"] for c in res.json()] == ["Acme Hotel"]


def test_duplicate_customer_names_allowed(client):
	"""Unlike Supplier, Customer.name isn't unique - two real customers can
	share a name."""
	client.post(CUSTOMERS_URL, json={"name": "Ahmad"})
	res = client.post(CUSTOMERS_URL, json={"name": "Ahmad"})
	assert res.status_code == 201
	assert len(client.get(CUSTOMERS_URL).json()) == 2


def test_search_by_name_or_phone(client):
	client.post(CUSTOMERS_URL, json={"name": "Acme Hotel", "phone": "71000000"})
	client.post(CUSTOMERS_URL, json={"name": "Beta Cafe", "phone": "71999999"})

	assert [c["name"] for c in client.get(f"{CUSTOMERS_URL}?q=acme").json()] == ["Acme Hotel"]
	assert [c["name"] for c in client.get(f"{CUSTOMERS_URL}?q=71999999").json()] == ["Beta Cafe"]


def test_delete_unused_customer(client):
	created = client.post(CUSTOMERS_URL, json={"name": "Acme Hotel"}).json()
	res = client.delete(f"{CUSTOMERS_URL}/{created['id']}")
	assert res.status_code == 204


def test_delete_customer_with_invoice_history_detaches_but_preserves_it(client):
	"""Deleting a customer with invoice history is allowed - Invoice
	already snapshots customer_name at creation time, so the invoice keeps
	showing who it was billed to with customer_id simply nulled out."""
	item = make_item(client)
	customer = client.post(CUSTOMERS_URL, json={"name": "Acme Hotel"}).json()
	invoice = client.post(INVOICES_URL, json={"customer_id": customer["id"], "lines": [{"item_id": item["id"], "qty": 1}]}).json()

	res = client.delete(f"{CUSTOMERS_URL}/{customer['id']}")
	assert res.status_code == 204

	invoice_after = client.get(f"{INVOICES_URL}/{invoice['id']}").json()
	assert invoice_after["customer_id"] is None
	assert invoice_after["customer_name"] == "Acme Hotel"


def test_new_customer_has_zero_balance(client):
	res = client.post(CUSTOMERS_URL, json={"name": "Acme Hotel"})
	assert res.json()["balance"] == 0.0


def test_balance_reflects_unpaid_invoices_only(client):
	item = make_item(client)
	customer = client.post(CUSTOMERS_URL, json={"name": "Acme Hotel"}).json()
	unpaid = client.post(INVOICES_URL, json={"customer_id": customer["id"], "lines": [{"item_id": item["id"], "qty": 2}]}).json()  # $20
	paid = client.post(INVOICES_URL, json={"customer_id": customer["id"], "lines": [{"item_id": item["id"], "qty": 3}]}).json()  # $30
	client.post(f"{INVOICES_URL}/{paid['id']}/mark-paid")

	customers = client.get(CUSTOMERS_URL).json()
	acme = next(c for c in customers if c["id"] == customer["id"])
	assert acme["balance"] == 20.0  # only the unpaid invoice
	assert unpaid["status"] == "unpaid"


def test_customers_export_csv_includes_balance(client):
	item = make_item(client)
	customer = client.post(CUSTOMERS_URL, json={"name": "Acme Hotel"}).json()
	client.post(INVOICES_URL, json={"customer_id": customer["id"], "lines": [{"item_id": item["id"], "qty": 1}]})

	res = client.get(f"{CUSTOMERS_URL}/export/csv")
	assert res.status_code == 200
	body = res.content.decode("utf-8-sig")
	assert "Acme Hotel" in body
	assert "10" in body  # 1 * $10 retail balance owed
