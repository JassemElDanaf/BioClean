ITEMS_URL = "/api/v1/items"
SALES_URL = "/api/v1/pos/sales"
INVOICES_URL = "/api/v1/invoices"
INCOME_URL = "/api/v1/income"
REVENUE_URL = "/api/v1/reports/revenue-history"


def make_item(client, **overrides):
	payload = {"item_name": "Widget", "barcode": "WIDGET-1", "cost_price": 2.0, "retail_price": 5.0, "initial_stock_qty": 20}
	payload.update(overrides)
	return client.post(ITEMS_URL, json=payload).json()


def test_empty_revenue_history(client):
	res = client.get(REVENUE_URL)
	assert res.status_code == 200
	assert res.json() == []
	assert res.headers["X-Total-Count"] == "0"


def test_includes_pos_sale(client):
	item = make_item(client)
	sale = client.post(SALES_URL, json={"lines": [{"item_id": item["id"], "qty": 3}]}).json()

	entries = client.get(REVENUE_URL).json()
	assert len(entries) == 1
	assert entries[0]["type"] == "pos_sale"
	assert entries[0]["reference"] == f"SALE-{sale['id']}"
	assert entries[0]["amount"] == 15.0


def test_unpaid_invoice_excluded_but_paid_invoice_included(client):
	item = make_item(client)
	unpaid = client.post(INVOICES_URL, json={"lines": [{"item_id": item["id"], "qty": 1}]}).json()
	paid = client.post(INVOICES_URL, json={"lines": [{"item_id": item["id"], "qty": 2}]}).json()
	client.post(f"{INVOICES_URL}/{paid['id']}/mark-paid")

	entries = client.get(REVENUE_URL).json()
	refs = [e["reference"] for e in entries]
	assert f"INV-{paid['id']}" in refs
	assert f"INV-{unpaid['id']}" not in refs


def test_income_entry_included(client):
	client.post(INCOME_URL, json={"source": "interest", "amount": 12.5})

	entries = client.get(REVENUE_URL).json()
	assert len(entries) == 1
	assert entries[0]["type"] == "income"
	assert entries[0]["amount"] == 12.5


def test_all_three_sources_merged_and_sorted_desc(client):
	item = make_item(client)
	client.post(SALES_URL, json={"lines": [{"item_id": item["id"], "qty": 1}]})
	invoice = client.post(INVOICES_URL, json={"lines": [{"item_id": item["id"], "qty": 1}]}).json()
	client.post(f"{INVOICES_URL}/{invoice['id']}/mark-paid")
	client.post(INCOME_URL, json={"source": "misc", "amount": 3})

	res = client.get(REVENUE_URL)
	entries = res.json()
	assert res.headers["X-Total-Count"] == "3"
	assert len(entries) == 3
	types = {e["type"] for e in entries}
	assert types == {"pos_sale", "invoice", "income"}
	occurred_ats = [e["occurred_at"] for e in entries]
	assert occurred_ats == sorted(occurred_ats, reverse=True)


def test_voided_sale_still_listed_but_flagged(client):
	item = make_item(client)
	sale = client.post(SALES_URL, json={"lines": [{"item_id": item["id"], "qty": 1}]}).json()
	client.post(f"{SALES_URL}/{sale['id']}/void")

	entries = client.get(REVENUE_URL).json()
	assert len(entries) == 1
	assert entries[0]["voided"] is True


def test_date_range_excludes_out_of_range_entries(client):
	item = make_item(client)
	client.post(SALES_URL, json={"lines": [{"item_id": item["id"], "qty": 1}]})

	from_far_future = "2099-01-01"
	entries = client.get(f"{REVENUE_URL}?from_date={from_far_future}").json()
	assert entries == []
