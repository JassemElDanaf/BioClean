"""One shared CSV export mechanism, used by every domain module (items
today; invoices, customers, expenses, etc. as they're built) - so
"everything is exportable" is a five-minute addition per module instead
of hand-rolled file-writing code duplicated everywhere.

CSV only (confirmed decision) - a separate .xlsx export was redundant
since CSV already opens directly in Excel; one format means one thing to
maintain and no risk of the two ever drifting apart.

Rules (kept deliberately simple, matching real accounting-tool import
expectations): rows are plain dicts with human-readable column names
already chosen by the caller (never raw DB field names), one header row,
no merged cells, no formulas - a file that opens cleanly in Excel/Sheets
and imports cleanly into any other accounting tool.

Every file is written UTF-8-with-BOM (Excel on Windows silently mangles
non-ASCII text without the BOM) and every cell is run through
_excel_safe() to defuse CSV-formula-injection from free-text fields."""

import csv
import io
from datetime import datetime

from fastapi.responses import StreamingResponse

from .archive import archive_document

# "pos_sales" -> "POS Sales" - everything else just title-cases cleanly
# ("items" -> "Items", "purchase_orders" -> "Purchase Orders").
_LABEL_OVERRIDES = {"pos_sales": "POS Sales"}


def _human_label(filename: str) -> str:
	return _LABEL_OVERRIDES.get(filename, filename.replace("_", " ").title())


_FORMULA_LEAD_CHARS = ("=", "+", "-", "@", "\t", "\r")


def _excel_safe(value):
	"""A cell value that starts with =, +, -, @ (or a tab/CR) gets parsed as
	a formula the instant Excel opens the file, which is exactly the CSV-
	injection vector OWASP warns about - a customer/item/reason field is
	free text a user typed, not something we control. Prefixing with a
	single quote defuses it (Excel shows the value as plain text) without
	touching values that were never at risk."""
	if isinstance(value, str) and value.startswith(_FORMULA_LEAD_CHARS):
		return "'" + value
	return value


def to_csv_response(rows: list[dict], filename: str) -> StreamingResponse:
	buffer = io.StringIO()
	if rows:
		writer = csv.DictWriter(buffer, fieldnames=list(rows[0].keys()))
		writer.writeheader()
		writer.writerows({k: _excel_safe(v) for k, v in row.items()} for row in rows)
	# Excel (Windows) only auto-detects UTF-8 with a BOM present - without
	# it, any non-ASCII character (Arabic customer/item names, accented
	# text) renders as mojibake the moment the file is double-clicked
	# instead of properly imported.
	bom = chr(0xFEFF)
	content = bom + buffer.getvalue()

	# Every export is a dated snapshot, not a single document with an id to
	# overwrite on regen (unlike the PDFs) - timestamped filename so two
	# exports on the same day both survive in the archive.
	now = datetime.now()
	archive_document(f"Exports/{_human_label(filename)}", now, f"{filename}_{now.strftime('%H%M%S')}.csv", content.encode("utf-8"))

	return StreamingResponse(
		iter([content]),
		media_type="text/csv",
		headers={"Content-Disposition": f'attachment; filename="{filename}.csv"'},
	)
