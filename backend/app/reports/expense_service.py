"""Unified feed of every distinct source of money leaving the business
over a date range - received Purchase Orders (stock restocked - gas,
supplies, whatever the PO was for) and manual Expense entries (rent,
utilities, gas for the delivery van, anything one-off). Mirrors
revenue_service.py's job on the money-in side: Purchasing's own list
previously showed pending/received/cancelled POs by themselves, with no
single place to see everything that actually cost money on a given day.

A pending PO hasn't cost anything yet - nothing was received, nothing
paid - so only "received" orders count, dated by received_at (when the
cash/commitment actually left), not created_at (when it was merely
ordered). Expense.date is the date the expense entry is itself for.
"""

from datetime import datetime

from sqlalchemy.orm import Session

from ..expenses.models import Expense
from ..purchases.models import PurchaseOrder

# Same safety cap reasoning as revenue_service.py's _MAX_PER_SOURCE.
_MAX_PER_SOURCE = 10_000


def _purchase_order_entries(db: Session, from_date: datetime | None, to_date: datetime | None) -> list[dict]:
	query = db.query(PurchaseOrder).filter(PurchaseOrder.status == "received")
	if from_date:
		query = query.filter(PurchaseOrder.received_at >= from_date)
	if to_date:
		query = query.filter(PurchaseOrder.received_at <= to_date)
	orders = query.order_by(PurchaseOrder.received_at.desc()).limit(_MAX_PER_SOURCE).all()
	return [
		{
			"type": "purchase_order",
			"id": order.id,
			"reference": f"PO-{order.id}",
			"occurred_at": order.received_at,
			"method": "purchase",
			"amount": float(order.total),
			"label": order.supplier_name,
		}
		for order in orders
	]


def _expense_entries(db: Session, from_date: datetime | None, to_date: datetime | None) -> list[dict]:
	query = db.query(Expense)
	if from_date:
		query = query.filter(Expense.date >= from_date)
	if to_date:
		query = query.filter(Expense.date <= to_date)
	entries = query.order_by(Expense.date.desc()).limit(_MAX_PER_SOURCE).all()
	return [
		{
			"type": "expense",
			"id": entry.id,
			"reference": entry.category,
			"occurred_at": entry.date,
			"method": "expense",
			"amount": float(entry.amount),
			"label": entry.description,
		}
		for entry in entries
	]


def list_expense_entries(
	db: Session,
	skip: int = 0,
	limit: int = 100,
	from_date: datetime | None = None,
	to_date: datetime | None = None,
) -> tuple[list[dict], int]:
	entries = [
		*_purchase_order_entries(db, from_date, to_date),
		*_expense_entries(db, from_date, to_date),
	]
	entries.sort(key=lambda e: e["occurred_at"], reverse=True)
	total = len(entries)
	return entries[skip : skip + limit], total
