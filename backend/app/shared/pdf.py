"""Shared PDF-rendering engine - one Chromium-via-Playwright pipeline every
document type (Invoice, Purchase Order, Quotation) renders its own Jinja2
HTML through, rather than three drifting copies of the same browser-launch
and event-loop-policy logic.

Also the single place that reads/caches the company logo as a base64 data
URI, so every document's Jinja2 template can just do <img src="{{ logo }}">
without touching the filesystem itself."""

import asyncio
import base64
import os
import sys

from playwright.sync_api import sync_playwright

_ASSETS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "assets")
_logo_data_uri: str | None = None


def get_logo_data_uri() -> str:
	global _logo_data_uri
	if _logo_data_uri is None:
		with open(os.path.join(_ASSETS_DIR, "logo.jpg"), "rb") as f:
			_logo_data_uri = "data:image/jpeg;base64," + base64.b64encode(f.read()).decode("ascii")
	return _logo_data_uri


def render_html_to_pdf(html: str) -> bytes:
	if sys.platform == "win32":
		# uvicorn's reload machinery leaves the process on
		# WindowsSelectorEventLoopPolicy, whose loop can't spawn
		# subprocesses (needed to launch Chromium) - only Proactor can.
		# Safe to flip here even mid-request: this runs in the calling
		# sync endpoint's threadpool worker thread, and the policy only
		# affects loops created after this point, not uvicorn's own
		# already-running main loop.
		asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

	with sync_playwright() as p:
		browser = p.chromium.launch()
		try:
			page = browser.new_page()
			page.set_content(html, wait_until="load")
			return page.pdf(format="Letter", print_background=True)
		finally:
			browser.close()
