ITEMS_URL = "/api/v1/items"
SALES_URL = "/api/v1/pos/sales"


def make_item(client, **overrides):
	payload = {
		"item_name": "Widget",
		"barcode": "WIDGET-1",
		"retail_price": 5.0,
		"wholesale_price": 4.0,
		"initial_stock_qty": 10,
	}
	payload.update(overrides)
	res = client.post(ITEMS_URL, json=payload)
	assert res.status_code == 201, res.text
	return res.json()


def test_checkout_deducts_stock_and_records_lines(client):
	item = make_item(client)

	res = client.post(SALES_URL, json={"lines": [{"item_id": item["id"], "qty": 3}], "payment_method": "cash", "amount_tendered": 20})
	assert res.status_code == 201, res.text
	sale = res.json()
	assert sale["total"] == 15.0  # 3 * retail_price 5.0
	assert sale["change_due"] == 5.0
	assert len(sale["lines"]) == 1
	assert sale["lines"][0]["unit_price"] == 5.0

	item_after = client.get(f"{ITEMS_URL}/{item['id']}").json()
	assert item_after["stock_qty"] == 7


def test_checkout_defaults_price_to_retail_and_allows_override(client):
	item = make_item(client)
	res = client.post(SALES_URL, json={"lines": [{"item_id": item["id"], "qty": 1, "unit_price": 4.0}]})
	assert res.json()["lines"][0]["unit_price"] == 4.0


def test_checkout_is_atomic_when_a_line_has_insufficient_stock(client):
	plenty = make_item(client, barcode="PLENTY-1", initial_stock_qty=100)
	scarce = make_item(client, barcode="SCARCE-1", initial_stock_qty=1)

	res = client.post(
		SALES_URL,
		json={"lines": [{"item_id": plenty["id"], "qty": 5}, {"item_id": scarce["id"], "qty": 5}]},
	)
	assert res.status_code == 409

	# Neither line's stock deduction should have taken effect.
	assert client.get(f"{ITEMS_URL}/{plenty['id']}").json()["stock_qty"] == 100
	assert client.get(f"{ITEMS_URL}/{scarce['id']}").json()["stock_qty"] == 1


def test_checkout_with_repeated_idempotency_key_does_not_double_charge_stock(client):
	"""Simulates a double-click / retried request: the same key sent twice
	must return the same Sale and only deduct stock once."""
	item = make_item(client, initial_stock_qty=10)
	key = "test-key-abc-123"

	res1 = client.post(SALES_URL, json={"lines": [{"item_id": item["id"], "qty": 3}], "idempotency_key": key})
	assert res1.status_code == 201, res1.text
	sale1 = res1.json()

	res2 = client.post(SALES_URL, json={"lines": [{"item_id": item["id"], "qty": 3}], "idempotency_key": key})
	assert res2.status_code == 201, res2.text
	sale2 = res2.json()

	assert sale1["id"] == sale2["id"]
	assert client.get(f"{ITEMS_URL}/{item['id']}").json()["stock_qty"] == 7


def test_checkout_without_idempotency_key_is_unaffected(client):
	"""Omitting the key (e.g. a direct API caller) still works exactly as
	before - it's optional, not required."""
	item = make_item(client, initial_stock_qty=10)
	res = client.post(SALES_URL, json={"lines": [{"item_id": item["id"], "qty": 2}]})
	assert res.status_code == 201, res.text
	assert client.get(f"{ITEMS_URL}/{item['id']}").json()["stock_qty"] == 8


def test_checkout_rejects_unknown_item(client):
	res = client.post(SALES_URL, json={"lines": [{"item_id": 999999, "qty": 1}]})
	assert res.status_code == 404


def test_checkout_rejects_empty_cart(client):
	res = client.post(SALES_URL, json={"lines": []})
	assert res.status_code == 422


