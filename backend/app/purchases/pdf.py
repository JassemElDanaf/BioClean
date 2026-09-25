"""Renders one PurchaseOrder as a printable PDF - what actually gets sent
to or handed to a supplier. Same engine and layout language as
invoicing/pdf.py (see that file for the reasoning), just addressed to a
supplier instead of a customer and priced in unit_cost instead of
unit_price."""

from jinja2 import Template

from ..shared.pdf import get_logo_data_uri, render_html_to_pdf
from ..shared.timezone import to_local
from .models import PurchaseOrder

STATUS_COLOR = {
	"pending": "#b45f06",
	"received": "#1e5f36",
	"cancelled": "#757575",
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
	.logo { height: 69px; }
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
			<div class="doc-no">PURCHASE ORDER #{{ po.id }}</div>
			<div>{{ created_at }}</div>
			<div class="status">{{ po.status.upper() }}</div>
		</div>
	</div>

	<div class="bill-to">
		<div class="label">Supplier</div>
		<div>{{ po.supplier.name }}</div>
		{% if po.supplier.phone %}<div>{{ po.supplier.phone }}</div>{% endif %}
		{% if po.supplier.email %}<div>{{ po.supplier.email }}</div>{% endif %}
	</div>

	<table>
		<thead>
			<tr>
				<th>Item</th>
				<th class="num">Qty</th>
				<th class="num">Unit Cost</th>
				<th class="num">Line Total</th>
			</tr>
		</thead>
		<tbody>
			{% for line in po.lines %}
			<tr>
				<td>{{ line.item_name }}</td>
				<td class="num">{{ '%g' % line.qty }}</td>
				<td class="num">${{ '%.2f' % line.unit_cost }}</td>
				<td class="num">${{ '%.2f' % line.line_total }}</td>
			</tr>
			{% endfor %}
		</tbody>
	</table>

	<div class="totals">
		<table>
			<tr class="grand">
				<td class="label">Total</td>
				<td class="val">${{ '%.2f' % po.total }}</td>
			</tr>
		</table>
	</div>

	{% if po.notes %}
	<div class="footer"><span class="label">Notes:</span> {{ po.notes }}</div>
	{% endif %}
</body>
</html>
"""
)


def generate_purchase_order_pdf(po: PurchaseOrder) -> bytes:
	html = TEMPLATE.render(
		po=po,
		logo=get_logo_data_uri(),
		status_color=STATUS_COLOR.get(po.status, "#212121"),
		created_at=to_local(po.created_at).strftime("%B %d, %Y"),
	)
	return render_html_to_pdf(html)
