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

Every "Book" button on the website opens the app on that service's booking step (`/app#book=<serviceId>`); if the visitor isn't logged in, it continues right after login (new visitors start on the sign-up tab). `/app#bookings` and `/app#chat` open the customer's bookings and the chat.

## Customers: finding and changing a booking

- **Захиалга** tab starts with **Таны захиалгууд** (upcoming visits), then a new booking. The home screen's **Дараагийн цаг** card opens the same booking sheet.
- The booking sheet shows the service, time and end, therapist, price, the address with a map link, **Google Calendar / .ics**, and the rule: change or cancel in the app up to `cancelHours` (24 h) before. Inside that window it says so and offers a call button instead.
- **🔁 Цаг өөрчлөх** — move the booking: only free times, its own old time counts as free, the same therapist is kept when free.
- After booking or moving, a confirmation sheet with the same details. Android/browser **Back** steps back through the booking instead of leaving the app.
- Phone numbers can be typed as `9511 2233`, `9511-2233` or `+976 95112233`. A number the salon saved from a phone booking is sent to **Бүртгүүлэх** and keeps its history.
- **Нууц үгээ мартсан уу?** — the customer calls; the owner opens the customer card → **🔑 Нэг удаагийн код** and reads out a 6-digit code. It ends the customer's sessions; they log in with it and choose a new password.
- Until the owner sets `mapUrl`, address links open a map search for the address.

## Phone booking (staff)

**📞** (the round button bottom-right on a phone, **📞 Захиалга** in the header on a computer, or press **N**) — three steps while the caller is on the line, one-handed, full screen on a phone:

1. **Number** — type it; after 4 digits matching clients appear, at 8 digits a known client is picked automatically with their last service preselected. An unknown number becomes a client record when the booking is saved (name optional).
2. **Service** — one tap. Services that use a machine show 🔧 and the machine's name.
3. **Time** — day buttons and only the start times that are really free: the therapist is free **and** every machine the service needs has a unit free for the part of the treatment that uses it. A clash cannot be picked. Staff book for themselves; the owner taps a therapist. **Enter** books.

