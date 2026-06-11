# Hosting Guide (v2)

> The old v1 guide described free static hosting (GitHub Pages). That no longer applies: **v2 has a real backend** (accounts, payments, photos), so the host must run **Node.js**. Costs and the full go-live plan: see **PUBLISHING-AND-COSTS.md**.

## Recommended: Render.com

1. Push this folder to a **private** GitHub repository (`setup-git.bat` already prepared git; ask me when you're ready).
2. https://render.com → New → **Web Service** → connect the repo.
3. Settings: Build Command — *(leave empty)*; Start Command — `node server.js`. Render sets `PORT` automatically (the server reads it).
4. **Important — data**: add a **Persistent Disk** (Starter plan, ~$7/mo) mounted at the project's `data/` path, otherwise `data/` (your bookings, accounts, photos) is erased on every restart. The free tier is demo-only for this reason.
5. Add your domain under Settings → Custom Domains; HTTPS is automatic.

## Alternatives

- **Railway.app** (~$5/mo, with a volume for `data/`) — similar flow.
- **Any VPS** ($5–10/mo, e.g. Hetzner/DigitalOcean): install Node, run `node server.js` under a process manager (pm2), Cloudflare in front for HTTPS. Most control, slightly more setup — I can write the exact commands when you choose.
- A local PC at the salon technically works but is fragile (power/internet outages).

## Before going public — security musts

1. Change `adminPin` in `config.json`
2. HTTPS only (automatic on Render/Cloudflare)
3. Regular backups: Admin → ⬇ Backup, and/or copy the `data/` folder
4. Keep `config.json` (QPay credentials!) out of public repos — the repo must be **private**
