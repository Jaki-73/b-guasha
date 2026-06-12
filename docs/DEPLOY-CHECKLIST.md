# Go Live — Step-by-Step Checklist

A click-by-click guide to put **B's Gua Sha** online for testing (free), then connect **bguasha.com**, then flip to production when you're ready.

**The plan (do it in this order):**

1. **Test for free** on Render → share a link → get feedback → improve. Cost: **$0**.
2. **Connect bguasha.com** when you want to show it off. Cost: the domain you already bought.
3. **Go to production** (bookings that stick + real payments) when you have real customers. Cost: ~$7/mo + ~1% per payment.

You can stop after any step. Bookings already work during testing — they just reset when the free server restarts, which is fine until Step 3.

---

## Part A — Put your code on GitHub (one time)

Render deploys from GitHub. Your project is already a git repo with commits; you just need to push it up.

1. Make a free account at **https://github.com** (skip if you have one).
2. Go to **https://github.com/new** and create the repo:
   - **Repository name:** `bs-guasha`
   - **Private** ✅ (important — keep it private)
   - **Do NOT** check "Add a README", ".gitignore", or "license"
   - Click **Create repository**.
3. On your PC, open the project folder (`Salon Application`), right-click an empty spot → **Open in Terminal** (or "Git Bash Here").
4. Paste these, one block, replacing **YOURNAME** with your GitHub username:
   ```bash
   git add -A
   git commit -m "Latest before deploy"
   git remote add origin https://github.com/YOURNAME/bs-guasha.git
   git branch -M main
   git push -u origin main
   ```
   - If commit says *"nothing to commit"* — that's fine, keep going.
   - If it says *"remote origin already exists"*, run instead:
     `git remote set-url origin https://github.com/YOURNAME/bs-guasha.git`
   - The first push opens a GitHub sign-in window — approve it.
5. Refresh the GitHub page — your files should be there.

> 🔒 `config.json` is in the repo (it holds the admin PIN). That's why the repo must be **Private**. When you later add real QPay keys, tell me — we'll move those into Render's secure settings so they never sit in GitHub.

---

## Part B — Deploy free on Render (one time)

1. Sign up at **https://render.com** with your GitHub account.
2. Click **New +** → **Web Service**.
3. **Connect** your `bs-guasha` repository.
4. Fill in:
   | Field | Value |
   |---|---|
   | Name | `bs-guasha` (becomes `bs-guasha.onrender.com`) |
   | Region | **Singapore** (closest to Mongolia) |
   | Branch | `main` |
   | Build Command | *(leave blank)* |
   | Start Command | `node server.js` |
   | Instance Type | **Free** |
5. Click **Create Web Service** and wait ~1–2 minutes for "Live".
6. Open your link: **https://bs-guasha.onrender.com**
   - Website: `/` · App: `/app` · Admin: `/admin` (PIN `1234`).

That's it — it's on the internet. 🎉

> First load after idle is slow (~30s) because the free server "wakes up". Normal for free tier.

---

## Part C — Test & share

- Send `https://bs-guasha.onrender.com` to a few people (Facebook, friends, a couple of clients).
- They can browse the site, open the app, register, and make a **demo** booking.
- Collect what they like / find confusing → tell me and I'll improve it.
- Remember: bookings/accounts may reset when the free server restarts. Totally fine for this phase.

---

## Part D — Connect bguasha.com (when ready)

### 1) In Render
Service → **Settings** → **Custom Domains** → **Add Custom Domain** → type `bguasha.com` → Save.
Render adds `www.bguasha.com` too and shows the DNS values needed.

### 2) In Namecheap
Domain List → **Manage** (next to bguasha.com) → **Advanced DNS** tab.

**Remove the default placeholder records:**
- the `CNAME  www → parkingpage.namecheap.com`
- any `URL Redirect` on `@`, and any `AAAA` record

**Add these two records:**

| Type | Host | Value | TTL |
|---|---|---|---|
| A Record | `@` | `216.24.57.1` | Automatic (or 1 min) |
| CNAME Record | `www` | `bs-guasha.onrender.com.` | Automatic |

*(Use your real `…onrender.com` name if you named the service differently. Render shows the exact value to copy.)*

### 3) Verify
Back in Render → click **Verify** next to the domain. DNS can take a few minutes to a couple of hours. When done, Render issues HTTPS automatically and **https://bguasha.com** loads your site. 🔒

---

## Part E — Go to production (real customers)

When testing is done and you want bookings that **persist** and **real payments**:

1. **Keep data:** Render → service → change Instance Type to **Starter (~$7/mo)**, then **Disks → Add Disk** mounted at your `data/` folder (Render shows the path, usually `/opt/render/project/src/data`). Without this, data resets on restart. *(Ask me and I'll confirm the exact disk settings.)*
2. **Security before real customers:**
   - Change `adminPin` in `config.json`
   - Change the owner password and the example staff account (Admin → Ажилтан)
   - Download a backup regularly (Admin → ⬇ Backup)
3. **Real payments (QPay):** sign a QPay merchant contract, then set `paymentsDemo: false`, add your QPay credentials, and set `callbackBaseUrl` to `https://bguasha.com`. Full steps in **PAYMENTS-QPAY.md** (tell me when you're here — I'll wire it up).

---

## What costs money (quick reference)

| Stage | Cost |
|---|---|
| Testing on Render Free | **$0** |
| Domain `bguasha.com` (already bought) | ~$10–13/yr |
| Production hosting (Render Starter + disk) | ~$7/month |
| Real QPay payments | ~1% per transaction |
| Google Play (optional, later) | $25 once |
| Apple App Store (optional, later) | $99/year |

Detailed costs: **PUBLISHING-AND-COSTS.md**.
