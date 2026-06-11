# Publishing & Costs — your payment plan

Everything is free until you decide to go live. Spend money in this order:

## Phase 0 — Testing (now) · **0₮**

Node.js, the app, the website, demo payments: all free, all on your laptop.

## Phase 1 — Website live on the internet · **~$12–80/year**

| Item | Where | Cost |
|---|---|---|
| Domain `.mn` (e.g. `bguasha.mn`) | https://domain.mn (official .mn registry, Datacom) | ~$40–60/yr |
| — or domain `.com` (e.g. `bguasha.com`) | Cloudflare / Namecheap / name.com | ~$10–13/yr |
| Hosting (the server must run Node.js) | Render.com / Railway.app | $0–7/mo |
| HTTPS certificate + DNS | Cloudflare | free |

- **Render free tier**: good for showing people, but it sleeps when idle **and its disk is wiped on every restart — bookings/accounts would be lost**. Fine for a public demo.
- **Real use**: Render Starter (~$7/mo) with a persistent disk for the `data/` folder, or any small VPS ($5–10/mo). I can help set either up.
- GitHub Pages (the old v1 plan) can't run this version — it has a real backend now.

**Realistic Phase 1 budget: ~$10–60 the first year (domain) + $0–7/month (hosting).**

## Phase 2 — Real payments (QPay) · **~0₮ upfront, ~1% per transaction**

| Item | Cost |
|---|---|
| Business registration (sole trader / company) — needed for a merchant contract | government fees, varies |
| QPay merchant contract (https://www.qpay.mn, or via your bank) | usually no setup fee; commission ≈ 1% per payment (confirm in your contract) |
| e-barimt (VAT receipt) registration — https://ebarimt.mn | free |

Full steps in **PAYMENTS-QPAY.md**. HTTPS (Phase 1) is required before this phase.

## Phase 3 — App stores · **$25 once (Android) + $99/year (iPhone)**

| Item | Cost |
|---|---|
| Google Play developer account | **$25 one-time** — https://play.google.com/console/about/ |
| Apple Developer Program | **$99/year** — https://developer.apple.com/programs/ |
| Wrapping the app for stores with Capacitor + Android Studio | free |
| iOS build needs a Mac (borrow one, or a cloud Mac service ~$30–95/mo only while building) | varies |

**My recommendation:** skip Phase 3 at first. "Add to Home Screen" (PWA) already gives customers an app icon, fullscreen app, for 0₮. Do Google Play when you want discoverability ($25 once), and Apple only when iPhone customers ask for it ($99 every year).

### How store publishing works (when ready)

1. Wrap this exact app with **Capacitor** → real Android/iOS app. Docs: https://capacitorjs.com/docs
2. Android: build an AAB in **Android Studio** (this is when an emulator is useful, also free) → upload to Play Console → fill the listing + **Data safety form** (we store photos & phone numbers — say so honestly) → review takes ~1–7 days. Docs: https://developer.android.com/distribute
3. iOS: build in Xcode (Mac) → App Store Connect → review. Guidelines: https://developer.apple.com/app-store/review/guidelines/
4. Both stores **require a privacy policy URL** — ask me and I'll generate one (MN/EN) and add it to the website.
5. General PWA→store background: https://web.dev/learn/pwa

## "Legit app" checklist (before real customers)

1. **HTTPS only** (free via Cloudflare/Render) — required for payments and trust.
2. **Change the admin PIN** in `config.json` (and keep that file private).
3. **Privacy policy + terms** in MN/EN — photos and phone numbers are personal data under Mongolia's Personal Data Protection Law (2021); the app already stores only eye-censored photos and asks consent by design. I can generate these documents.
4. **Backups**: download the admin backup regularly (`Admin → ⬇ Backup`); back up the `data/` folder.
5. **Business registration + e-barimt** for legal payments (Phase 2).
6. Real content: your address, phone, prices, real client reviews, photos of the studio.

## Total cost summary

| Scenario | Year 1 |
|---|---|
| Website + app used via browser/PWA, demo payments | **$0** |
| + own domain + always-on hosting | **~$95–145** (domain + ~$7/mo hosting) |
| + real QPay payments | + ~1% of each transaction |
| + Google Play | + $25 once |
| + Apple App Store | + $99/yr |
