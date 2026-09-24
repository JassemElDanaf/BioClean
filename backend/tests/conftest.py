"""In-memory SQLite per test - fast, and isolated from whatever real
Postgres database is running in Docker for local dev. Schema comes from
Base.metadata.create_all() rather than running the (Postgres-specific)
Alembic migrations, so the default warehouse row that migration
15808ae4ee21 inserts has to be created here instead.

override_get_db opens a *new* Session per request, same as the real
get_db() does in production - all requests in a test share one
StaticPool'd connection, so data still persists across them, but each
request's transaction is independent and gets rolled back on close() if
it was never committed. That per-request isolation is load-bearing: it's
the actual mechanism (not just a convention) that makes a failed
checkout() atomic - see pos/service.py's checkout() docstring - and a
single shared session across requests would silently hide a broken
rollback path instead of catching it."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.shared.archive as archive_module
from app.core.database import Base, get_db
from app.main import app
from app.warehouses.models import Warehouse


@pytest.fixture(autouse=True)
def isolate_document_archive(tmp_path, monkeypatch):
	"""Every test that hits a PDF/CSV endpoint would otherwise write real
	files into the real Documents backup folder - redirect ARCHIVE_ROOT to
	a throwaway tmp_path for the duration of each test instead."""
	monkeypatch.setattr(archive_module, "ARCHIVE_ROOT", str(tmp_path / "Documents"))


@pytest.fixture()
def engine():
	engine = create_engine(
		"sqlite:///:memory:",
		connect_args={"check_same_thread": False},
		poolclass=StaticPool,
	)
	Base.metadata.create_all(bind=engine)
	session = sessionmaker(autocommit=False, autoflush=False, bind=engine)()
	session.add(Warehouse(name="Main Store", is_default=True))
	session.commit()
	session.close()
	return engine


@pytest.fixture()
def client(engine):
	TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

	def override_get_db():
		db = TestingSessionLocal()
		try:
			yield db
		finally:
			db.close()

	app.dependency_overrides[get_db] = override_get_db
	try:
		yield TestClient(app)
	finally:
		app.dependency_overrides.clear()
