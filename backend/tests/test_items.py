import io

ITEMS_URL = "/api/v1/items"


def make_item(client, **overrides):
	payload = {
		"item_name": "Widget",
		"barcode": "WIDGET-1",
		"category": "Products",
		"cost_price": 1.0,
		"retail_price": 2.0,
		"wholesale_price": 1.5,
		"reorder_level": 5,
		"initial_stock_qty": 10,
	}
	payload.update(overrides)
	res = client.post(ITEMS_URL, json=payload)
	assert res.status_code == 201, res.text
	return res.json()


def test_create_item_sets_initial_stock(client):
	item = make_item(client)
	assert item["stock_qty"] == 10


def test_create_item_duplicate_barcode_rejected(client):
	make_item(client, barcode="DUPE-1")
	res = client.post(ITEMS_URL, json={"item_name": "Other", "barcode": "DUPE-1"})
	assert res.status_code == 409


def test_create_item_rejects_negative_price(client):
	res = client.post(ITEMS_URL, json={"item_name": "Bad", "barcode": "BAD-1", "cost_price": -1})
	assert res.status_code == 422


def test_create_item_rejects_blank_barcode(client):
	res = client.post(ITEMS_URL, json={"item_name": "Bad", "barcode": ""})
	assert res.status_code == 422


def test_adjust_stock_add_and_remove(client):
	item = make_item(client)
	res = client.post(f"{ITEMS_URL}/{item['id']}/adjust-stock", json={"delta": 5, "reason": "purchase_receipt"})
	assert res.status_code == 200
	assert res.json()["stock_qty"] == 15

	res = client.post(f"{ITEMS_URL}/{item['id']}/adjust-stock", json={"delta": -3, "reason": "damage"})
	assert res.status_code == 200
	assert res.json()["stock_qty"] == 12


def test_adjust_stock_cannot_go_negative(client):
	item = make_item(client, initial_stock_qty=2)
	res = client.post(f"{ITEMS_URL}/{item['id']}/adjust-stock", json={"delta": -5, "reason": "damage"})
	assert res.status_code == 409
	# Stock must be unchanged after the rejected adjustment.
	assert client.get(f"{ITEMS_URL}/{item['id']}").json()["stock_qty"] == 2


def test_delete_allowed_even_when_stock_history_exists(client):
	item = make_item(client)
	client.post(f"{ITEMS_URL}/{item['id']}/adjust-stock", json={"delta": -1, "reason": "damage"})
	res = client.delete(f"{ITEMS_URL}/{item['id']}")
	assert res.status_code == 204
	assert client.get(f"{ITEMS_URL}/{item['id']}").status_code == 404


def test_delete_allowed_for_untouched_zero_stock_item(client):
	item = make_item(client, initial_stock_qty=0)
	res = client.delete(f"{ITEMS_URL}/{item['id']}")
	assert res.status_code == 204


def test_delete_allowed_with_real_stock_on_hand(client):
	"""Deleting an item that still has physical stock on hand is allowed -
	the user's own explicit call, not something the backend should ever
	refuse to do."""
	item = make_item(client, initial_stock_qty=25)
	res = client.delete(f"{ITEMS_URL}/{item['id']}")
	assert res.status_code == 204


def test_delete_item_removes_its_own_stock_movements(client):
	item = make_item(client)
	client.post(f"{ITEMS_URL}/{item['id']}/adjust-stock", json={"delta": -1, "reason": "damage"})
	client.delete(f"{ITEMS_URL}/{item['id']}")
	# The item itself is gone - its per-item audit trail has no
	# independent meaning any more and goes with it.
	res = client.get(f"{ITEMS_URL}/{item['id']}/stock-movements")
	assert res.status_code == 404


def test_low_stock_filter(client):
	low = make_item(client, barcode="LOW-1", initial_stock_qty=1, reorder_level=5)
	high = make_item(client, barcode="HIGH-1", initial_stock_qty=50, reorder_level=5)

	res = client.get(f"{ITEMS_URL}?low_stock=true")
	ids = [i["id"] for i in res.json()]
	assert low["id"] in ids
	assert high["id"] not in ids


def test_low_stock_filter_excludes_out_of_stock(client):
	"""Low Stock and Out of Stock are mutually exclusive everywhere the app
	shows them (StockBadge) - the API filter has to agree, or the
	Inventory "Low Stock" toggle would show items whose own badge reads
	"Out of Stock"."""
	out_of_stock = make_item(client, barcode="ZERO-1", initial_stock_qty=0, reorder_level=5)
	res = client.get(f"{ITEMS_URL}?low_stock=true")
	assert out_of_stock["id"] not in [i["id"] for i in res.json()]


def test_out_of_stock_filter(client):
	zero = make_item(client, barcode="ZERO-1", initial_stock_qty=0, reorder_level=5)
	low = make_item(client, barcode="LOW-1", initial_stock_qty=1, reorder_level=5)
	high = make_item(client, barcode="HIGH-1", initial_stock_qty=50, reorder_level=5)

	res = client.get(f"{ITEMS_URL}?out_of_stock=true")
	ids = [i["id"] for i in res.json()]
	assert zero["id"] in ids
	assert low["id"] not in ids
	assert high["id"] not in ids


