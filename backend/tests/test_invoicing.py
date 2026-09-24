ITEMS_URL = "/api/v1/items"
CUSTOMERS_URL = "/api/v1/customers"
INVOICES_URL = "/api/v1/invoices"


def make_item(client, **overrides):
	payload = {"item_name": "Widget", "barcode": "WIDGET-1", "retail_price": 10.0, "wholesale_price": 7.0, "initial_stock_qty": 20}
	payload.update(overrides)
	return client.post(ITEMS_URL, json=payload).json()


def make_customer(client, **overrides):
	payload = {"name": "Acme Hotel", "is_wholesale": False}
	payload.update(overrides)
	return client.post(CUSTOMERS_URL, json=payload).json()


def test_invoice_creation_does_not_touch_stock_and_defaults_to_retail_price(client):
	"""An unpaid invoice is a pending commitment, not a completed sale (same
	idea as a Quotation) - stock only actually moves once it's paid, see
	test_mark_paid_deducts_stock below."""
	item = make_item(client)
	customer = make_customer(client)

	res = client.post(INVOICES_URL, json={"customer_id": customer["id"], "lines": [{"item_id": item["id"], "qty": 2}]})
	assert res.status_code == 201, res.text
	invoice = res.json()
	assert invoice["status"] == "unpaid"
	assert invoice["lines"][0]["unit_price"] == 10.0
	assert invoice["total"] == 20.0

	assert client.get(f"{ITEMS_URL}/{item['id']}").json()["stock_qty"] == 20


def test_invoice_defaults_to_wholesale_price_for_wholesale_customer(client):
	item = make_item(client)
	customer = make_customer(client, is_wholesale=True)

	res = client.post(INVOICES_URL, json={"customer_id": customer["id"], "lines": [{"item_id": item["id"], "qty": 1}]})
	assert res.json()["lines"][0]["unit_price"] == 7.0


def test_invoice_allows_no_customer(client):
	item = make_item(client)
	res = client.post(INVOICES_URL, json={"lines": [{"item_id": item["id"], "qty": 1}]})
	assert res.status_code == 201
	assert res.json()["customer_id"] is None


def test_invoice_creation_allows_more_than_current_stock(client):
	"""Unlike POS checkout, creating an invoice doesn't touch stock at all -
	so (like a Quotation) it's allowed to ask for more than what's
	currently on hand. The real availability check happens at mark-paid."""
	item = make_item(client, initial_stock_qty=1)
	res = client.post(INVOICES_URL, json={"lines": [{"item_id": item["id"], "qty": 50}]})
	assert res.status_code == 201, res.text


def test_mark_paid_deducts_stock_and_is_atomic_on_insufficient_stock(client):
	"""The insufficient-stock atomicity guarantee that used to apply to
	invoice *creation* now applies to mark-paid instead, since that's the
	moment stock actually moves - see invoicing/service.py."""
	item = make_item(client, initial_stock_qty=5)
	invoice = client.post(INVOICES_URL, json={"lines": [{"item_id": item["id"], "qty": 3}]}).json()

	res = client.post(f"{INVOICES_URL}/{invoice['id']}/mark-paid")
	assert res.status_code == 200
	assert res.json()["status"] == "paid"
	assert client.get(f"{ITEMS_URL}/{item['id']}").json()["stock_qty"] == 2

	plenty = make_item(client, barcode="PLENTY-1", initial_stock_qty=100)
	scarce = make_item(client, barcode="SCARCE-1", initial_stock_qty=1)
	multi_line_invoice = client.post(
		INVOICES_URL, json={"lines": [{"item_id": plenty["id"], "qty": 5}, {"item_id": scarce["id"], "qty": 5}]}
	).json()

	res = client.post(f"{INVOICES_URL}/{multi_line_invoice['id']}/mark-paid")
	assert res.status_code == 409
	assert client.get(f"{ITEMS_URL}/{plenty['id']}").json()["stock_qty"] == 100
	assert client.get(f"{INVOICES_URL}/{multi_line_invoice['id']}").json()["status"] == "unpaid"


