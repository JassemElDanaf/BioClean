ITEMS_URL = "/api/v1/items"
INVOICES_URL = "/api/v1/invoices"
SALES_URL = "/api/v1/pos/sales"
DASHBOARD_URL = "/api/v1/dashboard"
EXPENSES_URL = "/api/v1/expenses"
INCOME_URL = "/api/v1/income"
SUPPLIERS_URL = "/api/v1/suppliers"
PURCHASES_URL = "/api/v1/purchases"


def make_item(client, **overrides):
	payload = {"item_name": "Widget", "barcode": "WIDGET-1", "cost_price": 2.0, "retail_price": 5.0, "initial_stock_qty": 20}
	payload.update(overrides)
	return client.post(ITEMS_URL, json=payload).json()


def make_supplier(client, **overrides):
	payload = {"name": "Acme Supplier"}
	payload.update(overrides)
	return client.post(SUPPLIERS_URL, json=payload).json()


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


def test_return_reduces_revenue_and_cogs(client):
	"""A return isn't real revenue for the returned portion any more (see
	pos/service.py:create_return()) - the Dashboard has to net it out or
	Total Revenue would keep counting money that was actually refunded."""
	item = make_item(client, cost_price=2.0)
	sale = client.post(SALES_URL, json={"lines": [{"item_id": item["id"], "qty": 5}]}).json()
	line_id = sale["lines"][0]["id"]

	summary_before = client.get(f"{DASHBOARD_URL}/summary").json()
	assert summary_before["sales_revenue"] == 25.0  # 5 * $5
	assert summary_before["cogs"] == 10.0  # 5 * $2

	client.post(f"{SALES_URL}/{sale['id']}/return", json={"lines": [{"sale_line_id": line_id, "qty": 2}]})

	summary_after = client.get(f"{DASHBOARD_URL}/summary").json()
	assert summary_after["sales_revenue"] == 15.0  # 25 - (2 * $5)
	assert summary_after["cogs"] == 6.0  # (5 - 2) * $2
	assert summary_after["total_revenue"] == 15.0
	assert summary_after["gross_profit"] == 9.0


def test_manual_income_and_expenses_feed_net_profit(client):
	item = make_item(client, cost_price=2.0)
	client.post(SALES_URL, json={"lines": [{"item_id": item["id"], "qty": 1}]})  # $5 revenue, $2 cogs
	client.post(INCOME_URL, json={"source": "Bank Interest", "amount": 50.0})
	client.post(EXPENSES_URL, json={"category": "Rent", "amount": 20.0})

	summary = client.get(f"{DASHBOARD_URL}/summary").json()
	assert summary["manual_income"] == 50.0
	assert summary["expenses_total"] == 20.0
	assert summary["total_revenue"] == 55.0  # 5 sales + 50 manual income
	assert summary["gross_profit"] == 53.0  # 55 - 2 cogs
	assert summary["net_profit"] == 33.0  # 53 - 20 expenses


def test_purchases_total_reflects_received_pos_not_pending_and_excluded_from_net_profit(client):
	"""Cash spent restocking - a received PO counts once (received_at), a
	still-pending one hasn't cost anything yet, and this figure must never
	subtract from net_profit (see service.py's docstring: it would double-
	count against COGS the moment the stock actually sells)."""
	item = make_item(client, cost_price=2.0)
	supplier = make_supplier(client)

	pending = client.post(PURCHASES_URL, json={"supplier_id": supplier["id"], "lines": [{"item_id": item["id"], "qty": 10, "unit_cost": 2.0}]}).json()
	received = client.post(PURCHASES_URL, json={"supplier_id": supplier["id"], "lines": [{"item_id": item["id"], "qty": 5, "unit_cost": 2.0}]}).json()
	client.post(f"{PURCHASES_URL}/{received['id']}/receive")

	summary = client.get(f"{DASHBOARD_URL}/summary").json()
	assert summary["purchases_total"] == 10.0  # only the received one: 5 * $2
	assert pending["status"] == "pending"
	# Nothing was sold, so revenue/cogs/expenses are all zero - net_profit
	# must be zero too, not -10 (which it would be if purchases_total had
	# leaked into the calculation).
	assert summary["net_profit"] == 0.0


