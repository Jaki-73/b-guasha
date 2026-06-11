# B's Guasha — Hosting Guide

**Short answer: Yes, you can host this website 100% free, forever.** You do *not* need to rent a server.

Your site is a "static" website (just HTML/CSS in one file). Static sites are the cheapest and easiest kind to host — several big companies host them for free with no catch.

---

## Do I need to rent a server?

**No.** Renting a server (a "VPS", ~$5–10/month) is only needed for sites with logins, databases, or live booking software running on the back end. Your site is a simple brochure-style page, so a free static host is perfect. You can always upgrade later if you add online booking.

---

## What "free" gets you vs. what costs money

| Thing | Cost | Needed? |
|---|---|---|
| **Hosting** (putting the site online) | **Free** | Yes — covered free below |
| **Free web address** (e.g. `bsguasha.netlify.app`) | **Free** | Comes with the host |
| **Your own domain** (e.g. `bsguasha.com`) | **~$10/year** | Optional, but recommended — looks far more professional |
| **SSL / the padlock 🔒 (https)** | **Free** | Yes — included automatically by all hosts below |
| **Email at your domain** (e.g. hello@bsguasha.com) | ~$0–6/month | Optional, add later |

So the **only** thing worth paying for is a domain name (~$10/year). Everything else is genuinely free.

---

## The 3 best free hosts

All three are reputable, include free SSL (the 🔒), and let you connect your own domain for free.

**1. Netlify Drop — easiest, no tech skills needed.** You literally drag the `index.html` file (or its folder) onto the page and it's live in seconds. Best place to start. Free tier: 100GB bandwidth/month — far more than a salon site will ever use.

**2. Cloudflare Pages — most generous.** Unlimited bandwidth, very fast worldwide. Slightly more setup than Netlify Drop.

**3. GitHub Pages — most popular.** Free and rock-solid, but assumes you're comfortable with GitHub. Best if you'll be editing often.

My pick for you: **Netlify Drop** to get live today, then add a custom domain when you're ready.

---

## Easiest path: get live in ~5 minutes (Netlify Drop)

1. Fill in your real details in `index.html` (see **INFO-TO-FILL-IN.md**).
2. Go to **app.netlify.com/drop**.
3. Drag your project folder (the one containing `index.html`, and the `images` folder if you add photos) onto the page.
4. Done — Netlify gives you a free link like `https://wonderful-guasha-123.netlify.app`. Share it anywhere.
5. (Optional) Make a free Netlify account to keep the site and rename it to something like `bsguasha.netlify.app`.

To update the site later, just drag the new folder on top — it replaces the old one.

---

## Getting your own domain (recommended, ~$10/year)

A domain like **bsguasha.com** makes you look established and is easy for clients to remember.

- **Where to buy:** **Cloudflare** sells domains at cost (~$10–11/year, same price every year, no renewal markup) — the cheapest honest option. **Namecheap** is also fine (cheap first year ~$10, but renews higher ~$18/year).
- **A `.com`** is best if available. If taken, `bsguasha.co`, `.studio`, `.spa`, or `[city]guasha.com` are good alternatives.
- **After buying:** in your free host (Netlify/Cloudflare/GitHub), open the "Custom domain" setting and follow the prompts to point your domain at the site. It's a guided, copy-paste process — happy to walk you through it when you get there.

---

## My recommendation

1. **Now:** fill in your info, then drag the folder onto **Netlify Drop** → you're live free with a `.netlify.app` link.
2. **Soon:** buy **bsguasha.com** from Cloudflare (~$10/year) and connect it — your only real cost.
3. **Later (optional):** add online booking (Fresha and Booksy are free for solo therapists), domain email, and a Google Business Profile so you show up on Google Maps.

Total to run this professionally: **about $10 a year.** That's it.

---

### Sources
- [Free static hosting compared (2026)](https://htmlpub.com/blog/static-site-hosting-comparison-2026)
- [GitHub Pages vs Netlify vs Cloudflare vs Vercel](https://jp-my-blog.vercel.app/blog/github-pages-vs-netlify-cloudflare-pages-and-vercel-the-only-free-static-site-host-comparison-that-matters)
- [Cheapest domain registrars 2026](https://domaindetails.com/registrars/cheapest)
- [Namecheap domain pricing](https://www.namecheap.com/domains/)
