import os
import secrets

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
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


# Single shared password gating the whole app now that it's reachable over
# the Tailscale Funnel (i.e. the public internet), not just the tailnet.
# HTTP Basic rather than a login page/cookie because it's the least code -
# the browser's native auth prompt handles storing/resending credentials,
# so there's no session/cookie logic to write. Username is ignored; only
# the password (settings.app_password, numbers-only, changeable via .env)
# is checked. Skips /health so uptime checks don't need credentials.
@app.middleware("http")
async def require_password(request: Request, call_next):
	if request.url.path == "/health":
		return await call_next(request)

	auth = request.headers.get("Authorization")
	if auth and auth.startswith("Basic "):
		import base64

		try:
			decoded = base64.b64decode(auth[len("Basic "):]).decode()
			_, _, password = decoded.partition(":")
		except Exception:
			password = ""
		if secrets.compare_digest(password, settings.app_password):
			return await call_next(request)

	return Response(
		status_code=401,
		headers={"WWW-Authenticate": 'Basic realm="BioClean"'},
	)


# Serves the frontend's production build (frontend/dist, from `npm run
# build`) directly out of this same process - the daily-use alternative to
# running the Vite dev server (`npm run dev`). The dev server watches every
# file in the project for hot-reload, which on a machine where the project
# folder lives inside an OneDrive-synced directory means a background
# OneDrive sync can look exactly like a code change and trigger a full page
# reload with nobody having touched anything. A production build has no
# file-watcher at all, so this can never happen - and it collapses "two
# processes on two ports" into one, since API_BASE/image_url are already
# relative paths (see lib/api.ts, items/router.py) that work identically
# whether the frontend is proxied by Vite or served from right here.
#
# Registered last, and only mounted if the build actually exists - a dev
# environment that hasn't run `npm run build` yet just doesn't get this
# route, and every API/upload/health route above still take priority over
# anything with a matching path.
_FRONTEND_DIST = os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist")
if os.path.isdir(_FRONTEND_DIST):
	app.mount("/assets", StaticFiles(directory=os.path.join(_FRONTEND_DIST, "assets")), name="frontend-assets")

	@app.get("/{full_path:path}")
	def serve_frontend(full_path: str):
		# React Router handles client-side routes like /inventory or /pos -
		# there's no real file for those, so every non-API, non-asset path
		# gets index.html and the router takes it from there, same as any
		# other single-page app served statically.
		return FileResponse(os.path.join(_FRONTEND_DIST, "index.html"))
