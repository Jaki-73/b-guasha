# B's Guasha

The website and booking app for **B's Guasha** — facial & body gua sha.

## What's in this repo

```
.
├── website/                  Marketing site (the public one-page site)
│   └── index.html
├── app/                      Booking + owner dashboard (no-server web app)
│   ├── index.html
│   └── README.md
├── docs/                     Guides
│   ├── INFO-TO-FILL-IN.md    Checklist of details to fill into the website
│   └── HOSTING-GUIDE.md      Free hosting & domain options explained
├── .github/workflows/
│   └── deploy-website.yml     Auto-publishes website/ to GitHub Pages
├── .gitignore
└── README.md
```

The **website** and the **app** are independent — you can host, edit, or replace either one without touching the other.

## Quick start

- **Preview the website:** open `website/index.html` in a browser.
- **Use the app:** open `app/index.html` in a browser. Owner login passcode is `1234` (change it in Settings).
- **Fill in your details:** follow `docs/INFO-TO-FILL-IN.md`.

## Host the website free on GitHub Pages

This repo already includes a workflow that publishes the `website/` folder automatically.

1. Create a new repository on github.com (e.g. `bs-guasha`).
2. In this folder, connect it and push:
   ```bash
   git remote add origin https://github.com/<your-username>/bs-guasha.git
   git push -u origin main
   ```
3. On GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. Every push to `main` now redeploys. Your site appears at
   `https://<your-username>.github.io/bs-guasha/`.

To use a custom domain (e.g. `guashabyb.com`), buy it (~$10/yr from Cloudflare) and add it under **Settings → Pages → Custom domain**. Full details in `docs/HOSTING-GUIDE.md`.

> The app is not published by this workflow (kept private by default). To put it online too, drag the `app` folder onto app.netlify.com/drop, or ask and I'll add it to the deploy.

## Notes

- App data is stored in the browser on each device — see `app/README.md` for the cloud-upgrade path.
