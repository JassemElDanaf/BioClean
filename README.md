# BioClean ERP

Self-hosted ERP/POS for BioClean, built as a plain **React + FastAPI +
PostgreSQL** stack (no framework like ERPNext underneath — everything here
is custom, purpose-built for how BioClean actually operates).

## Stack

- **Frontend**: React + TypeScript + Vite, React Router for per-tab URLs
- **Backend**: FastAPI, SQLAlchemy, Alembic migrations
- **Database**: PostgreSQL (via Docker)

## Repo layout

```
BioClean/
├── backend/
│   ├── app/
│   │   ├── core/        # config, DB session - shared infra
│   │   ├── items/       # Inventory: models, schemas, service, router
│   │   ├── suppliers/
│   │   ├── warehouses/
│   │   ├── settings/    # admin-editable settings (USD→LBP rate, etc.)
│   │   └── shared/      # cross-domain utilities (CSV export, currency)
│   ├── alembic/         # migrations
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── features/    # one folder per domain (inventory, reports, settings, ...)
│       ├── tabs/         # thin per-route wrappers around features/
│       ├── components/  # shared UI (Modal, ActionsMenu)
│       └── lib/         # shared frontend utilities (API client, currency)
└── docker/
    └── docker-compose.yml   # Postgres only - backend/frontend run natively
```

**Why this structure**: each domain (Inventory today; Purchasing, POS,
Invoicing, etc. as they're built) owns its own models/schemas/router on
the backend and its own folder under `features/` on the frontend. Adding
a new module means adding a new folder, not touching existing ones.

## Fresh setup (any machine)

**Prerequisites**: Docker Desktop, Python 3.12+, Node 20+.

```bash
git clone https://github.com/JassemElDanaf/BioClean.git
cd BioClean

# 1. Database
cd docker
docker compose up -d
cd ..

# 2. Backend
cd backend
python -m venv .venv
./.venv/Scripts/activate        # Windows; use `source .venv/bin/activate` on macOS/Linux
pip install -r requirements.txt
python -m alembic upgrade head
python -m uvicorn app.main:app --reload --port 3001

# 3. Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

Visit **http://localhost:3000**. The frontend dev server proxies `/api`
to the backend on port 3001 (see `frontend/vite.config.ts`) - the backend
itself is never hit directly from the browser.

Default Postgres credentials (dev only, see `docker/docker-compose.yml`):
`bioclean` / `bioclean`, database `bioclean`.

A fresh database starts with **zero items** - there is deliberately no
seed script. This app now holds BioClean's real inventory; a script that
auto-populates a demo catalogue whenever the table is empty is exactly
the kind of thing that silently overwrites real data after a legitimate
cleanup. Add items by hand through the Inventory tab.

## Database migrations

Every schema change is a real Alembic migration - never edit the schema
by hand or rely on `create_all()`.

```bash
cd backend
python -m alembic revision --autogenerate -m "describe the change"
# review the generated file in alembic/versions/ before applying -
# autogenerate gets NOT NULL columns and data backfills wrong by default
python -m alembic upgrade head
```

## Remote access via Tailscale

This dev setup is reachable from any other device on the same [Tailscale](https://tailscale.com)
network (tailnet) - useful for continuing work from a second computer
without re-cloning/re-setting-up a whole separate database, or for showing
someone else the running app.

**One-time setup** (on whichever machine is actually running the backend/
frontend/Postgres - call this the "host" machine):

1. Install Tailscale and log in: `tailscale up`
2. Note the machine's Tailscale hostname (`tailscale status` or the
   Tailscale admin console) - it looks like `<name>.<tailnet>.ts.net`.
   This project's current host resolves at `sp01b01zz7469j.tailb446a6.ts.net`.
3. That hostname must be allow-listed in `frontend/vite.config.ts`'s
   `server.allowedHosts` (Vite rejects unrecognized Host headers by
   default) - it's already there for the hostname above; add your own if
   it differs.

**From a second machine**, once it's on the same tailnet (`tailscale up`
there too): browse to `http://<host-machine-tailscale-hostname>:3000` -
same app, same database, no separate setup needed. This only works while
the host machine has Postgres, the backend, and the frontend dev server
all actually running.

**If you instead want a fully independent local copy** on the second
machine (its own database, no dependency on the first machine being on),
just run the "Fresh setup" steps above there instead - Tailscale isn't
needed for that path.

## Common gotchas

- **Backend won't start / port already in use**: check for a stale
  `uvicorn` process (`taskkill /F /IM python.exe` on Windows) before
  restarting - a previous `--reload` process sometimes lingers.
- **API calls return connection errors after the host machine sleeps/
  restarts Docker**: the SQLAlchemy engine is configured with
  `pool_pre_ping=True` specifically to recover from this (see
  `backend/app/core/database.py`) - if it still happens, restart the
  backend process.
- **Docker/WSL2 memory**: if running on Windows with Docker Desktop's
  WSL2 backend, its memory ceiling is controlled by `%UserProfile%\.wslconfig`,
  not Docker Desktop's own settings UI. Changing it requires `wsl --shutdown`
  followed by `docker compose up -d` in `docker/` to bring Postgres back up.