The sheet opens on the day you are looking at (if that is today and nothing is free any more, it moves on to the next day with free times). The caller's name and number stay in the sheet's header. When a machine the service needs is full, the times say so without names ("🔧 HIFU дүүрэн 14:15–15:15"). Each day button shows how many start times are still free ("16 сул" / "дүүрэн"). When the owner books, a customer already booked at that time with anyone is refused and those times are left out; for staff this check is deliberately off, because a refusal or a missing time would reveal when a colleague has that customer. The **+** in the calendar opens it with that time and therapist filled in, and **📅 Цаг товлох** on a client card opens it with the client (and a repeat plan's service) filled in. If someone else took the time a moment earlier, the booking is refused with a clear message and the free times reload.

**Moving a booking**: tap it → **🔁 Өөр цаг руу шилжүүлэх** — the same sheet with the client and service fixed; the booking's old time and machines are freed at once. Staff move their own bookings; the owner can also give one to another therapist.

## Machines (one HIFU, two steamers…)

The system is the source of truth for machines: two people can never book the same machine at overlapping times.

1. **List the machines** in `config.json` → `machines`:
   ```json
   { "id": "hifu", "name": "HIFU", "units": 1, "bufferMinutes": 0 }
   ```
   `units` is how many of that machine the salon has; `bufferMinutes` (optional) keeps it busy for cleaning after every use. **The shipped list is a PLACEHOLDER** (`"placeholder": true`, names starting "PLACEHOLDER") — replace it with the salon's real machines and remove `placeholder`; the owner sees a warning until then. Restart the server after editing `config.json`.
2. **Say which services use which machine**: Админ → 🌿 Үйлчилгээ → **🔧 Машин**. For each machine: from which minute of the treatment and for how long (e.g. a 90-minute facial uses the HIFU from minute 15 for 60 minutes). A service may use several machines, or none — a service without a machine still takes the therapist's time.

How a booking is checked: it reserves its therapist for the whole appointment and each machine only for its own window (plus that machine's cleaning buffer). Times are half-open, so 14:00–15:00 and 15:00–16:00 do not clash. A booking is refused when any resource would exceed its units. The check runs again inside the save itself, one booking at a time, so two phones pressing "book" together can never both get the last unit. Cancelled and no-show bookings hold nothing; restoring one re-checks. All times are stored with an explicit `+08:00` (Ulaanbaatar) offset.

## My day, blocking time, the machine board

- **🙋 Миний өдөр** (staff land here) — your own bookings and blocks for one day, big ‹ › buttons, tap a booking to move or cancel it (cancelling asks first and frees the time and machines at once); **Болсон / Ирээгүй** appear once the visit has started. **📞 Захиалга нэмэх** and **🚫 Завгүй цаг** are right there.
- **🚫 Завгүй цаг** — mark your own time busy (personal, doctor, break): pick how long, then the start; times that clash with your bookings or run past closing are greyed out. It makes only you unavailable — the machines stay bookable by everyone else. **Устгах** removes it. The owner can do this for any therapist from the calendar's **+**.
- **🔧 Машин** — the shared machine board: each machine's busy windows ("🔴 14:15–15:15 завгүй", "🟡 1/2 эзэлсэн", cleaning time) and 🙋 your own machine times. It never shows who, which client, phone or service. It follows the day open in Миний өдөр.
- **Privacy** — staff cannot see each other's schedules through any page or API call: the server filters every request (calendar, my day, booking lists, client cards, lookups, free times, status changes); someone else's booking id behaves like one that does not exist. The owner sees everything.

## Staff phones: Add to Home Screen

Open `/admin` on the phone → browser menu → **Add to Home Screen** (iPhone: Share → Add to Home Screen). It opens full screen like an app and stays signed in: a login lasts **60 days from its last use**, so anyone who opens it at least every two months never has to log in again. **Гарах** ends that login on the server too. Blocking an account or changing its role takes effect at once.

## Bookings in Google Calendar

**📅 Google** in the admin header gives each person a private link (therapists: their own bookings; owner: also the whole salon). Add it once on a computer at calendar.google.com → Other calendars ＋ → From URL; it then shows on the phone too. Blocked times appear as 🚫 events.

Google refreshes subscribed calendars on its own schedule and can lag by hours — for same-day changes the admin **Календарь** / **Миний өдөр** is the truth. The link is a secret; "Холбоос шинэчлэх" makes a new one and the old stops working. Blocked or deactivated accounts' links stop working at once.

## Customer records (staff)

In **Админ → 👤 Үйлчлүүлэгч** every admin-side user (staff included) can:

- **＋ Шинэ үйлчлүүлэгч** — create a customer by name + phone, no password needed. If that person later registers in the app with the same phone, the record (with its history) becomes their account. Such records show an "апп-гүй" tag until then.
- **📋 Тайлбар** — a description every staff member sees (never shown to the customer).
- **✅ Болсон үйлчилгээ бүртгэх** — record a service given today or in the last 60 days (saved as done).
- **📅 Цаг товлох** — book the next visit through the booking sheet (only free times; the client is already filled in).
- **🔁 Давтан үйлчилгээ** — "this customer comes for X every N days". The list shows ⏰ when it is due within 3 days or overdue; tick "Давтан үйлчилгээ ойртсон / хоцорсон" to see who to call.
- **📝 Тэмдэглэл** — notes are shared with the team by default; untick "багтай хуваалцах" to keep one private.

## Roles

| Role | Logs in at | Can do |
|---|---|---|
| **Super admin** 🛡 | /admin (phone+password, or the PIN) | Everything the owner can, plus: turn features on/off (wallet), create/edit **every** account (customer, staff, owner), change roles, reset passwords, block accounts |
| **Owner** 👑 | /admin | Services & prices, products ("What we use"), FAQ, address/phone/email/Facebook, opening hours & booking rules, staff schedules, bookings, reviews, reports, backup |
| **Staff** 👤 | /admin | Only their own day and bookings (and only their own visits on a client's card); mark their own busy time; the shared (anonymous) machine board. The customer list (names, phones, staff description, shared notes) and the chat inbox are shared by the whole team. |
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
data/                  Created automatically — db.json + photos/ (your database; back it up!).
                       Before an upgrade changes db.json, the old file is kept as db.before-upgrade-<time>.json
docs/                  Guides (testing, publishing & costs, QPay, ideas, info to fill in)
test/                  Scheduling tests — run `npm test` (Node's built-in test runner, nothing to install)
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

## Tests

`npm test` starts the real server on a spare port with a throwaway database (your `data/` is never touched) and checks the machine scheduling end to end: the seven acceptance cases (HIFU at 14:00 blocks others until 15:00; two steamers allow two overlaps and refuse a third; back-to-back windows; a machine window that starts 15 minutes in; cancelling frees the time; a block stops only that therapist; staff cannot reach another's booking by changing an id or URL), plus cleaning buffers, services with two machines or none, simultaneous bookings racing for the last unit, `+08:00` storage, upgrading an old database, session expiry and sign-out. The server runs under a non-Mongolian time zone during the tests to prove the phone's or server's own zone never matters.

## Demo vs real payments

Payments run in **demo mode** (`"paymentsDemo": true` in config.json): the QR is fake and a "Simulate payment" button appears. To accept real money you need a QPay merchant contract — see **docs/PAYMENTS-QPAY.md**. Bundles and gift cards are paid from the wallet balance.

## Guides

- **docs/TESTING-GUIDE.md** — test all v3 features on this PC + your phone
- **docs/INFO-TO-FILL-IN.md** — what to replace before going live (prices, staff, passwords)
- **docs/PUBLISHING-AND-COSTS.md** — hosting, domain, app stores, costs
- **docs/PAYMENTS-QPAY.md** — getting real QPay payments
- **docs/NAMES-AND-IDEAS.md** — future feature ideas & roadmap
