# BioClean ERP

Self-hosted ERPNext-based ERP/POS for BioClean. ERPNext (Frappe framework) handles
accounting, inventory, and purchasing; this repo is the **`bioclean` custom Frappe
app** built on top of it — POS UX, receipts, pricing, dashboards — kept separate
from ERPNext core so upgrades never clobber custom work.

Full architecture/design decisions: see the project plan (referenced in this
repo's issue tracker / kept by the project owner). This README + `DEPLOY.md`
cover only what's needed to actually run the thing.

## Repo layout

This repo's root **is** the `bioclean` Frappe app itself — the same pattern
official apps like Frappe Helpdesk/CRM use, so `bench get-app <this-repo-url>`
just works.

```
BioClean/
├── bioclean/              # Python package: doctypes, hooks.py, api (the actual app)
├── pyproject.toml         # Frappe app metadata
├── frontend/              # Vue 3 + frappe-ui POS UI (added in Phase 3)
├── docker/
│   ├── apps.json          # erpnext + bioclean, pinned versions - see below
│   ├── frappe_docker.pin  # exact frappe_docker commit this setup is built against
│   ├── compose.yaml       # vendored base compose (production)
│   ├── overrides/         # vendored compose overrides (mariadb, redis, backups, ...)
│   ├── docker-compose.dev.yml  # dev stack (this repo bind-mounted straight into the bench)
│   └── .env.example       # copy to .env, fill in secrets - never commit .env
├── .github/workflows/deploy.yml  # staging-gated auto-deploy on merge to main
├── DEPLOY.md              # host PC setup: auto-start, backups, remote access, rollback
└── README.md              # this file
```

## Pinned versions

No floating `latest` anywhere. Current pins:

- **ERPNext**: `v16.35.0`
- **Frappe framework**: `version-16` branch (tracks the same major version ERPNext is pinned to)
- **frappe_docker**: commit in `docker/frappe_docker.pin`

A version bump is a deliberate, reviewed change to these files — never a side effect of a routine deploy.

## Dev setup (any machine with Docker + git)

This is the whole setup — no separate `frappe_docker` clone needed, no manual
bench install. Everything below runs the same way on a brand-new PC.

```bash
git clone https://github.com/JassemElDanaf/BioClean.git
cd BioClean
docker compose -f docker/docker-compose.dev.yml up -d
```

This starts MariaDB, Redis (cache + queue), and a `frappe/bench` container with
this repo bind-mounted directly into `frappe-bench/apps/bioclean` — edits you
make in this repo are picked up immediately inside the container, no rebuild.

Then, one-time bench setup inside the container:

```bash
docker exec -it docker-frappe-1 bash

# Inside the container:
cd /home/frappe/bench-workspace
bench init --frappe-branch version-16 --skip-redis-config-generation frappe-bench
cd frappe-bench
bench set-config -g db_host mariadb
bench set-config -g redis_cache redis://redis-cache:6379
bench set-config -g redis_queue redis://redis-queue:6379
bench set-config -g redis_socketio redis://redis-queue:6379
bench get-app --branch v16.35.0 erpnext
bench new-site --mariadb-user-host-login-scope=% --db-root-password 123 \
  --admin-password admin --install-app erpnext bioclean.localhost
bench --site bioclean.localhost install-app bioclean
bench --site bioclean.localhost set-config developer_mode 1
bench start
```

Then visit `http://localhost:8000` with your browser's Host header set to
`bioclean.localhost` (or add `127.0.0.1 bioclean.localhost` to your hosts
file and visit `http://bioclean.localhost:8000` directly). Login as
`Administrator` / `admin`.

**Why this two-step dance (compose up, then bench init by hand) instead of one
command?** `bench init` needs to happen once, interactively-ish, the first
time. After that, `bench-data` (a Docker volume) holds the fully initialized
bench permanently — `docker compose up -d` on a machine that's done this once
already just starts the same bench back up. A from-scratch automation script
that does all of the above in one shot is a reasonable later addition; doing
it by hand once is fine for now and makes every step visible while the setup
is still young.

### Frontend (Cashier Mode UI)

The `frontend/` directory is a separate Vue 3 + frappe-ui app. It is **not**
part of the Python app's install/migrate cycle — build it explicitly whenever
you change it:

```bash
docker exec -it docker-frappe-1 bash
cd /home/frappe/bench-workspace/frappe-bench/apps/bioclean/frontend
npm install
npm run build
```

This writes static assets into `bioclean/public/frontend/` (gitignored — built
fresh, never committed, same principle as not committing compiled Python
bytecode). Frappe serves the built app at `/bioclean` (see
`website_route_rules` in `hooks.py` and `bioclean/www/bioclean.py`), proxying
every deep link (`/bioclean/whatever`) back to the same `index.html` so Vue
Router can handle client-side routing.

For active frontend development with hot reload instead of rebuilding on
every change, run `npm run dev` inside `frontend/` (Vite dev server on
`:8080`, proxying `/app`, `/api`, `/assets`, `/files`, `/private` back to
the bench on `:8000`) and browse to `http://localhost:8080` instead of
through Frappe directly.

**Note on Docker Desktop for Windows:** the bind mount between this repo and
the container uses a 9p/drvfs bridge that has a known caching bug — a
directory or file newly created by one process (e.g. the Vite build) is
occasionally invisible to a *different* process/container instance until
something reads/writes it from inside that same container. If assets 404
right after a rebuild, `docker compose restart frappe` (or rebuild again
from inside the same still-running container) before assuming it's a code
bug.

## Production setup

See `DEPLOY.md` — covers the host PC (Windows, Docker Engine under WSL2,
auto-start on boot/reboot), the self-hosted GitHub Actions runner, backups,
remote access (Tailscale), and the rollback procedure.

## Project rule

Use native ERPNext/Frappe doctypes, workflows, permissions, reports,
accounting, and stock functionality wherever they already satisfy the
requirement. BioClean-specific behavior belongs in this app. Never modify or
fork ERPNext/Frappe core — if there's no clean extension mechanism for
something, that's a signal to reconsider the approach, not to patch core.
