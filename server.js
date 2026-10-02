/*
 * B's Guasha — zero-dependency Node.js server (v3)
 * Serves: marketing website (/), mobile app (/app), admin panel (/admin), JSON API (/api/...)
 * Storage: data/db.json (created/migrated automatically). Photos: data/photos/.
 * Run:  node server.js     (or double-click start-server.bat on Windows)
 * Requires Node.js 18+. No npm install needed.
 *
 * v3 adds: staff & roles, per-staff schedules + calendar, reviews, bundles (packages),
 * gift cards & promo codes, customer<->salon chat, private per-staff client notes,
 * blocked time slots, walk-in bookings, education content (tools & products),
 * owner-editable settings, services CRUD and a stats report.
 */
'use strict';

/* All dates and slot times are Ulaanbaatar wall-clock time. Hosts such as Render
   run in UTC, which would put "today" and "now" 8 hours off, so pin the zone
   before any Date is created. An explicit TZ in the environment still wins. */
process.env.TZ = process.env.TZ || 'Asia/Ulaanbaatar';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const ROOT = __dirname;
const PUB = path.join(ROOT, 'public');
/* BG_DATA_DIR / BG_CONFIG point a test run at a throwaway data folder and config */
const DATA = process.env.BG_DATA_DIR ? path.resolve(process.env.BG_DATA_DIR) : path.join(ROOT, 'data');
const CONFIG_FILE = process.env.BG_CONFIG ? path.resolve(process.env.BG_CONFIG) : path.join(ROOT, 'config.json');
const PHOTOS_DIR = path.join(DATA, 'photos');
const DB_FILE = path.join(DATA, 'db.json');
const PORT = parseInt(process.env.PORT || '3000', 10);

/* ---------------- config (bootstrap; db.settings overrides the schedule/policy parts) ---------------- */
const DEFAULT_CONFIG = {
  salonName: "B's Gua Sha",
  sloganMn: 'Гоо сайхан, Эрүүл арьс, Итгэлтэй чи',
  sloganEn: 'Naturally, Healthy and Beautiful',
  phoneDisplay: '+976 9111-3958',
  phoneTel: '+97691113958',
  bookingPhones: '99083070, 96674700',
  mapUrl: '',
  email: 'bolormaa.b.b@gmail.com',
  addressEn: '2nd floor, Khas Munkh center, Engels street, Naran khoroolol, Bayangol district, 26th khoroo, Ulaanbaatar 16020',
  addressMn: 'Баянгол дүүрэг, 26-р хороо, Нарны хороолол, Энгельсийн гудамж — Хас Мөнх төвийн 2 давхарт, Улаанбаатар 16020',
  facebook: 'https://www.facebook.com/profile.php?id=61589496517687',
  instagram: '',
  hoursOpen: '10:00',
  hoursClose: '19:00',
  slotMinutes: 60,
  closedWeekdays: [],
  closedDates: [],
  bookingDaysAhead: 21,
  cancelHours: 24,
  topupBonusThreshold: 100000,
  topupBonusPercent: 5,
  adminPin: '1234',
  paymentsDemo: true,
  featureWallet: false,
  machines: [],
  bookingStepMinutes: 15,
  qpay: { baseUrl: 'https://merchant-sandbox.qpay.mn', username: '', password: '', invoiceCode: '', callbackBaseUrl: '' }
};
let config = { ...DEFAULT_CONFIG };
try {
  config = { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) };
} catch (e) {
  console.warn('config.json missing or invalid — using defaults');
}
/* config.json is in git, so its PIN is public; on a host set ADMIN_PIN instead */
if (process.env.ADMIN_PIN) config.adminPin = String(process.env.ADMIN_PIN);

/* effective config = config.json + owner-edited settings stored in the db */
function cfg() { return db && db.settings ? { ...config, ...db.settings } : config; }

/* feature flags — the super admin toggles these in Admin → Тохиргоо.
   Wallet off = no balance, top-up, bundles, gift cards or promo codes anywhere.
   Nothing is deleted: existing balances stay in the db and come back when re-enabled. */
/* salon texts the owner edits in Admin → Тохиргоо (stored in db.settings, override config.json) */
const CONTACT_FIELDS = ['addressMn', 'addressEn', 'phoneDisplay', 'phoneTel', 'bookingPhones', 'mapUrl', 'email', 'facebook'];
function walletOn() { return cfg().featureWallet === true; }

/* ---------------- image guards ----------------
   The browser downscales before uploading (public/assets/imgtools.js), but the
   server must not trust that: an oversized image here costs real disk on the
   host, which is the one resource that is paid for by the gigabyte. */
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;  /* per stored image */
const MAX_IMAGE_PX = 2000;                /* longest side */

/* Width/height straight out of the file header — no image library needed. */
function imageDims(buf, ext) {
  try {
    if (ext === 'png') {
      if (buf.length < 24) return null;
      return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    }
    if (ext === 'webp') {
      if (buf.length < 30 || buf.toString('ascii', 8, 12) !== 'WEBP') return null;
      const fmt = buf.toString('ascii', 12, 16);
      if (fmt === 'VP8X') return { w: (buf.readUIntLE(24, 3) & 0xffffff) + 1, h: (buf.readUIntLE(27, 3) & 0xffffff) + 1 };
      if (fmt === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
      if (fmt === 'VP8L') { const b = buf.readUInt32LE(21); return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1 }; }
      return null;
    }
    /* jpeg — walk the segment chain to the start-of-frame marker */
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
      }
      const len = buf.readUInt16BE(i + 2);
      if (len < 2) return null;
      i += 2 + len;
    }
    return null;
  } catch (e) { return null; }
}

/* Shared by every image upload route. Returns an error code, or null if ok. */
function checkImage(buf, ext) {
  if (buf.length < 100) return 'bad_image';
  if (buf.length > MAX_IMAGE_BYTES) return 'image_too_large';
  const d = imageDims(buf, ext);
  if (d && Math.max(d.w, d.h) > MAX_IMAGE_PX) return 'image_too_large';
  return null;
}

/* ---------------- tiny JSON database ---------------- */
let db = null;

const DEFAULT_HOURS = { 0: ['10:00', '19:00'], 1: ['10:00', '19:00'], 2: ['10:00', '19:00'], 3: ['10:00', '19:00'], 4: ['10:00', '19:00'], 5: ['10:00', '19:00'], 6: ['10:00', '19:00'] };

function seedServices() {
  return [
    { id: 'svc-facial-signature', group: 'facial', nameEn: 'Signature Facial Gua Sha', nameMn: 'Нүүрний гуаша — сигнатур', descEn: 'Deep lifting facial: cleanse, oil, full gua sha sculpting, lymph drainage.', descMn: 'Гүн чангалгаатай иж бүрэн эмчилгээ: цэвэрлэгээ, тос, гуаша массаж, лимфийн урсгал сайжруулна.', minutes: 60, price: 90000, emoji: '🌿', active: true },
    { id: 'svc-facial-express', group: 'facial', nameEn: 'Express Glow', nameMn: 'Экспресс гэрэлтэлт', descEn: 'Quick refresh for eyes, jawline and cheekbones. Perfect before an event.', descMn: 'Нүд, эрүү, хацрын ясыг түргэн сэргээнэ. Арга хэмжээний өмнө тохиромжтой.', minutes: 30, price: 50000, emoji: '✨', active: true },
    { id: 'svc-facial-deluxe', group: 'facial', nameEn: 'Deluxe Lift & Sculpt', nameMn: 'Делюкс чангалгаа', descEn: 'Signature facial + neck & décolleté + finishing clay mask.', descMn: 'Сигнатур эмчилгээ + хүзүү, эгэмний хэсэг + шавар маск.', minutes: 75, price: 130000, emoji: '👑', active: true },
    { id: 'svc-body-neck', group: 'body', nameEn: 'Back, Neck & Shoulder Release', nameMn: 'Нуруу, хүзүү, мөрний гуаша', descEn: 'Releases tension and knots in the upper back, neck and shoulders.', descMn: 'Нуруу, хүзүү, мөрний чангаралт, булчингийн зангиралтыг тавиулна.', minutes: 45, price: 70000, emoji: '💆', active: true },
    { id: 'svc-body-thera', group: 'body', nameEn: 'Therapeutic Body Gua Sha', nameMn: 'Биеийн гуаша эмчилгээ', descEn: 'Targeted body work to boost circulation and ease muscle pain.', descMn: 'Цусны эргэлтийг сайжруулж, булчингийн өвдөлтийг намдаана.', minutes: 60, price: 95000, emoji: '🌀', active: true },
    { id: 'svc-body-full', group: 'body', nameEn: 'Full Body Renewal', nameMn: 'Бүтэн биеийн гуаша', descEn: 'Head-to-toe gua sha ritual for deep relaxation and recovery.', descMn: 'Бүх биеийн иж бүрэн гуаша — гүн амралт, сэргэлт.', minutes: 90, price: 140000, emoji: '🌙', active: true }
  ];
}

function seedBundles() {
  return [{
    id: 'bnd-facial-5',
    nameMn: 'Нүүрний гуаша — 5 удаагийн багц',
    nameEn: 'Facial Gua Sha — 5-session bundle',
    descMn: 'Урьдчилан төлөөд 5 удаагийн нүүрний эмчилгээ. Аль ч нүүрний үйлчилгээнд ашиглана.',
    descEn: 'Prepay 5 facial sessions, use them on any facial service.',
    emoji: '🎁',
    sessions: 5,
    price: 250000,
    validDays: 90,
    serviceIds: ['svc-facial-signature', 'svc-facial-express', 'svc-facial-deluxe'],
    active: true,
    createdAt: nowIso()
  }];
}

function seedEdu() {
  const mk = (cat, emoji, nameMn, nameEn, benefitMn, benefitEn, descMn, descEn, order) => ({ id: uid('edu'), category: cat, emoji, nameMn, nameEn, benefitMn, benefitEn, descMn, descEn, order, active: true });
  return [
    mk('tool', '💎', 'Хаш гуаша чулуу', 'Jade gua sha stone', 'Хаван бууруулна', 'De-puffs',
      'Жинхэнэ хаш чулуун хусуур. Байгалиасаа сэрүүн тул арьсыг тайвшруулж, лимфийн урсгалыг дэмжин, эрүү ба хацрын ясны тоймыг тодруулна.',
      'A genuine jade scraping stone. Naturally cool, it soothes the skin, encourages lymphatic flow and defines the jawline and cheekbones.', 1),
    mk('tool', '🌸', 'Ягаан кварц чулуу', 'Rose quartz stone', 'Мэдрэмтгий арьсанд', 'For sensitive skin',
      'Хашнаас зөөлөн мэдрэмжтэй чулуу. Улайх, цочрох хандлагатай мэдрэмтгий арьсанд сонгож, тайвшруулах зорилгоор хэрэглэнэ.',
      'A softer-feeling stone we choose for sensitive skin that reddens or reacts easily, used to calm and soothe.', 2),
    mk('tool', '🌀', 'Хаш өнхрүүш (роллер)', 'Jade roller', 'Шингээлт сайжруулна', 'Boosts absorption',
      'Эмчилгээний төгсгөлд нүүрийг сэрүүцүүлж, хавангаа буулгах ба серум, маскийг арьсанд жигд шингээхэд ашиглана.',
      'Used at the end of a treatment to cool and de-puff, and to press serums and masks evenly into the skin.', 3),
    mk('product', '🫒', 'Эмчилгээний тос', 'Facial treatment oil', 'Чулуу зөөлөн гулгана', 'Smooth glide',
      'Жожоба, камелиа зэрэг ургамлын гаралтай хөнгөн тос. Чулууг арьсан дээр чирэхгүй зөөлөн гулгуулж, эмчилгээний явцад арьсыг тэжээнэ. Харшилтай бол урьдчилан хэлээрэй.',
      'A light plant-based oil (jojoba, camellia) that lets the stone glide without tugging and nourishes the skin during the treatment. Tell us beforehand about any allergies.', 4),
    mk('product', '🧖‍♀️', 'Шавар маск', 'Clay mask', 'Нүх сүв цэвэрлэнэ', 'Clears pores',
      'Бентонит ба каолин шавар. Гуашагийн дараа түрхэж нүх сүвийг цэвэрлэн, илүүдэл тосыг шингээж, арьсыг гөлгөр болгоно.',
      'Bentonite and kaolin clays applied after gua sha to clear pores, absorb excess oil and leave the skin smooth.', 5),
    mk('product', '💧', 'Тонер', 'Toner', 'pH тэнцвэржүүлнэ', 'Balances pH',
      'Спиртгүй, ургамлын ханд бүхий тонер. Цэвэрлэгээний дараа арьсны pH-ийг тэнцвэржүүлж, дараагийн бүтээгдэхүүнд бэлдэнэ.',
      'An alcohol-free botanical toner that rebalances skin pH after cleansing and preps it for what comes next.', 6),
    mk('product', '✨', 'Гиалурон серум', 'Hyaluronic serum', 'Гүн чийгшүүлнэ', 'Deep hydration',
      'Арьсанд чийгийг татаж барина. Гуашагийн дараах гэрэлтэлтийг удаан хадгалж, хуурай арьсыг зөөлрүүлнэ.',
      'Draws moisture into the skin and holds it there — keeps the post-gua sha glow longer and softens dry skin.', 7),
    mk('product', '🍊', 'Витамин C серум', 'Vitamin C serum', 'Өнгө тэгшилнэ', 'Evens tone',
      'Арьсны өнгийг тэгшилж, пигмент толбыг аажмаар цайруулна. Мэдрэмтгий арьсанд бага тунгаар хэрэглэнэ.',
      'Evens skin tone and gradually fades dark spots. Used at a lower strength on sensitive skin.', 8),
    mk('machine', '♨️', 'Нүүрний уураар жигнэгч', 'Facial steamer', 'Нүх сүв нээнэ', 'Opens pores',
      'Эмчилгээний эхэнд зөөлөн уураар арьсыг зөөлрүүлж, нүх сүвийг нээснээр цэвэрлэгээ ба маскны үр дүн нэмэгдэнэ.',
      'Gentle steam at the start of a treatment softens the skin and opens pores so cleansing and masks work better.', 9),
    mk('machine', '💡', 'LED гэрлэн эмчилгээ', 'LED light therapy', 'Коллаген дэмжинэ', 'Supports collagen',
      'Улаан гэрэл арьсны нөхөн сэргээлт, коллагены нийлэгжилтийг дэмжинэ; цэнхэр гэрэл батга үүсгэгч бактерийг бууруулна. Өвдөлтгүй, дулаан мэдрэмжтэй.',
      'Red light supports skin renewal and collagen; blue light reduces acne-causing bacteria. Painless, with a gentle warmth.', 10),
    mk('machine', '⚡', 'Микро гүйдлийн чангалгаа', 'Microcurrent lifting device', 'Чангалгаа', 'Lifting',
      'Маш сул гүйдлээр нүүрний булчинг идэвхжүүлж, гуашагийн өргөх эффектийг гүнзгийрүүлнэ. Зүрхний аппараттай болон жирэмсэн хүнд хэрэглэхгүй.',
      'Very gentle currents tone the facial muscles and deepen the gua sha lift. Not used with pacemakers or during pregnancy.', 11),
    mk('product', '🇰🇷', 'CL Medisys эмнэлзүйн арчилгаа', 'CL Medisys clinical skincare', 'Гэрийн арчилгаа', 'Home care',
      'Бидний хамтран ажилладаг Солонгосын CL Medisys брэндийн эмнэлзүйн арьс арчилгааны бүтээгдэхүүн. Салоны курс эмчилгээгээ гэртээ үргэлжлүүлэхэд тохиромжтой — танд аль нь тохирохыг ажилтнаасаа асуугаарай.',
      'Korean clinical skincare from CL Medisys, the brand we work with. Good for continuing your salon course at home — ask your therapist which products suit you.', 8.5),
    mk('machine', '🪡', 'Бичил зүүний аппарат (CL Medisys)', 'Micro-needle device (CL Medisys)', 'Гүн давхаргад ажиллана', 'Works in deeper layers',
      'CL Medisys-ийн бичил зүүний аппарат нь арьсны гүн давхаргад ажиллаж, арьсыг өөрөө нөхөн төлжихөд нь дэмжлэг үзүүлнэ. Мэс засалгүй, зүсэлтгүй арга. Тохирох эсэхийг зөвлөгөөний үеэр шийднэ.',
      'The CL Medisys micro-needle device works in the deeper layers of the skin and supports its own renewal — no surgery or incisions. Whether it suits you is decided at your consultation.', 11.5),
    mk('method', '🌿', '100% органик арчилгаа', '100% organic care', 'Арьсанд ээлтэй', 'Skin-friendly',
      'Бид байгалийн гаралтай, органик бүтээгдэхүүнийг сонгож, арьсанд ээлтэй аргыг баримталдаг. Лазер зэрэг хүчтэй аппаратын эмчилгээг зөвхөн арьсны эмчийн зөвлөгөөний дагуу санал болгоно.',
      'We choose natural, organic products and skin-friendly methods. Stronger device treatments (e.g. laser) are only suggested on a dermatologist\'s advice.', 12)
  ];
}

/* Product descriptions shipped before content v2. An item still carrying one of
   these was never edited by the owner, so the migration may refresh it. */
const LEGACY_EDU_DESC_MN = new Set([
  'Жинхэнэ хаш чулуун хусуур — арьсыг сэрүүцүүлж, лимфийн урсгалыг идэвхжүүлж, нүүрний тоймыг тодруулна.',
  'Мэдрэмтгий арьсанд тохиромжтой зөөлөн чулуу. Тайвшруулах, улайлт багасгах үйлчилгээтэй.',
  'Эмчилгээний төгсгөлд сийрэгжүүлэх, маскны шингээлтийг сайжруулахад ашиглана.',
  'Жожоба, сараана зэрэг ургамлын гаралтай тос — чулуу арьсан дээр зөөлөн гулгах нөхцөлийг бүрдүүлж, арьсыг тэжээнэ.',
  'Гуаша массажийн дараа нүх сүвийг цэвэрлэж, илүүдэл тосыг шингээнэ. Бентонит ба каолин шавар ашиглана.',
  'Арьсны pH тэнцвэрийг сэргээж, дараагийн бүтээгдэхүүний шингээлтийг сайжруулна. Спиргүй, ургамлын ханд бүхий тонер хэрэглэнэ.',
  'Арьсыг гүн чийгшүүлж, гуашагийн дараах гэрэлтэлтийг хадгална.',
  'Толбо бууруулж, арьсны өнгийг тэгшилнэ. Өглөөний эмчилгээнд тохиромжтой.',
  'Эмчилгээний эхэнд нүх сүвийг нээж, цэвэрлэгээ ба маскны үр дүнг нэмэгдүүлнэ.',
  'Улаан гэрэл — коллаген, сэргээлт; цэнхэр гэрэл — батга үүсгэгч бактерийг бууруулна.',
  'Сул гүйдлээр булчинг идэвхжүүлж, өргөх эффектийг гүнзгийрүүлнэ. Гуашатай хослуулахад үр дүнтэй.',
  'Бид байгалийн гаралтай, органик бүтээгдэхүүнийг сонгож, арьсанд ээлтэй аргыг баримталдаг. Лазер зэрэг хүчтэй аппаратын эмчилгээг арьсны мэргэжилтний зөвлөгөөний дагуу л санал болгоно.'
]);

/* FAQ — owner-editable in Admin → ❓ Асуулт. `show` hides wallet-only answers
   when the wallet is off (and vice versa). Answers may use {cancelHours},
   {phone}, {hoursOpen} and {hoursClose}; they are filled in from the settings. */
