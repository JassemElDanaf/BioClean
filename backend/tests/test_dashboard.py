ITEMS_URL = "/api/v1/items"
INVOICES_URL = "/api/v1/invoices"
SALES_URL = "/api/v1/pos/sales"
DASHBOARD_URL = "/api/v1/dashboard"


def make_item(client, **overrides):
	payload = {"item_name": "Widget", "barcode": "WIDGET-1", "cost_price": 2.0, "retail_price": 5.0, "initial_stock_qty": 20}
	payload.update(overrides)
	return client.post(ITEMS_URL, json=payload).json()


def test_empty_dashboard_has_zeroed_summary(client):
	res = client.get(f"{DASHBOARD_URL}/summary")
	assert res.status_code == 200
	body = res.json()
	assert body["sales_revenue"] == 0
	assert body["total_revenue"] == 0
	assert body["gross_profit"] == 0
	assert body["total_items"] == 0


def test_pos_sale_counts_as_revenue_and_profit(client):
	item = make_item(client)
	client.post(SALES_URL, json={"lines": [{"item_id": item["id"], "qty": 3}]})

	summary = client.get(f"{DASHBOARD_URL}/summary").json()
	assert summary["sales_revenue"] == 15.0  # 3 * $5 retail
	assert summary["sales_count"] == 1
	assert summary["cogs"] == 6.0  # 3 * $2 cost
	assert summary["gross_profit"] == 9.0
	assert summary["total_revenue"] == 15.0


def test_voided_sale_excluded_from_revenue(client):
	item = make_item(client)
	sale = client.post(SALES_URL, json={"lines": [{"item_id": item["id"], "qty": 2}]}).json()
	client.post(f"{SALES_URL}/{sale['id']}/void")

	summary = client.get(f"{DASHBOARD_URL}/summary").json()
	assert summary["sales_revenue"] == 0
	assert summary["sales_count"] == 0


def test_unpaid_invoice_excluded_but_paid_invoice_counts(client):
	item = make_item(client)
	unpaid = client.post(INVOICES_URL, json={"lines": [{"item_id": item["id"], "qty": 1}]}).json()
	paid = client.post(INVOICES_URL, json={"lines": [{"item_id": item["id"], "qty": 2}]}).json()
	client.post(f"{INVOICES_URL}/{paid['id']}/mark-paid")

	summary = client.get(f"{DASHBOARD_URL}/summary").json()
	assert summary["invoice_revenue"] == 10.0  # only the paid one (2 * $5)
	assert summary["unpaid_invoices_count"] == 1
	assert summary["unpaid_invoices_total"] == 5.0
	# Confirm the unpaid one really is `unpaid` (sanity on the fixture itself).
	assert unpaid["status"] == "unpaid"


def test_date_range_filters_revenue_but_not_inventory(client):
	item = make_item(client, initial_stock_qty=5, reorder_level=10)

	from_far_future = "2099-01-01"
	summary = client.get(f"{DASHBOARD_URL}/summary?from_date={from_far_future}").json()
	# No sale could possibly be in this range yet.
	assert summary["sales_revenue"] == 0
	# But inventory figures are always live/point-in-time, unaffected by the range.
	assert summary["total_items"] == 1
	assert summary["low_stock_count"] == 1


def test_low_stock_and_out_of_stock_are_mutually_exclusive(client):
	make_item(client, barcode="LOW-1", initial_stock_qty=2, reorder_level=10)
	make_item(client, barcode="ZERO-1", initial_stock_qty=0, reorder_level=10)

	summary = client.get(f"{DASHBOARD_URL}/summary").json()
	assert summary["low_stock_count"] == 1
	assert summary["out_of_stock_count"] == 1


def test_inventory_value_matches_qty_times_cost(client):
	make_item(client, cost_price=3.0, initial_stock_qty=10)
	summary = client.get(f"{DASHBOARD_URL}/summary").json()
	assert summary["total_inventory_value"] == 30.0
