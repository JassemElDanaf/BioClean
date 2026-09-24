ITEMS_URL = "/api/v1/items"
QUOTATIONS_URL = "/api/v1/quotations"


def make_item(client, **overrides):
	payload = {"item_name": "Widget", "barcode": "WIDGET-1", "retail_price": 10.0, "wholesale_price": 7.0, "initial_stock_qty": 20}
	payload.update(overrides)
	return client.post(ITEMS_URL, json=payload).json()


def test_list_filters_by_date_range(client):
	item = make_item(client)
	client.post(QUOTATIONS_URL, json={"lines": [{"item_id": item["id"], "qty": 1}]})

	from datetime import datetime, timedelta

	tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
	yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")

	assert client.get(f"{QUOTATIONS_URL}?from_date={tomorrow}").json() == []
	res = client.get(f"{QUOTATIONS_URL}?from_date={yesterday}")
	assert len(res.json()) == 1


def test_quotation_creation_does_not_touch_stock(client):
	item = make_item(client)
	res = client.post(QUOTATIONS_URL, json={"lines": [{"item_id": item["id"], "qty": 5}]})
	assert res.status_code == 201, res.text
	assert res.json()["status"] == "draft"
	assert res.json()["total"] == 50.0

	assert client.get(f"{ITEMS_URL}/{item['id']}").json()["stock_qty"] == 20


def test_convert_creates_unpaid_invoice_without_touching_stock(client):
	"""convert_to_invoice() delegates to invoicing.service.create_invoice(),
	which no longer touches stock at creation (see test_invoicing.py) - the
	resulting invoice starts "unpaid" just like a hand-created one, and
	only actually deducts stock once *that* invoice is marked paid."""
	item = make_item(client)
	quotation = client.post(QUOTATIONS_URL, json={"lines": [{"item_id": item["id"], "qty": 3}]}).json()

	res = client.post(f"{QUOTATIONS_URL}/{quotation['id']}/convert")
	assert res.status_code == 200, res.text
	invoice = res.json()
	assert invoice["status"] == "unpaid"
	assert invoice["total"] == 30.0
	assert invoice["lines"][0]["qty"] == 3

	assert client.get(f"{ITEMS_URL}/{item['id']}").json()["stock_qty"] == 20

	updated_quote = client.get(f"{QUOTATIONS_URL}/{quotation['id']}").json()
	assert updated_quote["status"] == "converted"
	assert updated_quote["converted_invoice_id"] == invoice["id"]

	client.post(f"/api/v1/invoices/{invoice['id']}/mark-paid")
	assert client.get(f"{ITEMS_URL}/{item['id']}").json()["stock_qty"] == 17


def test_convert_twice_is_rejected(client):
	item = make_item(client)
	quotation = client.post(QUOTATIONS_URL, json={"lines": [{"item_id": item["id"], "qty": 1}]}).json()
	client.post(f"{QUOTATIONS_URL}/{quotation['id']}/convert")

	res = client.post(f"{QUOTATIONS_URL}/{quotation['id']}/convert")
	assert res.status_code == 409


def test_delete_draft_quotation(client):
	item = make_item(client)
	quotation = client.post(QUOTATIONS_URL, json={"lines": [{"item_id": item["id"], "qty": 1}]}).json()
	res = client.delete(f"{QUOTATIONS_URL}/{quotation['id']}")
	assert res.status_code == 204


def test_delete_converted_quotation_is_blocked(client):
	item = make_item(client)
	quotation = client.post(QUOTATIONS_URL, json={"lines": [{"item_id": item["id"], "qty": 1}]}).json()
	client.post(f"{QUOTATIONS_URL}/{quotation['id']}/convert")

	res = client.delete(f"{QUOTATIONS_URL}/{quotation['id']}")
	assert res.status_code == 409


def test_convert_preserves_quoted_price_even_if_retail_price_changed_since(client):
	item = make_item(client, retail_price=10.0)
	quotation = client.post(QUOTATIONS_URL, json={"lines": [{"item_id": item["id"], "qty": 1}]}).json()
	assert quotation["lines"][0]["unit_price"] == 10.0

	# Price goes up after the quote was made.
	client.put(
		f"{ITEMS_URL}/{item['id']}",
		json={"item_name": item["item_name"], "barcode": item["barcode"], "retail_price": 999.0, "wholesale_price": item["wholesale_price"]},
	)

	res = client.post(f"{QUOTATIONS_URL}/{quotation['id']}/convert")
	assert res.json()["lines"][0]["unit_price"] == 10.0
