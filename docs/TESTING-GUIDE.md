# Testing guide (v3) — try everything in 20 minutes

Start the server (double-click `start-server.bat`) and keep this open.

**Logins**

| Who | Where | Login |
|---|---|---|
| Demo customer | http://localhost:3000/app | `99000000` / `demo123` (50,000₮ balance) |
| Owner | http://localhost:3000/admin | PIN `1234` |
| Owner as staff | /admin → "Ажилтан" tab | `91113958` / `owner123` |
| Example staff (Туяа) | /admin → "Ажилтан" tab | `88000001` / `staff123` |

Tip: open the app in a normal window and the admin in an incognito window — both stay logged in at once.

## 1. Website (http://localhost:3000)

- Gold theme everywhere; logo in the hero; slogan "Гоо сайхан, Эрүүл арьс, Итгэлтэй чи".
- "Бид юу хэрэглэдэг вэ?" section lists stones/toner/clay mask/LED etc.
- Reviews section shows the 3 sample reviews (★★★★★) and the hero shows the average.
- Bundles appear under services (5 удаагийн багц · 250,000₮).
- EN button switches everything to English; 🌙 switches dark mode.

## 2. Customer app — booking with a therapist

1. Log in as the demo customer.
2. Захиалга → choose a service → **choose a therapist** (Болормаа / Туяа / "Хэн ч байсан болно", ratings appear once reviews exist) → pick day & time → pay from balance → confirm.
3. Profile → the booking shows the therapist's name. Cancel it (≥24h before) — money returns to the wallet.

## 3. Bundles (багц)

1. Хэтэвч → top up if needed (QR → "Симуляци" button) → in "Багц үйлчилгээ" buy the 5-session bundle (250,000₮).
2. Book a *facial* service again → at payment a new option appears: **"Багцаасаа ашиглах (5 үлдсэн)"** → confirm. Remaining count drops to 4.
3. Cancel that booking from the profile → the session returns (back to 5).

## 4. Gift cards & promo codes

1. Хэтэвч → 🎁 Бэлгийн карт авах → 20,000₮ → a code like `BG-XXXX-XXXX` appears (copy it).
2. Register a **second customer** (any 8-digit phone) → Хэтэвч → "Код идэвхжүүлэх" → paste the code → +20,000₮.
3. Same place, enter **WELCOME10** → +10,000₮ (the seeded promo code).
4. As owner: Багц · Код tab shows the gift card as "Ашигласан" and the promo usage count.

## 5. Chat

1. In the app press 💬 (top bar) → send a message.
2. Admin → Чат → the thread appears with an unread badge → reply.
3. Back in the app: the reply arrives (within ~5s) with the sender's name.

## 6. Reviews

1. Admin → Календарь → click the demo user's *past or today's finished* booking → "Болсон ✓". (Create one first if needed: click an empty slot → Захиалга нэмэх → phone `99000000`.)
2. App → Нүүр shows "Сүүлийн үйлчилгээ хэр байсан бэ?" → rate ★★★★★ + text.
3. Admin → Сэтгэгдэл → the review is "Хүлээгдэж байна" → "✓ Сайтад гаргах".
4. Refresh the website → your review is live; the therapist's rating now shows in the app's booking flow.

## 7. Owner calendar & schedules

- Календарь: arrows / date picker switch days; each therapist is a column.
- Click an empty slot → **Цаг хаах** (lunch break 🚫) or **Захиалга нэмэх** (walk-in by name or phone).
- Click a booking → change status, reassign therapist, open client history.
- Ажилтан tab → ✎ on Туяа → untick a weekday or add a day off → the app immediately stops offering those times.
- Тохиргоо tab → change opening hours / closed dates → slots update everywhere.

## 8. Client history & private notes

1. Үйлчлүүлэгч → "Түүх →" on the demo user: visits, spent, balance, packages, full booking history, skin/allergy info.
2. Add a note ("хүчтэй массаж таалагддаг") — saved under *your* login.
3. Log out → log in as Туяа (88000001/staff123) → open the same client → **your note is not visible** (notes are private per author). Туяа also only sees her own column in the calendar.

## 9. Customer profile personalisation

App → Профайл → "Мэдээлэл засах" → set skin type, allergies, birthday, requests, favourite therapist. Booking with "Хэн ч байсан болно" now prefers your favourite when free. The salon sees these details in the client profile (helps personalise service).

## 10. Reports

Admin → Тайлан: monthly revenue split (services / bundles / gift cards / top-ups), bookings done/no-show/cancelled, top services bar chart, staff performance with ratings, new & returning clients. Switch months with the picker.

## On your phone

1. PC and phone on the same Wi-Fi.
2. The server prints `Phone : http://192.168.x.x:3000/app` — open that on the phone.
3. Add to Home Screen → opens full-screen like a real app (gold icon).

If it doesn't load: allow Node.js through Windows Firewall (first-run popup), or `netsh advfirewall firewall add rule name="BGuaSha" dir=in action=allow protocol=TCP localport=3000`.

## Reset all data

Stop the server, delete the `data` folder, start again — a fresh demo database is created.
