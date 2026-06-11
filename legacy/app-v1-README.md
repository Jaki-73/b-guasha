# B's Guasha — Booking & Dashboard App

A single-file, **no-server** web app. Two sides in one page:

- **Booking page** (what clients see): choose a service → pick a date & time → enter contact details → submit. The request is saved as *pending*.
- **Owner dashboard** (click **Owner login**, top right): manage appointments, view your client list, edit your service menu, and change settings.

## How to run it

Just open `app/index.html` in any web browser (double-click it), or host it (see below). No installation, no build step.

**Owner login passcode:** `1234` — change it in **Settings** the first time you log in.

## What it does

- **Appointments** — confirm, mark done, cancel, or delete bookings; filter by status; see counts at a glance.
- **Clients** — auto-built from bookings: visit count, last visit, and total value per person.
- **Services** — edit names, groups, durations, and prices. These drive the booking page.
- **Settings** — business name, opening hours, slot length, passcode, plus **Export / Import backup**.

## Important: where the data lives

Bookings are stored **in the browser on the device where they're made** (using the browser's local storage). That means:

- It's perfect as a personal tool or a demo — open it on your own laptop/tablet and manage everything.
- A client booking on *their* phone is saved on *their* phone, not automatically on yours. For a true shared, multi-device system you need the **cloud upgrade** below.
- Use **Settings → Export backup** regularly so you never lose data, and **Import** to move it to another device.

The passcode only hides the dashboard locally; it is not real security. Don't keep sensitive personal data here.

## Hosting the app

Because it's a single static file, you can host it free anywhere:

- **Netlify Drop** — drag the `app` folder onto app.netlify.com/drop.
- **GitHub Pages / Cloudflare Pages** — same as the website.

## Upgrade path (when you're ready)

To turn this into a real shared system with accounts and a synced database, the lightest options are **Supabase** or **Firebase** (both have free tiers) for the data, keeping this same interface. Ask and I can build that next.
