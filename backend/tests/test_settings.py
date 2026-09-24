SETTINGS_URL = "/api/v1/settings"


def test_tax_rate_defaults_to_zero(client):
	res = client.get(f"{SETTINGS_URL}/tax-rate")
	assert res.status_code == 200
	assert res.json()["tax_rate"] == 0


def test_update_tax_rate(client):
	res = client.put(f"{SETTINGS_URL}/tax-rate", json={"tax_rate": 11})
	assert res.status_code == 200
	assert res.json()["tax_rate"] == 11

	assert client.get(f"{SETTINGS_URL}/tax-rate").json()["tax_rate"] == 11


def test_tax_rate_rejects_out_of_range(client):
	assert client.put(f"{SETTINGS_URL}/tax-rate", json={"tax_rate": -1}).status_code == 422
	assert client.put(f"{SETTINGS_URL}/tax-rate", json={"tax_rate": 101}).status_code == 422


def test_exchange_rate_and_tax_rate_are_independent(client):
	client.put(f"{SETTINGS_URL}/exchange-rate", json={"usd_to_lbp_rate": 90000})
	client.put(f"{SETTINGS_URL}/tax-rate", json={"tax_rate": 5})

	assert client.get(f"{SETTINGS_URL}/exchange-rate").json()["usd_to_lbp_rate"] == 90000
	assert client.get(f"{SETTINGS_URL}/tax-rate").json()["tax_rate"] == 5


def test_exchange_rate_change_is_logged_to_history(client):
	# Fetching the current rate bootstraps the first history entry.
	client.get(f"{SETTINGS_URL}/exchange-rate")
	client.put(f"{SETTINGS_URL}/exchange-rate", json={"usd_to_lbp_rate": 91000})
	client.put(f"{SETTINGS_URL}/exchange-rate", json={"usd_to_lbp_rate": 92000})

	history = client.get(f"{SETTINGS_URL}/exchange-rate/history").json()
	rates = [h["usd_to_lbp_rate"] for h in history]
	assert 92000 in rates
	assert 91000 in rates
	# Newest first.
	assert history[0]["usd_to_lbp_rate"] == 92000


def test_invoice_and_sale_keep_their_original_exchange_rate(client):
	"""The whole point: changing today's rate must never rewrite what an
	already-created invoice or sale shows for its own rate."""
	client.put(f"{SETTINGS_URL}/exchange-rate", json={"usd_to_lbp_rate": 90000})

	item = client.post("/api/v1/items", json={"item_name": "Widget", "barcode": "FX-1", "retail_price": 10.0, "initial_stock_qty": 5}).json()
	invoice = client.post("/api/v1/invoices", json={"lines": [{"item_id": item["id"], "qty": 1}]}).json()
	sale = client.post("/api/v1/pos/sales", json={"lines": [{"item_id": item["id"], "qty": 1}]}).json()

	assert invoice["exchange_rate"] == 90000
	assert sale["exchange_rate"] == 90000

	# Rate moves after the fact - neither historical record should budge.
	client.put(f"{SETTINGS_URL}/exchange-rate", json={"usd_to_lbp_rate": 95000})

	assert client.get(f"/api/v1/invoices/{invoice['id']}").json()["exchange_rate"] == 90000
	assert client.get(f"/api/v1/pos/sales/{sale['id']}").json()["exchange_rate"] == 90000
