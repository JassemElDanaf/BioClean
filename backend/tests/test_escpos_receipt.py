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
		paid_currency="USD",
		amount_tendered=20.0,
		exchange_rate=0,
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

	assert "SALE-42" in text
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


def test_render_receipt_shows_lbp_total_when_sale_has_an_exchange_rate():
	printer = Dummy()
	render_receipt(printer, make_sale(exchange_rate=89500), lbp_rounding=1000)
	text = printer.output.decode("ascii", errors="ignore")

	assert "TOTAL (LBP)" in text
	# 15.75 * 89500 = 1,409,625 -> rounds to the nearest 1,000.
	assert "1,410,000 LBP" in text


def test_render_receipt_omits_lbp_total_when_sale_predates_exchange_rate_tracking():
	printer = Dummy()
	render_receipt(printer, make_sale(exchange_rate=0))
	text = printer.output.decode("ascii", errors="ignore")

	assert "LBP" not in text


def test_render_receipt_notes_when_paid_in_lbp():
	printer = Dummy()
	render_receipt(printer, make_sale(paid_currency="LBP"))
	text = printer.output.decode("ascii", errors="ignore")

	assert "Paid in LBP" in text


def test_render_receipt_omits_lbp_note_when_paid_in_usd():
	printer = Dummy()
	render_receipt(printer, make_sale(paid_currency="USD"))
	text = printer.output.decode("ascii", errors="ignore")

	assert "Paid in LBP" not in text


def test_get_printer_rejects_unconfigured():
	with pytest.raises(PrinterError):
		_get_printer("none", None)


def test_get_printer_rejects_network_without_target():
	with pytest.raises(PrinterError):
		_get_printer("network", None)


def test_get_printer_rejects_usb_without_target():
	with pytest.raises(PrinterError):
		_get_printer("usb", None)


def test_get_printer_rejects_usb_with_non_hex_target():
	with pytest.raises(PrinterError):
		_get_printer("usb", "not-hex")
