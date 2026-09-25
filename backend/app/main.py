import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .core.config import settings
from .customers.router import router as customers_router
from .dashboard.router import router as dashboard_router
from .expenses.router import router as expenses_router
from .income.router import router as income_router
from .invoicing.router import router as invoicing_router
from .items.router import router as items_router
from .pos.router import router as pos_router
from .purchases.router import router as purchases_router
from .quotation.router import router as quotation_router
from .reports.router import router as reports_router
from .settings.router import router as app_settings_router
from .suppliers.router import router as suppliers_router
from .warehouses.router import router as warehouses_router

app = FastAPI(title="BioClean API")

app.add_middleware(
	CORSMiddleware,
	allow_origins=settings.cors_origins,
	allow_credentials=True,
	allow_methods=["*"],
	allow_headers=["*"],
	expose_headers=["X-Total-Count"],
)

# Uploaded item photos (see items/router.py:upload_item_image) - served back
# out at the same /uploads/... path stored in Item.image_url. Proxied
# through the frontend dev server like /api, per the project's "browser
# never hits the backend directly" rule (see frontend/vite.config.ts).
UPLOADS_DIR = os.path.join(os.path.dirname(__file__), "..", "uploads")
os.makedirs(UPLOADS_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")

app.include_router(items_router, prefix=settings.api_v1_prefix)
app.include_router(suppliers_router, prefix=settings.api_v1_prefix)
app.include_router(warehouses_router, prefix=settings.api_v1_prefix)
app.include_router(app_settings_router, prefix=settings.api_v1_prefix)
app.include_router(pos_router, prefix=settings.api_v1_prefix)
app.include_router(customers_router, prefix=settings.api_v1_prefix)
app.include_router(invoicing_router, prefix=settings.api_v1_prefix)
app.include_router(quotation_router, prefix=settings.api_v1_prefix)
app.include_router(purchases_router, prefix=settings.api_v1_prefix)
app.include_router(expenses_router, prefix=settings.api_v1_prefix)
app.include_router(income_router, prefix=settings.api_v1_prefix)
app.include_router(dashboard_router, prefix=settings.api_v1_prefix)
app.include_router(reports_router, prefix=settings.api_v1_prefix)


@app.get("/health")
def health():
	return {"status": "ok"}