def test_search_filter_matches_name_and_barcode(client):
	make_item(client, item_name="Blue Widget", barcode="BLU-1")
	make_item(client, item_name="Red Gadget", barcode="RED-1")

	by_name = client.get(f"{ITEMS_URL}?q=widget").json()
	assert {i["item_name"] for i in by_name} == {"Blue Widget"}

	by_barcode = client.get(f"{ITEMS_URL}?q=RED-1").json()
	assert {i["item_name"] for i in by_barcode} == {"Red Gadget"}


def test_total_count_header_reflects_full_match_count_not_page_size(client):
	for i in range(5):
		make_item(client, barcode=f"PAGE-{i}", item_name=f"Page Item {i}")

	res = client.get(f"{ITEMS_URL}?limit=2")
	assert len(res.json()) == 2
	assert int(res.headers["x-total-count"]) == 5


def test_upload_item_image_accepts_png(client, monkeypatch, tmp_path):
	# Redirect the upload target so the test doesn't write into the real
	# backend/uploads/items directory used by the running dev server.
	import app.items.router as items_router

	monkeypatch.setattr(items_router, "UPLOAD_DIR", str(tmp_path))

	item = make_item(client)
	# Minimal 1x1 PNG.
	png_bytes = bytes.fromhex(
		"89504e470d0a1a0a0000000d49484452000000010000000108020000009077"
		"53de0000000a49444154789c6360000002000100ffff03000006000557bfab"
		"d40000000049454e44ae426082"
	)
	res = client.post(
		f"{ITEMS_URL}/{item['id']}/image",
		files={"file": ("test.png", io.BytesIO(png_bytes), "image/png")},
	)
	assert res.status_code == 200, res.text
	assert res.json()["image_url"].startswith("/uploads/items/")


def test_upload_item_image_rejects_wrong_type(client):
	item = make_item(client)
	res = client.post(
		f"{ITEMS_URL}/{item['id']}/image",
		files={"file": ("test.txt", io.BytesIO(b"not an image"), "text/plain")},
	)
	assert res.status_code == 400


def test_editing_item_does_not_wipe_out_its_photo(client, monkeypatch, tmp_path):
	# Same fixture-redirect as test_upload_item_image_accepts_png above -
	# don't write into the real backend/uploads/items directory.
	import app.items.router as items_router

	monkeypatch.setattr(items_router, "UPLOAD_DIR", str(tmp_path))

	item = make_item(client)
	png_bytes = bytes.fromhex(
		"89504e470d0a1a0a0000000d49484452000000010000000108020000009077"
		"53de0000000a49444154789c6360000002000100ffff03000006000557bfab"
		"d40000000049454e44ae426082"
	)
	uploaded = client.post(
		f"{ITEMS_URL}/{item['id']}/image",
		files={"file": ("test.png", io.BytesIO(png_bytes), "image/png")},
	).json()
	assert uploaded["image_url"]

	# The edit form (frontend/src/features/inventory/ItemFormModal.tsx)
	# never sends image_url at all - editing an unrelated field like the
	# name must not touch the photo already on file.
	edit_payload = {k: v for k, v in item.items() if k in {"item_name", "category", "uom", "barcode", "cost_price", "retail_price", "wholesale_price", "reorder_level"}}
	edit_payload["item_name"] = "Renamed Widget"
	updated = client.put(f"{ITEMS_URL}/{item['id']}", json=edit_payload).json()

	assert updated["item_name"] == "Renamed Widget"
	assert updated["image_url"] == uploaded["image_url"]


def test_rename_category_updates_every_matching_item(client):
	make_item(client, barcode="RC-1", category="Old Name")
	make_item(client, barcode="RC-2", category="Old Name")
	make_item(client, barcode="RC-3", category="Different Category")

	res = client.put(f"{ITEMS_URL}/categories/Old Name", json={"new_category": "New Name"})
	assert res.status_code == 200, res.text
	assert res.json()["updated"] == 2

	items = {i["barcode"]: i["category"] for i in client.get(ITEMS_URL).json()}
	assert items["RC-1"] == "New Name"
	assert items["RC-2"] == "New Name"
	assert items["RC-3"] == "Different Category"


def test_rename_category_merges_into_an_existing_one(client):
	make_item(client, barcode="MC-1", category="A")
	make_item(client, barcode="MC-2", category="B")

	res = client.put(f"{ITEMS_URL}/categories/A", json={"new_category": "B"})
	assert res.status_code == 200
	assert res.json()["updated"] == 1

	items = {i["barcode"]: i["category"] for i in client.get(ITEMS_URL).json()}
	assert items["MC-1"] == "B"
	assert items["MC-2"] == "B"


def test_rename_category_with_blank_new_name_clears_it(client):
	make_item(client, barcode="CL-1", category="Retiring")

	res = client.put(f"{ITEMS_URL}/categories/Retiring", json={"new_category": ""})
	assert res.status_code == 200
	assert res.json()["updated"] == 1

	item = next(i for i in client.get(ITEMS_URL).json() if i["barcode"] == "CL-1")
	assert item["category"] is None
