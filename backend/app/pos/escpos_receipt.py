"""Builds a real ESC/POS byte stream for a Sale and sends it to whatever
printer Settings.printer_connection_type points at - a small USB/network
thermal receipt printer, the kind actually used at a supermarket counter -
as opposed to pos/pdf.py's Letter-size PDF receipt, which is for the
Documents backup archive and download/email, never for the roll printer.

Printing is a pure side effect with no bearing on the Sale record itself:
a failed or unconfigured printer must never fail, void, or alter a
checkout that already succeeded (see pos/service.py's checkout() for the
guarantee this must not undermine). Callers catch PrinterError and report
"couldn't print" without touching the Sale - the cashier can retry the
print alone, as many times as needed, completely independent of the sale
itself.

render_receipt() writes to any given printer/escpos.Escpos-like object
(the real hardware target, or a Dummy in tests) - kept separate from
_get_printer() (which resolves Settings into a real connection) so the
formatting logic is fully testable without hardware."""

import os

from PIL import Image

from ..settings.models import AppSettings
from ..shared.currency import usd_to_lbp
from ..shared.timezone import to_local
from .models import Sale

_ASSETS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "assets")
_LOGO_PATH = os.path.join(_ASSETS_DIR, "logo.jpg")

# Most 80mm thermal printers give ~48 characters per line at the default
# font - this is what keeps a two-column "label ... price" line aligned
# without the printer's own hardware wrapping breaking it.
LINE_WIDTH = 48


class PrinterError(Exception):
	"""Anything that goes wrong resolving or talking to the physical
	printer. Deliberately a plain Exception, not an HTTPException - the
	router decides how to surface this, since a print failure is never
	itself the reason a request as a whole should fail."""


def _get_printer(connection_type: str, target: str | None):
	if connection_type == "windows":
		from escpos.printer import Win32Raw

		return Win32Raw(target or "")
	if connection_type == "network":
		if not target:
			raise PrinterError("No printer address configured - set one in Settings")
		from escpos.printer import Network

		host, _, port = target.partition(":")
		return Network(host, int(port) if port else 9100, timeout=10)
	if connection_type == "usb":
		# Direct USB (no OS driver/print queue in between) - what's needed
		# when the backend itself runs on the machine the printer is
		# physically plugged into (Linux/Mac), as opposed to "windows"
		# above which goes through a printer already installed in Windows.
		# target is "vendor_id:product_id" in hex, e.g. "0483:5743" for a
		# Xprinter XP-T80A - found via `lsusb` (Linux) or Device Manager
		# (Windows, under the printer's Properties > Details > Hardware
		# Ids) with the printer plugged in and powered on.
		if not target:
			raise PrinterError("No USB vendor/product ID configured - set one in Settings")
		vendor_id_str, _, product_id_str = target.partition(":")
		try:
			vendor_id = int(vendor_id_str, 16)
			product_id = int(product_id_str, 16)
		except ValueError:
			raise PrinterError('USB printer target must be "vendor_id:product_id" in hex, e.g. "0483:5743"')
		from escpos.printer import Usb

		try:
			return Usb(vendor_id, product_id, 0)
		except Exception as exc:
			raise PrinterError(f"Couldn't open USB printer {target} - check it's plugged in, powered on, and this machine has permission to access it ({exc})")
	raise PrinterError("No receipt printer configured - set one in Settings")


def _row(left: str, right: str, width: int = LINE_WIDTH) -> str:
	"""Left-aligned label, right-aligned value, padded to fill one printed
	line - the standard two-column receipt row. Wraps to a second line if
	the label alone is too long to leave room for the value."""
	space = width - len(left) - len(right)
	if space < 1:
		return f"{left}\n{' ' * max(0, width - len(right))}{right}\n"
	return f"{left}{' ' * space}{right}\n"