def test_mark_paid_lifecycle(client):
	item = make_item(client)
	invoice = client.post(INVOICES_URL, json={"lines": [{"item_id": item["id"], "qty": 1}]}).json()

	res = client.post(f"{INVOICES_URL}/{invoice['id']}/mark-paid")
	assert res.status_code == 200
	assert res.json()["status"] == "paid"

	# Can't mark paid twice.
	assert client.post(f"{INVOICES_URL}/{invoice['id']}/mark-paid").status_code == 409


def test_void_unpaid_invoice_does_not_touch_stock(client):
	"""An unpaid invoice never deducted stock in the first place, so voiding
	it has nothing to restore."""
	item = make_item(client, initial_stock_qty=10)
	invoice = client.post(INVOICES_URL, json={"lines": [{"item_id": item["id"], "qty": 4}]}).json()

	res = client.post(f"{INVOICES_URL}/{invoice['id']}/void")
	assert res.status_code == 200
	assert res.json()["status"] == "voided"
	assert client.get(f"{ITEMS_URL}/{item['id']}").json()["stock_qty"] == 10


def test_void_restores_stock_even_after_paid(client):
	item = make_item(client, initial_stock_qty=10)
	invoice = client.post(INVOICES_URL, json={"lines": [{"item_id": item["id"], "qty": 4}]}).json()
	client.post(f"{INVOICES_URL}/{invoice['id']}/mark-paid")

	res = client.post(f"{INVOICES_URL}/{invoice['id']}/void")
	assert res.status_code == 200
	assert res.json()["status"] == "voided"
	assert client.get(f"{ITEMS_URL}/{item['id']}").json()["stock_qty"] == 10

	# Can't mark a voided invoice paid, and can't void it twice.
	assert client.post(f"{INVOICES_URL}/{invoice['id']}/mark-paid").status_code == 409
	assert client.post(f"{INVOICES_URL}/{invoice['id']}/void").status_code == 409


def test_pdf_is_generated_cached_and_invalidated_on_status_change(client):
	item = make_item(client)
	invoice = client.post(INVOICES_URL, json={"lines": [{"item_id": item["id"], "qty": 1}]}).json()

	res = client.get(f"{INVOICES_URL}/{invoice['id']}/pdf")
	assert res.status_code == 200
	assert res.headers["content-type"] == "application/pdf"
	assert res.content[:5] == b"%PDF-"
	first_bytes = res.content

	# Second fetch is served from the DB cache, so it's byte-identical.
	res2 = client.get(f"{INVOICES_URL}/{invoice['id']}/pdf")
	assert res2.content == first_bytes

	# mark-paid invalidates the cache - the PDF's status text changed, so
	# a freshly-generated PDF must differ from the cached "unpaid" one.
	client.post(f"{INVOICES_URL}/{invoice['id']}/mark-paid")
	res3 = client.get(f"{INVOICES_URL}/{invoice['id']}/pdf")
	assert res3.content != first_bytes


def test_pdf_is_mirrored_into_the_documents_archive(client):
	import os

	import app.shared.archive as archive_module

	item = make_item(client)
	invoice = client.post(INVOICES_URL, json={"lines": [{"item_id": item["id"], "qty": 1}]}).json()

	res = client.get(f"{INVOICES_URL}/{invoice['id']}/pdf")
	assert res.status_code == 200

	created = datetime_from_iso(invoice["created_at"])
	expected_path = os.path.join(
		archive_module.ARCHIVE_ROOT, "Invoices", str(created.year), f"{created.month:02d}", f"{created.day:02d}", f"invoice-{invoice['id']}.pdf"
	)
	assert os.path.isfile(expected_path)
	with open(expected_path, "rb") as f:
		assert f.read() == res.content


def datetime_from_iso(value: str):
	from datetime import datetime

	return datetime.fromisoformat(value.replace("Z", "+00:00"))


def test_list_total_count_matches_full_count_not_page_size(client):
	item = make_item(client, initial_stock_qty=100)
	for _ in range(3):
		client.post(INVOICES_URL, json={"lines": [{"item_id": item["id"], "qty": 1}]})

	res = client.get(f"{INVOICES_URL}?limit=2")
	assert len(res.json()) == 2
	assert int(res.headers["x-total-count"]) == 3
