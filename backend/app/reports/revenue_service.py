"""Unified feed of every distinct source of money coming into the business
over a date range - POS sales, paid invoices, and manual Income entries.
Sales History (frontend/src/features/pos/SalesHistoryTab.tsx) previously
queried pos.Sale alone, which under-counted "everything that made money
today" whenever a B2B invoice got paid or a one-off Income entry (interest,
a refund received) landed the same day - see dashboard/service.py's
get_summary() for the same three-source split used for the headline
revenue figure; this just returns the underlying rows instead of a sum.

Each source is filtered on the date that money actually moved, not
necessarily its creation date: a Sale has no credit terms, so created_at
IS the moment it charged. An Invoice can be created well before it's paid,
so paid_at is used instead - an invoice created last month but paid today
belongs in today's list, not last month's. Income.date is the date the
entry itself is for.
"""

from datetime import datetime

from sqlalchemy.orm import Session

from ..income.models import Income
from ..invoicing.models import Invoice
from ..pos.models import Sale

# Safety cap per source, same reasoning as the 10_000 cap every CSV export
# endpoint in this codebase already uses (see pos/router.py, invoicing/
# router.py) - a business this size never legitimately has more rows than
# this in one range, and it keeps an unbounded "All Time" query from
# pulling entire tables into memory.
_MAX_PER_SOURCE = 10_000


def _sale_entries(db: Session, from_date: datetime | None, to_date: datetime | None) -> list[dict]:
	query = db.query(Sale)
	if from_date:
		query = query.filter(Sale.created_at >= from_date)
	if to_date:
		query = query.filter(Sale.created_at <= to_date)
	sales = query.order_by(Sale.created_at.desc()).limit(_MAX_PER_SOURCE).all()
	return [
		{
			"type": "pos_sale",
			"id": sale.id,
			"reference": f"SALE-{sale.id}",
			"occurred_at": sale.created_at,
			"method": sale.payment_method,
			# Net of returns, same as the revenue figure on the Dashboard -
			# a partially/fully returned sale isn't real money in for the
			# returned portion any more.
			"amount": float(sale.total) - float(sale.returned_total),
			"voided": sale.voided,
			"label": None,
		}
		for sale in sales
	]


def _invoice_entries(db: Session, from_date: datetime | None, to_date: datetime | None) -> list[dict]:
	# Unpaid invoices are pending commitments, not money in yet - same rule
	# dashboard/service.py's invoice_revenue figure follows.
	query = db.query(Invoice).filter(Invoice.status == "paid")
	if from_date:
		query = query.filter(Invoice.paid_at >= from_date)
	if to_date:
		query = query.filter(Invoice.paid_at <= to_date)
	invoices = query.order_by(Invoice.paid_at.desc()).limit(_MAX_PER_SOURCE).all()
	return [
		{
			"type": "invoice",
			"id": invoice.id,
			"reference": f"INV-{invoice.id}",
			"occurred_at": invoice.paid_at,
			"method": "invoice",
			"amount": float(invoice.total),
			"voided": False,
			"label": invoice.customer_name,
		}
		for invoice in invoices
	]


def _income_entries(db: Session, from_date: datetime | None, to_date: datetime | None) -> list[dict]:
	query = db.query(Income)
	if from_date:
		query = query.filter(Income.date >= from_date)
	if to_date:
		query = query.filter(Income.date <= to_date)
	entries = query.order_by(Income.date.desc()).limit(_MAX_PER_SOURCE).all()
	return [
		{
			"type": "income",
			"id": entry.id,
			"reference": entry.source,
			"occurred_at": entry.date,
			"method": "income",
			"amount": float(entry.amount),
			"voided": False,
			"label": entry.description,
		}
		for entry in entries
	]


def list_revenue_entries(
	db: Session,
	skip: int = 0,
	limit: int = 100,
	from_date: datetime | None = None,
	to_date: datetime | None = None,
) -> tuple[list[dict], int]:
	entries = [
		*_sale_entries(db, from_date, to_date),
		*_invoice_entries(db, from_date, to_date),
		*_income_entries(db, from_date, to_date),
	]
	entries.sort(key=lambda e: e["occurred_at"], reverse=True)
	total = len(entries)
	return entries[skip : skip + limit], total