const FAQ_GROUPS = ['treatment', 'booking', 'care'];
function seedFaq() {
  let n = 0;
  const mk = (group, qMn, qEn, aMn, aEn, show) => ({ id: uid('faq'), group, qMn, qEn, aMn, aEn, show: show || 'always', order: ++n, active: true });
  return [
    mk('treatment', 'Гуаша гэж юу вэ?', 'What exactly is gua sha?',
      'Тос түрхсэн арьсыг хаш эсвэл кварц чулуун хавтгай хусуураар тодорхой чиглэлд зөөлөн иллэх, дорно дахины уламжлалт арга. Нүүрний гуаша хөнгөн, тайвшруулах даралттай; биеийн гуаша булчинд арай гүн хүрнэ.',
      'A traditional East Asian technique: a flat jade or quartz stone is stroked over oiled skin in set directions. Facial gua sha uses light, soothing pressure; body gua sha works a little deeper into the muscles.'),
    mk('treatment', 'Өвддөг үү?', 'Does it hurt?',
      'Үгүй. Нүүрний гуаша зөөлөн, тайвшруулах мэдрэмжтэй — олон хүн эмчилгээний үеэр унтчихдаг. Биеийн гуаша булчин зангирсан хэсэгт бага зэрэг эмзэг байж болох ч даралтыг таны хүссэнээр тохируулна.',
      'No. Facial gua sha feels gentle and calming — many clients doze off. Body gua sha can feel tender over tight muscles, and we adjust the pressure to suit you.'),
    mk('treatment', 'Үр дүн хэзээ харагдах вэ?', 'When will I see results?',
      'Хаван багасч, арьс гэрэлтэх нь ихэвчлэн эхний удаагаас л мэдэгддэг. Нүүрний тойм тодрох, арьсны чийгшил сайжрах нь 3–5 удаагийн дараа илүү тогтвортой болдог. Үр дүн хүн бүрийн арьснаас хамаарч харилцан адилгүй.',
      'Less puffiness and a brighter look usually show after the very first visit. A more defined contour and better-hydrated skin become steadier after 3–5 sessions. Results vary from person to person.'),
    mk('treatment', 'Хэр олон удаа хийлгэх вэ?', 'How often should I come?',
      'Эхний сард 7 хоногт 1 удаа, дараа нь үр дүнгээ хадгалахын тулд сард 1–2 удаа хийлгэхийг зөвлөдөг. Ажилтан тань арьсны байдлыг хараад хувийн зөвлөгөө өгнө.',
      'We suggest once a week for the first month, then 1–2 times a month to maintain results. Your therapist will tailor this to your skin.'),
    mk('treatment', 'Хэнд тохирохгүй вэ?', 'Is it suitable for everyone?',
      'Ихэнх хүнд тохиромжтой. Харин арьсан дээр идэвхтэй үрэвсэл, шарх, халдвар байгаа, ботокс эсвэл филлер хийлгээд 2 долоо хоног болоогүй, цус шингэлэх эм ууж байгаа, эсвэл жирэмсэн бол захиалахаасаа өмнө бидэнд хэлээрэй — шаардлагатай бол эмчээсээ зөвлөгөө авахыг санал болгоно.',
      'It suits most people. If you have active inflammation, broken or infected skin, had Botox or fillers in the last 2 weeks, take blood thinners, or are pregnant, please tell us before booking — we may suggest checking with your doctor first.'),
    mk('treatment', 'Эрэгтэй хүн хийлгэж болох уу?', 'Do you treat men?',
      'Мэдээж. Ажлын стресс, ачааллаа түр хойш тавиад өөртөө цаг гаргаарай — нүүр, хуйх, нуруу, хүзүү, мөрний гуаша ба массаж алжаалыг тайлж, цусны эргэлтийг сайжруулна. Эрэгтэйчүүдийн дунд хамгийн их эрэлттэй нь нуруу, хүзүү, мөрний гуаша.',
      'Of course. Put work stress aside for an hour — face, scalp, back, neck and shoulder gua sha and massage ease tension and boost circulation. Back, neck and shoulder gua sha is the most popular with men.'),
    mk('booking', 'Цагаа яаж захиалах вэ?', 'How do I book?',
      'Апп-аар 24/7: үйлчилгээгээ сонгоод ажилтнаа (эсвэл "Хэн ч байсан болно") сонгож, чөлөөтэй цагаас товшино. Утсаар захиалах бол {phone} дугаарт {hoursOpen}–{hoursClose} цагийн хооронд залгаарай.',
      'In the app, 24/7: pick a service, a therapist (or "Anyone is fine") and tap a free slot. To book by phone, call {phone} between {hoursOpen} and {hoursClose}.'),
    mk('booking', 'Төлбөрөө яаж төлөх вэ?', 'How can I pay?',
      'Аппын хэтэвчээ QPay QR-ээр цэнэглээд үлдэгдлээсээ, эсвэл багц, бэлгийн картаараа төлж болно. Салон дээр бэлнээр болон картаар төлөх боломжтой.',
      'Top up your in-app wallet with QPay and pay from your balance, a bundle or a gift card — or pay by cash or card at the salon.', 'wallet_on'),
    mk('booking', 'Төлбөрөө яаж төлөх вэ?', 'How can I pay?',
      'Төлбөрөө үйлчилгээ авсны дараа салон дээр бэлнээр эсвэл картаар төлнө. Урьдчилгаа шаардлагагүй.',
      'You pay at the salon after your treatment, by cash or card. No deposit is needed.', 'wallet_off'),
    mk('booking', 'Цагаа цуцлах, өөрчлөх боломжтой юу?', 'Can I cancel or reschedule?',
      'Болно. Цагаасаа {cancelHours}-аас дээш цагийн өмнө аппын Профайл → Миний захиалгууд хэсгээс цуцлаад шинэ цаг авна. Түүнээс ойрхон болсон бол {phone} дугаарт залгаарай.',
      'Yes. Up to {cancelHours} hours before your time, cancel in the app under Profile → My bookings and pick a new slot. Closer than that, please call {phone}.'),
    mk('booking', 'Цуцалбал төлбөр буцаж орох уу?', 'Do I get my payment back if I cancel?',
      'Тийм. Хугацаандаа цуцалбал үлдэгдлээс төлсөн мөнгө хэтэвчинд, багцаас ашигласан эрх багцад тань шууд буцаж орно.',
      'Yes. Cancel in time and money paid from your balance returns to your wallet, and a bundle session returns to your bundle — instantly.', 'wallet_on'),
    mk('booking', 'Багц гэж юу вэ?', 'What is a bundle?',
      'Хэд хэдэн удаагийн эмчилгээг урьдчилан төлж, нэг бүрчлэн авснаас хямд авах боломж. Багцад хамаарах үйлчилгээ болон хүчинтэй хугацаа нь багц бүр дээр бичигдсэн байдаг.',
      'Prepay several sessions for less than booking them one by one. Each bundle lists which services it covers and how long it is valid.', 'wallet_on'),
    mk('booking', 'Бэлгийн карт яаж ажилладаг вэ?', 'How do gift cards work?',
      'Аппаас бэлгийн карт аваад кодыг нь хайртай хүндээ илгээнэ. Тэр хүн аппын "Код идэвхжүүлэх" хэсэгт оруулахад мөнгө хэтэвчинд нь шууд орно.',
      'Buy a gift card in the app and send the code to someone special. They enter it under "Redeem a code" and the amount lands in their wallet.', 'wallet_on'),
    mk('care', 'Эмчилгээнд яаж бэлдэх вэ?', 'How should I prepare?',
      'Будалттай ирсэн ч болно — бид эхлээд арьсыг тань цэвэрлэнэ. Цагаасаа 5–10 минутын өмнө ирж, арьсны онцлог, харшлаа хэлээрэй. Эдгээрийг аппын Профайл хэсэгт урьдчилан бичиж болно.',
      'Coming with make-up is fine — we cleanse first. Arrive 5–10 minutes early and tell us about your skin and any allergies; you can also note them in your app profile beforehand.'),
    mk('care', 'Эмчилгээний дараа юу анхаарах вэ?', 'What should I do afterwards?',
      'Ус сайн ууж, 4–6 цаг будалт хийхгүй байх, тэр өдөртөө саун, халуун усанд орохоос зайлсхийгээрэй. Биеийн гуашагийн дараа арьсан дээр ягаан-улаавтар толбо гарах нь хэвийн бөгөөд 2–4 хоногт арилдаг.',
      'Drink plenty of water, skip make-up for 4–6 hours and avoid the sauna or a hot bath that day. After body gua sha, pink-red marks on the skin are normal and fade within 2–4 days.'),
    mk('care', 'Гэртээ гуаша хийж болох уу?', 'Can I do gua sha at home?',
      'Болно — өдөрт хэдхэн минутын гэрийн арчилгаа салоны үр дүнг удаан хадгалахад тусална. Ямар чулуу, ямар хөдөлгөөн тохирохыг ажилтнаасаа асуугаарай.',
      'Yes — a few minutes a day at home helps salon results last longer. Ask your therapist which stone and strokes suit you.')
  ];
}
function faqFromBody(b, base) {
  const qMn = String(b.qMn || '').trim();
  const aMn = String(b.aMn || '').trim();
  if (!qMn || !aMn) return null;
  return {
    ...base,
    group: FAQ_GROUPS.includes(b.group) ? b.group : 'treatment',
    qMn: qMn.slice(0, 160), qEn: String(b.qEn || qMn).trim().slice(0, 160),
    aMn: aMn.slice(0, 1200), aEn: String(b.aEn || aMn).trim().slice(0, 1200),
    show: ['always', 'wallet_on', 'wallet_off'].includes(b.show) ? b.show : 'always',
    order: Number.isFinite(Number(b.order)) ? Number(b.order) : 99
  };
}

function seedReviews() {
  return [
    { id: uid('rv'), bookingId: null, userId: null, staffId: null, serviceId: 'svc-facial-signature', rating: 5, name: 'Номин', text: '3 удаагийн дараа нүүрний хаван илт багасч, эрүүний тойм тодорсон. Ажлын дараа очиход хамгийн сайхан амралт.', approved: true, sample: true, createdAt: nowIso() },
    { id: uid('rv'), bookingId: null, userId: null, staffId: null, serviceId: 'svc-body-neck', rating: 5, name: 'Анужин', text: 'Мөр хүзүүний чангаралт арилаад унтлага сайжирсан. Аппаар захиалга хийхэд маш амар.', approved: true, sample: true, createdAt: nowIso() },
    { id: uid('rv'), bookingId: null, userId: null, staffId: null, serviceId: 'svc-facial-express', rating: 5, name: 'Сүврэг', text: 'Арьс минь гэрэлтэж, будалтгүйгээр гарах болсон. Явцын зургаа харьцуулахад өөрчлөлт нь харагддаг нь мотивац өгдөг.', approved: true, sample: true, createdAt: nowIso() }
  ];
}

function seedPromos() {
  return [{ id: uid('pr'), code: 'WELCOME10', amount: 10000, maxUses: 100, used: 0, usedBy: [], expiresAt: null, active: true, note: 'Тавтай морил — шинэ үйлчлүүлэгчийн урамшуулал', createdAt: nowIso() }];
}

function seedStaffUsers() {
  const owner = makeUser('Болормаа', '91113958', 'owner123');
  owner.role = 'owner';
  owner.staff = { specialtyMn: 'Гуаша эмчилгээ — эзэн', specialtyEn: 'Gua sha therapist — owner', color: '#b08c46', hours: { ...DEFAULT_HOURS }, daysOff: [], active: true };
  const ex = makeUser('Туяа (жишээ ажилтан)', '88000001', 'staff123');
  ex.role = 'staff';
  ex.staff = { specialtyMn: 'Нүүрний гуаша', specialtyEn: 'Facial gua sha', color: '#7d9b76', hours: { ...DEFAULT_HOURS }, daysOff: [], active: true };
  return [owner, ex];
}

/* Super admin — the platform account. Not a therapist (no staff profile, never
   booked). Controls feature switches and creates / edits every account. */
const SUPER_PHONE = '80000000';
/* first-start password; set SUPER_ADMIN_PASSWORD on the host so production never uses the default */
const SUPER_PASSWORD = process.env.SUPER_ADMIN_PASSWORD || 'super123';
function seedSuperAdmin() {
  const su = makeUser('Супер админ', SUPER_PHONE, SUPER_PASSWORD);
  su.role = 'superadmin';
  return su;
}

function seedDb() {
  const demo = makeUser('Сараа (Demo)', '99000000', 'demo123');
  demo.balance = 50000;
  demo.isDemo = true;
  return {
    meta: { version: 3, contentVersion: 3, scheduleVersion: 1, createdAt: nowIso() },
    settings: {},
    services: seedServices(),
    users: [demo, ...seedStaffUsers(), seedSuperAdmin()],
    sessions: {},
    adminSessions: {},
    bookings: [],
    transactions: [],
    invoices: [],
    photos: [],
    reviews: seedReviews(),
    messages: [],
    bundles: seedBundles(),
    userBundles: [],
    giftcards: [],
    promos: seedPromos(),
    notes: [],
    blocks: [],
    edu: seedEdu(),
    faq: seedFaq(),
    calFeeds: {}
  };
}

/* migrate an existing (v2) db in place to v3 */
function migrateDb() {
  const seed = seedDb();
  for (const k of Object.keys(seed)) if (db[k] === undefined) db[k] = seed[k];
  if (!db.meta) db.meta = { version: 2 };
  db.users.forEach((u) => { if (!u.role) u.role = 'customer'; });
  if (!db.users.some((u) => (u.role === 'staff' || u.role === 'owner') && u.staff)) {
    for (const su of seedStaffUsers()) {
      if (db.users.some((u) => u.phone === su.phone)) su.phone = String(90000000 + Math.floor(Math.random() * 9999999));
      db.users.push(su);
    }
  }
  if (!db.users.some((u) => u.role === 'superadmin')) {
    const sa = seedSuperAdmin();
    if (db.users.some((u) => u.phone === sa.phone)) sa.phone = String(80000000 + Math.floor(Math.random() * 999999));
    db.users.push(sa);
    console.log('Created super admin account: ' + sa.phone + ' / ' + SUPER_PASSWORD + '  (change the password after first login)');
  }
  const firstStaff = db.users.find((u) => u.role === 'owner' && u.staff) || db.users.find((u) => u.role === 'staff' && u.staff);
  db.bookings.forEach((b) => {
    if (!b.staffId) b.staffId = firstStaff ? firstStaff.id : null;
  });
  /* schedule v1: bookings and blocks used to store a bare local date + time. They now
     store startsAt/endsAt with an explicit +08:00 offset, and bookings carry a snapshot
     of the machine windows they hold (none for bookings made before machines existed). */
  if ((db.meta.scheduleVersion || 0) < 1) {
    let n = 0;
    for (const b of db.bookings) {
      if (!b.startsAt && b.date && b.time) {
        const svc = db.services.find((x) => x.id === b.serviceId);
        const s0 = ubMs(b.date, b.time);
        b.startsAt = ubIso(s0);
        b.endsAt = ubIso(s0 + (b.minutes || (svc && svc.minutes) || 60) * MIN_MS);
        n++;
      }
      if (!Array.isArray(b.machines)) b.machines = [];
      delete b.date; delete b.time; delete b.minutes;
    }
    for (const bl of db.blocks) {
      if (!bl.startsAt && bl.date && bl.time) {
        const s0 = ubMs(bl.date, bl.time);
        bl.startsAt = ubIso(s0);
        bl.endsAt = ubIso(s0 + (cfg().slotMinutes || 60) * MIN_MS);
        n++;
      }
      delete bl.date; delete bl.time;
    }
    db.services.forEach((sv) => { if (!Array.isArray(sv.uses)) sv.uses = []; });
    db.meta.scheduleVersion = 1;
    if (n) console.log('Migrated ' + n + ' bookings/blocks to +08:00 timestamps');
  }
  /* sessions expire after SESSION_TTL_MS without use; existing ones start their clock now */
  for (const map of [db.sessions, db.adminSessions]) {
    for (const s0 of Object.values(map)) if (!s0.lastSeenAt) s0.lastSeenAt = nowIso();
  }
  db.services.forEach((s) => { if (s.group === 'package') s.active = false; });
  if (!db.bundles.length) db.bundles = seedBundles();
  if (!db.edu.length) db.edu = seedEdu();
  if (!db.reviews.length) db.reviews = seedReviews();
  if (!db.promos.length) db.promos = seedPromos();
  if (db.meta.version < 3) { db.adminSessions = {}; db.meta.version = 3; }
  /* content v2: richer product texts with a short benefit label. Only items the
     owner never edited are refreshed; edited ones are left exactly as they are. */
  if ((db.meta.contentVersion || 1) < 2) {
    const fresh = seedEdu();
    for (const it of db.edu) {
      const nu = fresh.find((f) => f.nameMn === it.nameMn);
      if (nu && LEGACY_EDU_DESC_MN.has(it.descMn)) Object.assign(it, { descMn: nu.descMn, descEn: nu.descEn, benefitMn: nu.benefitMn, benefitEn: nu.benefitEn });
    }
    db.meta.contentVersion = 2;
  }
  /* content v3 (from the Facebook page): CL Medisys items, men's FAQ answer */
  if (db.meta.contentVersion < 3) {
    const fresh = seedEdu();
    for (const nm of ['CL Medisys эмнэлзүйн арчилгаа', 'Бичил зүүний аппарат (CL Medisys)']) {
      if (!db.edu.some((e) => e.nameMn === nm)) db.edu.push(fresh.find((f) => f.nameMn === nm));
    }
    const men = db.faq.find((f) => f.qMn === 'Эрэгтэй хүн хийлгэж болох уу?' && f.aMn.startsWith('Мэдээж. Нуруу, хүзүү, мөрний гуаша ажлын'));
    const nu = seedFaq().find((f) => f.qMn === 'Эрэгтэй хүн хийлгэж болох уу?');
    if (men && nu) Object.assign(men, { aMn: nu.aMn, aEn: nu.aEn });
    db.meta.contentVersion = 3;
  }
}

function loadDb() {
  fs.mkdirSync(DATA, { recursive: true });
  fs.mkdirSync(PHOTOS_DIR, { recursive: true });
  if (fs.existsSync(DB_FILE)) {
    try {
      db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      migrateDb();
      saveDb();
      return;
    } catch (e) {
      const bak = DB_FILE + '.corrupt-' + Date.now();
      try { fs.copyFileSync(DB_FILE, bak); } catch (_) {}
      console.error('db.json unreadable — re-seeding (backup at ' + bak + ')');
    }
  }
  db = seedDb();
  saveDb();
}

/* Boot record for the "is the data surviving restarts?" check. If the database
   creation time keeps matching the latest start, the host is wiping data/. */
function recordBoot() {
  if (!db.meta.createdAt) { db.meta.createdAt = nowIso(); db.meta.createdAtIsFirstSeen = true; }
  db.meta.boots = (db.meta.boots || 0) + 1;
  db.meta.lastBoot = nowIso();
  saveDb();
}
function storageInfo() {
  let separateDisk = null;
  try { separateDisk = fs.statSync(DATA).dev !== fs.statSync(ROOT).dev; } catch (e) { /* unknown */ }
  return {
    onRender: !!process.env.RENDER, separateDisk,
    dbCreatedAt: db.meta.createdAt, createdAtIsFirstSeen: !!db.meta.createdAtIsFirstSeen,
    boots: db.meta.boots || 1, lastBoot: db.meta.lastBoot
  };
}
/* things the owner should fix before real customers arrive */
function safetyWarnings() {
  const w = [];
  const st = storageInfo();
  if (st.onRender && st.separateDisk === false) w.push('no_disk');
  if (String(cfg().adminPin) === '1234') w.push('default_pin');
  const find = (phone, role) => db.users.find((u) => u.phone === phone && u.role === role && !u.disabled);
  const sa = db.users.find((u) => u.role === 'superadmin' && !u.disabled);
  if (sa && checkPassword(sa, 'super123')) w.push('default_super');
  const ow = find('91113958', 'owner');
  if (ow && checkPassword(ow, 'owner123')) w.push('default_owner');
  const ex = find('88000001', 'staff');
  if (ex && ex.staff && ex.staff.active !== false && checkPassword(ex, 'staff123')) w.push('example_staff');
  if (db.users.some((u) => u.isDemo && !u.disabled)) w.push('demo_customer');
  if (machineList().some((m) => m.placeholder)) w.push('machines_placeholder');
  if (db.services.some((sv) => sv.active && serviceMachineProblem(sv))) w.push('service_machine_problem');
  return w;
}