def render_receipt(printer, sale: Sale, lbp_rounding: float = 1) -> None:
	"""Writes the full receipt to `printer` (anything with the escpos.
	Escpos interface - real hardware or a Dummy). Never calls printer.
	close() - that's the caller's responsibility, since only the caller
	knows whether the connection should be reused or torn down."""
	if os.path.exists(_LOGO_PATH):
		printer.set(align="center")
		printer.image(Image.open(_LOGO_PATH))
		printer.ln()

	printer.set(align="center", bold=True)
	printer.textln("BioClean Chemicals, LB")
	printer.set(align="center", bold=False)
	# Same "SALE-{id}" reference already used everywhere else this sale is
	# referenced (Financial Summary, revenue reports, stock movement
	# ledger - see reports/revenue_service.py and pos/service.py) - not a
	# separate display-only counter, so a customer's paper receipt always
	# matches the exact same number the rest of the app shows for it.
	printer.textln(f"Receipt No. SALE-{sale.id}")
	printer.textln(to_local(sale.created_at).strftime("%B %d, %Y %I:%M %p"))
	printer.textln(f"Currency: USD   Payment: {sale.payment_method.title()}")
	printer.textln("-" * LINE_WIDTH)

	printer.set(align="left", bold=True)
	printer.text(_row("Item", "Qty   Price    Total"))
	printer.set(bold=False)
	printer.textln("-" * LINE_WIDTH)
	subtotal = float(sale.total) - float(sale.tax_amount)
	for line in sale.lines:
		printer.textln(str(line.item_name)[:LINE_WIDTH])
		qty_price = f"{line.qty:g} x ${float(line.unit_price):.2f}"
		printer.text(_row(f"  {qty_price}", f"${float(line.line_total):.2f}"))
	printer.textln("-" * LINE_WIDTH)

	printer.text(_row("Subtotal", f"${subtotal:.2f}"))
	if float(sale.tax_amount) > 0:
		printer.text(_row("Tax", f"${float(sale.tax_amount):.2f}"))
	printer.set(bold=True)
	printer.text(_row("TOTAL", f"${float(sale.total):.2f}"))
	printer.set(bold=False)

	# exchange_rate is 0 on a sale from before this app tracked one at all
	# (see Sale.exchange_rate's own docstring) - a bogus "0 LBP" line on an
	# old receipt would be worse than just leaving it off. Standard on a
	# Lebanese receipt to show both currencies on the total, same as every
	# on-screen total in this app already does (Sales History, Invoicing).
	if sale.exchange_rate:
		lbp_total = usd_to_lbp(float(sale.total), float(sale.exchange_rate), lbp_rounding)
		printer.set(bold=True)
		printer.text(_row("TOTAL (LBP)", f"{lbp_total:,.0f} LBP"))
		printer.set(bold=False)

	if sale.payment_method == "cash" and sale.amount_tendered is not None:
		printer.text(_row("Tendered", f"${float(sale.amount_tendered):.2f}"))
		change = float(sale.amount_tendered) - float(sale.total)
		printer.text(_row("Change", f"${change:.2f}"))
	else:
		printer.textln(f"Paid by {sale.payment_method}")

	# Every amount above is always USD regardless - this is purely a note
	# for whoever's reading the receipt, matching what was actually handed
	# over at the register (see Sale.paid_currency's own docstring).
	if sale.paid_currency == "LBP":
		printer.textln("(Paid in LBP)")

	printer.ln(2)
	printer.set(align="center")
	printer.textln("Thank you!")
	printer.ln(3)
	printer.cut()


def print_receipt(sale: Sale, settings: AppSettings) -> None:
	printer = _get_printer(settings.printer_connection_type, settings.printer_target)
	try:
		render_receipt(printer, sale, float(settings.lbp_rounding))
	except PrinterError:
		raise
	except Exception as exc:
		raise PrinterError(f"Couldn't print: {exc}") from exc
	finally:
		try:
			printer.close()
		except Exception:
			pass


def print_test_receipt(settings: AppSettings) -> None:
	"""What Settings' "Send Test Print" button calls - confirms the
	configured printer actually works without needing a real sale."""
	printer = _get_printer(settings.printer_connection_type, settings.printer_target)
	try:
		if os.path.exists(_LOGO_PATH):
			printer.set(align="center")
			printer.image(Image.open(_LOGO_PATH))
			printer.ln()
		printer.set(align="center", bold=True)
		printer.textln("Test Print")
		printer.set(align="center", bold=False)
		printer.textln("BioClean receipt printer is connected.")
		printer.ln(3)
		printer.cut()
	except Exception as exc:
		raise PrinterError(f"Couldn't print: {exc}") from exc
	finally:
		try:
			printer.close()
		except Exception:
			pass
