"""Renders one Sale as a printable receipt PDF - what a customer walks
away with after a POS checkout. Same engine and layout language as
invoicing/pdf.py (see that file for the reasoning); no "Bill To" section
since POS sales have no customer on file, and shows the
Subtotal/Tax/Total breakdown plus tendered/change for cash sales."""

from jinja2 import Template

from ..shared.pdf import get_logo_data_uri, render_html_to_pdf
from .models import Sale

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
	.status { font-weight: 700; color: {{ '#757575' if sale.voided else '#1e5f36' }}; }
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
			<div class="doc-no">RECEIPT - SALE #{{ sale.id }}</div>
			<div>{{ created_at }}</div>
			<div class="status">{{ 'VOIDED' if sale.voided else 'PAID' }}</div>
		</div>
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
			{% for line in sale.lines %}
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
			<tr><td class="label">Subtotal</td><td class="val">${{ '%.2f' % subtotal }}</td></tr>
			{% if sale.tax_amount %}
			<tr><td class="label">Tax</td><td class="val">${{ '%.2f' % sale.tax_amount }}</td></tr>
			{% endif %}
			<tr class="grand">
				<td class="label">Total</td>
				<td class="val">${{ '%.2f' % sale.total }}</td>
			</tr>
			{% if sale.payment_method == 'cash' and sale.amount_tendered %}
			<tr><td class="label">Tendered</td><td class="val">${{ '%.2f' % sale.amount_tendered }}</td></tr>
			<tr><td class="label">Change Due</td><td class="val">${{ '%.2f' % change_due }}</td></tr>
			{% endif %}
		</table>
	</div>

	<div class="footer"><span class="label">Payment Method:</span> {{ sale.payment_method.title() }}</div>
</body>
</html>
"""
)


def generate_sale_receipt_pdf(sale: Sale) -> bytes:
	subtotal = float(sale.total) - float(sale.tax_amount)
	change_due = float(sale.amount_tendered) - float(sale.total) if sale.amount_tendered is not None else None
	html = TEMPLATE.render(
		sale=sale,
		logo=get_logo_data_uri(),
		created_at=sale.created_at.strftime("%B %d, %Y %I:%M %p"),
		subtotal=subtotal,
		change_due=change_due,
	)
	return render_html_to_pdf(html)
