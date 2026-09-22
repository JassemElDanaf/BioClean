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
		context.built_html = f.read()
