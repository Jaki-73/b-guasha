# CLAUDE.md

B's Gua Sha: salon website (`/`), customer booking app (`/app`) and admin (`/admin`), served by one zero-dependency Node server (`server.js`). Tests: `npm test` (`node --test`). Run locally: `node server.js` → http://localhost:3000.

Live at **https://bguasha.com**, hosted on a Contabo VPS. Full details: `docs/HOSTING-GUIDE.md`.

## Server

- Contabo VPS, Ubuntu 24.04, Docker and Docker Compose installed. The app and Caddy run as containers (`docker-compose.yml`, `Dockerfile`, `Caddyfile`). Data lives in `./data` on the server (gitignored).
- Firewall: ufw is active and allows only OpenSSH (22), 80 and 443. The Contabo panel firewall is not used.
- Docker bypasses ufw for published ports, so **only Caddy may publish ports**. The app must stay on Docker's internal network (`expose`, never `ports`).
- SSH: root login is disabled, fail2ban runs the sshd jail, password login is still on (no SSH key yet).
- You run as user `javkhlan` (uid 1001, in the docker group). You do **not** have the sudo password; never ask for it in chat or store it.
- The git remote uses a GitHub deploy key (`~/.ssh/github_deploy`), scoped to this repo only.

## Rules

- Never change firewall rules, SSH config, users or sudo settings. If a task needs that, write the exact commands for the owner to run themselves.
- Never commit `.env`, `data/`, keys or passwords. Run `git status` before every commit.
- Don't print the contents of `.env`, or app logs that contain the admin PIN, into chat. The app prints the PIN and super admin password at startup, so don't show `docker compose logs app` output unfiltered.
- Deploy with: `git pull && docker compose up -d --build`
- You are on the hosting VPS to deploy: once tests pass, merge to `main`, push, deploy and check the live site yourself. Hold back only when the owner says not to deploy for that specific task.
- Record infrastructure changes in the "Server changelog" in `docs/HOSTING-GUIDE.md`.
