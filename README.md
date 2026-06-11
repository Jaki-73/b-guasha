# B's Guasha — Website + Mobile App (v2)

Everything for **B's Guasha** in one folder: marketing website, mobile booking app with wallet (QPay top-up), progress photos with automatic eye-censoring, and an owner admin panel.

**Only requirement: [Node.js LTS](https://nodejs.org) (free). No emulator, no npm install, no build step.**

## Run it

Double-click **`start-server.bat`** (or run `node server.js`). Then:

| What | URL | Login |
|---|---|---|
| Website | http://localhost:3000 | — |
| Mobile app | http://localhost:3000/app | demo: `99000000` / `demo123`, or register |
| Owner admin | http://localhost:3000/admin | PIN `1234` (change in `config.json`) |

On your phone (same Wi-Fi): `http://<your-PC-IP>:3000/app` → "Add to Home Screen" installs it like a real app. Full steps: **docs/TESTING-GUIDE.md**.

## What's inside

```
server.js              All backend logic (accounts, bookings, wallet, QPay, photos, admin)
config.json            Salon name, phone, address, hours, prices policy, admin PIN, QPay keys
start-server.bat       One-click start on Windows
public/                Website (index.html, site.css, site.js)
public/app/            Mobile app (PWA): booking, wallet, progress photos, profile
public/admin/          Owner panel: bookings, clients, transactions, prices
data/                  Created automatically — db.json + photos/ (this is your database; back it up!)
docs/                  Guides (testing, publishing & costs, QPay, names & ideas)
legacy/                The old v1 site & app, kept for reference
```

## Features

- **Both languages (Монгол / English) and dark & light mode** — website and app
- **Accounts & wallet**: top up by QPay QR (demo mode now — no real money), +5% bonus over 100,000₮, pay bookings from balance or at the salon, full transaction history, refunds on cancellation (≥24h before)
- **Booking**: live free-slot calendar, 21 days ahead, double-booking impossible
- **Progress photos**: eyes are detected and covered automatically *before* saving (manual adjust possible); only the censored photo is stored
- **Admin**: today's & upcoming bookings, mark done/no-show/cancel (auto-refund), client list, transactions, edit prices, one-click backup

## Demo vs real payments

Payments run in **demo mode** (`"paymentsDemo": true` in config.json): the QR is fake and a "Simulate payment" button appears. To accept real money you need a QPay merchant contract — see **docs/PAYMENTS-QPAY.md**.

## Guides

- **docs/TESTING-GUIDE.md** — test everything on this PC + your phone
- **docs/PUBLISHING-AND-COSTS.md** — what to buy/pay, hosting, app stores, legal checklist
- **docs/PAYMENTS-QPAY.md** — getting real QPay payments
- **docs/NAMES-AND-IDEAS.md** — name/domain suggestions, future features
