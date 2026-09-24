"""Covers shared/export.py's Excel-compatibility behavior (BOM + CSV-
formula-injection defusing) through a real CSV-producing endpoint, rather
than unit-testing to_csv_response() directly - StreamingResponse's sync
body_iterator isn't trivially consumable outside a real request/response
cycle, and the items export endpoint already exercises it end to end."""

import csv
import io

ITEMS_URL = "/api/v1/items"


def test_csv_export_starts_with_utf8_bom(client):
	"""Excel (Windows) only auto-detects UTF-8 without prompting the user
	when a BOM is present - without it, non-ASCII text (Arabic item/customer
	names, accented text) renders as mojibake on double-click."""
	client.post(ITEMS_URL, json={"item_name": "Widget", "barcode": "BOM-1", "retail_price": 5.0, "wholesale_price": 4.0})
	res = client.get(f"{ITEMS_URL}/export/csv")
	assert res.status_code == 200
	assert res.content.startswith("﻿".encode("utf-8"))


def test_csv_export_defuses_formula_injection(client):
	"""A field starting with =, +, -, or @ gets parsed as a formula the
	instant Excel opens the file - a malicious or accidental
	'=cmd|...'-style item name must come back prefixed with a leading
	quote so Excel treats it as plain text instead of executing it."""
	client.post(ITEMS_URL, json={"item_name": "=cmd|'/c calc'!A1", "barcode": "INJECT-1", "retail_price": 1.0, "wholesale_price": 1.0})
	res = client.get(f"{ITEMS_URL}/export/csv")
	rows = list(csv.DictReader(io.StringIO(res.content.decode("utf-8-sig"))))
	item_name = next(r["Item Name"] for r in rows if r["Barcode"] == "INJECT-1")
	assert item_name == "'=cmd|'/c calc'!A1"


def test_csv_export_leaves_normal_values_untouched(client):
	client.post(ITEMS_URL, json={"item_name": "Plain Widget", "barcode": "PLAIN-1", "retail_price": 5.0, "wholesale_price": 4.0})
	res = client.get(f"{ITEMS_URL}/export/csv")
	body = res.content.decode("utf-8-sig")
	assert "Plain Widget" in body
	assert "'Plain Widget" not in body
