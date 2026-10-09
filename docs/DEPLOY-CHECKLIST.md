# Go Live — Checklist (Contabo VPS)

> **Draft.** We no longer use Render. The site will be hosted on our Contabo VPS — server details and the planned setup are in **HOSTING-GUIDE.md**.

## Part A — Code on GitHub ✅

Done: the code is in the private repo `github.com/Jaki-73/b-guasha` and cloned on the VPS at `/home/javkhlan/b-guasha`.

> 🔒 `config.json` is in the repo (it holds the admin PIN). That's why the repo must be **Private**. Real QPay keys go into environment variables on the VPS, never into GitHub.

## Part B — Run it on the VPS

- [x] Run in Docker (`docker compose up -d --build`)
- [x] Restarts automatically on crash/reboot
- [x] `ADMIN_PIN` and `SUPER_ADMIN_PASSWORD` set in `.env`
- [x] Caddy on 80/443 with automatic HTTPS (activates once DNS points here)
- [x] Firewall: ufw allows 22, 80, 443 only

## Part C — Point bguasha.com at the VPS

- [x] DNS: `@` and `www` → A record `169.58.153.224`
- [x] https://bguasha.com loads with a valid certificate
- [ ] Move any data worth keeping from the old Render site (Admin → ⬇ Backup there, restore here)

## Part D — Production (real customers)

1. **Security:**
   - Change `adminPin` in `config.json`
   - Change the owner password and the example staff account (Admin → Ажилтан)
   - Back up regularly (Admin → ⬇ Backup, plus a copy of `data/` off the server)
2. **Real payments (QPay):** sign a QPay merchant contract, then set `paymentsDemo: false`, add your QPay credentials, and set `callbackBaseUrl` to `https://bguasha.com`. Full steps in **PAYMENTS-QPAY.md**.

## What costs money (quick reference)

| Stage | Cost |
|---|---|
| Domain `bguasha.com` (already bought) | ~$10–13/yr |
| Hosting (Contabo VPS) | your Contabo plan's monthly price |
| HTTPS certificate (Let's Encrypt) | free |
| Real QPay payments | ~1% per transaction |
| Google Play (optional, later) | $25 once |
| Apple App Store (optional, later) | $99/year |

Detailed costs: **PUBLISHING-AND-COSTS.md**.
