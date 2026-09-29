# B's Gua Sha — Website + Mobile App (v3)

Everything for **B's Gua Sha** in one folder: marketing website, mobile booking app, and an admin panel for the owner **and** staff.

**Only requirement: [Node.js LTS](https://nodejs.org) (free). No emulator, no npm install, no build step.**

## Run it

Double-click **`start-server.bat`** (or run `node server.js`). Then:

| What | URL | Login |
|---|---|---|
| Website | http://localhost:3000 | — |
| Mobile app | http://localhost:3000/app | demo customer: `99000000` / `demo123`, or register |
| Admin (super admin) | http://localhost:3000/admin → "Утсаар" | `80000000` / `super123` — or the "Супер админ (PIN)" tab with PIN `1234` (config.json) |
| Admin (owner) | http://localhost:3000/admin → "Утсаар" | `91113958` / `owner123` |
| Admin (staff) | http://localhost:3000/admin → "Утсаар" | example staff: `88000001` / `staff123` |

On your phone (same Wi-Fi): `http://<your-PC-IP>:3000/app` → "Add to Home Screen" installs it like a real app. Full steps: **docs/TESTING-GUIDE.md**.

⚠️ **Change these before going live:** admin PIN (config.json), the super admin, owner and example staff passwords (Админ → 🔐 Бүртгэл).

## Phone and desktop layouts

Both the website and the app have two layouts that switch automatically by screen width:

| | Phone | Desktop (≥ 1024px) |
|---|---|---|
| **Website** (`/`) | Burger menu, a bottom bar with **📞 Call** and **Book now**, swipeable reviews and products, one-column lists | Full top menu, multi-column grids, review summary and FAQ categories in sticky side panels |
| **App** (`/app`) | Bottom tab bar, one column | Left sidebar (with Chat, Products and FAQ), two-column dashboard and profile, wide booking grid, split login screen |

Every "Book" button on the website opens the app on that service's booking step (`/app#book=<serviceId>`); if the visitor isn't logged in, it continues right after login.

## Roles

| Role | Logs in at | Can do |
|---|---|---|
| **Super admin** 🛡 | /admin (phone+password, or the PIN) | Everything the owner can, plus: turn features on/off (wallet), create/edit **every** account (customer, staff, owner), change roles, reset passwords, block accounts |
| **Owner** 👑 | /admin | Services & prices, products ("What we use"), FAQ, address/phone/email/Facebook, opening hours & booking rules, staff schedules, bookings, reviews, reports, backup |
| **Staff** 👤 | /admin | Only their own calendar, clients and chat |
| **Customer** 🙂 | /app | Book, profile, chat (and wallet when it is on) |

The super admin is a separate account and is not a therapist (it never appears in the booking calendar).
An owner can optionally also be a therapist ("Эмчилгээ хийнэ"). Role changes and blocked accounts take effect immediately, even for people already logged in.

## What's new in v3

- **Gold brand theme** matching the B's GUA SHA logo, website + app + admin
- **Staff & roles**: every booking belongs to a therapist; staff log in to the admin with their own phone+password and see only their own calendar, clients and chat. The owner sees everything.
- **Owner calendar**: day grid per staff — add walk-in/phone bookings, block time slots, change statuses, reassign staff
- **Staff schedules**: weekly hours + specific days off per person; salon-wide closed days in Settings
- **Reviews**: customers rate finished visits in the app (1–5 stars + text). The owner approves them; approved ones appear live on the website. Staff ratings show in the app's therapist picker.
- **Bundles** (багц): e.g. 5 facial sessions for 250,000₮ — customers buy in the app and bookings consume sessions; cancelling returns the session
- **Gift cards**: buy in the app, send the code to a friend, they redeem it into wallet credit
- **Promo codes**: owner creates codes (e.g. WELCOME10) that add wallet credit — announce them on Facebook
- **Chat**: customers message the salon from the app; owner/staff reply from the admin panel
- **Private client notes**: each staff member can keep notes per client ("likes stronger massage") that **only they** can see — not even the owner
- **Client history**: visits, total spent, no-shows, packages, preferences, skin type & allergies per client
- **Customer profile**: skin type, allergies, birthday, requests, favourite therapist — used to personalise service
- **Education section**: "What we use" — stones, toner, clay mask, serums, LED, microcurrent… each with a short key-benefit label, filterable by category on the website and in the app; owner edits them in Админ → 🛍 Бүтээгдэхүүн
- **FAQ**: 16 questions in three groups (treatment, booking & payment, prep & aftercare), owner-editable in Админ → ❓ Асуулт. Answers can use `{cancelHours}`, `{phone}`, `{hoursOpen}`, `{hoursClose}`, filled from the settings; wallet-only answers hide themselves when the wallet is off
- **Monthly report**: revenue (services / bundles / gift cards), top services, staff performance with ratings, new & returning clients
- **Editable settings in admin**: opening hours, slot length, closed days, cancellation window, top-up bonus

Everything from v2 still works: wallet with QPay top-up (+5% bonus over 100k), live slot booking, progress photos with automatic eye-censoring, transactions, backup export, Mongolian/English, dark/light mode.

## What's inside

```
server.js              All backend logic (zero dependencies, Node 18+)
config.json            Salon contacts, hours, PIN, QPay keys, slogan
start-server.bat       One-click start on Windows
public/                Website (index.html, site.css, site.js)
public/app/            Mobile app (PWA)
public/admin/          Admin panel (owner + staff)
public/assets/         Logo & favicon (gold brand)
data/                  Created automatically — db.json + photos/ (your database; back it up!)
docs/                  Guides (testing, publishing & costs, QPay, ideas, info to fill in)
legacy/                The old v1 site & app, kept for reference
```

## Turning the wallet on and off

The whole money-in-app side — wallet balance, QPay top-up, bundles (багц), gift cards
and promo codes — is a single switch the super admin controls in **Админ → ⚙️ Тохиргоо →
Нэмэлт боломж**. It ships **off**.

- **Off** (default): customers browse services and book a time; payment is arranged by
  phone or at the salon. The wallet tab, gift cards and bundles disappear from the app,
  the website stops advertising them, and the "Багц · Код" admin tab is hidden. The
  matching API endpoints are closed server-side too, not just hidden in the interface.
- **On**: everything from v3 comes back exactly as before.

Switching it off **deletes nothing** — balances, bundles and gift cards stay in
`data/db.json` and reappear the moment it is switched back on. The choice is stored in
the database, so it survives restarts and overrides `featureWallet` in `config.json`.

Only the super admin can change this setting; the owner sees whether it is on or off, and staff accounts get 403.

## Demo vs real payments

Payments run in **demo mode** (`"paymentsDemo": true` in config.json): the QR is fake and a "Simulate payment" button appears. To accept real money you need a QPay merchant contract — see **docs/PAYMENTS-QPAY.md**. Bundles and gift cards are paid from the wallet balance.

## Guides

- **docs/TESTING-GUIDE.md** — test all v3 features on this PC + your phone
- **docs/INFO-TO-FILL-IN.md** — what to replace before going live (prices, staff, passwords)
- **docs/PUBLISHING-AND-COSTS.md** — hosting, domain, app stores, costs
- **docs/PAYMENTS-QPAY.md** — getting real QPay payments
- **docs/NAMES-AND-IDEAS.md** — future feature ideas & roadmap
