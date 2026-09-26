from datetime import datetime

from sqlalchemy.orm import Session

from .models import AuditLog


def log_action(db: Session, user: str, method: str, path: str, status_code: int, body: str | None = None) -> None:
	db.add(AuditLog(user=user, method=method, path=path, status_code=status_code, body=body))
	db.commit()


def query_audit_log(
	db: Session,
	from_date: datetime | None = None,
	to_date: datetime | None = None,
	user: str | None = None,
	method: str | None = None,
):
	query = db.query(AuditLog)
	if from_date:
		query = query.filter(AuditLog.created_at >= from_date)
	if to_date:
		query = query.filter(AuditLog.created_at <= to_date)
	if user:
		query = query.filter(AuditLog.user == user)
	if method:
		query = query.filter(AuditLog.method == method)
	return query.order_by(AuditLog.created_at.desc()).limit(1000).all()