function saveDb() {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 1));
  fs.renameSync(tmp, DB_FILE);
}

/* ---------------- helpers ---------------- */
function uid(p) { return p + '-' + crypto.randomBytes(8).toString('hex'); }
function nowIso() { return new Date().toISOString(); }

function makeUser(name, phone, password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 32).toString('hex');
  return { id: uid('u'), name, phone, salt, hash, balance: 0, role: 'customer', createdAt: nowIso() };
}
function setPassword(user, password) {
  user.salt = crypto.randomBytes(16).toString('hex');
  user.hash = crypto.scryptSync(password, user.salt, 32).toString('hex');
}
function checkPassword(user, password) {
  try {
    const hash = crypto.scryptSync(password, user.salt, 32).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(user.hash, 'hex'));
  } catch (e) { return false; }
}
function publicUser(u) {
  return {
    id: u.id, name: u.name, phone: u.phone, balance: u.balance, createdAt: u.createdAt, isDemo: !!u.isDemo,
    role: u.role || 'customer', disabled: !!u.disabled,
    skinType: u.skinType || '', allergies: u.allergies || '', birthday: u.birthday || '',
    prefNote: u.prefNote || '', preferredStaffId: u.preferredStaffId || ''
  };
}

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
const fail = (res, code, error) => json(res, code, { error });

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 12 * 1024 * 1024) { reject(new Error('too_large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
async function readJson(req) {
  const buf = await readBody(req);
  if (!buf.length) return {};
  try { return JSON.parse(buf.toString('utf8')); } catch (e) { throw new Error('bad_json'); }
}

function tokenFrom(req, q) {
  const h = req.headers['authorization'] || '';
  if (h.startsWith('Bearer ')) return h.slice(7).trim();
  if (q && q.get('token')) return q.get('token');
  return null;
}
/* Sessions last SESSION_TTL_MS after their last use (sliding), so staff stay signed in
   on their phone for weeks; lastSeenAt is written at most once an hour per session. */
const SESSION_TTL_MS = 60 * 86400000;
function liveSession(map, t) {
  const s = map[t];
  if (!s) return null;
  const last = Date.parse(s.lastSeenAt || s.createdAt);
  if (!(Date.now() - last < SESSION_TTL_MS)) { delete map[t]; saveDb(); return null; }
  if (Date.now() - last > 3600000) { s.lastSeenAt = nowIso(); saveDb(); }
  return s;
}
function authUser(req, q) {
  const t = tokenFrom(req, q);
  if (!t) return null;
  const s = liveSession(db.sessions, t);
  if (!s) return null;
  const u = db.users.find((x) => x.id === s.userId);
  return u && !u.disabled ? u : null;
}
const ADMIN_ROLES = ['superadmin', 'owner', 'staff'];
/* The session is re-checked against the account on every request, so a role
   change, a disabled account or a deactivated therapist takes effect at once. */
function authAdmin(req, q) {
  const t = tokenFrom(req, q);
  if (!t) return null;
  const s = liveSession(db.adminSessions, t);
  if (!s) return null;
  const uid_ = s.userId || s.staffUserId;
  if (!uid_) return s.role === 'superadmin' ? s : null;
  const u = db.users.find((x) => x.id === uid_);
  if (!u || u.disabled || !ADMIN_ROLES.includes(u.role)) return null;
  if (u.role === 'staff' && (!u.staff || u.staff.active === false)) return null;
  return { ...s, userId: u.id, role: u.role, name: u.name, staffUserId: u.staff ? u.id : null };
}
function newSession(map, payload) {
  const t = crypto.randomBytes(24).toString('hex');
  map[t] = { ...payload, createdAt: nowIso(), lastSeenAt: nowIso() };
  return t;
}

const PHONE_RE = /^\d{8}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function genCode(prefix) {
  let s = '';
  const bytes = crypto.randomBytes(8);
  for (let i = 0; i < 8; i++) s += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return prefix + '-' + s.slice(0, 4) + '-' + s.slice(4);
}
function normCode(c) { return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }

function toMin(t) { const p = t.split(':').map(Number); return p[0] * 60 + (p[1] || 0); }
function slotTimes() {
  const c = cfg();
  const out = [];
  let t = toMin(c.hoursOpen);
  const end = toMin(c.hoursClose);
  while (t + c.slotMinutes <= end) {
    out.push(String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'));
    t += c.slotMinutes;
  }
  return out;
}
function salonClosed(dateStr) {
  const c = cfg();
  return c.closedWeekdays.includes(ubWeekday(dateStr)) || (c.closedDates || []).includes(dateStr);
}

function addTransaction(userId, type, method, amount, note, status) {
  const tx = { id: uid('tx'), userId, type, method, amount, note: note || '', status: status || 'paid', createdAt: nowIso() };
  db.transactions.push(tx);
  return tx;
}

/* ---------------- staff & slot engine ---------------- */
function staffUsers(includeInactive) {
  return db.users.filter((u) => (u.role === 'staff' || u.role === 'owner') && u.staff && (includeInactive || u.staff.active !== false));
}
function staffById(id) { return db.users.find((u) => u.id === id && u.staff) || null; }
function staffRating(staffId) {
  const list = db.reviews.filter((r) => r.approved === true && r.staffId === staffId);
  if (!list.length) return { rating: 0, count: 0 };
  return { rating: Math.round((list.reduce((s, r) => s + r.rating, 0) / list.length) * 10) / 10, count: list.length };
}
function publicStaff(u) {
  const r = staffRating(u.id);
  return { id: u.id, name: u.name, specialtyMn: u.staff.specialtyMn || '', specialtyEn: u.staff.specialtyEn || '', color: u.staff.color || '#b08c46', rating: r.rating, reviewCount: r.count };
}
function staffWindow(u, dateStr) {
  if (!u || !u.staff || u.staff.active === false) return null;
  if ((u.staff.daysOff || []).includes(dateStr)) return null;
  const h = (u.staff.hours || DEFAULT_HOURS)[ubWeekday(dateStr)];
  if (!h) return null;
  return [toMin(h[0]), toMin(h[1])];
}
/* customer app: any free staff member for this slot, preferring their favourite,
   then whoever has the fewest bookings that day */
function pickStaff(dateStr, time, svc, preferredId, list) {
  const candidates = staffUsers().filter((u) => !evaluate(u, svc, dateStr, time, list).error);
  if (!candidates.length) return null;
  if (preferredId) {
    const p = candidates.find((u) => u.id === preferredId);
    if (p) return p;
  }
  const load = (u) => db.bookings.filter((x) => x.staffId === u.id && HOLDING.includes(x.status) && bkDate(x) === dateStr).length;
  candidates.sort((a, b) => load(a) - load(b));
  return candidates[0];
}

/* ---------------- time: Ulaanbaatar is UTC+08:00 all year (no DST) ----------------
   Every stored appointment instant (bookings, blocks, machine holds) is an ISO string
   with an explicit +08:00 offset, e.g. "2026-10-02T14:00:00+08:00": unambiguous,
   readable as salon time, and — because the offset never varies — sortable as plain
   strings. These helpers do the offset arithmetic themselves and never depend on the
   process timezone. */
const UB_OFFSET_MS = 8 * 3600000;
const MIN_MS = 60000;
function ubIso(ms) { return new Date(ms + UB_OFFSET_MS).toISOString().slice(0, 19) + '+08:00'; }
function ubMs(dateStr, time) { return Date.parse(dateStr + 'T' + time + ':00+08:00'); }
function ubDate(iso) { return ubIso(Date.parse(iso)).slice(0, 10); }
function ubTime(iso) { return ubIso(Date.parse(iso)).slice(11, 16); }
function ubToday() { return ubIso(Date.now()).slice(0, 10); }
function ubAddDays(dateStr, n) { return ubIso(ubMs(dateStr, '12:00') + n * 86400000).slice(0, 10); }
function ubWeekday(dateStr) { return new Date(ubMs(dateStr, '12:00') + UB_OFFSET_MS).getUTCDay(); }
function validDate(d) { return DATE_RE.test(d || '') && ubIso(ubMs(d, '12:00')).slice(0, 10) === d; }
function validTime(t) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(t || ''); }
function hhmm(min) { return String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0'); }
function bkDate(b) { return ubDate(b.startsAt); }
function bkTime(b) { return ubTime(b.startsAt); }
function bkMinutes(b) { return Math.round((Date.parse(b.endsAt) - Date.parse(b.startsAt)) / MIN_MS); }
function stepMinutes() { const s = Number(cfg().bookingStepMinutes); return [5, 10, 15, 20, 30, 60].includes(s) ? s : 15; }

/* ---------------- machines (config.json → "machines") ----------------
   { id, name, units, bufferMinutes } — bufferMinutes is turnaround/cleaning time
   added after every machine window. Read once at start; invalid entries are dropped
   loudly, and any service that names a dropped machine refuses to book (fail closed). */
const MACHINE_ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const MACHINES = (() => {
  const out = new Map();
  for (const m of Array.isArray(config.machines) ? config.machines : []) {
    const units = Number(m && m.units), buf = m && m.bufferMinutes !== undefined ? Number(m.bufferMinutes) : 0;
    if (!m || !MACHINE_ID_RE.test(m.id || '') || out.has(m.id) || !Number.isInteger(units) || units < 1 || units > 50 || !Number.isInteger(buf) || buf < 0 || buf > 240) {
      console.error('config.json machines: ignoring invalid entry ' + JSON.stringify(m));
      continue;
    }
    out.set(m.id, { id: m.id, name: String(m.name || m.id).slice(0, 60), units, bufferMinutes: buf, placeholder: m.placeholder === true });
  }
  return out;
})();
function machineList() { return [...MACHINES.values()]; }

/* A service's machine usage: [{ machine, minutes, startOffset }] — the machine is held
   from startOffset to startOffset+minutes inside the appointment (plus its buffer after).
   Returns { uses } or { error } for owner input. */
function cleanUses(raw, serviceMinutes) {
  if (raw === undefined || raw === null) return { uses: [] };
  if (!Array.isArray(raw) || raw.length > 4) return { error: 'bad_uses' };
  const uses = [], seen = new Set();
  for (const u of raw) {
    const machine = String((u && u.machine) || '');
    const minutes = Number(u && u.minutes), startOffset = Number((u && u.startOffset) || 0);
    if (!MACHINES.has(machine)) return { error: 'unknown_machine' };
    if (seen.has(machine)) return { error: 'duplicate_machine' };
    if (!Number.isInteger(minutes) || minutes < 1 || !Number.isInteger(startOffset) || startOffset < 0) return { error: 'bad_uses' };
    if (startOffset + minutes > serviceMinutes) return { error: 'machine_window_outside_service' };
    seen.add(machine);
    uses.push({ machine, minutes, startOffset });
  }
  return { uses };
}
/* why an existing service cannot be booked right now (config may have changed under it) */
function serviceMachineProblem(svc) {
  for (const u of svc.uses || []) {
    if (!MACHINES.has(u.machine)) return 'machine_not_configured';
    if (u.startOffset + u.minutes > svc.minutes) return 'machine_window_outside_service';
  }
  return null;
}

/* ---------------- availability engine ----------------
   Resources: every staff member is one unit ("staff:<id>"); every machine has its
   configured unit count ("machine:<id>"). Only confirmed and done bookings hold
   anything — cancelled and no-show bookings hold nothing, so cancelling frees the
   staff member and every machine at once. Blocks hold their staff member only.
   All intervals are half-open [start, end): one ending at 15:00 and another
   starting at 15:00 do not overlap. */
const HOLDING = ['confirmed', 'done'];
/* the appointment window: what the staff member is busy for */
function appointmentWindow(b) { return { s: Date.parse(b.startsAt), e: Date.parse(b.endsAt) }; }
/* the machine windows: a sub-window of the appointment, held until releasesAt (use + buffer) */
function machineHolds(b) { return (b.machines || []).map((h) => ({ machine: h.machine, s: Date.parse(h.startsAt), e: Date.parse(h.releasesAt) })); }

function reservations(excludeBookingId) {
  const out = [];
  for (const b of db.bookings) {
    if (!HOLDING.includes(b.status) || b.id === excludeBookingId) continue;
    const w = appointmentWindow(b);
    if (b.staffId) out.push({ res: 'staff:' + b.staffId, s: w.s, e: w.e });
    for (const h of machineHolds(b)) out.push({ res: 'machine:' + h.machine, s: h.s, e: h.e });
  }
  for (const bl of db.blocks) out.push({ res: 'staff:' + bl.staffId, s: Date.parse(bl.startsAt), e: Date.parse(bl.endsAt) });
  return out;
}
/* Highest number of reservations on `res` active at the same instant inside [s, e).
   This is the "count overlapping reservations" rule made exact: for a 1-unit resource
   it is any overlap at all; for 2+ units, two existing bookings that both touch the
   window but never run at the same time only use one unit. */
function peakUse(list, res, s, e) {
  const ev = [];
  for (const r of list) {
    if (r.res === res && r.s < e && s < r.e) ev.push([Math.max(r.s, s), 1], [Math.min(r.e, e), -1]);
  }
  ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]); /* at the same instant, releases come before starts */
  let cur = 0, peak = 0;
  for (const [, d] of ev) { cur += d; if (cur > peak) peak = cur; }
  return peak;
}
/* what a booking of `svc` starting at startMs would reserve */
function candidateFor(svc, startMs) {
  const problem = serviceMachineProblem(svc);
  if (problem) return { error: problem };
  const holds = (svc.uses || []).map((u) => {
    const s = startMs + u.startOffset * MIN_MS, e = s + u.minutes * MIN_MS;
    return { machine: u.machine, s, e, release: e + MACHINES.get(u.machine).bufferMinutes * MIN_MS };
  });
  return { startMs, endMs: startMs + svc.minutes * MIN_MS, holds };
}
/* the same shape rebuilt from a stored booking (restore / reassign re-check its own snapshot) */
function candidateOf(b) {
  const w = appointmentWindow(b);
  return { startMs: w.s, endMs: w.e, holds: machineHolds(b).map((h) => ({ machine: h.machine, s: h.s, e: h.e, release: h.e })) };
}
function clashFor(cand, staffId, list) {
  if (peakUse(list, 'staff:' + staffId, cand.startMs, cand.endMs) >= 1) return 'staff_busy';
  for (const h of cand.holds) {
    const m = MACHINES.get(h.machine);
    if (!m || peakUse(list, 'machine:' + h.machine, h.s, h.release) >= m.units) return 'machine_busy';
  }
  return null;
}
function hoursProblem(su, dateStr, startMin, endMin) {
  if (salonClosed(dateStr)) return 'closed';
  const win = staffWindow(su, dateStr);
  if (!win) return 'staff_off';
  if (startMin < win[0] || endMin > win[1]) return 'outside_hours';
  return null;
}
/* full check for a new booking; `list` defaults to the live reservations */
function evaluate(su, svc, dateStr, time, list) {
  const startMin = toMin(time);
  const hp = hoursProblem(su, dateStr, startMin, startMin + svc.minutes);
  if (hp) return { error: hp };
  const cand = candidateFor(svc, ubMs(dateStr, time));
  if (cand.error) return cand;
  const clash = clashFor(cand, su.id, list || reservations());
  return clash ? { error: clash } : { cand };
}
/* stored fields for a booking made from a checked candidate */
function scheduleFields(cand) {
  return {
    startsAt: ubIso(cand.startMs), endsAt: ubIso(cand.endMs),
    machines: cand.holds.map((h) => ({ machine: h.machine, startsAt: ubIso(h.s), endsAt: ubIso(h.e), releasesAt: ubIso(h.release) }))
  };
}
/* bookable start times for one staff member, service and day, on the step grid */
function freeStarts(su, svc, dateStr, step, notBeforeMs) {
  const win = staffWindow(su, dateStr);
  if (!win || salonClosed(dateStr) || serviceMachineProblem(svc)) return [];
  const list = reservations();
  const out = [];
  for (let t = Math.ceil(win[0] / step) * step; t + svc.minutes <= win[1]; t += step) {
    const time = hhmm(t);
    if (notBeforeMs && ubMs(dateStr, time) < notBeforeMs) continue;
    if (!evaluate(su, svc, dateStr, time, list).error) out.push(time);
  }
  return out;
}

/* ---------------- serialized write path ----------------
   Every booking and block write runs through here, one at a time. The callback is
   synchronous: it re-derives reservations from the live db, re-checks availability,
   mutates and calls saveDb() without yielding, so no other request can get between
   the final check and the write — two staff racing for the last unit cannot both win. */
let writeQueue = Promise.resolve();
function serialized(fn) {
  const run = writeQueue.then(fn);
  writeQueue = run.catch(() => {});
  return run;
}

function refundBooking(booking, byWhom) {
  const u = db.users.find((x) => x.id === booking.userId);
  if (booking.paid === 'balance' && u) {
    u.balance += booking.amount;
    addTransaction(u.id, 'refund', 'balance', booking.amount, byWhom || 'booking cancelled');
    booking.paid = 'refunded';
  } else if (booking.paid === 'package' && booking.userBundleId) {
    const ub = db.userBundles.find((x) => x.id === booking.userBundleId);
    if (ub) ub.remaining += 1;
    booking.paid = 'package_returned';
  }
}

function firstName(name) { return String(name || '').trim().split(/\s+/)[0] || ''; }

/* ---------------- QPay integration (real mode) ----------------
 * Docs: https://developer.qpay.mn  (sandbox: merchant-sandbox.qpay.mn, production: merchant.qpay.mn)
 * Set config.json: paymentsDemo=false + qpay credentials to activate. Demo mode never touches the network.
 */
let qpayToken = null, qpayTokenExp = 0;
async function qpayAuth() {
  const { baseUrl, username, password } = cfg().qpay;
  if (Date.now() < qpayTokenExp && qpayToken) return qpayToken;
  const r = await fetch(baseUrl + '/v2/auth/token', {
    method: 'POST',
    headers: { Authorization: 'Basic ' + Buffer.from(username + ':' + password).toString('base64') }
  });
  if (!r.ok) throw new Error('qpay_auth_failed');
  const d = await r.json();
  qpayToken = d.access_token;
  qpayTokenExp = Date.now() + 50 * 60 * 1000;
  return qpayToken;
}
async function qpayCreateInvoice(inv) {
  const t = await qpayAuth();
  const c = cfg();
  const r = await fetch(c.qpay.baseUrl + '/v2/invoice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t },
    body: JSON.stringify({
      invoice_code: c.qpay.invoiceCode,
      sender_invoice_no: inv.id,
      invoice_receiver_code: 'terminal',
      invoice_description: "B's Gua Sha wallet top-up " + inv.amount + 'MNT',
      amount: inv.amount,
      callback_url: (c.qpay.callbackBaseUrl || '') + '/api/payments/qpay/callback?invoice=' + inv.id
    })
  });
  if (!r.ok) throw new Error('qpay_invoice_failed');
  return r.json();
}
async function qpayCheckPaid(qpayInvoiceId) {
  const t = await qpayAuth();
  const r = await fetch(cfg().qpay.baseUrl + '/v2/payment/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t },
    body: JSON.stringify({ object_type: 'INVOICE', object_id: qpayInvoiceId, offset: { page_number: 1, page_limit: 100 } })
  });
  if (!r.ok) return false;
  const d = await r.json();
  return (d.rows || []).some((p) => p.payment_status === 'PAID');
}
function creditInvoice(inv) {
  if (inv.status === 'paid') return;
  inv.status = 'paid';
  inv.paidAt = nowIso();
  const user = db.users.find((u) => u.id === inv.userId);
  if (user) {
    user.balance += inv.amount + inv.bonus;
    addTransaction(user.id, 'topup', inv.method, inv.amount, inv.bonus > 0 ? 'bonus +' + inv.bonus : '');
    if (inv.bonus > 0) addTransaction(user.id, 'bonus', inv.method, inv.bonus, 'top-up bonus');
  }
  saveDb();
}

/* ---------------- admin pin rate limit ---------------- */
const pinFails = { count: 0, until: 0 };

