# Deploy + Public Funnel

**Warning:** the last step (`tailscale funnel --bg 3000`) exposes the app to the
**public internet**, not just your tailnet. Anyone with the URL can reach it —
there's no auth in front of it unless the app itself has one. Only run this
when you actually want that; use `tailscale funnel 3000 off` to turn it back
off, and `tailscale funnel status` to check whether it's currently on.

```powershell
git status --short --branch; git pull --ff-only origin main; docker compose -f docker/docker-compose.yml up -d; Push-Location backend; & .\.venv\Scripts\python.exe -m pip install -r requirements.txt; & .\.venv\Scripts\python.exe -m alembic upgrade head; Pop-Location; Push-Location frontend; npm run build; $buildOk = ($LASTEXITCODE -eq 0); Pop-Location; if ($buildOk) { Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'BioClean.*vite|vite.js.*3000|app.main:app|uvicorn' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }; Start-Sleep -Milliseconds 800; $backend = Start-Process -WindowStyle Hidden -FilePath (Resolve-Path 'backend\.venv\Scripts\python.exe') -ArgumentList '-m','uvicorn','app.main:app','--host','0.0.0.0','--port','3000' -WorkingDirectory (Resolve-Path 'backend') -RedirectStandardOutput (Join-Path (Resolve-Path 'backend') 'uvicorn.local.log') -RedirectStandardError (Join-Path (Resolve-Path 'backend') 'uvicorn.local.err.log') -PassThru; Write-Output "Started $($backend.Id)"; Start-Sleep -Seconds 2; try { $app = (Invoke-WebRequest 'http://localhost:3000/' -UseBasicParsing -TimeoutSec 10).StatusCode } catch { $app = "FAILED" }; try { $health = (Invoke-WebRequest 'http://localhost:3000/health' -UseBasicParsing -TimeoutSec 10).StatusCode } catch { $health = "FAILED" }; Write-Output "app=$app health=$health"; tailscale funnel --bg 3000 } else { Write-Output "Frontend build failed - not restarting. Check the error above." }; Write-Output "`n=== Tailscale ==="; tailscale status; Write-Output "`n=== Funnel ==="; tailscale funnel status; Write-Output "`n=== Git ==="; git status --short --branch; git log -1 --oneline
```

## What changed vs. the tailnet-only version

- Added `tailscale funnel --bg 3000` right after the health checks pass,
  so it only runs if the build/restart actually succeeded.
- `--bg` keeps the funnel running in the background instead of holding
  the terminal open.
- The final `tailscale funnel status` block will now show the funnel URL
  as public instead of `(tailnet only)`.

## Turning it back off

```powershell
tailscale funnel 3000 off
```
