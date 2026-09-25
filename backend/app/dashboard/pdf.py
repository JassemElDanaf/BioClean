"""Renders the Financial Summary as a printable PDF - what actually gets
handed to an accountant, a bank, or kept for a tax filing, as opposed to
the CSV export (a raw-numbers dump meant for Excel/accounting software).

Same shared HTML+CSS-to-Chromium pipeline every other document in this app
uses (see shared/pdf.py and invoicing/pdf.py's own docstring for why),
rendered straight from the same dict get_summary() returns - the PDF can
never show different numbers than the on-screen report for the same
period."""

from jinja2 import Template

from ..shared.pdf import get_logo_data_uri, render_html_to_pdf

TEMPLATE = Template(
	"""
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
	@page { size: letter; margin: 0.6in; }
	* { box-sizing: border-box; }
	body {
		font-family: 'Inter', -apple-system, Segoe UI, Helvetica, Arial, sans-serif;
		color: #1a1a1a;
		margin: 0;
		font-size: 13px;
	}
	.header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; }
	.logo { height: 69px; }
	.meta { text-align: right; line-height: 1.6; }
	.meta .doc-title { font-weight: 700; font-size: 15px; }
	.meta .period { color: #555; }
	.kpis { display: flex; gap: 12px; margin-bottom: 24px; }
	.kpi { flex: 1; border: 1px solid #e0e0e0; border-radius: 10px; padding: 12px 14px; }
	.kpi .label { font-size: 11px; color: #757575; margin-bottom: 4px; }
	.kpi .value { font-size: 19px; font-weight: 800; }
	.kpi .value.negative { color: #b42318; }
	.kpi .value.positive { color: #1e5f36; }
	table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
	.section-title {
		background: #1e5f36;
		color: #fff;
		padding: 6px 10px;
		font-size: 12px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.4px;
	}
	tbody td { padding: 8px 10px; border-bottom: 1px solid #e0e0e0; font-size: 12.5px; }
	tbody td.val { text-align: right; }
	tbody td.negative { color: #b42318; }
	tbody tr.bold td { font-weight: 700; }
	tbody tr.highlight-brand td { color: #1e5f36; font-weight: 700; }
	tbody tr.highlight-danger td { color: #b42318; font-weight: 700; }
	tbody tr.total td { border-top: 1.5px solid #1a1a1a; border-bottom: none; padding-top: 10px; }
	.note { font-size: 11.5px; color: #757575; margin: -10px 0 16px; line-height: 1.5; }
	.footer { margin-top: 8px; font-size: 11px; color: #999; text-align: center; }
</style>
</head>
<body>
	<div class="header">
		<img class="logo" src="{{ logo }}" alt="BioClean">
		<div class="meta">
			<div class="doc-title">FINANCIAL SUMMARY</div>
			<div class="period">{{ period_label }}</div>
			<div>Generated {{ generated_at }}</div>
		</div>
	</div>

	<div class="kpis">
		<div class="kpi">
			<div class="label">Total Income</div>
			<div class="value">${{ '%.2f' % summary.total_revenue }}</div>
		</div>
		<div class="kpi">
			<div class="label">Gross Profit</div>
			<div class="value {{ 'positive' if summary.gross_profit >= 0 else 'negative' }}">${{ '%.2f' % summary.gross_profit }}</div>
		</div>
		<div class="kpi">
			<div class="label">Net Profit</div>
			<div class="value {{ 'positive' if summary.net_profit >= 0 else 'negative' }}">${{ '%.2f' % summary.net_profit }}</div>
		</div>
	</div>

	<table>
		<thead><tr><th class="section-title" colspan="2">Profit &amp; Loss</th></tr></thead>
		<tbody>
			<tr><td>POS Sales Revenue (net of returns)</td><td class="val">${{ '%.2f' % summary.sales_revenue }}</td></tr>
			<tr><td>Invoice Revenue (paid only)</td><td class="val">${{ '%.2f' % summary.invoice_revenue }}</td></tr>
			<tr class="bold total"><td>Sales</td><td class="val">${{ '%.2f' % (summary.sales_revenue + summary.invoice_revenue) }}</td></tr>
			<tr><td>Other</td><td class="val">${{ '%.2f' % summary.manual_income }}</td></tr>
			<tr class="bold total"><td>Total Income</td><td class="val">${{ '%.2f' % summary.total_revenue }}</td></tr>
			<tr><td>Cost of Goods Sold</td><td class="val negative">-${{ '%.2f' % summary.cogs }}</td></tr>
			<tr class="highlight-brand total"><td>Gross Profit</td><td class="val">${{ '%.2f' % summary.gross_profit }}</td></tr>
			<tr><td>Expenses</td><td class="val negative">-${{ '%.2f' % summary.expenses_total }}</td></tr>
			<tr class="{{ 'highlight-brand' if summary.net_profit >= 0 else 'highlight-danger' }} total"><td>Net Profit</td><td class="val">${{ '%.2f' % summary.net_profit }}</td></tr>
		</tbody>
	</table>

	<table>
		<thead><tr><th class="section-title" colspan="2">Cash Flow</th></tr></thead>
		<tbody>
			<tr><td>Inventory Purchases (cash out)</td><td class="val">${{ '%.2f' % summary.purchases_total }}</td></tr>
		</tbody>
	</table>
	<div class="note">Cash spent restocking this period - not included in Net Profit above. A purchase only becomes Cost of Goods Sold once the stock actually sells, so counting it here too would double it.</div>

	<table>
		<thead><tr><th class="section-title" colspan="2">Receivables</th></tr></thead>
		<tbody>
			<tr><td>Unpaid Invoices ({{ summary.unpaid_invoices_count }})</td><td class="val">${{ '%.2f' % summary.unpaid_invoices_total }}</td></tr>
		</tbody>
	</table>

	<div class="footer">BioClean Chemicals, LB</div>
</body>
</html>
"""
)


def generate_financial_summary_pdf(summary: dict, period_label: str, generated_at: str) -> bytes:
	html = TEMPLATE.render(summary=summary, period_label=period_label, generated_at=generated_at, logo=get_logo_data_uri())
	return render_html_to_pdf(html)