def test_void_restores_stock_and_writes_audit_trail(client):
	item = make_item(client, initial_stock_qty=10)
	sale = client.post(SALES_URL, json={"lines": [{"item_id": item["id"], "qty": 4}]}).json()
	assert client.get(f"{ITEMS_URL}/{item['id']}").json()["stock_qty"] == 6

	res = client.post(f"{SALES_URL}/{sale['id']}/void")
	assert res.status_code == 200
	assert res.json()["voided"] is True
	assert client.get(f"{ITEMS_URL}/{item['id']}").json()["stock_qty"] == 10

	movements = client.get(f"{ITEMS_URL}/{item['id']}/stock-movements").json()
	reasons = [m["reason"] for m in movements]
	assert "pos_sale" in reasons
	assert "pos_void" in reasons


def test_void_twice_rejected(client):
	item = make_item(client)
	sale = client.post(SALES_URL, json={"lines": [{"item_id": item["id"], "qty": 1}]}).json()
	client.post(f"{SALES_URL}/{sale['id']}/void")
	res = client.post(f"{SALES_URL}/{sale['id']}/void")
	assert res.status_code == 409


def test_list_sales_total_count_matches_full_count_not_page_size(client):
	item = make_item(client, initial_stock_qty=100)
	for _ in range(3):
		client.post(SALES_URL, json={"lines": [{"item_id": item["id"], "qty": 1}]})

	res = client.get(f"{SALES_URL}?limit=2")
	assert len(res.json()) == 2
	assert int(res.headers["x-total-count"]) == 3


def test_deleting_sold_item_detaches_but_preserves_sale_history(client):
	"""Deleting an item that's been sold is allowed - SaleLine already
	snapshotted item_name/barcode/unit_price at sale time, so the sale
	keeps showing exactly what was sold with item_id simply nulled out."""
	item = make_item(client, item_name="Widget To Delete")
	sale = client.post(SALES_URL, json={"lines": [{"item_id": item["id"], "qty": 1}]}).json()

	res = client.delete(f"{ITEMS_URL}/{item['id']}")
	assert res.status_code == 204

	sale_after = client.get(f"{SALES_URL}/{sale['id']}").json()
	assert sale_after["lines"][0]["item_id"] is None
	assert sale_after["lines"][0]["item_name"] == "Widget To Delete"
	assert sale_after["lines"][0]["line_total"] == sale["lines"][0]["line_total"]


def test_partial_return_restores_stock_and_updates_sale(client):
	item = make_item(client, initial_stock_qty=10)
	sale = client.post(SALES_URL, json={"lines": [{"item_id": item["id"], "qty": 5}]}).json()
	assert client.get(f"{ITEMS_URL}/{item['id']}").json()["stock_qty"] == 5

	sale_line_id = sale["lines"][0]["id"]
	res = client.post(
		f"{SALES_URL}/{sale['id']}/return",
		json={"lines": [{"sale_line_id": sale_line_id, "qty": 2}], "refund_method": "cash", "reason": "wrong item"},
	)
	assert res.status_code == 201, res.text
	ret = res.json()
	assert ret["total_refund"] == 10.0  # 2 * unit_price 5.0
	assert ret["lines"][0]["qty"] == 2

	assert client.get(f"{ITEMS_URL}/{item['id']}").json()["stock_qty"] == 7

	sale_after = client.get(f"{SALES_URL}/{sale['id']}").json()
	assert sale_after["returned_total"] == 10.0


def test_return_after_item_deleted_does_not_crash(client):
	"""The item's own stock history goes away when it's deleted (see
	items/service.py:delete_item()) - nothing left to restore stock
	against, but the refund itself must still be recorded."""
	item = make_item(client, initial_stock_qty=10)
	sale = client.post(SALES_URL, json={"lines": [{"item_id": item["id"], "qty": 5}]}).json()
	sale_line_id = sale["lines"][0]["id"]
	client.delete(f"{ITEMS_URL}/{item['id']}")

	res = client.post(f"{SALES_URL}/{sale['id']}/return", json={"lines": [{"sale_line_id": sale_line_id, "qty": 2}]})
	assert res.status_code == 201, res.text
	assert res.json()["total_refund"] == 10.0


def test_return_cannot_exceed_remaining_quantity(client):
	item = make_item(client, initial_stock_qty=10)
	sale = client.post(SALES_URL, json={"lines": [{"item_id": item["id"], "qty": 3}]}).json()
	sale_line_id = sale["lines"][0]["id"]

	res = client.post(f"{SALES_URL}/{sale['id']}/return", json={"lines": [{"sale_line_id": sale_line_id, "qty": 4}]})
	assert res.status_code == 409


