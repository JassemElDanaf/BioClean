# Deploying BioClean to the host PC

This is the machine that runs the real, always-on ERPNext instance BioClean
actually uses day to day. It is **Windows + WSL2 + Docker Engine inside WSL2**
— deliberately **not Docker Desktop**, because Docker Desktop is a GUI app
that needs an interactive Windows login session to run at all, which directly
conflicts with "comes back on its own after a power outage with nobody
around." Everything that needs to survive a reboot unattended — Docker, the
containers, the GitHub Actions runner — runs as a Linux systemd service
*inside* WSL2. Windows's only two jobs are: (1) make sure the WSL2 VM is
actually running, and (2) turn the PC back on after a power cut. That split
is what makes headless auto-start actually reliable.

## Architecture (see the project plan for full detail)

```
ERPNext/Frappe (native) -> bioclean custom app -> Docker (WSL2, headless)
  -> GitHub (PR -> merge to main) -> self-hosted runner (inside WSL2)
  -> backup -> staging restore -> build -> migrate+smoke-test staging
  -> only if that passes: migrate + restart production
  -> daily automated backups -> Google Drive
  -> Tailscale (remote access) + reverse proxy (TLS)
  -> Docker restart policies + WSL2 auto-boot + BIOS power-restore
```

---

## 1. One-time host PC setup

### 1.1 Install WSL2 + a Linux distro

In an elevated (Administrator) PowerShell on the host PC:

```powershell
wsl --install -d Ubuntu-24.04
wsl --set-default-version 2
wsl --set-default Ubuntu-24.04
```

Reboot if prompted, then open the Ubuntu distro once to finish its first-run
setup (create a Linux username/password).

### 1.2 Enable systemd inside WSL2

Systemd is what lets Docker and the GitHub Actions runner start automatically
*inside* the Linux environment, independent of anyone being logged into
Windows. Inside the Ubuntu WSL2 shell:

```bash
sudo tee /etc/wsl.conf > /dev/null <<'EOF'
[boot]
systemd=true
EOF
```

Then, from PowerShell, restart WSL2 so it picks this up:

```powershell
wsl --shutdown
wsl -d Ubuntu-24.04
```

Confirm systemd is actually running as PID 1:

```bash
ps -p 1 -o comm=
# should print: systemd
```

### 1.3 Disable WSL2's idle auto-shutdown

By default WSL2 can suspend the VM after a period of inactivity. Since we
need it to genuinely stay up indefinitely, disable that. On the **Windows**
side, create/edit `%UserProfile%\.wslconfig`:

```ini
[wsl2]
vmIdleTimeout=-1
```

Then `wsl --shutdown` and reopen once to apply.

### 1.4 Install Docker Engine inside WSL2 (not Docker Desktop)

Inside the Ubuntu WSL2 shell:

```bash
curl -fsSL https://get.docker.com | sudo bash
sudo usermod -aG docker $USER
sudo systemctl enable docker
sudo systemctl start docker
```

Log out/in of the WSL2 shell (or `newgrp docker`) so the group membership
takes effect, then confirm:

```bash
docker run hello-world
```

`systemctl enable docker` is what makes the daemon start automatically the
moment WSL2's systemd comes up — no manual `dockerd` invocation, ever.

### 1.5 Make Windows actually boot WSL2 on startup

WSL2 doesn't start itself when Windows boots — something has to ask it to.
Use a Scheduled Task that runs **at system startup**, not at user logon, and
**whether a user is logged on or not**, so it works even if nobody signs in:

```powershell
$action = New-ScheduledTaskAction -Execute "wsl.exe" -Argument "-d Ubuntu-24.04 -u root -- /bin/true"
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
Register-ScheduledTask -TaskName "BioClean-WSL-Boot" -Action $action -Trigger $trigger -Principal $principal -Settings $settings
```

Once WSL2 boots this way, systemd inside it starts Docker automatically
(step 1.4), and Docker's own `restart: unless-stopped` policy on every
BioClean container (already set in `docker/compose.yaml`) brings the actual
application containers back up **without needing a `docker compose up`
command run again** — Docker remembers which containers were running and
restarts them when the daemon comes back.

### 1.6 BIOS/UEFI: restore power state after an outage

Reboot into BIOS/UEFI setup (usually `Del` or `F2` at boot) and find the
power-loss setting — named differently per vendor:

- Dell: **AC Recovery** -> `Power On`
- HP: **After Power Loss** -> `Power On`
- ASUS/MSI (consumer boards): **Restore AC Power Loss** -> `Power On`

This is the step that makes the whole chain above start from a dead outage,
not just a graceful reboot: PC powers on -> Windows boots -> Scheduled Task
boots WSL2 -> systemd starts Docker -> Docker restarts BioClean's containers.

**Test this for real** — don't just assume it works. Pull the power cord (or
flip the breaker), wait 30 seconds, restore power, and confirm the site is
reachable again on its own without anyone touching the keyboard.

### 1.7 Optional but worth it: UPS + 4G/LTE failover

- A small UPS avoids the one scenario the above doesn't fully cover: a hard
  power cut *mid database write*, which the restart chain above will recover
  from (MariaDB is crash-safe) but which a UPS avoids causing in the first
  place.
- A cheap 4G/LTE failover router (or a phone hotspot as a manual fallback)
  keeps remote access, backup uploads, and CI/CD deploys working through an
  ISP outage — the core POS itself doesn't need internet at all (see below).

---

## 2. Clone the repo and build the production image