/* ---------------- API router ---------------- */
async function handleApi(req, res, pathname, q) {
  const method = req.method;
  const route = method + ' ' + pathname;
  const c = cfg();
  let m;

  /* ---------- wallet feature gate ----------
     When the super admin turns the wallet off, every money-in-app endpoint is closed
     server-side. List endpoints answer with an empty array so an old cached app
     degrades quietly instead of showing errors. */
  if (!walletOn()) {
    const WALLET_LISTS = ['GET /api/bundles', 'GET /api/my/bundles', 'GET /api/giftcards/mine', 'GET /api/transactions'];
    if (WALLET_LISTS.includes(route)) return json(res, 200, []);
    if (/^\/api\/(topup|bundles|giftcards|redeem)(\/|$)/.test(pathname)) return fail(res, 403, 'feature_disabled');
  }

  /* ===================== public ===================== */
  if (route === 'GET /api/health') return json(res, 200, { ok: true, time: nowIso(), demo: c.paymentsDemo, version: 3 });

  if (route === 'GET /api/config') {
    return json(res, 200, {
      salonName: c.salonName, sloganMn: c.sloganMn, sloganEn: c.sloganEn,
      phoneDisplay: c.phoneDisplay, phoneTel: c.phoneTel, bookingPhones: c.bookingPhones || '', mapUrl: c.mapUrl || '', email: c.email,
      addressEn: c.addressEn, addressMn: c.addressMn,
      facebook: c.facebook, instagram: c.instagram,
      hoursOpen: c.hoursOpen, hoursClose: c.hoursClose,
      slotMinutes: c.slotMinutes, bookingDaysAhead: c.bookingDaysAhead,
      cancelHours: c.cancelHours, paymentsDemo: c.paymentsDemo,
      topupBonusThreshold: c.topupBonusThreshold, topupBonusPercent: c.topupBonusPercent,
      featureWallet: c.featureWallet === true
    });
  }

  if (route === 'GET /api/services') return json(res, 200, db.services.filter((s) => s.active));
  if (route === 'GET /api/staff') return json(res, 200, staffUsers().map(publicStaff));
  if (route === 'GET /api/bundles') return json(res, 200, db.bundles.filter((b) => b.active));

  if (route === 'GET /api/public/reviews') {
    const list = db.reviews
      .filter((r) => r.approved === true)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 30)
      .map((r) => {
        const svc = db.services.find((s) => s.id === r.serviceId);
        const st = r.staffId ? staffById(r.staffId) : null;
        const u = r.userId ? db.users.find((x) => x.id === r.userId) : null;
        return {
          rating: r.rating, text: r.text, createdAt: r.createdAt,
          verified: !!r.bookingId, /* written after a real booking in the app */
          name: r.name || firstName(u && u.name) || 'Үйлчлүүлэгч',
          serviceMn: svc ? svc.nameMn : '', serviceEn: svc ? svc.nameEn : '',
          staffName: st ? firstName(st.name) : ''
        };
      });
    const avg = list.length ? Math.round((list.reduce((s, r) => s + r.rating, 0) / list.length) * 10) / 10 : 0;
    const distribution = [5, 4, 3, 2, 1].map((st) => list.filter((r) => r.rating === st).length);
    return json(res, 200, { average: avg, count: list.length, distribution, reviews: list });
  }

  if (route === 'GET /api/public/faq') {
    const fill = (txt) => String(txt || '')
      .replace(/\{cancelHours\}/g, String(c.cancelHours))
      .replace(/\{phone\}/g, c.phoneDisplay || '')
      .replace(/\{hoursOpen\}/g, c.hoursOpen || '')
      .replace(/\{hoursClose\}/g, c.hoursClose || '');
    const w = walletOn();
    return json(res, 200, db.faq
      .filter((f) => f.active && (f.show === 'always' || (f.show === 'wallet_on') === w))
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .map((f) => ({ id: f.id, group: f.group, qMn: f.qMn, qEn: f.qEn, aMn: fill(f.aMn), aEn: fill(f.aEn) })));
  }

  if (route === 'GET /api/public/edu') {
    return json(res, 200, db.edu.filter((e) => e.active).sort((a, b) => (a.order || 0) - (b.order || 0)));
  }

  if (route === 'POST /api/register') {
    const b = await readJson(req);
    const name = String(b.name || '').trim();
    const phone = String(b.phone || '').trim();
    const password = String(b.password || '');
    if (!name || name.length > 60) return fail(res, 400, 'bad_name');
    if (!PHONE_RE.test(phone)) return fail(res, 400, 'bad_phone');
    if (password.length < 6) return fail(res, 400, 'bad_password');
    /* staff may have created this customer at the counter (no password yet) —
       registering with that phone turns the record into a login and keeps its history */
    const pre = db.users.find((u) => u.phone === phone);
    if (pre && pre.role === 'customer' && pre.noLogin && !pre.disabled) {
      setPassword(pre, password);
      delete pre.noLogin;
      const token = newSession(db.sessions, { userId: pre.id });
      saveDb();
      return json(res, 200, { token, user: publicUser(pre) });
    }
    if (pre) return fail(res, 409, 'phone_taken');
    const user = makeUser(name, phone, password);
    db.users.push(user);
    const token = newSession(db.sessions, { userId: user.id });
    saveDb();
    return json(res, 200, { token, user: publicUser(user) });
  }

  if (route === 'POST /api/login') {
    const b = await readJson(req);
    const user = db.users.find((u) => u.phone === String(b.phone || '').trim());
    if (!user || !checkPassword(user, String(b.password || ''))) return fail(res, 401, 'invalid_credentials');
    if (user.disabled) return fail(res, 403, 'account_disabled');
    const token = newSession(db.sessions, { userId: user.id });
    saveDb();
    return json(res, 200, { token, user: publicUser(user) });
  }

  /* ===================== user routes ===================== */
  const user = authUser(req, q);

  if (route === 'GET /api/me') {
    if (!user) return fail(res, 401, 'unauthorized');
    const unreadChat = db.messages.filter((msg) => msg.userId === user.id && msg.from === 'salon' && !msg.readByCustomer).length;
    return json(res, 200, { user: publicUser(user), unreadChat });
  }

  if (route === 'PATCH /api/me' || route === 'POST /api/me') {
    if (!user) return fail(res, 401, 'unauthorized');
    const b = await readJson(req);
    if (typeof b.name === 'string' && b.name.trim() && b.name.trim().length <= 60) user.name = b.name.trim();
    if (typeof b.skinType === 'string') user.skinType = b.skinType.trim().slice(0, 40);
    if (typeof b.allergies === 'string') user.allergies = b.allergies.trim().slice(0, 200);
    if (typeof b.prefNote === 'string') user.prefNote = b.prefNote.trim().slice(0, 300);
    if (typeof b.birthday === 'string') {
      if (b.birthday === '' || DATE_RE.test(b.birthday)) user.birthday = b.birthday;
    }
    if (b.preferredStaffId !== undefined) {
      if (b.preferredStaffId === '' || b.preferredStaffId === null) user.preferredStaffId = '';
      else if (staffById(b.preferredStaffId)) user.preferredStaffId = b.preferredStaffId;
    }
    if (b.newPassword) {
      if (!checkPassword(user, String(b.password || ''))) return fail(res, 401, 'invalid_credentials');
      if (String(b.newPassword).length < 6) return fail(res, 400, 'bad_password');
      user.salt = crypto.randomBytes(16).toString('hex');
      user.hash = crypto.scryptSync(String(b.newPassword), user.salt, 32).toString('hex');
    }
    saveDb();
    return json(res, 200, { user: publicUser(user) });
  }

  if (route === 'POST /api/logout') {
    const t = tokenFrom(req, q);
    if (t) { delete db.sessions[t]; saveDb(); }
    return json(res, 200, { ok: true });
  }

  if (route === 'GET /api/slots') {
    const date = q.get('date') || '';
    if (!validDate(date)) return fail(res, 400, 'bad_date');
    const today = ubToday();
    const max = ubAddDays(today, c.bookingDaysAhead);
    if (date < today || date > max) return fail(res, 400, 'date_out_of_range');
    if (salonClosed(date)) return json(res, 200, { date, closed: true, slots: [] });
    const svc = db.services.find((s) => s.id === q.get('serviceId') && s.active);
    if (!svc) return fail(res, 400, 'bad_service');
    const staffParam = q.get('staffId') || 'any';
    const pool = staffParam === 'any' ? staffUsers() : [staffById(staffParam)].filter(Boolean);
    const list = reservations();
    const soonest = Date.now() + 60 * MIN_MS; /* the app keeps a one-hour lead time */
    const slots = slotTimes().map((time) => ({
      time,
      available: ubMs(date, time) >= soonest && pool.some((u) => !evaluate(u, svc, date, time, list).error)
    }));
    return json(res, 200, { date, closed: false, slots });
  }

  if (route === 'POST /api/bookings') {
    if (!user) return fail(res, 401, 'unauthorized');
    const b = await readJson(req);
    const svc = db.services.find((s) => s.id === b.serviceId && s.active);
    if (!svc) return fail(res, 400, 'bad_service');
    if (!validDate(b.date) || !validTime(b.time)) return fail(res, 400, 'bad_request');
    if (!slotTimes().includes(b.time)) return fail(res, 400, 'bad_time');
    const today = ubToday();
    if (b.date < today || b.date > ubAddDays(today, c.bookingDaysAhead) || salonClosed(b.date)) return fail(res, 400, 'date_out_of_range');
    if (ubMs(b.date, b.time) - Date.now() < 60 * MIN_MS) return fail(res, 400, 'too_soon');
    if (b.staffId && b.staffId !== 'any' && !staffById(b.staffId)) return fail(res, 400, 'bad_staff');
    const payWith = walletOn() && ['balance', 'salon', 'package'].includes(b.payWith) ? b.payWith : 'salon';

    /* check and write in one step (see serialized) */
    const r = await serialized(() => {
      const list = reservations();
      let staffUser, ev;
      if (!b.staffId || b.staffId === 'any') {
        staffUser = pickStaff(b.date, b.time, svc, user.preferredStaffId, list);
        if (!staffUser) return { status: 409, error: 'slot_taken' };
        ev = evaluate(staffUser, svc, b.date, b.time, list);
      } else {
        staffUser = staffById(b.staffId);
        ev = evaluate(staffUser, svc, b.date, b.time, list);
        if (ev.error) return { status: 409, error: 'slot_taken' };
      }
      let userBundleId = null;
      if (payWith === 'package') {
        const ub = usableBundleFor(user.id, svc.id);
        if (!ub) return { status: 400, error: 'no_package' };
        ub.remaining -= 1;
        userBundleId = ub.id;
      } else if (payWith === 'balance') {
        if (user.balance < svc.price) return { status: 400, error: 'insufficient_balance' };
        user.balance -= svc.price;
        addTransaction(user.id, 'payment', 'balance', -svc.price, svc.nameEn);
      }
      const booking = {
        id: uid('bk'), userId: user.id, serviceId: svc.id, staffId: staffUser.id,
        ...scheduleFields(ev.cand),
        status: 'confirmed', paid: payWith, amount: svc.price,
        createdBy: 'app', createdAt: nowIso()
      };
      if (userBundleId) booking.userBundleId = userBundleId;
      db.bookings.push(booking);
      saveDb();
      return { booking };
    });
    if (r.error) return fail(res, r.status, r.error);
    return json(res, 200, { booking: bookingOut(r.booking), balance: user.balance });
  }

  if (route === 'GET /api/bookings') {
    if (!user) return fail(res, 401, 'unauthorized');
    const list = db.bookings
      .filter((b) => b.userId === user.id)
      .sort((a, b) => b.startsAt.localeCompare(a.startsAt))
      .map(bookingOut);
    return json(res, 200, list);
  }

  m = pathname.match(/^\/api\/bookings\/([\w-]+)\/cancel$/);
  if (m && method === 'POST') {
    if (!user) return fail(res, 401, 'unauthorized');
    const booking = db.bookings.find((b) => b.id === m[1] && b.userId === user.id);
    if (!booking) return fail(res, 404, 'not_found');
    if (booking.status !== 'confirmed') return fail(res, 400, 'bad_request');
    const hoursLeft = (Date.parse(booking.startsAt) - Date.now()) / 3600000;
    if (hoursLeft < c.cancelHours) return fail(res, 400, 'too_late_cancel');
    booking.status = 'cancelled';
    booking.cancelledAt = nowIso();
    refundBooking(booking);
    saveDb();
    return json(res, 200, { ok: true, balance: user.balance });
  }

  /* ----- reviews ----- */
  if (route === 'POST /api/reviews') {
    if (!user) return fail(res, 401, 'unauthorized');
    const b = await readJson(req);
    const booking = db.bookings.find((x) => x.id === b.bookingId && x.userId === user.id);
    if (!booking) return fail(res, 404, 'not_found');
    if (booking.status !== 'done') return fail(res, 400, 'not_done_yet');
    if (booking.reviewId) return fail(res, 409, 'already_reviewed');
    const rating = Math.round(Number(b.rating));
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) return fail(res, 400, 'bad_rating');
    const review = {
      id: uid('rv'), bookingId: booking.id, userId: user.id, staffId: booking.staffId || null,
      serviceId: booking.serviceId, rating, text: String(b.text || '').trim().slice(0, 600),
      name: firstName(user.name), approved: null, createdAt: nowIso()
    };
    db.reviews.push(review);
    booking.reviewId = review.id;
    saveDb();
    return json(res, 200, { ok: true, review });
  }

  /* ----- wallet ----- */
  if (route === 'POST /api/topup') {
    if (!user) return fail(res, 401, 'unauthorized');
    const b = await readJson(req);
    const amount = Math.round(Number(b.amount));
    if (!Number.isFinite(amount) || amount < 5000 || amount > 5000000) return fail(res, 400, 'bad_amount');
    const bonus = amount >= c.topupBonusThreshold ? Math.floor((amount * c.topupBonusPercent) / 100) : 0;
    const inv = { id: uid('inv'), userId: user.id, amount, bonus, method: 'qpay', status: 'pending', createdAt: nowIso() };
    if (c.paymentsDemo) {
      inv.qrText = 'BGUASHA-DEMO-INVOICE|' + inv.id + '|' + amount + 'MNT';
    } else {
      try {
        const r = await qpayCreateInvoice(inv);
        inv.qpayInvoiceId = r.invoice_id;
        inv.qrText = r.qr_text;
        inv.urls = r.urls;
      } catch (e) {
        console.error('QPay error:', e.message);
        return fail(res, 502, 'qpay_unavailable');
      }
    }
    db.invoices.push(inv);
    saveDb();
    return json(res, 200, { invoiceId: inv.id, qrText: inv.qrText, amount, bonus, demo: c.paymentsDemo });
  }

  m = pathname.match(/^\/api\/topup\/([\w-]+)$/);
  if (m && method === 'GET') {
    if (!user) return fail(res, 401, 'unauthorized');
    const inv = db.invoices.find((i) => i.id === m[1] && i.userId === user.id);
    if (!inv) return fail(res, 404, 'not_found');
    if (!c.paymentsDemo && inv.status === 'pending' && inv.qpayInvoiceId) {
      try { if (await qpayCheckPaid(inv.qpayInvoiceId)) creditInvoice(inv); } catch (e) {}
    }
    return json(res, 200, { status: inv.status, balance: user.balance });
  }

  m = pathname.match(/^\/api\/topup\/([\w-]+)\/confirm-demo$/);
  if (m && method === 'POST') {
    if (!user) return fail(res, 401, 'unauthorized');
    if (!c.paymentsDemo) return fail(res, 400, 'not_demo_mode');
    const inv = db.invoices.find((i) => i.id === m[1] && i.userId === user.id);
    if (!inv) return fail(res, 404, 'not_found');
    if (inv.status !== 'pending') return fail(res, 400, 'bad_request');
    creditInvoice(inv);
    return json(res, 200, { ok: true, balance: user.balance });
  }

  if (pathname === '/api/payments/qpay/callback' && (method === 'GET' || method === 'POST')) {
    const invId = q.get('invoice');
    const inv = db.invoices.find((i) => i.id === invId);
    if (inv && inv.status === 'pending' && !c.paymentsDemo && inv.qpayInvoiceId) {
      try { if (await qpayCheckPaid(inv.qpayInvoiceId)) creditInvoice(inv); } catch (e) {}
    }
    return json(res, 200, { ok: true });
  }

  if (route === 'GET /api/transactions') {
    if (!user) return fail(res, 401, 'unauthorized');
    return json(res, 200, db.transactions.filter((t) => t.userId === user.id).slice().reverse());
  }

  /* ----- bundles (packages) ----- */
  if (route === 'GET /api/my/bundles') {
    if (!user) return fail(res, 401, 'unauthorized');
    const list = db.userBundles.filter((ub) => ub.userId === user.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((ub) => {
        const bd = db.bundles.find((b) => b.id === ub.bundleId) || {};
        return {
          id: ub.id, remaining: ub.remaining, expiresAt: ub.expiresAt, createdAt: ub.createdAt,
          nameMn: bd.nameMn || '', nameEn: bd.nameEn || '', emoji: bd.emoji || '🎁',
          sessions: bd.sessions || 0,
          serviceIds: bd.serviceIds || [],
          expired: new Date(ub.expiresAt).getTime() < Date.now()
        };
      });
    return json(res, 200, list);
  }

  m = pathname.match(/^\/api\/bundles\/([\w-]+)\/buy$/);
  if (m && method === 'POST') {
    if (!user) return fail(res, 401, 'unauthorized');
    const bd = db.bundles.find((b) => b.id === m[1] && b.active);
    if (!bd) return fail(res, 404, 'not_found');
    if (user.balance < bd.price) return fail(res, 400, 'insufficient_balance');
    user.balance -= bd.price;
    addTransaction(user.id, 'bundle', 'balance', -bd.price, bd.nameEn);
    const ub = { id: uid('ub'), userId: user.id, bundleId: bd.id, remaining: bd.sessions, expiresAt: new Date(Date.now() + bd.validDays * 86400000).toISOString(), createdAt: nowIso() };
    db.userBundles.push(ub);
    saveDb();
    return json(res, 200, { ok: true, balance: user.balance, userBundle: ub });
  }

  /* ----- gift cards & promo codes ----- */
  if (route === 'POST /api/giftcards/buy') {
    if (!user) return fail(res, 401, 'unauthorized');
    const b = await readJson(req);
    const amount = Math.round(Number(b.amount));
    if (!Number.isFinite(amount) || amount < 10000 || amount > 1000000) return fail(res, 400, 'bad_amount');
    if (user.balance < amount) return fail(res, 400, 'insufficient_balance');
    user.balance -= amount;
    addTransaction(user.id, 'giftcard_buy', 'balance', -amount, '');
    let code = genCode('BG');
    while (db.giftcards.some((g) => g.code === code)) code = genCode('BG');
    const gc = {
      id: uid('gc'), code, amount, fromUserId: user.id,
      toName: String(b.toName || '').trim().slice(0, 60),
      message: String(b.message || '').trim().slice(0, 200),
      status: 'active', createdAt: nowIso()
    };
    db.giftcards.push(gc);
    saveDb();
    return json(res, 200, { ok: true, balance: user.balance, giftcard: gc });
  }

  if (route === 'GET /api/giftcards/mine') {
    if (!user) return fail(res, 401, 'unauthorized');
    return json(res, 200, db.giftcards.filter((g) => g.fromUserId === user.id).slice().reverse());
  }

  if (route === 'POST /api/redeem') {
    if (!user) return fail(res, 401, 'unauthorized');
    const b = await readJson(req);
    const code = normCode(b.code);
    if (!code) return fail(res, 400, 'bad_code');
    const gc = db.giftcards.find((g) => normCode(g.code) === code);
    if (gc) {
      if (gc.status !== 'active') return fail(res, 400, 'code_used');
      gc.status = 'redeemed';
      gc.redeemedBy = user.id;
      gc.redeemedAt = nowIso();
      user.balance += gc.amount;
      addTransaction(user.id, 'gift', 'code', gc.amount, gc.code);
      saveDb();
      return json(res, 200, { kind: 'giftcard', amount: gc.amount, balance: user.balance });
    }
    const pr = db.promos.find((p) => normCode(p.code) === code);
    if (pr) {
      if (!pr.active) return fail(res, 400, 'code_invalid');
      if (pr.expiresAt && new Date(pr.expiresAt).getTime() < Date.now()) return fail(res, 400, 'code_expired');
      if (pr.used >= pr.maxUses) return fail(res, 400, 'code_used');
      if (pr.usedBy.includes(user.id)) return fail(res, 400, 'code_already_yours');
      pr.used += 1;
      pr.usedBy.push(user.id);
      user.balance += pr.amount;
      addTransaction(user.id, 'promo', 'code', pr.amount, pr.code);
      saveDb();
      return json(res, 200, { kind: 'promo', amount: pr.amount, balance: user.balance });
    }
    return fail(res, 404, 'code_invalid');
  }

  /* ----- chat (customer side) ----- */
  if (route === 'GET /api/chat') {
    if (!user) return fail(res, 401, 'unauthorized');
    let changed = false;
    const list = db.messages.filter((msg) => msg.userId === user.id);
    list.forEach((msg) => { if (msg.from === 'salon' && !msg.readByCustomer) { msg.readByCustomer = true; changed = true; } });
    if (changed) saveDb();
    return json(res, 200, list.map(msgOut));
  }
  if (route === 'POST /api/chat') {
    if (!user) return fail(res, 401, 'unauthorized');
    const b = await readJson(req);
    const text = String(b.text || '').trim().slice(0, 1000);
    if (!text) return fail(res, 400, 'bad_request');
    const msg = { id: uid('msg'), userId: user.id, from: 'customer', fromName: firstName(user.name), text, createdAt: nowIso(), readByCustomer: true, readBySalon: false };
    db.messages.push(msg);
    saveDb();
    return json(res, 200, msgOut(msg));
  }

  /* ----- progress photos ----- */
  if (route === 'POST /api/photos') {
    if (!user) return fail(res, 401, 'unauthorized');
    const b = await readJson(req);
    const dataUrl = String(b.image || '');
    const mm = dataUrl.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
    if (!mm) return fail(res, 400, 'bad_image');
    const buf = Buffer.from(mm[2], 'base64');
    const ext = mm[1] === 'png' ? 'png' : (mm[1] === 'webp' ? 'webp' : 'jpg');
    const imgErr = checkImage(buf, ext);
    if (imgErr) return fail(res, imgErr === 'image_too_large' ? 413 : 400, imgErr);
    const photo = { id: uid('ph'), userId: user.id, ext: ext, note: String(b.note || '').slice(0, 200), createdAt: nowIso() };
    fs.writeFileSync(path.join(PHOTOS_DIR, photo.id + '.' + photo.ext), buf);
    db.photos.push(photo);
    saveDb();
    return json(res, 200, photoOut(photo));
  }

  if (route === 'GET /api/photos') {
    if (!user) return fail(res, 401, 'unauthorized');
    const list = db.photos.filter((p) => p.userId === user.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return json(res, 200, list.map(photoOut));
  }

  m = pathname.match(/^\/api\/photos\/([\w-]+)\/file$/);
  if (m && method === 'GET') {
    if (!user) return fail(res, 401, 'unauthorized');
    const photo = db.photos.find((p) => p.id === m[1] && p.userId === user.id);
    if (!photo) return fail(res, 404, 'not_found');
    const file = path.join(PHOTOS_DIR, photo.id + '.' + photo.ext);
    if (!fs.existsSync(file)) return fail(res, 404, 'not_found');
    res.writeHead(200, { 'Content-Type': photo.ext === 'png' ? 'image/png' : (photo.ext === 'webp' ? 'image/webp' : 'image/jpeg'), 'Cache-Control': 'private, max-age=86400' });
    fs.createReadStream(file).pipe(res);
    return;
  }

  m = pathname.match(/^\/api\/photos\/([\w-]+)$/);
  if (m && method === 'DELETE') {
    if (!user) return fail(res, 401, 'unauthorized');
    const idx = db.photos.findIndex((p) => p.id === m[1] && p.userId === user.id);
    if (idx === -1) return fail(res, 404, 'not_found');
    const photo = db.photos[idx];
    try { fs.unlinkSync(path.join(PHOTOS_DIR, photo.id + '.' + photo.ext)); } catch (e) {}
    db.photos.splice(idx, 1);
    saveDb();
    return json(res, 200, { ok: true });
  }

  /* ===================== admin / staff ===================== */
  if (route === 'POST /api/admin/login') {
    if (Date.now() < pinFails.until) return fail(res, 429, 'try_later');
    const b = await readJson(req);
    if (String(b.pin || '') !== String(c.adminPin)) {
      pinFails.count++;
      if (pinFails.count >= 5) { pinFails.until = Date.now() + 5 * 60 * 1000; pinFails.count = 0; }
      return fail(res, 401, 'bad_pin');
    }
    pinFails.count = 0;
    /* the config.json PIN is the emergency key — it opens the super admin account */
    const sa = db.users.find((u) => u.role === 'superadmin' && !u.disabled);
    const token = newSession(db.adminSessions, { role: 'superadmin', userId: sa ? sa.id : null, staffUserId: null, name: sa ? sa.name : 'Super admin' });
    saveDb();
    return json(res, 200, { token, role: 'superadmin', name: sa ? sa.name : 'Super admin', staffUserId: null });
  }

  /* phone + password login for every admin-side account: super admin, owner, staff */
  if (route === 'POST /api/admin/login-staff') {
    const b = await readJson(req);
    const su = db.users.find((u) => u.phone === String(b.phone || '').trim() && ADMIN_ROLES.includes(u.role));
    if (!su || !checkPassword(su, String(b.password || ''))) return fail(res, 401, 'invalid_credentials');
    if (su.disabled) return fail(res, 403, 'account_disabled');
    if (su.role === 'staff' && (!su.staff || su.staff.active === false)) return fail(res, 403, 'staff_inactive');
    const staffUserId = su.staff ? su.id : null;
    const token = newSession(db.adminSessions, { role: su.role, userId: su.id, staffUserId, name: su.name });
    saveDb();
    return json(res, 200, { token, role: su.role, name: su.name, staffUserId });
  }

  if (pathname.startsWith('/api/admin/') && pathname !== '/api/admin/login' && pathname !== '/api/admin/login-staff') {
    const sess = authAdmin(req, q);
    if (!sess) return fail(res, 401, 'unauthorized');
    /* superadmin ⊃ owner ⊃ staff: the super admin can do everything the owner can */
    const isSuper = sess.role === 'superadmin';
    const isOwner = isSuper || sess.role === 'owner';
    const ownerOnly = () => fail(res, 403, 'owner_only');
    const superOnly = () => fail(res, 403, 'superadmin_only');

    /* Гарах ends the session on the server too — otherwise it would stay valid for weeks */
    if (route === 'POST /api/admin/logout') {
      delete db.adminSessions[tokenFrom(req, q)];
      saveDb();
      return json(res, 200, { ok: true });
    }

    /* same wallet gate for the admin side — after auth, so an unauthenticated
       request still gets 401 rather than an empty list */
    if (!walletOn()) {
      const ADMIN_WALLET_LISTS = ['GET /api/admin/bundles', 'GET /api/admin/giftcards', 'GET /api/admin/promos', 'GET /api/admin/transactions'];
      if (ADMIN_WALLET_LISTS.includes(route)) return json(res, 200, []);
      if (/^\/api\/admin\/(bundles|giftcards|promos|transactions)(\/|$)/.test(pathname)) return fail(res, 403, 'feature_disabled');
      if (/^\/api\/admin\/users\/[\w-]+\/adjust$/.test(pathname)) return fail(res, 403, 'feature_disabled');
    }

    /* ----- overview ----- */
    if (route === 'GET /api/admin/overview') {
      const today = ubToday();
      const upcoming = db.bookings
        .filter((b) => b.status === 'confirmed' && bkDate(b) >= today && (isOwner || b.staffId === sess.staffUserId))
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
        .map(adminBookingOut);
      const past = db.bookings
        .filter((b) => !(b.status === 'confirmed' && bkDate(b) >= today) && (isOwner || b.staffId === sess.staffUserId))
        .sort((a, b) => b.startsAt.localeCompare(a.startsAt))
        .slice(0, 80)
        .map(adminBookingOut);
      const paidTx = db.transactions.filter((t) => t.type === 'topup');
      return json(res, 200, {
        today, upcoming, past,
        role: sess.role,
        stats: isOwner ? {
          users: db.users.filter((u) => u.role === 'customer').length,
          bookingsTotal: db.bookings.length,
          topupTotal: paidTx.reduce((s, t) => s + t.amount, 0),
          balancesTotal: db.users.reduce((s, u) => s + u.balance, 0),
          pendingReviews: db.reviews.filter((r) => r.approved === null).length,
          unreadChats: threadList().filter((t) => t.unread > 0).length
        } : null
      });
    }

    if (route === 'GET /api/admin/stats') {
      if (!isOwner) return ownerOnly();
      const month = /^\d{4}-\d{2}$/.test(q.get('month') || '') ? q.get('month') : ubToday().slice(0, 7);
      const inMonth = (iso) => (iso || '').slice(0, 7) === month;
      const bks = db.bookings.filter((b) => bkDate(b).slice(0, 7) === month);
      const done = bks.filter((b) => b.status === 'done');
      const svcRevenue = done.filter((b) => b.paid === 'balance' || b.paid === 'salon').reduce((s, b) => s + b.amount, 0);
      const bundleSales = db.transactions.filter((t) => t.type === 'bundle' && inMonth(t.createdAt)).reduce((s, t) => s - t.amount, 0);
      const giftSales = db.transactions.filter((t) => t.type === 'giftcard_buy' && inMonth(t.createdAt)).reduce((s, t) => s - t.amount, 0);
      const topups = db.transactions.filter((t) => t.type === 'topup' && inMonth(t.createdAt)).reduce((s, t) => s + t.amount, 0);
      const bySvc = {}, byStaff = {};
      done.forEach((b) => {
        bySvc[b.serviceId] = (bySvc[b.serviceId] || 0) + 1;
        if (b.staffId) byStaff[b.staffId] = (byStaff[b.staffId] || 0) + 1;
      });
      const topServices = Object.entries(bySvc).map(([id, count]) => {
        const s = db.services.find((x) => x.id === id);
        return { name: s ? s.nameMn : id, count };
      }).sort((a, b) => b.count - a.count).slice(0, 6);
      const topStaff = Object.entries(byStaff).map(([id, count]) => {
        const u = staffById(id);
        const r = staffRating(id);
        return { name: u ? u.name : '?', count, rating: r.rating, reviews: r.count };
      }).sort((a, b) => b.count - a.count);
      const newUsers = db.users.filter((u) => u.role === 'customer' && inMonth(u.createdAt)).length;
      const doneByUser = {};
      db.bookings.filter((b) => b.status === 'done' && b.userId).forEach((b) => { doneByUser[b.userId] = (doneByUser[b.userId] || 0) + 1; });
      const returning = Object.values(doneByUser).filter((n) => n >= 2).length;
      return json(res, 200, {
        month,
        revenue: { services: svcRevenue, bundles: bundleSales, giftcards: giftSales, total: svcRevenue + bundleSales + giftSales, topups },
        bookings: { total: bks.length, done: done.length, noshow: bks.filter((b) => b.status === 'noshow').length, cancelled: bks.filter((b) => b.status === 'cancelled').length },
        topServices, topStaff, newUsers, returningCustomers: returning
      });
    }

    /* ----- calendar ----- */
    if (route === 'GET /api/admin/calendar') {
      const date = validDate(q.get('date')) ? q.get('date') : ubToday();
      const staff = (isOwner ? staffUsers(true) : staffUsers(true).filter((u) => u.id === sess.staffUserId)).map((u) => {
        const win = staffWindow(u, date);
        return { id: u.id, name: u.name, color: (u.staff && u.staff.color) || '#b08c46', active: u.staff.active !== false, working: !!win, open: win ? win[0] : null, close: win ? win[1] : null };
      });
      const bookings = db.bookings.filter((b) => bkDate(b) === date && (isOwner || b.staffId === sess.staffUserId)).map(adminBookingOut);
      const blocks = db.blocks.filter((b) => bkDate(b) === date && (isOwner || b.staffId === sess.staffUserId)).map(blockOut);
      return json(res, 200, { date, closed: salonClosed(date), slotMinutes: c.slotMinutes, step: stepMinutes(), slots: slotTimes(), staff, bookings, blocks });
    }

    /* A block is the staff member's own unavailable time ("15:00–16:00 personal").
       It reserves that person only — never a machine. */
    if (route === 'POST /api/admin/blocks') {
      const b = await readJson(req);
      const from = b.from || b.time;
      if (!validDate(b.date) || !validTime(from)) return fail(res, 400, 'bad_request');
      /* the calendar grid's one-slot block sends only `time` */
      const to = b.to === undefined ? hhmm(toMin(from) + c.slotMinutes) : String(b.to);
      const sMin = toMin(from), eMin = to === '24:00' ? 1440 : (validTime(to) ? toMin(to) : -1);
      if (eMin <= sMin || sMin % 5 || eMin % 5) return fail(res, 400, 'bad_range');
      const su = staffById(b.staffId || sess.staffUserId || '');
      if (!su) return fail(res, 400, 'bad_staff');
      if (!isOwner && su.id !== sess.staffUserId) return fail(res, 403, 'forbidden');
      const note = String(b.note || '').trim().slice(0, 100);
      const r = await serialized(() => {
        const s0 = ubMs(b.date, from), e0 = s0 + (eMin - sMin) * MIN_MS;
        if (peakUse(reservations(), 'staff:' + su.id, s0, e0) >= 1) return { status: 409, error: 'staff_busy' };
        const block = { id: uid('bl'), staffId: su.id, startsAt: ubIso(s0), endsAt: ubIso(e0), note, createdAt: nowIso() };
        db.blocks.push(block);
        saveDb();
        return { block };
      });
      if (r.error) return fail(res, r.status, r.error);
      return json(res, 200, blockOut(r.block));
    }

    m = pathname.match(/^\/api\/admin\/blocks\/([\w-]+)$/);
    if (m && method === 'DELETE') {
      const idx = db.blocks.findIndex((x) => x.id === m[1]);
      if (idx === -1) return fail(res, 404, 'not_found');
      if (!isOwner && db.blocks[idx].staffId !== sess.staffUserId) return fail(res, 403, 'forbidden');
      db.blocks.splice(idx, 1);
      saveDb();
      return json(res, 200, { ok: true });
    }

    if (route === 'POST /api/admin/walkin') {
      const b = await readJson(req);
      const svc = db.services.find((s) => s.id === b.serviceId);
      if (!svc) return fail(res, 400, 'bad_service');
      if (!validDate(b.date) || !validTime(b.time)) return fail(res, 400, 'bad_request');
      if (toMin(b.time) % stepMinutes()) return fail(res, 400, 'bad_time');
      const su = staffById(b.staffId);
      if (!su) return fail(res, 400, 'bad_staff');
      if (!isOwner && su.id !== sess.staffUserId) return fail(res, 403, 'forbidden');
      const today = ubToday();
      if (b.date < ubAddDays(today, -60) || b.date > ubAddDays(today, c.bookingDaysAhead)) return fail(res, 400, 'date_out_of_range');
      const phone = String(b.phone || '').trim();
      if (b.customerId && !db.users.some((u) => u.id === b.customerId && u.role === 'customer')) return fail(res, 404, 'not_found');
      const noteText = String(b.note || '').trim().slice(0, 500);

      /* availability is re-checked here, inside the serialized write, right before saving */
      const r = await serialized(() => {
        const ev = evaluate(su, svc, b.date, b.time);
        if (ev.error) {
          const clash = ev.error === 'staff_busy' || ev.error === 'machine_busy';
          return { status: clash ? 409 : 400, error: clash ? 'slot_taken' : ev.error, reason: ev.error };
        }
        let existing = b.customerId
          ? db.users.find((u) => u.id === b.customerId && u.role === 'customer')
          : (phone ? db.users.find((u) => u.phone === phone) : null);
        /* an unknown number becomes a client record as part of saving the booking,
           so the customer list builds itself out of ordinary phone bookings */
        let created = false;
        if (!existing && PHONE_RE.test(phone)) {
          existing = makeUser(String(b.name || '').trim().slice(0, 60) || 'Үйлчлүүлэгч ' + phone.slice(-4), phone, crypto.randomBytes(18).toString('hex'));
          existing.noLogin = true;
          existing.createdBy = sess.userId || 'admin';
          db.users.push(existing);
          created = true;
        }
        const booking = {
          id: uid('bk'), userId: existing ? existing.id : null,
          walkName: existing ? '' : String(b.name || phone || 'Walk-in').trim().slice(0, 60),
          walkPhone: existing ? '' : phone,
          serviceId: svc.id, staffId: su.id, ...scheduleFields(ev.cand),
          status: b.date < today || (b.done === true && b.date === today) ? 'done' : 'confirmed', paid: 'salon', amount: svc.price,
          createdBy: b.via === 'phone' ? 'phone' : 'admin', createdAt: nowIso()
        };
        db.bookings.push(booking);
        if (noteText && existing && sess.userId) {
          db.notes.push({ id: uid('nt'), staffUserId: sess.userId, customerId: existing.id, text: noteText, shared: true, createdAt: nowIso(), updatedAt: nowIso() });
        }
        saveDb();
        return { booking, created };
      });
      if (r.error) return json(res, r.status, { error: r.error, reason: r.reason });
      return json(res, 200, { ...adminBookingOut(r.booking), customerCreated: r.created });
    }

    /* ----- fast phone booking helpers ----- */
    /* type-ahead by phone (4+ digits) or name (2+ letters): newest visits first.
       Staff only ever see their own bookings with a client. */
    if (route === 'GET /api/admin/lookup') {
      const qq = String(q.get('q') || '').trim().toLowerCase();
      const digits = qq.replace(/\D/g, '');
      if (digits.length < 4 && (/\d/.test(qq) || qq.length < 2)) return json(res, 200, []);
      const hits = db.users.filter((u) => u.role === 'customer' && (digits.length >= 4 ? u.phone.includes(digits) : u.name.toLowerCase().includes(qq)));
      const today = ubToday();
      return json(res, 200, hits.slice(0, 50).map((u) => {
        const bks = db.bookings.filter((x) => x.userId === u.id && (isOwner || x.staffId === sess.staffUserId)).sort((a, b) => b.startsAt.localeCompare(a.startsAt));
        const lastDone = bks.find((x) => x.status === 'done');
        const next = bks.filter((x) => x.status === 'confirmed' && bkDate(x) >= today).pop();
        /* the service to suggest: whatever they booked most recently, done or upcoming */
        const lastAny = bks.find((x) => HOLDING.includes(x.status));
        const svc = lastAny ? db.services.find((x) => x.id === lastAny.serviceId) : null;
        return {
          id: u.id, name: u.name, phone: u.phone, desc: (u.staffDesc || '').slice(0, 140), noLogin: !!u.noLogin,
          visits: bks.filter((x) => x.status === 'done').length,
          lastVisit: lastDone ? bkDate(lastDone) : '', lastServiceId: svc ? svc.id : '', lastServiceName: svc ? svc.nameMn : '',
          nextBooking: next ? bkDate(next) + ' ' + bkTime(next) : ''
        };
      }).sort((a, b) => (b.lastVisit || '').localeCompare(a.lastVisit || '')).slice(0, 6));
    }
    /* Bookable start times for one therapist, service and day — only times that pass
       the full staff + machine check, so the booking screen cannot offer a clash. */
    if (route === 'GET /api/admin/free') {
      const date = q.get('date') || '';
      if (!validDate(date)) return fail(res, 400, 'bad_date');
      const svc = db.services.find((x) => x.id === q.get('serviceId'));
      if (!svc) return fail(res, 400, 'bad_service');
      const su = staffById(q.get('staffId') || sess.staffUserId || '');
      if (!su) return fail(res, 400, 'bad_staff');
      if (!isOwner && su.id !== sess.staffUserId) return fail(res, 403, 'forbidden');
      const step = stepMinutes();
      /* today: keep the slot that is just starting, drop anything earlier */
      const notBefore = date === ubToday() ? Date.now() - step * MIN_MS : 0;
      return json(res, 200, {
        date, step, closed: salonClosed(date) || !staffWindow(su, date),
        problem: serviceMachineProblem(svc), slots: freeStarts(su, svc, date, step, notBefore)
      });
    }

    /* ----- own day view -----
       Staff get their own bookings and blocks only (any staffId parameter is ignored);
       the owner may look at any therapist. */
    if (route === 'GET /api/admin/myday') {
      const date = validDate(q.get('date')) ? q.get('date') : ubToday();
      const sid = isOwner && q.get('staffId') ? q.get('staffId') : sess.staffUserId;
      const su = sid ? staffById(sid) : null;
      if (!su) return json(res, 200, { date, staff: null, items: [] });
      const win = staffWindow(su, date);
      const items = db.bookings.filter((b) => b.staffId === su.id && bkDate(b) === date).map((b) => ({ kind: 'booking', ...adminBookingOut(b) }))
        .concat(db.blocks.filter((bl) => bl.staffId === su.id && bkDate(bl) === date).map((bl) => ({ kind: 'block', ...blockOut(bl) })))
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
      return json(res, 200, {
        date, step: stepMinutes(), closed: salonClosed(date),
        staff: { id: su.id, name: su.name, working: !!win, open: win ? hhmm(win[0]) : null, close: win ? hhmm(win[1]) : null },
        items
      });
    }

    /* ----- machines ----- */
    if (route === 'GET /api/admin/machines') {
      return json(res, 200, machineList().map((m) => ({ id: m.id, name: m.name, units: m.units, bufferMinutes: m.bufferMinutes, placeholder: m.placeholder })));
    }
    /* Shared board, visible to every staff member: each machine and when it is busy.
       Deliberately anonymous — no booking id, customer, phone, service or staff ever
       leaves this endpoint; only times and how many units are taken. */
    if (route === 'GET /api/admin/machines/board') {
      const date = validDate(q.get('date')) ? q.get('date') : ubToday();
      const dayS = ubMs(date, '00:00'), dayE = dayS + 86400000;
      const holds = [];
      for (const b of db.bookings) {
        if (!HOLDING.includes(b.status)) continue;
        for (const h of b.machines || []) {
          const s0 = Date.parse(h.startsAt), e0 = Date.parse(h.endsAt), r0 = Date.parse(h.releasesAt);
          if (s0 < dayE && dayS < r0) holds.push({ machine: h.machine, s: s0, e: e0, r: r0 });
        }
      }
      const clip = (x) => ubTime(ubIso(Math.min(Math.max(x, dayS), dayE - MIN_MS)));
      return json(res, 200, {
        date,
        machines: machineList().map((m) => {
          const mine = holds.filter((h) => h.machine === m.id);
          /* occupancy over the day as a step function: [from, to) with units taken */
          const ev = [];
          for (const h of mine) ev.push([h.s, 1], [h.r, -1]);
          ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
          const busy = [];
          let cur = 0, from = null;
          for (const [t, d] of ev) {
            if (cur > 0 && from !== null && t > from) busy.push({ s: from, e: t, inUse: cur });
            cur += d;
            from = t;
          }
          const merged = [];
          for (const x of busy) {
            const last = merged[merged.length - 1];
            if (last && last.e === x.s && last.inUse === x.inUse) last.e = x.e; else merged.push({ ...x });
          }
          return {
            id: m.id, name: m.name, units: m.units, placeholder: m.placeholder,
            busy: merged.map((x) => ({ from: clip(x.s), to: x.e >= dayE ? '24:00' : ubTime(ubIso(x.e)), inUse: x.inUse, full: x.inUse >= m.units })),
            cleaning: mine.filter((h) => h.r > h.e).map((h) => ({ from: ubTime(ubIso(h.e)), to: ubTime(ubIso(h.r)) }))
          };
        })
      });
    }

    /* ----- setup health (owner / super admin) ----- */
    if (route === 'GET /api/admin/health') {
      if (!isOwner) return ownerOnly();
      return json(res, 200, { storage: storageInfo(), warnings: safetyWarnings() });
    }

    /* ----- calendar subscription links ----- */
    if (route === 'GET /api/admin/calfeed' || route === 'POST /api/admin/calfeed/reset') {
      const me = db.users.find((x) => x.id === sess.userId);
      if (!me) return fail(res, 403, 'forbidden');
      if (route === 'POST /api/admin/calfeed/reset') {
        for (const [t, f] of Object.entries(db.calFeeds)) if (f.userId === me.id) delete db.calFeeds[t];
      }
      const want = [];
      if (me.staff) want.push('mine');
      if (isOwner) want.push('all');
      const have = calFeedTokens(me.id);
      for (const scope of want) {
        if (!have[scope]) {
          const t = crypto.randomBytes(20).toString('hex');
          db.calFeeds[t] = { userId: me.id, scope, createdAt: nowIso() };
          have[scope] = t;
        }
      }
      saveDb();
      const base = publicBase(req);
      return json(res, 200, {
        mine: have.mine && want.includes('mine') ? base + '/cal/' + have.mine + '.ics' : null,
        all: have.all && want.includes('all') ? base + '/cal/' + have.all + '.ics' : null
      });
    }

    /* ----- bookings management ----- */
    m = pathname.match(/^\/api\/admin\/bookings\/([\w-]+)\/status$/);
    if (m && method === 'POST') {
      const b = await readJson(req);
      const booking = db.bookings.find((x) => x.id === m[1]);
      /* another staff member's booking id behaves exactly like one that does not exist */
      if (!booking || (!isOwner && booking.staffId !== sess.staffUserId)) return fail(res, 404, 'not_found');
      const allowed = ['confirmed', 'done', 'noshow', 'cancelled'];
      if (!allowed.includes(b.status)) return fail(res, 400, 'bad_request');
      const r = await serialized(() => {
        /* bringing a cancelled / no-show booking back must not create a clash */
        if (HOLDING.includes(b.status) && !HOLDING.includes(booking.status)) {
          const clash = clashFor(candidateOf(booking), booking.staffId, reservations(booking.id));
          if (clash) return { status: 409, error: 'slot_taken', reason: clash };
        }
        if (b.status === 'cancelled' && booking.status !== 'cancelled') {
          refundBooking(booking, 'cancelled by salon');
          booking.cancelledAt = nowIso();
        }
        booking.status = b.status;
        saveDb();
        return {};
      });
      if (r.error) return json(res, r.status, { error: r.error, reason: r.reason });
      return json(res, 200, { ok: true, booking: adminBookingOut(booking) });
    }

    m = pathname.match(/^\/api\/admin\/bookings\/([\w-]+)\/assign$/);
    if (m && method === 'POST') {
      if (!isOwner) return ownerOnly();
      const b = await readJson(req);
      const booking = db.bookings.find((x) => x.id === m[1]);
      if (!booking) return fail(res, 404, 'not_found');
      const su = staffById(b.staffId);
      if (!su) return fail(res, 400, 'bad_staff');
      const r = await serialized(() => {
        if (HOLDING.includes(booking.status) && su.id !== booking.staffId) {
          const clash = clashFor(candidateOf(booking), su.id, reservations(booking.id));
          if (clash) return { status: 409, error: 'slot_taken', reason: clash };
        }
        booking.staffId = su.id;
        saveDb();
        return {};
      });
      if (r.error) return json(res, r.status, { error: r.error, reason: r.reason });
      return json(res, 200, { ok: true, booking: adminBookingOut(booking) });
    }

    /* ----- clients ----- */
    if (route === 'GET /api/admin/users') {
      const qry = (q.get('q') || '').toLowerCase().trim();
      let list = db.users.filter((u) => u.role === 'customer');
      if (qry) list = list.filter((u) => u.name.toLowerCase().includes(qry) || u.phone.includes(qry) || (u.staffDesc || '').toLowerCase().includes(qry));
      const ownStaff = isOwner ? null : sess.staffUserId || '-';
      const today = ubToday();
      let out = list.map((u) => {
        const myBks = db.bookings.filter((b) => b.userId === u.id && (!ownStaff || b.staffId === ownStaff));
        const doneBks = myBks.filter((b) => b.status === 'done');
        const plans = planStatus(u, ownStaff);
        const due = plans.filter((pl) => pl.state !== 'booked').sort((a, b) => a.nextDue.localeCompare(b.nextDue))[0];
        return {
          ...publicUser(u),
          desc: u.staffDesc || '', noLogin: !!u.noLogin,
          nextDue: due ? due.nextDue : '', dueState: due ? due.state : '', dueService: due ? due.serviceName : '',
          bookings: myBks.length,
          visits: doneBks.length,
          lastVisit: doneBks.length ? bkDate(doneBks.sort((a, b) => b.startsAt.localeCompare(a.startsAt))[0]) : '',
          nextBooking: (() => { const n = myBks.filter((b) => b.status === 'confirmed' && bkDate(b) >= today).sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0]; return n ? bkDate(n) : ''; })()
        };
      });
      if (q.get('due') === '1') out = out.filter((u) => u.dueState === 'due' || u.dueState === 'overdue').sort((a, b) => a.nextDue.localeCompare(b.nextDue));
      return json(res, 200, out);
    }

    /* ----- customer records (staff, owner, super admin) -----
       Staff create customers at the counter or by phone; no password is needed.
       The customer can later register in the app with the same phone and gets
       this record, with its history, as their account. */
    if (route === 'POST /api/admin/customers') {
      const b = await readJson(req);
      const name = String(b.name || '').trim();
      const phone = String(b.phone || '').trim();
      if (!name || name.length > 60) return fail(res, 400, 'bad_name');
      if (!PHONE_RE.test(phone)) return fail(res, 400, 'bad_phone');
      if (db.users.some((u) => u.phone === phone)) return fail(res, 409, 'phone_taken');
      const u = makeUser(name, phone, crypto.randomBytes(18).toString('hex'));
      u.noLogin = true;
      u.createdBy = sess.userId || 'admin';
      u.staffDesc = String(b.desc || '').trim().slice(0, 1000);
      for (const k of ['skinType', 'allergies', 'birthday']) if (typeof b[k] === 'string') u[k] = b[k].trim().slice(0, k === 'allergies' ? 200 : 40);
      if (u.birthday && !DATE_RE.test(u.birthday)) u.birthday = '';
      db.users.push(u);
      saveDb();
      return json(res, 200, { ok: true, id: u.id });
    }
    m = pathname.match(/^\/api\/admin\/customers\/([\w-]+)$/);
    if (m && method === 'POST') {
      const u = db.users.find((x) => x.id === m[1] && x.role === 'customer');
      if (!u) return fail(res, 404, 'not_found');
      const b = await readJson(req);
      if (typeof b.name === 'string') { const nm = b.name.trim(); if (!nm || nm.length > 60) return fail(res, 400, 'bad_name'); u.name = nm; }
      if (b.phone !== undefined) {
        const ph = String(b.phone).trim();
        if (!PHONE_RE.test(ph)) return fail(res, 400, 'bad_phone');
        if (db.users.some((x) => x.phone === ph && x.id !== u.id)) return fail(res, 409, 'phone_taken');
        u.phone = ph;
      }
      if (typeof b.desc === 'string') u.staffDesc = b.desc.trim().slice(0, 1000);
      for (const k of ['skinType', 'allergies']) if (typeof b[k] === 'string') u[k] = b[k].trim().slice(0, k === 'allergies' ? 200 : 40);
      if (typeof b.birthday === 'string') u.birthday = DATE_RE.test(b.birthday) ? b.birthday : '';
      saveDb();
      return json(res, 200, { ok: true });
    }
    /* repeat-service plans: "this customer should come for X every N days" */
    m = pathname.match(/^\/api\/admin\/customers\/([\w-]+)\/plans$/);
    if (m && method === 'POST') {
      const u = db.users.find((x) => x.id === m[1] && x.role === 'customer');
      if (!u) return fail(res, 404, 'not_found');
      const b = await readJson(req);
      const svc = db.services.find((x) => x.id === b.serviceId);
      if (!svc) return fail(res, 400, 'bad_service');
      const every = Math.round(Number(b.everyDays));
      if (!Number.isFinite(every) || every < 1 || every > 365) return fail(res, 400, 'bad_interval');
      const start = validDate(b.startDate) ? b.startDate : ubToday();
      if (!u.plans) u.plans = [];
      if (u.plans.length >= 10) return fail(res, 400, 'too_many');
      u.plans.push({ id: uid('pl'), serviceId: svc.id, everyDays: every, startDate: start, note: String(b.note || '').trim().slice(0, 200), createdBy: sess.userId || null, createdAt: nowIso() });
      saveDb();
      return json(res, 200, { ok: true });
    }
    m = pathname.match(/^\/api\/admin\/customers\/([\w-]+)\/plans\/([\w-]+)$/);
    if (m && method === 'DELETE') {
      const u = db.users.find((x) => x.id === m[1] && x.role === 'customer');
      if (!u || !u.plans) return fail(res, 404, 'not_found');
      const before = u.plans.length;
      u.plans = u.plans.filter((pl) => pl.id !== m[2]);
      if (u.plans.length === before) return fail(res, 404, 'not_found');
      saveDb();
      return json(res, 200, { ok: true });
    }

    m = pathname.match(/^\/api\/admin\/users\/([\w-]+)$/);
    if (m && method === 'GET') {
      const u = db.users.find((x) => x.id === m[1] && x.role === 'customer');
      if (!u) return fail(res, 404, 'not_found');
      /* staff see their own visits with this client only; the owner sees all */
      const ownStaff = isOwner ? null : sess.staffUserId || '-';
      const bks = db.bookings.filter((b) => b.userId === u.id && (!ownStaff || b.staffId === ownStaff)).sort((a, b) => b.startsAt.localeCompare(a.startsAt)).map(adminBookingOut);
      const done = bks.filter((b) => b.status === 'done');
      const spent = done.filter((b) => b.paid === 'balance' || b.paid === 'salon').reduce((s, b) => s + b.amount, 0);
      const packages = db.userBundles.filter((ub) => ub.userId === u.id).map((ub) => {
        const bd = db.bundles.find((b) => b.id === ub.bundleId) || {};
        return { id: ub.id, name: bd.nameMn || '?', remaining: ub.remaining, sessions: bd.sessions || 0, expiresAt: ub.expiresAt, expired: new Date(ub.expiresAt).getTime() < Date.now() };
      });
      const reviews = db.reviews.filter((r) => r.userId === u.id && (!ownStaff || r.staffId === ownStaff)).map((r) => ({ id: r.id, rating: r.rating, text: r.text, approved: r.approved, createdAt: r.createdAt }));
      const myNotes = db.notes.filter((n) => n.customerId === u.id && n.staffUserId === sess.userId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      /* notes other staff chose to share with the team */
      const sharedNotes = db.notes.filter((n) => n.customerId === u.id && n.shared && n.staffUserId !== sess.userId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((n) => ({ ...n, author: firstName((db.users.find((x) => x.id === n.staffUserId) || {}).name) || '?' }));
      const preferred = u.preferredStaffId ? staffById(u.preferredStaffId) : null;
      return json(res, 200, {
        user: publicUser(u),
        preferredStaffName: preferred ? preferred.name : '',
        stats: { visits: done.length, spent, total: bks.length, noshow: bks.filter((b) => b.status === 'noshow').length },
        bookings: bks.slice(0, 60),
        packages, reviews, myNotes, sharedNotes,
        desc: u.staffDesc || '', noLogin: !!u.noLogin, plans: planStatus(u, ownStaff)
      });
    }

    m = pathname.match(/^\/api\/admin\/users\/([\w-]+)\/adjust$/);
    if (m && method === 'POST') {
      if (!isOwner) return ownerOnly();
      const b = await readJson(req);
      const u = db.users.find((x) => x.id === m[1]);
      if (!u) return fail(res, 404, 'not_found');
      const amount = Math.round(Number(b.amount));
      if (!Number.isFinite(amount) || amount === 0 || Math.abs(amount) > 5000000) return fail(res, 400, 'bad_amount');
      if (u.balance + amount < 0) return fail(res, 400, 'insufficient_balance');
      u.balance += amount;
      addTransaction(u.id, 'adjust', 'admin', amount, String(b.note || '').slice(0, 100));
      saveDb();
      return json(res, 200, { ok: true, balance: u.balance });
    }

    /* ----- client notes: private to their author unless marked shared ----- */
    if (route === 'POST /api/admin/notes') {
      const b = await readJson(req);
      const cu = db.users.find((x) => x.id === b.customerId);
      if (!cu) return fail(res, 404, 'not_found');
      if (!sess.userId) return fail(res, 403, 'forbidden');
      const text = String(b.text || '').trim().slice(0, 500);
      if (!text) return fail(res, 400, 'bad_request');
      const note = { id: uid('nt'), staffUserId: sess.userId, customerId: cu.id, text, shared: b.shared === true, createdAt: nowIso(), updatedAt: nowIso() };
      db.notes.push(note);
      saveDb();
      return json(res, 200, note);
    }
    m = pathname.match(/^\/api\/admin\/notes\/([\w-]+)$/);
    if (m && (method === 'POST' || method === 'DELETE')) {
      const idx = db.notes.findIndex((n) => n.id === m[1]);
      if (idx === -1) return fail(res, 404, 'not_found');
      if (db.notes[idx].staffUserId !== sess.userId) return fail(res, 403, 'forbidden');
      if (method === 'DELETE') {
        db.notes.splice(idx, 1);
        saveDb();
        return json(res, 200, { ok: true });
      }
      const b = await readJson(req);
      const text = String(b.text || '').trim().slice(0, 500);
      if (!text) return fail(res, 400, 'bad_request');
      db.notes[idx].text = text;
      if (b.shared !== undefined) db.notes[idx].shared = b.shared === true;
      db.notes[idx].updatedAt = nowIso();
      saveDb();
      return json(res, 200, db.notes[idx]);
    }

    /* ----- transactions ----- */
    if (route === 'GET /api/admin/transactions') {
      if (!isOwner) return ownerOnly();
      return json(res, 200, db.transactions.slice().reverse().slice(0, 300).map((t) => ({
        ...t, userName: (db.users.find((u) => u.id === t.userId) || {}).name || '?'
      })));
    }

    /* ----- services CRUD ----- */
    if (route === 'GET /api/admin/services') return json(res, 200, db.services);

    if (route === 'POST /api/admin/services') {
      if (!isOwner) return ownerOnly();
      const b = await readJson(req);
      const svc = serviceFromBody(b, { id: uid('svc'), active: true });
      if (!svc) return fail(res, 400, 'bad_request');
      const cu = cleanUses(b.uses, svc.minutes);
      if (cu.error) return fail(res, 400, cu.error);
      db.services.push(svc);
      saveDb();
      return json(res, 200, svc);
    }

    m = pathname.match(/^\/api\/admin\/services\/([\w-]+)$/);
    if (m && method === 'POST') {
      if (!isOwner) return ownerOnly();
      const svc = db.services.find((s) => s.id === m[1]);
      if (!svc) return fail(res, 404, 'not_found');
      const b = await readJson(req);
      if (b.price !== undefined) {
        const p = Math.round(Number(b.price));
        if (!Number.isFinite(p) || p < 0 || p > 100000000) return fail(res, 400, 'bad_request');
        svc.price = p;
      }
      if (b.minutes !== undefined || b.uses !== undefined) {
        const mn = b.minutes !== undefined ? Math.round(Number(b.minutes)) : svc.minutes;
        if (!Number.isFinite(mn) || mn < 15 || mn > 240) return fail(res, 400, 'bad_request');
        /* the machine windows must still fit inside the (new) duration */
        const cu = cleanUses(b.uses !== undefined ? b.uses : svc.uses, mn);
        if (cu.error) return fail(res, 400, cu.error);
        svc.minutes = mn;
        svc.uses = cu.uses;
      }
      if (b.active !== undefined) svc.active = !!b.active;
      if (typeof b.nameEn === 'string' && b.nameEn.trim()) svc.nameEn = b.nameEn.trim().slice(0, 80);
      if (typeof b.nameMn === 'string' && b.nameMn.trim()) svc.nameMn = b.nameMn.trim().slice(0, 80);
      if (typeof b.descEn === 'string') svc.descEn = b.descEn.trim().slice(0, 300);
      if (typeof b.descMn === 'string') svc.descMn = b.descMn.trim().slice(0, 300);
      if (typeof b.emoji === 'string') svc.emoji = b.emoji.trim().slice(0, 8) || svc.emoji;
      if (typeof b.group === 'string' && ['facial', 'body', 'other'].includes(b.group)) svc.group = b.group;
      saveDb();
      return json(res, 200, svc);
    }
    if (m && method === 'DELETE') {
      if (!isOwner) return ownerOnly();
      const svc = db.services.find((s) => s.id === m[1]);
      if (!svc) return fail(res, 404, 'not_found');
      svc.active = false;
      saveDb();
      return json(res, 200, { ok: true });
    }

    /* ----- staff management ----- */
    if (route === 'GET /api/admin/staff') {
      if (!isOwner) return ownerOnly();
      return json(res, 200, staffUsers(true).map((u) => ({
        id: u.id, name: u.name, phone: u.phone, role: u.role,
        specialtyMn: u.staff.specialtyMn || '', specialtyEn: u.staff.specialtyEn || '',
        color: u.staff.color || '#b08c46', hours: u.staff.hours || DEFAULT_HOURS,
        daysOff: u.staff.daysOff || [], active: u.staff.active !== false,
        rating: staffRating(u.id).rating, reviewCount: staffRating(u.id).count,
        upcoming: db.bookings.filter((b) => b.staffId === u.id && b.status === 'confirmed' && bkDate(b) >= ubToday()).length
      })));
    }

    if (route === 'POST /api/admin/staff') {
      if (!isSuper) return superOnly();
      const b = await readJson(req);
      const name = String(b.name || '').trim();
      const phone = String(b.phone || '').trim();
      const password = String(b.password || '');
      if (!name || name.length > 60) return fail(res, 400, 'bad_name');
      if (!PHONE_RE.test(phone)) return fail(res, 400, 'bad_phone');
      if (password.length < 6) return fail(res, 400, 'bad_password');
      if (db.users.some((u) => u.phone === phone)) return fail(res, 409, 'phone_taken');
      const su = makeUser(name, phone, password);
      su.role = 'staff';
      su.staff = newStaffProfile(b);
      db.users.push(su);
      saveDb();
      return json(res, 200, { ok: true, id: su.id });
    }

    m = pathname.match(/^\/api\/admin\/staff\/([\w-]+)$/);
    if (m && method === 'POST') {
      if (!isOwner) return ownerOnly();
      const su = db.users.find((u) => u.id === m[1] && u.staff);
      if (!su) return fail(res, 404, 'not_found');
      const b = await readJson(req);
      if (typeof b.name === 'string' && b.name.trim()) su.name = b.name.trim().slice(0, 60);
      if (typeof b.specialtyMn === 'string') su.staff.specialtyMn = b.specialtyMn.trim().slice(0, 80);
      if (typeof b.specialtyEn === 'string') su.staff.specialtyEn = b.specialtyEn.trim().slice(0, 80);
      if (/^#[0-9a-fA-F]{6}$/.test(b.color || '')) su.staff.color = b.color;
      if (b.hours !== undefined) {
        const h = validHours(b.hours);
        if (!h) return fail(res, 400, 'bad_hours');
        su.staff.hours = h;
      }
      if (Array.isArray(b.daysOff)) su.staff.daysOff = b.daysOff.filter((d) => DATE_RE.test(d)).slice(0, 200);
      if (b.active !== undefined && su.role !== 'owner') su.staff.active = !!b.active;
      if (b.newPassword) {
        if (!isSuper) return superOnly();
        if (String(b.newPassword).length < 6) return fail(res, 400, 'bad_password');
        setPassword(su, String(b.newPassword));
      }
      saveDb();
      return json(res, 200, { ok: true });
    }

    /* ----- accounts (super admin only) -----
       Every login in the system: customers, staff, owners and the super admin. */
    if (route === 'GET /api/admin/accounts') {
      if (!isSuper) return superOnly();
      const qry = (q.get('q') || '').toLowerCase().trim();
      const roleF = q.get('role') || '';
      let list = db.users.slice();
      if (roleF) list = list.filter((u) => (u.role || 'customer') === roleF);
      if (qry) list = list.filter((u) => u.name.toLowerCase().includes(qry) || u.phone.includes(qry));
      const order = { superadmin: 0, owner: 1, staff: 2, customer: 3 };
      list.sort((a, b) => (order[a.role] - order[b.role]) || a.name.localeCompare(b.name));
      return json(res, 200, list.map((u) => ({
        id: u.id, name: u.name, phone: u.phone, role: u.role || 'customer',
        disabled: !!u.disabled, isDemo: !!u.isDemo, createdAt: u.createdAt,
        therapist: !!(u.staff && u.staff.active !== false), isMe: u.id === sess.userId
      })));
    }

    if (route === 'POST /api/admin/accounts') {
      if (!isSuper) return superOnly();
      const b = await readJson(req);
      const name = String(b.name || '').trim();
      const phone = String(b.phone || '').trim();
      const password = String(b.password || '');
      const accRole = String(b.role || 'customer');
      if (!['customer', 'staff', 'owner'].includes(accRole)) return fail(res, 400, 'bad_role');
      if (!name || name.length > 60) return fail(res, 400, 'bad_name');
      if (!PHONE_RE.test(phone)) return fail(res, 400, 'bad_phone');
      if (password.length < 6) return fail(res, 400, 'bad_password');
      if (db.users.some((u) => u.phone === phone)) return fail(res, 409, 'phone_taken');
      const u = makeUser(name, phone, password);
      u.role = accRole;
      u.createdBy = 'superadmin';
      if (accRole === 'staff' || (accRole === 'owner' && b.therapist)) u.staff = newStaffProfile(b);
      db.users.push(u);
      saveDb();
      return json(res, 200, { ok: true, id: u.id });
    }

    m = pathname.match(/^\/api\/admin\/accounts\/([\w-]+)$/);
    if (m && method === 'POST') {
      if (!isSuper) return superOnly();
      const u = db.users.find((x) => x.id === m[1]);
      if (!u) return fail(res, 404, 'not_found');
      const b = await readJson(req);
      const self = u.id === sess.userId;
      if (typeof b.name === 'string') {
        const nm = b.name.trim();
        if (!nm || nm.length > 60) return fail(res, 400, 'bad_name');
        u.name = nm;
      }
      if (b.phone !== undefined) {
        const ph = String(b.phone).trim();
        if (!PHONE_RE.test(ph)) return fail(res, 400, 'bad_phone');
        if (db.users.some((x) => x.phone === ph && x.id !== u.id)) return fail(res, 409, 'phone_taken');
        u.phone = ph;
      }
      if (b.role !== undefined && b.role !== u.role) {
        /* the super admin account itself can't be demoted or created here */
        if (u.role === 'superadmin' || !['customer', 'staff', 'owner'].includes(b.role)) return fail(res, 400, 'bad_role');
        u.role = b.role;
        if (u.role === 'staff') {
          if (!u.staff) u.staff = newStaffProfile(b);
          u.staff.active = true;
        }
        if (u.role === 'customer' && u.staff) u.staff.active = false;
      }
      if (b.therapist !== undefined && u.role === 'owner') {
        if (b.therapist && !u.staff) u.staff = newStaffProfile(b);
        if (u.staff) u.staff.active = !!b.therapist;
      }
      if (b.disabled !== undefined) {
        if (self) return fail(res, 400, 'cannot_disable_self');
        u.disabled = !!b.disabled;
        if (u.disabled) {
          for (const [t, s0] of Object.entries(db.sessions)) if (s0.userId === u.id) delete db.sessions[t];
          for (const [t, s0] of Object.entries(db.adminSessions)) if ((s0.userId || s0.staffUserId) === u.id) delete db.adminSessions[t];
        }
      }
      if (b.newPassword) {
        if (String(b.newPassword).length < 6) return fail(res, 400, 'bad_password');
        setPassword(u, String(b.newPassword));
      }
      saveDb();
      return json(res, 200, { ok: true });
    }

    /* ----- bundles CRUD ----- */
    if (route === 'GET /api/admin/bundles') {
      if (!isOwner) return ownerOnly();
      return json(res, 200, db.bundles.map((b) => ({
        ...b,
        sold: db.userBundles.filter((ub) => ub.bundleId === b.id).length,
        activeOwned: db.userBundles.filter((ub) => ub.bundleId === b.id && ub.remaining > 0 && new Date(ub.expiresAt).getTime() > Date.now()).length
      })));
    }
    if (route === 'POST /api/admin/bundles') {
      if (!isOwner) return ownerOnly();
      const b = await readJson(req);
      const bd = bundleFromBody(b, { id: uid('bnd'), active: true, createdAt: nowIso() });
      if (!bd) return fail(res, 400, 'bad_request');
      db.bundles.push(bd);
      saveDb();
      return json(res, 200, bd);
    }
    m = pathname.match(/^\/api\/admin\/bundles\/([\w-]+)$/);
    if (m && method === 'POST') {
      if (!isOwner) return ownerOnly();
      const bd = db.bundles.find((x) => x.id === m[1]);
      if (!bd) return fail(res, 404, 'not_found');
      const b = await readJson(req);
      const upd = bundleFromBody({ ...bd, ...b }, { id: bd.id, active: b.active !== undefined ? !!b.active : bd.active, createdAt: bd.createdAt });
      if (!upd) return fail(res, 400, 'bad_request');
      Object.assign(bd, upd);
      saveDb();
      return json(res, 200, bd);
    }

    /* ----- gift cards & promos ----- */
    if (route === 'GET /api/admin/giftcards') {
      if (!isOwner) return ownerOnly();
      return json(res, 200, db.giftcards.slice().reverse().map((g) => ({
        ...g,
        fromName: (db.users.find((u) => u.id === g.fromUserId) || {}).name || '?',
        redeemedByName: g.redeemedBy ? ((db.users.find((u) => u.id === g.redeemedBy) || {}).name || '?') : ''
      })));
    }
    m = pathname.match(/^\/api\/admin\/giftcards\/([\w-]+)\/disable$/);
    if (m && method === 'POST') {
      if (!isOwner) return ownerOnly();
      const g = db.giftcards.find((x) => x.id === m[1]);
      if (!g) return fail(res, 404, 'not_found');
      if (g.status === 'redeemed') return fail(res, 400, 'code_used');
      g.status = 'disabled';
      saveDb();
      return json(res, 200, { ok: true });
    }

    if (route === 'GET /api/admin/promos') {
      if (!isOwner) return ownerOnly();
      return json(res, 200, db.promos.slice().reverse());
    }
    if (route === 'POST /api/admin/promos') {
      if (!isOwner) return ownerOnly();
      const b = await readJson(req);
      const amount = Math.round(Number(b.amount));
      const maxUses = Math.round(Number(b.maxUses || 1));
      if (!Number.isFinite(amount) || amount < 1000 || amount > 1000000) return fail(res, 400, 'bad_amount');
      if (!Number.isFinite(maxUses) || maxUses < 1 || maxUses > 100000) return fail(res, 400, 'bad_request');
      let code = b.code ? String(b.code).toUpperCase().trim().replace(/[^A-Z0-9-]/g, '').slice(0, 20) : genCode('PR');
      if (!code) code = genCode('PR');
      if (db.promos.some((p) => normCode(p.code) === normCode(code)) || db.giftcards.some((g) => normCode(g.code) === normCode(code))) return fail(res, 409, 'code_taken');
      let expiresAt = null;
      if (b.expiresAt && DATE_RE.test(b.expiresAt)) expiresAt = b.expiresAt + 'T23:59:59.000Z';
      const pr = { id: uid('pr'), code, amount, maxUses, used: 0, usedBy: [], expiresAt, active: true, note: String(b.note || '').slice(0, 100), createdAt: nowIso() };
      db.promos.push(pr);
      saveDb();
      return json(res, 200, pr);
    }
    m = pathname.match(/^\/api\/admin\/promos\/([\w-]+)$/);
    if (m && method === 'POST') {
      if (!isOwner) return ownerOnly();
      const pr = db.promos.find((x) => x.id === m[1]);
      if (!pr) return fail(res, 404, 'not_found');
      const b = await readJson(req);
      if (b.active !== undefined) pr.active = !!b.active;
      saveDb();
      return json(res, 200, pr);
    }

    /* ----- reviews moderation ----- */
    if (route === 'GET /api/admin/reviews') {
      if (!isOwner) return ownerOnly();
      return json(res, 200, db.reviews.slice().reverse().map((r) => {
        const svc = db.services.find((s) => s.id === r.serviceId);
        const st = r.staffId ? staffById(r.staffId) : null;
        const u = r.userId ? db.users.find((x) => x.id === r.userId) : null;
        return { ...r, serviceName: svc ? svc.nameMn : '', staffName: st ? st.name : '', userName: u ? u.name : (r.name || '?'), userPhone: u ? u.phone : '' };
      }));
    }
    m = pathname.match(/^\/api\/admin\/reviews\/([\w-]+)$/);
    if (m && method === 'POST') {
      if (!isOwner) return ownerOnly();
      const r = db.reviews.find((x) => x.id === m[1]);
      if (!r) return fail(res, 404, 'not_found');
      const b = await readJson(req);
      if (b.approved !== undefined) r.approved = b.approved === true ? true : (b.approved === false ? false : null);
      saveDb();
      return json(res, 200, r);
    }
    if (m && method === 'DELETE') {
      if (!isOwner) return ownerOnly();
      const idx = db.reviews.findIndex((x) => x.id === m[1]);
      if (idx === -1) return fail(res, 404, 'not_found');
      const bk = db.bookings.find((b) => b.reviewId === db.reviews[idx].id);
      if (bk) delete bk.reviewId;
      db.reviews.splice(idx, 1);
      saveDb();
      return json(res, 200, { ok: true });
    }

    /* ----- education content CRUD ----- */
    if (route === 'GET /api/admin/edu') {
      if (!isOwner) return ownerOnly();
      return json(res, 200, db.edu.slice().sort((a, b) => (a.order || 0) - (b.order || 0)));
    }
    if (route === 'POST /api/admin/edu') {
      if (!isOwner) return ownerOnly();
      const b = await readJson(req);
      const it = eduFromBody(b, { id: uid('edu'), active: true });
      if (!it) return fail(res, 400, 'bad_request');
      db.edu.push(it);
      saveDb();
      return json(res, 200, it);
    }
    m = pathname.match(/^\/api\/admin\/edu\/([\w-]+)$/);
    if (m && method === 'POST') {
      if (!isOwner) return ownerOnly();
      const it = db.edu.find((x) => x.id === m[1]);
      if (!it) return fail(res, 404, 'not_found');
      const b = await readJson(req);
      const upd = eduFromBody({ ...it, ...b }, { id: it.id, active: b.active !== undefined ? !!b.active : it.active });
      if (!upd) return fail(res, 400, 'bad_request');
      Object.assign(it, upd);
      saveDb();
      return json(res, 200, it);
    }
    if (m && method === 'DELETE') {
      if (!isOwner) return ownerOnly();
      const idx = db.edu.findIndex((x) => x.id === m[1]);
      if (idx === -1) return fail(res, 404, 'not_found');
      db.edu.splice(idx, 1);
      saveDb();
      return json(res, 200, { ok: true });
    }

    /* ----- FAQ CRUD ----- */
    if (route === 'GET /api/admin/faq') {
      if (!isOwner) return ownerOnly();
      return json(res, 200, db.faq.slice().sort((a, b) => (a.order || 0) - (b.order || 0)));
    }
    if (route === 'POST /api/admin/faq') {
      if (!isOwner) return ownerOnly();
      const b = await readJson(req);
      const it = faqFromBody(b, { id: uid('faq'), active: true });
      if (!it) return fail(res, 400, 'bad_request');
      db.faq.push(it);
      saveDb();
      return json(res, 200, it);
    }
    m = pathname.match(/^\/api\/admin\/faq\/([\w-]+)$/);
    if (m && method === 'POST') {
      if (!isOwner) return ownerOnly();
      const it = db.faq.find((x) => x.id === m[1]);
      if (!it) return fail(res, 404, 'not_found');
      const b = await readJson(req);
      const upd = faqFromBody({ ...it, ...b }, { id: it.id, active: b.active !== undefined ? !!b.active : it.active });
      if (!upd) return fail(res, 400, 'bad_request');
      Object.assign(it, upd);
      saveDb();
      return json(res, 200, it);
    }
    if (m && method === 'DELETE') {
      if (!isOwner) return ownerOnly();
      const idx = db.faq.findIndex((x) => x.id === m[1]);
      if (idx === -1) return fail(res, 404, 'not_found');
      db.faq.splice(idx, 1);
      saveDb();
      return json(res, 200, { ok: true });
    }

    /* ----- chat (salon side) ----- */
    if (route === 'GET /api/admin/chat') {
      return json(res, 200, threadList());
    }
    m = pathname.match(/^\/api\/admin\/chat\/([\w-]+)$/);
    if (m && method === 'GET') {
      const cu = db.users.find((x) => x.id === m[1]);
      if (!cu) return fail(res, 404, 'not_found');
      let changed = false;
      const list = db.messages.filter((msg) => msg.userId === cu.id);
      list.forEach((msg) => { if (msg.from === 'customer' && !msg.readBySalon) { msg.readBySalon = true; changed = true; } });
      if (changed) saveDb();
      return json(res, 200, { user: { id: cu.id, name: cu.name, phone: cu.phone }, messages: list.map(msgOut) });
    }
    if (m && method === 'POST') {
      const cu = db.users.find((x) => x.id === m[1]);
      if (!cu) return fail(res, 404, 'not_found');
      const b = await readJson(req);
      const text = String(b.text || '').trim().slice(0, 1000);
      if (!text) return fail(res, 400, 'bad_request');
      const sender = sess.userId && sess.role !== 'superadmin' ? db.users.find((u) => u.id === sess.userId) : null;
      const msg = { id: uid('msg'), userId: cu.id, from: 'salon', fromName: sender ? firstName(sender.name) : c.salonName, staffUserId: sess.userId || null, text, createdAt: nowIso(), readByCustomer: false, readBySalon: true };
      db.messages.push(msg);
      saveDb();
      return json(res, 200, msgOut(msg));
    }

    /* ----- settings ----- */
    if (route === 'GET /api/admin/settings') {
      if (!isOwner) return ownerOnly();
      return json(res, 200, {
        hoursOpen: c.hoursOpen, hoursClose: c.hoursClose, slotMinutes: c.slotMinutes,
        closedWeekdays: c.closedWeekdays, closedDates: c.closedDates || [],
        bookingDaysAhead: c.bookingDaysAhead, cancelHours: c.cancelHours,
        topupBonusThreshold: c.topupBonusThreshold, topupBonusPercent: c.topupBonusPercent,
        featureWallet: c.featureWallet === true,
        canToggleFeatures: isSuper,
        contact: Object.fromEntries(CONTACT_FIELDS.map((k) => [k, c[k] || '']))
      });
    }
    if (route === 'POST /api/admin/settings') {
      if (!isOwner) return ownerOnly();
      const b = await readJson(req);
      const s = db.settings;
      if (b.hoursOpen !== undefined) { if (!TIME_RE.test(b.hoursOpen)) return fail(res, 400, 'bad_request'); s.hoursOpen = b.hoursOpen; }
      if (b.hoursClose !== undefined) { if (!TIME_RE.test(b.hoursClose)) return fail(res, 400, 'bad_request'); s.hoursClose = b.hoursClose; }
      const effOpen = s.hoursOpen || c.hoursOpen, effClose = s.hoursClose || c.hoursClose;
      if (toMin(effClose) - toMin(effOpen) < 60) return fail(res, 400, 'bad_request');
      if (b.slotMinutes !== undefined) { const v = Number(b.slotMinutes); if (![30, 45, 60, 90].includes(v)) return fail(res, 400, 'bad_request'); s.slotMinutes = v; }
      if (b.closedWeekdays !== undefined) { if (!Array.isArray(b.closedWeekdays) || b.closedWeekdays.some((d) => ![0, 1, 2, 3, 4, 5, 6].includes(d)) || b.closedWeekdays.length > 6) return fail(res, 400, 'bad_request'); s.closedWeekdays = b.closedWeekdays; }
      if (b.closedDates !== undefined) { if (!Array.isArray(b.closedDates)) return fail(res, 400, 'bad_request'); s.closedDates = b.closedDates.filter((d) => DATE_RE.test(d)).slice(0, 200); }
      if (b.bookingDaysAhead !== undefined) { const v = Math.round(Number(b.bookingDaysAhead)); if (!Number.isFinite(v) || v < 3 || v > 90) return fail(res, 400, 'bad_request'); s.bookingDaysAhead = v; }
      if (b.cancelHours !== undefined) { const v = Math.round(Number(b.cancelHours)); if (!Number.isFinite(v) || v < 0 || v > 96) return fail(res, 400, 'bad_request'); s.cancelHours = v; }
      if (b.topupBonusThreshold !== undefined) { const v = Math.round(Number(b.topupBonusThreshold)); if (!Number.isFinite(v) || v < 0) return fail(res, 400, 'bad_request'); s.topupBonusThreshold = v; }
      if (b.topupBonusPercent !== undefined) { const v = Math.round(Number(b.topupBonusPercent)); if (!Number.isFinite(v) || v < 0 || v > 50) return fail(res, 400, 'bad_request'); s.topupBonusPercent = v; }
      /* feature switches belong to the super admin; the owner's form never sends them */
      if (b.featureWallet !== undefined) {
        if (!isSuper) return superOnly();
        s.featureWallet = b.featureWallet === true;
      }
      /* salon name, slogans, address and contacts shown on the website and in the app */
      if (b.contact && typeof b.contact === 'object') {
        for (const k of CONTACT_FIELDS) {
          if (b.contact[k] === undefined) continue;
          const v = String(b.contact[k]).trim().slice(0, k.startsWith('address') ? 300 : 120);
          if ((k === 'facebook' || k === 'mapUrl') && v && !/^https:\/\//.test(v)) return fail(res, 400, 'bad_url');
          if (k === 'email' && v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return fail(res, 400, 'bad_email');
          if (k === 'phoneTel' && v && !/^\+?\d{6,15}$/.test(v)) return fail(res, 400, 'bad_phone');
          if (k === 'bookingPhones' && v && !/^[\d\s+,\-]{6,120}$/.test(v)) return fail(res, 400, 'bad_phone');
          s[k] = v;
        }
      }
      saveDb();
      return json(res, 200, { ok: true });
    }

    if (route === 'GET /api/admin/export') {
      if (!isOwner) return ownerOnly();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': 'attachment; filename="bs-guasha-backup.json"' });
      return res.end(JSON.stringify(db, null, 1));
    }
  }

  return fail(res, 404, 'not_found');
}

/* ---------------- output shapers & validators ---------------- */
function photoOut(p) {
  return { id: p.id, note: p.note, createdAt: p.createdAt, url: '/api/photos/' + p.id + '/file' };
}
function machineHoldOut(h) {
  const m = MACHINES.get(h.machine);
  return { machine: h.machine, name: m ? m.name : h.machine, from: ubTime(h.startsAt), to: ubTime(h.endsAt), until: ubTime(h.releasesAt) };
}
function blockOut(bl) {
  /* until is counted from the start so a block to midnight reads 24:00, not 00:00 */
  return { id: bl.id, staffId: bl.staffId, note: bl.note || '', startsAt: bl.startsAt, endsAt: bl.endsAt, date: bkDate(bl), time: bkTime(bl), until: hhmm(toMin(bkTime(bl)) + bkMinutes(bl)), minutes: bkMinutes(bl) };
}
function msgOut(msg) {
  return { id: msg.id, from: msg.from, fromName: msg.fromName, text: msg.text, createdAt: msg.createdAt };
}
function bookingOut(b) {
  const svc = db.services.find((s) => s.id === b.serviceId) || null;
  const st = b.staffId ? staffById(b.staffId) : null;
  return {
    id: b.id, serviceId: b.serviceId, staffId: b.staffId || null,
    staffName: st ? st.name : '', staffColor: st && st.staff ? st.staff.color : '',
    /* date/time/minutes are derived for the screens; startsAt/endsAt are what is stored */
    date: bkDate(b), time: bkTime(b), minutes: bkMinutes(b), startsAt: b.startsAt, endsAt: b.endsAt,
    machines: (b.machines || []).map(machineHoldOut),
    status: b.status, paid: b.paid, amount: b.amount,
    createdAt: b.createdAt, reviewId: b.reviewId || null, service: svc
  };
}
/* Next due date for each repeat-service plan: last finished visit of that service
   (or the plan start) + everyDays. "booked" when a future booking already exists. */
function planStatus(u, staffId) {
  const today = ubToday();
  const soon = ubAddDays(today, 3);
  return (u.plans || []).map((pl) => {
    const svc = db.services.find((x) => x.id === pl.serviceId);
    const mine = db.bookings.filter((b) => b.userId === u.id && b.serviceId === pl.serviceId && (!staffId || b.staffId === staffId));
    const last = mine.filter((b) => b.status === 'done').map(bkDate).sort().pop() || '';
    const base = last && last > pl.startDate ? last : pl.startDate;
    const nextDue = ubAddDays(base, pl.everyDays);
    const booked = mine.some((b) => b.status === 'confirmed' && bkDate(b) >= today);
    const state = booked ? 'booked' : (nextDue < today ? 'overdue' : (nextDue <= soon ? 'due' : 'ok'));
    return { ...pl, serviceName: svc ? svc.nameMn : '?', lastVisit: last, nextDue, state };
  });
}

function adminBookingOut(b) {
  const out = bookingOut(b);
  const u = b.userId ? db.users.find((x) => x.id === b.userId) : null;
  out.user = u ? { id: u.id, name: u.name, phone: u.phone } : { id: null, name: b.walkName || 'Walk-in', phone: b.walkPhone || '' };
  out.walkIn = !u;
  out.createdBy = b.createdBy || 'app';
  return out;
}
function threadList() {
  const byUser = {};
  db.messages.forEach((msg) => {
    if (!byUser[msg.userId]) byUser[msg.userId] = { last: null, unread: 0 };
    byUser[msg.userId].last = msg;
    if (msg.from === 'customer' && !msg.readBySalon) byUser[msg.userId].unread++;
  });
  return Object.entries(byUser).map(([userId, t]) => {
    const u = db.users.find((x) => x.id === userId);
    return {
      userId, name: u ? u.name : '?', phone: u ? u.phone : '',
      lastText: t.last ? t.last.text.slice(0, 80) : '', lastFrom: t.last ? t.last.from : '',
      lastAt: t.last ? t.last.createdAt : '', unread: t.unread
    };
  }).sort((a, b) => (b.lastAt || '').localeCompare(a.lastAt || ''));
}
function serviceFromBody(b, base) {
  const nameMn = String(b.nameMn || '').trim();
  const nameEn = String(b.nameEn || '').trim() || nameMn;
  if (!nameMn) return null;
  const minutes = Math.round(Number(b.minutes));
  const price = Math.round(Number(b.price));
  if (!Number.isFinite(minutes) || minutes < 15 || minutes > 240) return null;
  if (!Number.isFinite(price) || price < 0 || price > 100000000) return null;
  return {
    ...base,
    group: ['facial', 'body', 'other'].includes(b.group) ? b.group : 'facial',
    nameMn: nameMn.slice(0, 80), nameEn: nameEn.slice(0, 80),
    descMn: String(b.descMn || '').trim().slice(0, 300), descEn: String(b.descEn || '').trim().slice(0, 300),
    minutes, price, emoji: String(b.emoji || '🌿').trim().slice(0, 8),
    uses: cleanUses(b.uses, minutes).uses || []
  };
}
function bundleFromBody(b, base) {
  const nameMn = String(b.nameMn || '').trim();
  if (!nameMn) return null;
  const sessions = Math.round(Number(b.sessions));
  const price = Math.round(Number(b.price));
  const validDays = Math.round(Number(b.validDays));
  if (!Number.isFinite(sessions) || sessions < 1 || sessions > 50) return null;
  if (!Number.isFinite(price) || price < 0 || price > 10000000) return null;
  if (!Number.isFinite(validDays) || validDays < 7 || validDays > 365) return null;
  const serviceIds = Array.isArray(b.serviceIds) ? b.serviceIds.filter((id) => db.services.some((s) => s.id === id)) : [];
  return {
    ...base,
    nameMn: nameMn.slice(0, 80), nameEn: String(b.nameEn || nameMn).trim().slice(0, 80),
    descMn: String(b.descMn || '').trim().slice(0, 300), descEn: String(b.descEn || '').trim().slice(0, 300),
    emoji: String(b.emoji || '🎁').trim().slice(0, 8),
    sessions, price, validDays, serviceIds
  };
}
function eduFromBody(b, base) {
  const nameMn = String(b.nameMn || '').trim();
  if (!nameMn) return null;
  return {
    ...base,
    category: ['tool', 'product', 'machine', 'method'].includes(b.category) ? b.category : 'product',
    emoji: String(b.emoji || '🌿').trim().slice(0, 8),
    nameMn: nameMn.slice(0, 80), nameEn: String(b.nameEn || nameMn).trim().slice(0, 80),
    descMn: String(b.descMn || '').trim().slice(0, 500), descEn: String(b.descEn || '').trim().slice(0, 500),
    benefitMn: String(b.benefitMn || '').trim().slice(0, 40), benefitEn: String(b.benefitEn || '').trim().slice(0, 40),
    order: Number.isFinite(Number(b.order)) ? Number(b.order) : 99
  };
}
function newStaffProfile(b) {
  return {
    specialtyMn: String(b.specialtyMn || '').trim().slice(0, 80),
    specialtyEn: String(b.specialtyEn || '').trim().slice(0, 80),
    color: /^#[0-9a-fA-F]{6}$/.test(b.color || '') ? b.color : '#b08c46',
    hours: validHours(b.hours) || { ...DEFAULT_HOURS },
    daysOff: [], active: true
  };
}
function validHours(h) {
  if (h === undefined || h === null) return null;
  const out = {};
  for (let d = 0; d <= 6; d++) {
    const v = h[d] !== undefined ? h[d] : h[String(d)];
    if (v === null || v === undefined || v === false || v === 'off') { out[d] = null; continue; }
    if (!Array.isArray(v) || v.length !== 2 || !TIME_RE.test(v[0]) || !TIME_RE.test(v[1]) || toMin(v[1]) <= toMin(v[0])) return null;
    out[d] = [v[0], v[1]];
  }
  return out;
}

/* ---------------- static files ---------------- */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2'
};

/* ---------------- calendar subscription feed (.ics) ----------------
   Each admin-side user gets a secret link that Google Calendar (or Apple/Outlook)
   subscribes to, so bookings made here show up in the calendar staff already use.
   Google refreshes subscriptions on its own schedule (often hours), so the admin
   day view stays the source of truth for same-day changes. */
function icsUtc(iso) { return new Date(Date.parse(iso)).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); }
function icsText(s) {
  return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}
/* RFC 5545: lines longer than 75 octets are folded; never split a UTF-8 character */
function icsFold(line) {
  const out = [];
  let cur = '', bytes = 0;
  for (const ch of line) {
    const n = Buffer.byteLength(ch);
    if (bytes + n > (out.length ? 74 : 75)) { out.push(cur); cur = ''; bytes = 0; }
    cur += ch; bytes += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}
function calFeedFor(feed) {
  const u = db.users.find((x) => x.id === feed.userId);
  if (!u || u.disabled || !ADMIN_ROLES.includes(u.role)) return null;
  const all = feed.scope === 'all';
  if (all && u.role !== 'owner' && u.role !== 'superadmin') return null;
  if (!all && !u.staff) return null;
  const c = cfg();
  const from = Date.now() - 60 * 86400000, to = Date.now() + 180 * 86400000;
  const inRange = (x) => Date.parse(x.startsAt) >= from && Date.parse(x.startsAt) <= to;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//B\'s Gua Sha//Bookings//MN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:' + icsText("B's Gua Sha — " + (all ? 'бүх захиалга' : u.name)),
    'X-WR-TIMEZONE:Asia/Ulaanbaatar', 'REFRESH-INTERVAL;VALUE=DURATION:PT30M', 'X-PUBLISHED-TTL:PT30M'
  ];
  const bks = db.bookings.filter((b) => HOLDING.includes(b.status) && inRange(b) && (all || b.staffId === u.id));
  for (const b of bks) {
    const svc = db.services.find((x) => x.id === b.serviceId);
    const cu = b.userId ? db.users.find((x) => x.id === b.userId) : null;
    const name = cu ? cu.name : (b.walkName || 'Зочин');
    const phone = cu ? cu.phone : (b.walkPhone || '');
    const st = all && b.staffId ? staffById(b.staffId) : null;
    const desc = [phone ? '📞 ' + phone : '', svc ? svc.nameMn + ' · ' + bkMinutes(b) + ' мин · ' + (b.amount || svc.price).toLocaleString('en-US') + '₮' : '',
      b.status === 'done' ? '✓ Болсон' : '', cu && cu.staffDesc ? '📋 ' + cu.staffDesc : ''].filter(Boolean).join('\n');
    lines.push('BEGIN:VEVENT', 'UID:' + b.id + '@bguasha', 'DTSTAMP:' + stamp,
      'DTSTART:' + icsUtc(b.startsAt), 'DTEND:' + icsUtc(b.endsAt),
      'SUMMARY:' + icsText(name + ' — ' + (svc ? svc.nameMn : 'Үйлчилгээ') + (st ? ' (' + firstName(st.name) + ')' : '')),
      'DESCRIPTION:' + icsText(desc), 'LOCATION:' + icsText(c.addressMn || ''), 'STATUS:CONFIRMED', 'END:VEVENT');
  }
  /* blocked time (breaks, errands) so the calendar shows the day as it really is */
  for (const bl of db.blocks.filter((x) => inRange(x) && (all || x.staffId === u.id))) {
    lines.push('BEGIN:VEVENT', 'UID:' + bl.id + '@bguasha', 'DTSTAMP:' + stamp,
      'DTSTART:' + icsUtc(bl.startsAt), 'DTEND:' + icsUtc(bl.endsAt),
      'SUMMARY:' + icsText('🚫 ' + (bl.note || 'Хаасан цаг')), 'TRANSP:OPAQUE', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(icsFold).join('\r\n') + '\r\n';
}
function calFeedTokens(userId) {
  const mine = {};
  for (const [t, f] of Object.entries(db.calFeeds)) if (f.userId === userId) mine[f.scope] = t;
  return mine;
}
function publicBase(req) {
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() || 'http';
  return proto + '://' + (req.headers['x-forwarded-host'] || req.headers.host || 'localhost');
}

/* ---------------- share previews + search data for the home page ----------------
   Facebook, Messenger and Google read these from the raw HTML, so they are
   injected by the server (from the live settings) instead of by site.js. */
function escAttr(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function homeHead(req) {
  const c = cfg();
  const base = publicBase(req);
  const title = c.salonName + ' — Гуаша гоо сайхны студи · Улаанбаатар';
  const desc = 'Нүүр ба биеийн гуаша эмчилгээ, Баянгол дүүрэг. ' + (c.sloganMn || '') + '. Цаг авах: ' + (c.phoneDisplay || '');
  const image = base + '/app/icons/icon-512.png';
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].filter((d, i) => !(c.closedWeekdays || []).includes(i));
  const postal = (String(c.addressMn || '').match(/\b\d{5}\b/) || [])[0];
  const ld = {
    '@context': 'https://schema.org', '@type': 'BeautySalon',
    name: c.salonName, url: base + '/', image, logo: image, description: c.sloganEn || c.sloganMn,
    telephone: c.phoneTel || undefined, email: c.email || undefined,
    address: { '@type': 'PostalAddress', streetAddress: c.addressMn, addressLocality: 'Улаанбаатар', postalCode: postal, addressCountry: 'MN' },
    openingHoursSpecification: [{ '@type': 'OpeningHoursSpecification', dayOfWeek: days, opens: c.hoursOpen, closes: c.hoursClose }],
    hasMap: c.mapUrl || undefined,
    sameAs: [c.facebook, c.instagram].filter(Boolean)
  };
  return [
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="' + escAttr(c.salonName) + '">',
    '<meta property="og:title" content="' + escAttr(title) + '">',
    '<meta property="og:description" content="' + escAttr(desc) + '">',
    '<meta property="og:url" content="' + escAttr(base + '/') + '">',
    '<meta property="og:image" content="' + escAttr(image) + '">',
    '<meta property="og:image:width" content="512"><meta property="og:image:height" content="512">',
    '<meta property="og:locale" content="mn_MN"><meta property="og:locale:alternate" content="en_US">',
    '<meta name="twitter:card" content="summary">',
    '<link rel="canonical" href="' + escAttr(base + '/') + '">',
    /* "<" is escaped so no value can close the script tag */
    '<script type="application/ld+json">' + JSON.stringify(ld).replace(/</g, '\\u003c') + '</script>'
  ].join('\n');
}

function serveStatic(res, pathname, req) {
  let p;
  try { p = decodeURIComponent(pathname); } catch (e) { p = pathname; }
  if (p === '/' || p === '/index.html') {
    return fs.readFile(path.join(PUB, 'index.html'), 'utf8', (err, html) => {
      if (err) { res.writeHead(500); return res.end(); }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
      res.end(html.replace('</head>', homeHead(req) + '\n</head>'));
    });
  }
  if (p === '/app' || p === '/app/') p = '/app/index.html';
  if (p === '/admin' || p === '/admin/') p = '/admin/index.html';
  const full = path.normalize(path.join(PUB, p));
  if (!full.startsWith(PUB + path.sep) && full !== PUB) { res.writeHead(403); return res.end('Forbidden'); }
  fs.stat(full, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end('<meta charset="utf-8"><body style="font-family:sans-serif;text-align:center;padding-top:10vh"><h2>404</h2><p>Хуудас олдсонгүй · Page not found</p><a href="/">B\'s Gua Sha</a></body>');
    }
    const ext = path.extname(full).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(full).pipe(res);
  });
}

/* ---------------- server ---------------- */
loadDb();
recordBoot();

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  const pathname = u.pathname;
  try {
    if (pathname.startsWith('/api/')) return await handleApi(req, res, pathname, u.searchParams);
    const cm = pathname.match(/^\/cal\/([a-f0-9]{40})\.ics$/);
    if (cm && (req.method === 'GET' || req.method === 'HEAD')) {
      const feed = db.calFeeds[cm[1]];
      const body = feed ? calFeedFor(feed) : null;
      if (!body) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('not found'); }
      res.writeHead(200, { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'no-cache', 'Content-Disposition': 'inline; filename="bguasha.ics"' });
      return res.end(req.method === 'HEAD' ? undefined : body);
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    return serveStatic(res, pathname, req);
  } catch (e) {
    if (e.message === 'bad_json') return fail(res, 400, 'bad_json');
    if (e.message === 'too_large') return fail(res, 413, 'too_large');
    console.error('Error handling', pathname, e);
    return fail(res, 500, 'server_error');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log("  B's Gua Sha (v3) is running!");
  console.log('  ----------------------------------------');
  console.log('  Website : http://localhost:' + PORT + '/');
  console.log('  App     : http://localhost:' + PORT + '/app');
  console.log('  Admin   : http://localhost:' + PORT + '/admin   (super admin PIN: ' + cfg().adminPin + ')');
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        console.log('  Phone   : http://' + net.address + ':' + PORT + '/app   (same Wi-Fi)');
      }
    }
  }
  console.log('  ----------------------------------------');
  console.log('  Demo customer : 99000000 / demo123');
  console.log('  Super admin : ' + SUPER_PHONE + ' / ' + SUPER_PASSWORD + '  (default — change it in Admin → Бүртгэл)');
  console.log('  Owner       : 91113958 / owner123   |   Example staff : 88000001 / staff123');
  console.log('  Payments are in DEMO mode (no real money). See docs/PAYMENTS-QPAY.md');
  console.log('');
});
