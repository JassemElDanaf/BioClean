from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .core.config import settings
from .items.router import router as items_router
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
)

app.include_router(items_router, prefix=settings.api_v1_prefix)
app.include_router(suppliers_router, prefix=settings.api_v1_prefix)
app.include_router(warehouses_router, prefix=settings.api_v1_prefix)
app.include_router(app_settings_router, prefix=settings.api_v1_prefix)


@app.get("/health")
def health():
	return {"status": "ok"}