def test_return_accounts_for_earlier_partial_returns(client):
	"""A second return against the same line can't exceed what's left after
	the first one - covers the "remaining" math, not just the qty-sold cap."""
	item = make_item(client, initial_stock_qty=10)
	sale = client.post(SALES_URL, json={"lines": [{"item_id": item["id"], "qty": 5}]}).json()
	sale_line_id = sale["lines"][0]["id"]

	res1 = client.post(f"{SALES_URL}/{sale['id']}/return", json={"lines": [{"sale_line_id": sale_line_id, "qty": 3}]})
	assert res1.status_code == 201, res1.text

	res2 = client.post(f"{SALES_URL}/{sale['id']}/return", json={"lines": [{"sale_line_id": sale_line_id, "qty": 3}]})
	assert res2.status_code == 409

	res3 = client.post(f"{SALES_URL}/{sale['id']}/return", json={"lines": [{"sale_line_id": sale_line_id, "qty": 2}]})
	assert res3.status_code == 201, res3.text

	assert client.get(f"{ITEMS_URL}/{item['id']}").json()["stock_qty"] == 10


def test_return_rejects_unknown_sale_line(client):
	item = make_item(client, initial_stock_qty=10)
	sale = client.post(SALES_URL, json={"lines": [{"item_id": item["id"], "qty": 2}]}).json()

	res = client.post(f"{SALES_URL}/{sale['id']}/return", json={"lines": [{"sale_line_id": 999999, "qty": 1}]})
	assert res.status_code == 404


def test_return_rejected_for_voided_sale(client):
	item = make_item(client, initial_stock_qty=10)
	sale = client.post(SALES_URL, json={"lines": [{"item_id": item["id"], "qty": 2}]}).json()
	client.post(f"{SALES_URL}/{sale['id']}/void")

	sale_line_id = sale["lines"][0]["id"]
	res = client.post(f"{SALES_URL}/{sale['id']}/return", json={"lines": [{"sale_line_id": sale_line_id, "qty": 1}]})
	assert res.status_code == 409


def test_list_returns_for_sale(client):
	item = make_item(client, initial_stock_qty=10)
	sale = client.post(SALES_URL, json={"lines": [{"item_id": item["id"], "qty": 5}]}).json()
	sale_line_id = sale["lines"][0]["id"]

	client.post(f"{SALES_URL}/{sale['id']}/return", json={"lines": [{"sale_line_id": sale_line_id, "qty": 1}]})
	client.post(f"{SALES_URL}/{sale['id']}/return", json={"lines": [{"sale_line_id": sale_line_id, "qty": 1}]})

	res = client.get(f"{SALES_URL}/{sale['id']}/returns")
	assert res.status_code == 200
	assert len(res.json()) == 2


def test_return_on_unknown_sale_404s(client):
	res = client.post(f"{SALES_URL}/999999/return", json={"lines": [{"sale_line_id": 1, "qty": 1}]})
	assert res.status_code == 404


def test_void_after_partial_return_does_not_double_restore_stock(client):
	"""A sale of 5, with 2 already returned (already back in stock), then
	voided must only restore the remaining 3 - not all 5 again, which
	would inflate stock above what was ever really sold."""
	item = make_item(client, initial_stock_qty=10)
	sale = client.post(SALES_URL, json={"lines": [{"item_id": item["id"], "qty": 5}]}).json()
	assert client.get(f"{ITEMS_URL}/{item['id']}").json()["stock_qty"] == 5

	sale_line_id = sale["lines"][0]["id"]
	client.post(f"{SALES_URL}/{sale['id']}/return", json={"lines": [{"sale_line_id": sale_line_id, "qty": 2}]})
	assert client.get(f"{ITEMS_URL}/{item['id']}").json()["stock_qty"] == 7

	res = client.post(f"{SALES_URL}/{sale['id']}/void")
	assert res.status_code == 200
	# Back to the original 10 - not 12 (which double-restoring the already-returned 2 would give).
	assert client.get(f"{ITEMS_URL}/{item['id']}").json()["stock_qty"] == 10
