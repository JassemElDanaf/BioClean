from datetime import date, datetime

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from ..core.database import get_db
from ..shared.archive import archive_document
from ..shared.export import to_csv_response
from ..shared.timezone import BUSINESS_TZ, parse_local_date_range
from . import pdf, schemas, service

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/summary", response_model=schemas.DashboardSummary)
def get_dashboard_summary(from_date: str | None = None, to_date: str | None = None, db: Session = Depends(get_db)):
	start, end = parse_local_date_range(from_date, to_date)
	return service.get_summary(db, start, end)


@router.get("/insights", response_model=schemas.DashboardInsights)
def get_dashboard_insights(from_date: str | None = None, to_date: str | None = None, db: Session = Depends(get_db)):
	start, end = parse_local_date_range(from_date, to_date)
	return service.get_insights(db, start, end)


def _period_label(from_date: str | None, to_date: str | None) -> str:
	if not from_date and not to_date:
		return "All Time"
	if from_date == to_date:
		return date.fromisoformat(from_date).strftime("%B %d, %Y")
	start_label = date.fromisoformat(from_date).strftime("%B %d, %Y") if from_date else "the beginning"
	end_label = date.fromisoformat(to_date).strftime("%B %d, %Y") if to_date else "now"
	return f"{start_label} - {end_label}"


@router.get("/summary/export/csv")
def export_dashboard_summary_csv(from_date: str | None = None, to_date: str | None = None, db: Session = Depends(get_db)):
	start, end = parse_local_date_range(from_date, to_date)
	summary = service.get_summary(db, start, end)
	rows = [
		{"Line Item": "POS Sales Revenue (net of returns)", "Amount": summary["sales_revenue"]},
		{"Line Item": "Invoice Revenue (paid only)", "Amount": summary["invoice_revenue"]},
		{"Line Item": "Sales", "Amount": summary["sales_revenue"] + summary["invoice_revenue"]},
		{"Line Item": "Other", "Amount": summary["manual_income"]},
		{"Line Item": "Total Income", "Amount": summary["total_revenue"]},
		{"Line Item": "Cost of Goods Sold", "Amount": -summary["cogs"]},
		{"Line Item": "Gross Profit", "Amount": summary["gross_profit"]},
		{"Line Item": "Expenses", "Amount": -summary["expenses_total"]},
		{"Line Item": "Net Profit", "Amount": summary["net_profit"]},
		{"Line Item": "Inventory Purchases (cash out)", "Amount": summary["purchases_total"]},
		{"Line Item": f"Unpaid Invoices ({summary['unpaid_invoices_count']})", "Amount": summary["unpaid_invoices_total"]},
	]
	return to_csv_response(rows, "financial_summary")


@router.get("/summary/export/pdf")
def export_dashboard_summary_pdf(from_date: str | None = None, to_date: str | None = None, db: Session = Depends(get_db)):
	start, end = parse_local_date_range(from_date, to_date)
	summary = service.get_summary(db, start, end)
	now = datetime.now(BUSINESS_TZ)
	pdf_bytes = pdf.generate_financial_summary_pdf(
		summary,
		period_label=_period_label(from_date, to_date),
		generated_at=now.strftime("%B %d, %Y %I:%M %p"),
	)
	# Every generated PDF in this app mirrors a copy to the Documents
	# archive (see invoicing/service.py, purchases/service.py, pos/
	# service.py) - timestamped rather than keyed by a stable id, same
	# reasoning as to_csv_response's own archiving: this is a dated
	# snapshot of "the report as of right now", not a single document to
	# overwrite on regen, so two exports run minutes apart both survive.
	archive_document("Reports", now, f"financial-summary_{now.strftime('%Y%m%d_%H%M%S')}.pdf", pdf_bytes)
	return Response(
		content=pdf_bytes,
		media_type="application/pdf",
		headers={"Content-Disposition": 'inline; filename="financial-summary.pdf"'},
	)
