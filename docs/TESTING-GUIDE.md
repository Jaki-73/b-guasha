# Testing Guide (Windows)

## 1. Install the one thing you need

**Node.js LTS** — free, from https://nodejs.org (big green LTS button → run installer → keep all defaults).
Check it worked: open Command Prompt, type `node -v` → you should see a version like `v22…`.

**No emulator needed.** The app is a PWA (installable web app) — it runs in any browser and installs on your phone from the browser. An Android emulator only becomes relevant later, when you build store versions (see PUBLISHING-AND-COSTS.md).

## 2. Start the server

Double-click **`start-server.bat`** in this folder. A black window opens (keep it open — that *is* the server) and your browser opens the website.

If Windows Firewall asks → **Allow** (needed for phone testing).

## 3. Test on this PC

| Page | URL |
|---|---|
| Website | http://localhost:3000 |
| App | http://localhost:3000/app |
| Admin | http://localhost:3000/admin (PIN `1234`) |

To see the app like a phone: press **F12** → **Ctrl+Shift+M** → pick "iPhone" or "Galaxy" at the top.

**Test checklist (10 minutes):**

1. Website: click the **EN/МН** button and the **🌙/☀️** button — everything should switch instantly.
2. App: log in with demo `99000000` / `demo123`, or register (any 8-digit phone, it's all local).
3. Wallet → pick **100,000₮** → *Create QR code* → a QR appears with a **Simulate payment (DEMO)** button → press it → balance becomes 155,000₮ (50,000 + 100,000 + 5,000 bonus).
4. Book: Захиалга tab → choose a service → pick a day & time → *Pay from balance* → confirm. Try booking the same slot again — it must be blocked.
5. Progress: take/choose a photo of a face → a black bar covers the eyes automatically (first time needs internet to load the detector; if no face is found, drag the bar yourself) → save → it appears in the gallery. Add a second one and press **Compare**.
6. Profile: cancel the booking (works if it's ≥24h away) → money returns to wallet → check transaction history in Wallet.
7. Admin (`/admin`, PIN 1234): see the booking, mark it *Болсон ✓*, change a price (it changes in the app instantly), download a backup.

## 4. Test on your phone (same Wi-Fi)

1. On the PC: Command Prompt → `ipconfig` → find **IPv4 Address** (e.g. `192.168.1.5`).
2. On the phone browser: `http://192.168.1.5:3000/app`.
3. Android Chrome: menu ⋮ → **Add to Home screen** → it opens fullscreen like a native app. iPhone Safari: Share → **Add to Home Screen**.

Notes: "Take a photo" opens the phone camera (it's a normal camera prompt). The automatic eye detection downloads its model from the internet on first use — after that it's cached.

## 5. Resetting & data

- All data lives in the **`data/`** folder (`db.json` + photos). Stop the server and delete `data/db.json` to start fresh (a new demo account is created automatically).
- Stop the server by closing the black window.
- Port busy? Start with another port: `set PORT=3100 && node server.js`.

## If something breaks

Copy the text from the black server window (or the browser console: F12 → Console) and send it to me — I'll fix it.
