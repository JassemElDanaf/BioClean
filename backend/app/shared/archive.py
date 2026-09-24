"""Every generated document (Invoice/PO/Quotation/Receipt PDF, every CSV
export) mirrors a copy here - Documents/<category>/<year>/<month>/<day>/
<filename> - so the full document history lives as plain files under the
project's own OneDrive-synced folder, not just inside Postgres. This *is*
the backup: nothing else copies these files anywhere.

ARCHIVE_ROOT is a module attribute, not a function-local constant, so
tests can monkeypatch it to a tmp_path (see tests/conftest.py) and never
write real files into the real Documents folder."""

import os
from datetime import datetime

_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))  # .../BioClean/backend
_PROJECT_ROOT = os.path.dirname(_BACKEND_DIR)  # .../BioClean

ARCHIVE_ROOT = os.path.join(_PROJECT_ROOT, "Documents")


def archive_document(category: str, doc_date: datetime, filename: str, content: bytes) -> None:
	"""category may itself contain a "/" (e.g. "Exports/Items") to nest one
	level deeper - os.path.join/makedirs handle that the same as any other
	path segment."""
	folder = os.path.join(ARCHIVE_ROOT, category, str(doc_date.year), f"{doc_date.month:02d}", f"{doc_date.day:02d}")
	os.makedirs(folder, exist_ok=True)
	with open(os.path.join(folder, filename), "wb") as f:
		f.write(content)
