# Hosting Guide (v3 — Contabo VPS)

> The site used to run on Render; it now runs on our own **Contabo VPS**. Costs: see **PUBLISHING-AND-COSTS.md**.

## Server setup

| | |
|---|---|
| Provider | Contabo VPS |
| OS | Ubuntu 24.04 LTS |
| IPv4 | `169.58.153.224` |
| IPv6 | `2a02:c207:2364:3028::1` |
| Code | `/home/javkhlan/b-guasha` (git clone of `github.com/Jaki-73/b-guasha`) |

- **Docker and Docker Compose** are installed. The app and Caddy run as containers. Data lives in `./data` on the server (gitignored).
- **Firewall:** ufw is active and allows only OpenSSH (22), 80 and 443. The Contabo panel firewall is not used.
- **Docker and ufw:** Docker bypasses ufw for published ports, so only Caddy may publish ports. The app must stay on Docker's internal network (`expose`, never `ports`, in `docker-compose.yml`).
- **SSH:** root login is disabled (`PermitRootLogin no`). fail2ban is running with the sshd jail. Password login is still on; no SSH key is set up yet.
- **Users:** the app is managed as user `javkhlan` (uid 1001, in the docker group). Firewall, SSH, user and sudo changes are done by the owner with sudo, not by Claude.
- **Git:** the remote uses a GitHub deploy key (`~/.ssh/github_deploy`), scoped to this repo only.

## How it runs (Docker)

- `docker-compose.yml` runs two containers: **app** (`node server.js`, built from `Dockerfile`) and **caddy** (ports 80/443, automatic Let's Encrypt HTTPS, config in `Caddyfile`).
- **Data**: `./data` on the VPS disk is mounted into the app (`BG_DATA_DIR=/data`), so bookings, accounts and photos survive restarts and rebuilds.
- **Secrets**: `.env` (not in git, readable only by the owner) holds `ADMIN_PIN` and `SUPER_ADMIN_PASSWORD`. `cat .env` to see them.
- Both containers restart automatically on crash and on reboot.

Common commands (run in `/home/javkhlan/b-guasha`):

| Task | Command |
|---|---|
| Deploy an update | `git pull && docker compose up -d --build` |
| See logs | `docker compose logs -f app` |
| Restart | `docker compose restart app` |
| Status | `docker compose ps` |
| Re-try HTTPS after a DNS change | `docker compose restart caddy` |

Still to do: off-server backups of `data/`.

## Domain

`bguasha.com` and `www.bguasha.com` point at the VPS (A records → `169.58.153.224`). Caddy serves `https://bguasha.com` and redirects `www` to it. If a certificate ever fails after a DNS change, run `docker compose restart caddy`.

## Before going public — security musts

1. Change `adminPin` in `config.json` (or set `ADMIN_PIN`)
2. HTTPS only (Caddy handles it)
3. Regular backups: Admin → ⬇ Backup, and/or copy the `data/` folder off the server
4. Keep `config.json` (QPay credentials!) out of public repos — the repo must be **private**

## Server changelog

Infrastructure changes only, newest last.

- **2026-10-09** — Docker setup: app and Caddy containers via `docker-compose.yml`; data in `./data`; secrets in `.env`.
- **2026-10-09** — Firewall: ufw enabled, allowing only OpenSSH (22), 80 and 443. Root SSH login disabled; fail2ban sshd jail on.
- **2026-10-09** — DNS move: `bguasha.com` and `www` switched from Render to the VPS (`169.58.153.224`); HTTPS via Caddy/Let's Encrypt.
