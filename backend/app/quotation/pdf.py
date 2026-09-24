"""Renders one Quotation as a printable PDF - what actually gets handed to
or emailed to a prospective customer. Same engine and layout language as
invoicing/pdf.py (see that file for the reasoning), addressed to a
customer like an invoice, but with a valid-until date instead of a due
date and no "paid" concept - only draft/sent/accepted/expired/converted."""

from jinja2 import Template

from ..shared.pdf import get_logo_data_uri, render_html_to_pdf
from .models import Quotation

STATUS_COLOR = {
	"draft": "#757575",
	"sent": "#b45f06",
	"accepted": "#1e5f36",
	"expired": "#757575",
	"converted": "#1e5f36",
}

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
	.logo { height: 46px; }
	.meta { text-align: right; line-height: 1.6; }
	.meta .doc-no { font-weight: 700; font-size: 15px; }
	.status { font-weight: 700; color: {{ status_color }}; }
	.bill-to { margin-bottom: 24px; line-height: 1.6; }
	.bill-to .label { font-weight: 700; margin-bottom: 4px; }
	table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
	thead th {
		background: #1e5f36;
		color: #fff;
		text-align: left;
		padding: 8px 10px;
		font-size: 12px;
	}
	thead th.num { text-align: right; }
	tbody td {
		padding: 8px 10px;
		border-bottom: 1px solid #e0e0e0;
		font-size: 12.5px;
	}
	tbody td.num { text-align: right; }
	tbody tr:nth-child(even) { background: #fafafa; }
	.totals { display: flex; justify-content: flex-end; margin-top: 6px; }
	.totals table { width: 260px; }
	.totals td { padding: 4px 10px; font-size: 13px; }
	.totals td.label { text-align: left; color: #555; }
	.totals td.val { text-align: right; }
	.totals tr.grand td { font-weight: 700; font-size: 15px; border-top: 1px solid #1a1a1a; padding-top: 8px; }
	.footer { margin-top: 28px; line-height: 1.6; font-size: 12.5px; }
	.footer .label { font-weight: 700; }
</style>
</head>
<body>
	<div class="header">
		<img class="logo" src="{{ logo }}" alt="BioClean">
		<div class="meta">
			<div class="doc-no">QUOTATION #{{ quotation.id }}</div>
			<div>{{ created_at }}</div>
			<div class="status">{{ quotation.status.upper() }}</div>
		</div>
	</div>

	<div class="bill-to">
		<div class="label">Prepared For</div>
		{% if customer %}
			<div>{{ customer.name }}</div>
			{% if customer.phone %}<div>{{ customer.phone }}</div>{% endif %}
			{% if customer.email %}<div>{{ customer.email }}</div>{% endif %}
			{% if customer.address %}<div>{{ customer.address }}</div>{% endif %}
		{% else %}
			<div>Walk-in customer</div>
		{% endif %}
	</div>

	<table>
		<thead>
			<tr>
				<th>Item</th>
				<th class="num">Qty</th>
				<th class="num">Unit Price</th>
				<th class="num">Line Total</th>
			</tr>
		</thead>
		<tbody>
			{% for line in quotation.lines %}
			<tr>
				<td>{{ line.item_name }}</td>
				<td class="num">{{ '%g' % line.qty }}</td>
				<td class="num">${{ '%.2f' % line.unit_price }}</td>
				<td class="num">${{ '%.2f' % line.line_total }}</td>
			</tr>
			{% endfor %}
		</tbody>
	</table>

	<div class="totals">
		<table>
			<tr class="grand">
				<td class="label">Total</td>
				<td class="val">${{ '%.2f' % quotation.total }}</td>
			</tr>
		</table>
	</div>

	{% if quotation.valid_until %}
	<div class="footer"><span class="label">Valid until:</span> {{ valid_until }}</div>
	{% endif %}
	{% if quotation.notes %}
	<div class="footer"><span class="label">Notes:</span> {{ quotation.notes }}</div>
	{% endif %}
</body>
</html>
"""
)


def generate_quotation_pdf(quotation: Quotation) -> bytes:
	html = TEMPLATE.render(
		quotation=quotation,
		customer=quotation.customer,
		logo=get_logo_data_uri(),
		status_color=STATUS_COLOR.get(quotation.status, "#212121"),
		created_at=quotation.created_at.strftime("%B %d, %Y"),
		valid_until=quotation.valid_until.strftime("%B %d, %Y") if quotation.valid_until else None,
	)
	return render_html_to_pdf(html)