def test_insights_trend_includes_today_with_correct_revenue(client):
	item = make_item(client)
	client.post(SALES_URL, json={"lines": [{"item_id": item["id"], "qty": 2}]})  # $10

	from datetime import datetime, timezone

	insights = client.get(f"{DASHBOARD_URL}/insights").json()
	assert len(insights["trend"]) == 14
	today_utc = datetime.now(timezone.utc).date().isoformat()
	today = next(p for p in insights["trend"] if p["date"] == today_utc)
	assert today["revenue"] == 10.0


def test_insights_trend_ignores_the_summary_date_filter(client):
	"""The trend is a fixed rolling 14-day window, independent of
	from_date/to_date - a single-day KPI selection must not collapse it
	into a one-point chart."""
	item = make_item(client)
	client.post(SALES_URL, json={"lines": [{"item_id": item["id"], "qty": 1}]})

	from datetime import date, timedelta

	far_future = (date.today() + timedelta(days=5)).isoformat()
	insights = client.get(f"{DASHBOARD_URL}/insights?from_date={far_future}").json()
	assert len(insights["trend"]) == 14


def test_insights_payment_breakdown_groups_by_method(client):
	item = make_item(client)
	client.post(SALES_URL, json={"lines": [{"item_id": item["id"], "qty": 1}], "payment_method": "cash"})  # $5
	client.post(SALES_URL, json={"lines": [{"item_id": item["id"], "qty": 2}], "payment_method": "cash"})  # $10
	client.post(SALES_URL, json={"lines": [{"item_id": item["id"], "qty": 1}], "payment_method": "whish"})  # $5

	insights = client.get(f"{DASHBOARD_URL}/insights").json()
	by_method = {row["payment_method"]: row for row in insights["payment_breakdown"]}
	assert by_method["cash"]["total"] == 15.0
	assert by_method["cash"]["count"] == 2
	assert by_method["whish"]["total"] == 5.0
	assert by_method["whish"]["count"] == 1


def test_insights_payment_breakdown_excludes_voided_and_nets_returns(client):
	item = make_item(client)
	sale = client.post(SALES_URL, json={"lines": [{"item_id": item["id"], "qty": 3}], "payment_method": "cash"}).json()  # $15
	client.post(f"{SALES_URL}/{sale['id']}/return", json={"lines": [{"sale_line_id": sale["lines"][0]["id"], "qty": 1}]})  # -$5

	voided = client.post(SALES_URL, json={"lines": [{"item_id": item["id"], "qty": 1}], "payment_method": "cash"}).json()
	client.post(f"{SALES_URL}/{voided['id']}/void")

	insights = client.get(f"{DASHBOARD_URL}/insights").json()
	by_method = {row["payment_method"]: row for row in insights["payment_breakdown"]}
	assert by_method["cash"]["total"] == 10.0  # 15 - 5 returned; voided sale excluded entirely


def test_insights_top_products_combines_pos_and_paid_invoices(client):
	item = make_item(client, item_name="Widget A", barcode="A-1")
	other = make_item(client, item_name="Widget B", barcode="B-1", retail_price=2.0)

	client.post(SALES_URL, json={"lines": [{"item_id": item["id"], "qty": 2}]})  # $10
	invoice = client.post(INVOICES_URL, json={"lines": [{"item_id": item["id"], "qty": 1}]}).json()  # $5, unpaid yet
	client.post(f"{INVOICES_URL}/{invoice['id']}/mark-paid")
	client.post(SALES_URL, json={"lines": [{"item_id": other["id"], "qty": 1}]})  # $2

	insights = client.get(f"{DASHBOARD_URL}/insights").json()
	by_name = {row["item_name"]: row for row in insights["top_products"]}
	assert by_name["Widget A"]["qty"] == 3.0  # 2 POS + 1 invoiced
	assert by_name["Widget A"]["revenue"] == 15.0  # 10 + 5
	assert by_name["Widget B"]["revenue"] == 2.0
	# Sorted by revenue descending.
	assert insights["top_products"][0]["item_name"] == "Widget A"


def test_insights_top_products_survives_deleted_item(client):
	"""The item's own name is snapshotted on the line (see
	items/service.py:delete_item()) - a deleted item's past sales must
	still show up in what actually sold."""
	item = make_item(client, item_name="Deleted Widget", barcode="DEL-1")
	client.post(SALES_URL, json={"lines": [{"item_id": item["id"], "qty": 1}]})
	client.delete(f"{ITEMS_URL}/{item['id']}")

	insights = client.get(f"{DASHBOARD_URL}/insights").json()
	names = [row["item_name"] for row in insights["top_products"]]
	assert "Deleted Widget" in names
