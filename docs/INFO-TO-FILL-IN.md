# Before going live — replace these

## ✅ Already filled from your Facebook page

These were taken from facebook.com/profile.php?id=61589496517687 and are already in `config.json`:

- **Phone:** +976 9111-3958
- **Email:** bolormaa.b.b@gmail.com
- **Address:** Баянгол дүүрэг, 26-р хороо, Нарны хороолол, Энгельсийн гудамж — Хас Мөнх төвийн 2 давхарт, Улаанбаатар 16020
- **Slogan:** Гоо сайхан, Эрүүл арьс, Итгэлтэй чи / Naturally, Healthy and Beautiful

Double-check they're correct (especially the English address spelling).

Also from the page (added in September 2026):

- **Booking phones** 99083070, 96674700 (from a post) — shown on the website and in the app next to the main number, editable in Админ → Тохиргоо. The same post lists the main number as 91113859; the correct one is **9111 3958**. Post: https://www.facebook.com/permalink.php?story_fbid=122106577155316550&id=61589496517687
- **CL Medisys** (Korean clinical skincare + micro-needle device) — added to Products. There is no micro-needle *service* with a price yet; add one in Админ → Үйлчилгээ if you offer it.
- **Men's treatments** (face, scalp, back/neck/shoulder gua sha and massage) — used in the FAQ answer for men.
- **Hours:** the page says "Always open"; the salon keeps 10:00–19:00 (confirmed).

## 🔴 Must change before real customers use it

1. **Admin PIN** — `config.json` → `"adminPin": "1234"` → your own 4-8 digits.
2. **Owner staff account** — seeded as **Болормаа / 91113958 / owner123**. Change the password: Админ → Ажилтан → ✎ Болормаа → "Шинэ нууц үг". If the owner's name/phone differ, edit them there too.
3. **Example staff "Туяа (жишээ ажилтан)" (88000001/staff123)** — replace with your real second therapist (✎ → change name/phone/password) or switch her off (✎ → untick "Идэвхтэй").
4. **Demo customer "Сараа (Demo)"** — harmless for testing; delete the `data` folder once before launch for a clean start (this also removes test bookings).
5. **Service prices & names** — current ones are sensible placeholders. Админ → Үйлчилгээ: edit names/prices/durations, add or hide services.
6. **Bundle** — seeded as "Нүүрний гуаша — 5 удаагийн багц, 250,000₮, 90 хоног" valid for the three facial services. Adjust price/sessions/validity/services: Админ → Багц · Код.
7. **Promo code WELCOME10** (10,000₮ × 100 хүн) — keep, edit or switch off: Админ → Багц · Код.
8. **Working hours** — currently 10:00–19:00 all week (your FB says "Always open"). Set real hours: Админ → Тохиргоо + each therapist's weekly hours in Ажилтан.
9. **Products ("Бидний хэрэглэдэг зүйлс")** — default descriptions of stones/oil/clay mask/LED etc., each with a short benefit label. Review and adjust to the products you actually use (brands welcome): Админ → 🛍 Бүтээгдэхүүн.
10. **Sample reviews** (Номин, Анужин, Сүврэг) — visible on the website now so it doesn't look empty. They are not real customers: hide/delete them before launch or as soon as real reviews come in: Админ → Сэтгэгдэл (they're marked "жишээ"). Real reviews written after an app booking get a "✓ Апп-аар захиалсан" badge on the website.
11. **FAQ policies** — Админ → ❓ Асуулт. The answers are written as sensible defaults; check the ones that state salon policy (who shouldn't be treated, payment, cancellation, aftercare) and change anything that doesn't match how you work.

## 🟡 When you're ready for real money

- QPay merchant contract → fill `config.json` → `qpay` → set `"paymentsDemo": false` (see docs/PAYMENTS-QPAY.md).

## 🟢 Optional

- Instagram link → `config.json` → `"instagram"`.
- A real photo of the salon/team for the website hero (currently the logo).
