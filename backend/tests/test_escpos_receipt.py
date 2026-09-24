from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from escpos.printer import Dummy

from app.pos.escpos_receipt import PrinterError, _get_printer, render_receipt


def make_sale(**overrides):
	defaults = dict(
		id=42,
		created_at=datetime(2026, 9, 24, 14, 30, tzinfo=timezone.utc),
		total=15.75,
		tax_amount=0.75,
		payment_method="cash",
		amount_tendered=20.0,
		lines=[
			SimpleNamespace(item_name="BioMax 3L", qty=2, unit_price=6.0, line_total=12.0),
			SimpleNamespace(item_name="BioChlore 1L", qty=3, unit_price=1.0, line_total=3.0),
		],
	)
	defaults.update(overrides)
	return SimpleNamespace(**defaults)


def test_render_receipt_produces_real_escpos_bytes():
	printer = Dummy()
	render_receipt(printer, make_sale())

	assert len(printer.output) > 0
	# The cut command must be the last thing sent, or the printer never
	# actually releases the receipt.
	assert printer.output.endswith(b"\x1dV\x00") or b"\x1dV" in printer.output[-10:]


def test_render_receipt_includes_readable_text():
	printer = Dummy()
	render_receipt(printer, make_sale())
	text = printer.output.decode("ascii", errors="ignore")

	assert "Sale #42" in text
	assert "BioMax 3L" in text
	assert "BioChlore 1L" in text
	assert "15.75" in text  # total
	assert "Tendered" in text
	assert "4.25" in text  # change due = 20.00 - 15.75


def test_render_receipt_card_payment_has_no_tendered_line():
	printer = Dummy()
	render_receipt(printer, make_sale(payment_method="card", amount_tendered=None))
	text = printer.output.decode("ascii", errors="ignore")

	assert "Tendered" not in text
	assert "Paid by card" in text


def test_render_receipt_zero_tax_omits_tax_line():
	printer = Dummy()
	render_receipt(printer, make_sale(tax_amount=0))
	text = printer.output.decode("ascii", errors="ignore")

	assert "Tax" not in text


def test_get_printer_rejects_unconfigured():
	with pytest.raises(PrinterError):
		_get_printer("none", None)


def test_get_printer_rejects_network_without_target():
	with pytest.raises(PrinterError):
		_get_printer("network", None)
