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
and imports cleanly into any other accounting tool."""

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


def to_csv_response(rows: list[dict], filename: str) -> StreamingResponse:
	buffer = io.StringIO()
	if rows:
		writer = csv.DictWriter(buffer, fieldnames=list(rows[0].keys()))
		writer.writeheader()
		writer.writerows(rows)
	content = buffer.getvalue()

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