```bash
git clone https://github.com/JassemElDanaf/BioClean.git ~/bioclean
cd ~/bioclean/docker
cp .env.example .env
nano .env   # fill in DB_PASSWORD, ADMIN_PASSWORD, SITE_NAME, etc.
```

Build the image (fetches `frappe_docker` at the pinned commit in
`frappe_docker.pin`, then builds with our `apps.json`):

```bash
PIN=$(cat frappe_docker.pin)
git clone https://github.com/frappe/frappe_docker.git /tmp/frappe_docker-build
git -C /tmp/frappe_docker-build checkout "$PIN"
cp apps.json /tmp/frappe_docker-build/apps.json
docker build \
  --build-arg=FRAPPE_PATH=https://github.com/frappe/frappe \
  --build-arg=FRAPPE_BRANCH=version-16 \
  --secret=id=apps_json,src=/tmp/frappe_docker-build/apps.json \
  --tag=bioclean:v16.35.0 \
  --file=/tmp/frappe_docker-build/images/layered/Containerfile \
  /tmp/frappe_docker-build
```

## 3. First deploy (done once, manually, to establish the site)

```bash
cd ~/bioclean/docker
export $(grep -v '^#' .env | xargs)
docker compose -p bioclean-prod --env-file .env \
  -f compose.yaml -f overrides/compose.mariadb.yaml -f overrides/compose.redis.yaml \
  -f overrides/compose.noproxy.yaml -f overrides/compose.backup-cron.yaml up -d

# Create the production site (first time only):
docker compose -p bioclean-prod --env-file .env exec backend \
  bench new-site --mariadb-user-host-login-scope=% \
  --db-root-password "$DB_PASSWORD" --admin-password "$ADMIN_PASSWORD" \
  --install-app erpnext --install-app bioclean "$SITE_NAME"
```

Visit `http://<host-pc-lan-ip>:8080` (Host header / hosts-file entry set to
your `SITE_NAME`) to confirm it's live.

## 4. CI/CD setup (self-hosted runner, inside WSL2)

Register a self-hosted runner **inside the same Ubuntu WSL2 environment**
(not as a Windows service) — this keeps it in the same place as Docker, so
the workflow's `docker` commands just work with no cross-boundary exec.

From the repo's GitHub Settings -> Actions -> Runners -> "New self-hosted
runner", follow the generated `./config.sh` command inside WSL2, labeling it
`bioclean-host` to match `.github/workflows/deploy.yml`'s `runs-on`. Then:

```bash
sudo ./svc.sh install
sudo ./svc.sh start
```

This installs it as a systemd service too — same auto-start guarantee as
Docker itself (step 1.4-1.5 bring WSL2 and systemd up; systemd brings the
runner up).

From here, every merge to `main` runs the staging-gated pipeline in
`.github/workflows/deploy.yml` automatically.

## 5. Backups

`docker/overrides/compose.backup-cron.yaml` runs `bench backup --with-files`
once a day (`BACKUP_CRONSTRING=@daily` in `.env` — stretch to `@every 2d` if
daily ever proves too resource-heavy, though at this scale it shouldn't).

Upload backups off the host PC via `rclone` to Google Drive:

```bash
# One-time setup inside WSL2:
curl https://rclone.org/install.sh | sudo bash
rclone config   # create a remote named to match RCLONE_REMOTE_NAME in .env
```

Add a cron entry (`crontab -e` inside WSL2) to push new backups after they're
created:

```
15 0 * * * rclone copy ~/bioclean-sites-volume/private/backups <remote-name>:bioclean-backups --min-age 5m
```

(Adjust the source path to wherever the `sites` Docker volume's backup
directory actually resolves — `docker volume inspect bioclean-prod_sites` on
the host.)

**Retention**: keep daily for ~2 weeks, weekly for ~2-3 months, monthly
beyond that — prune with `rclone` filters or a simple scheduled script.

**Restore testing**: periodically restore the latest backup into a throwaway
site (e.g. on the dev PC) and confirm it comes up cleanly — this is what
actually proves a backup works, not just that the file exists.

**Full disaster-recovery drill** (quarterly): simulate "the host PC is
completely gone" — rebuild the stack on a different machine from nothing but
this repo, the pinned versions, a production backup, and this document. If
that works, BioClean isn't secretly dependent on undocumented state that only
lives on the original host PC.

## 6. Remote access

Install [Tailscale](https://tailscale.com/download) inside WSL2 (or on
Windows directly — either works, but WSL2 keeps everything in one place):

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

Then from any device on your tailnet, reach the site at the host's Tailscale
address. No port-forwarding, no exposing the host PC to the public internet.

## 7. Rollback

Two distinct cases:

- **Staging failed during a deploy**: nothing to roll back — production was
  never touched. This is what the pipeline optimizes for.
- **Production migration ran, then something broke** (missed by the smoke
  test): (1) stop the new container, (2) restore the MariaDB database from
  the backup taken immediately before that deploy (step in the workflow logs
  timestamps this), (3) redeploy the previous image tag
  (`docker images | grep bioclean` to find it), (4) re-run the health check.

## 8. Internet independence

Day-to-day POS/ERP use is pure LAN traffic between a register and this host
PC — it does **not** depend on internet connectivity. Internet is only
needed for: remote access (Tailscale), backup uploads (Google Drive), CI/CD
deploys (GitHub), and any future automated exchange-rate fetching. An ISP
outage pauses those four things; the register keeps working.
