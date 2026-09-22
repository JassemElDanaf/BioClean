"""Serves the built Cashier/Boss Mode SPA at /bioclean. Reads the actual
built index.html at request time rather than hardcoding Vite's hashed asset
filenames, which change on every build."""

import os

import frappe


def get_context(context):
	context.no_cache = 1
	if not frappe.session.user or frappe.session.user == "Guest":
		frappe.local.flags.redirect_location = "/login?redirect-to=/bioclean"
		raise frappe.Redirect

	built_index = os.path.abspath(
		os.path.join(frappe.get_app_path("bioclean"), "public", "frontend", "index.html")
	)
	with open(built_index, encoding="utf-8") as f:
		html = f.read()

	# The built page is a plain static file with none of Desk's usual boot
	# context - frappe-ui's call() only attaches a CSRF header when
	# `window.csrf_token` is actually set (see its source), so without this
	# every whitelisted call from the SPA fails with CSRFTokenError. Found
	# from a real "Couldn't reach BioClean" error report once the frontend
	# started surfacing the actual exception instead of hanging silently.
	csrf_script = f'<script>window.csrf_token = "{frappe.sessions.get_csrf_token()}";</script>'
	context.built_html = html.replace("<head>", f"<head>{csrf_script}", 1)
