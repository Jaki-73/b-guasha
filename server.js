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

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const ROOT = __dirname;
const PUB = path.join(ROOT, 'public');
const DATA = path.join(ROOT, 'data');
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
  qpay: { baseUrl: 'https://merchant-sandbox.qpay.mn', username: '', password: '', invoiceCode: '', callbackBaseUrl: '' }
};
let config = { ...DEFAULT_CONFIG };
try {
  config = { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8')) };
} catch (e) {
  console.warn('config.json missing or invalid — using defaults');
}

/* effective config = config.json + owner-edited settings stored in the db */
function cfg() { return db && db.settings ? { ...config, ...db.settings } : config; }

/* feature flags — the owner (super admin) toggles these in Admin → Тохиргоо.
   Wallet off = no balance, top-up, bundles, gift cards or promo codes anywhere.
   Nothing is deleted: existing balances stay in the db and come back when re-enabled. */
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
  const mk = (cat, emoji, nameMn, nameEn, descMn, descEn, order) => ({ id: uid('edu'), category: cat, emoji, nameMn, nameEn, descMn, descEn, order, active: true });
  return [
    mk('tool', '💎', 'Хаш гуаша чулуу', 'Jade gua sha stone', 'Жинхэнэ хаш чулуун хусуур — арьсыг сэрүүцүүлж, лимфийн урсгалыг идэвхжүүлж, нүүрний тоймыг тодруулна.', 'Genuine jade scraping stone — cools the skin, activates lymphatic drainage and sculpts facial contours.', 1),
    mk('tool', '🌸', 'Ягаан кварц чулуу', 'Rose quartz stone', 'Мэдрэмтгий арьсанд тохиромжтой зөөлөн чулуу. Тайвшруулах, улайлт багасгах үйлчилгээтэй.', 'A gentler stone suited to sensitive skin; calming and redness-reducing.', 2),
    mk('tool', '🌀', 'Хаш өнхрүүш (роллер)', 'Jade roller', 'Эмчилгээний төгсгөлд сийрэгжүүлэх, маскны шингээлтийг сайжруулахад ашиглана.', 'Used at the end of a treatment to de-puff and help masks absorb.', 3),
    mk('product', '🫒', 'Эмчилгээний тос', 'Facial treatment oil', 'Жожоба, сараана зэрэг ургамлын гаралтай тос — чулуу арьсан дээр зөөлөн гулгах нөхцөлийг бүрдүүлж, арьсыг тэжээнэ.', 'Plant-based oils (jojoba, camellia) that let the stone glide smoothly while nourishing the skin.', 4),
    mk('product', '🧖‍♀️', 'Шавар маск', 'Clay mask', 'Гуаша массажийн дараа нүх сүвийг цэвэрлэж, илүүдэл тосыг шингээнэ. Бентонит ба каолин шавар ашиглана.', 'Applied after gua sha to deep-clean pores and absorb excess oil. We use bentonite and kaolin clays.', 5),
    mk('product', '💧', 'Тонер', 'Toner', 'Арьсны pH тэнцвэрийг сэргээж, дараагийн бүтээгдэхүүний шингээлтийг сайжруулна. Спиргүй, ургамлын ханд бүхий тонер хэрэглэнэ.', 'Restores the skin pH balance and preps it to absorb what follows. We use alcohol-free botanical toners.', 6),
    mk('product', '✨', 'Гиалурон серум', 'Hyaluronic serum', 'Арьсыг гүн чийгшүүлж, гуашагийн дараах гэрэлтэлтийг хадгална.', 'Deeply hydrates and locks in the post-gua sha glow.', 7),
    mk('product', '🍊', 'Витамин C серум', 'Vitamin C serum', 'Толбо бууруулж, арьсны өнгийг тэгшилнэ. Өглөөний эмчилгээнд тохиромжтой.', 'Brightens, evens skin tone and fades dark spots. Great in morning treatments.', 8),
    mk('machine', '♨️', 'Нүүрний уураар жигнэгч', 'Facial steamer', 'Эмчилгээний эхэнд нүх сүвийг нээж, цэвэрлэгээ ба маскны үр дүнг нэмэгдүүлнэ.', 'Opens the pores at the start of a treatment so cleansing and masks work better.', 9),
    mk('machine', '💡', 'LED гэрлэн эмчилгээ', 'LED light therapy', 'Улаан гэрэл — коллаген, сэргээлт; цэнхэр гэрэл — батга үүсгэгч бактерийг бууруулна.', 'Red light supports collagen and recovery; blue light reduces acne-causing bacteria.', 10),
    mk('machine', '⚡', 'Микро гүйдлийн чангалгаа', 'Microcurrent lifting device', 'Сул гүйдлээр булчинг идэвхжүүлж, өргөх эффектийг гүнзгийрүүлнэ. Гуашатай хослуулахад үр дүнтэй.', 'Gentle currents tone facial muscles and deepen the lifting effect; pairs well with gua sha.', 11),
    mk('method', '🌿', '100% органик арчилгаа', '100% organic care', 'Бид байгалийн гаралтай, органик бүтээгдэхүүнийг сонгож, арьсанд ээлтэй аргыг баримталдаг. Лазер зэрэг хүчтэй аппаратын эмчилгээг арьсны мэргэжилтний зөвлөгөөний дагуу л санал болгоно.', 'We choose natural, organic products and skin-friendly methods. Stronger device treatments (e.g. laser) are only suggested with a specialist advice.', 12)
  ];
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

function seedDb() {
  const demo = makeUser('Сараа (Demo)', '99000000', 'demo123');
  demo.balance = 50000;
  demo.isDemo = true;
  return {
    meta: { version: 3 },
    settings: {},
    services: seedServices(),
    users: [demo, ...seedStaffUsers()],
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
    edu: seedEdu()
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
  const firstStaff = db.users.find((u) => u.role === 'owner' && u.staff) || db.users.find((u) => u.role === 'staff' && u.staff);
  db.bookings.forEach((b) => {
    if (!b.staffId) b.staffId = firstStaff ? firstStaff.id : null;
    if (!b.minutes) { const s = db.services.find((x) => x.id === b.serviceId); b.minutes = (s && s.minutes) || 60; }
  });
  db.services.forEach((s) => { if (s.group === 'package') s.active = false; });
  if (!db.bundles.length) db.bundles = seedBundles();
  if (!db.edu.length) db.edu = seedEdu();
  if (!db.reviews.length) db.reviews = seedReviews();
  if (!db.promos.length) db.promos = seedPromos();
  if (db.meta.version < 3) { db.adminSessions = {}; db.meta.version = 3; }
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
function checkPassword(user, password) {
  try {
    const hash = crypto.scryptSync(password, user.salt, 32).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(user.hash, 'hex'));
  } catch (e) { return false; }
}
function publicUser(u) {
  return {
    id: u.id, name: u.name, phone: u.phone, balance: u.balance, createdAt: u.createdAt, isDemo: !!u.isDemo,
    role: u.role || 'customer',
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
function authUser(req, q) {
  const t = tokenFrom(req, q);
  if (!t) return null;
  const s = db.sessions[t];
  if (!s) return null;
  return db.users.find((u) => u.id === s.userId) || null;
}
function authAdmin(req, q) {
  const t = tokenFrom(req, q);
  if (!t) return null;
  return db.adminSessions[t] || null;
}
function newSession(map, payload) {
  const t = crypto.randomBytes(24).toString('hex');
  map[t] = { ...payload, createdAt: nowIso() };
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

function localDateStr(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
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
function bookingDateTime(b) { return new Date(b.date + 'T' + b.time + ':00'); }
function salonClosed(dateStr) {
  const c = cfg();
  const d = new Date(dateStr + 'T12:00:00');
  return c.closedWeekdays.includes(d.getDay()) || (c.closedDates || []).includes(dateStr);
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
  const wd = new Date(dateStr + 'T12:00:00').getDay();
  const h = (u.staff.hours || DEFAULT_HOURS)[wd];
  if (!h) return null;
  return [toMin(h[0]), toMin(h[1])];
}
function staffBusy(staffId, dateStr) {
  const c = cfg();
  const out = [];
  db.bookings.forEach((b) => {
    if (b.staffId === staffId && b.date === dateStr && (b.status === 'confirmed' || b.status === 'done')) {
      const s = toMin(b.time);
      out.push([s, s + (b.minutes || c.slotMinutes)]);
    }
  });
  db.blocks.forEach((bl) => {
    if (bl.staffId === staffId && bl.date === dateStr) {
      const s = toMin(bl.time);
      out.push([s, s + c.slotMinutes]);
    }
  });
  return out;
}
function overlaps(busy, start, end) { return busy.some(([a, b]) => start < b && end > a); }
function slotFreeFor(u, dateStr, time, minutes) {
  const win = staffWindow(u, dateStr);
  if (!win) return false;
  const s = toMin(time), e = s + minutes;
  if (s < win[0] || e > win[1]) return false;
  return !overlaps(staffBusy(u.id, dateStr), s, e);
}
function pickStaff(dateStr, time, minutes, preferredId) {
  const candidates = staffUsers().filter((u) => slotFreeFor(u, dateStr, time, minutes));
  if (!candidates.length) return null;
  if (preferredId) {
    const p = candidates.find((u) => u.id === preferredId);
    if (p) return p;
  }
  candidates.sort((a, b) => {
    const la = db.bookings.filter((x) => x.staffId === a.id && x.date === dateStr && (x.status === 'confirmed' || x.status === 'done')).length;
    const lb = db.bookings.filter((x) => x.staffId === b.id && x.date === dateStr && (x.status === 'confirmed' || x.status === 'done')).length;
    return la - lb;
  });
  return candidates[0];
}

function usableBundleFor(userId, serviceId) {
  const now = Date.now();
  return db.userBundles.find((ub) => {
    if (ub.userId !== userId || ub.remaining <= 0) return false;
    if (new Date(ub.expiresAt).getTime() < now) return false;
    const bd = db.bundles.find((b) => b.id === ub.bundleId);
    if (!bd) return false;
    return !bd.serviceIds || !bd.serviceIds.length || bd.serviceIds.includes(serviceId);
  }) || null;
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
     When the owner turns the wallet off, every money-in-app endpoint is closed
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
      phoneDisplay: c.phoneDisplay, phoneTel: c.phoneTel, email: c.email,
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
          name: r.name || firstName(u && u.name) || 'Үйлчлүүлэгч',
          serviceMn: svc ? svc.nameMn : '', serviceEn: svc ? svc.nameEn : '',
          staffName: st ? firstName(st.name) : ''
        };
      });
    const avg = list.length ? Math.round((list.reduce((s, r) => s + r.rating, 0) / list.length) * 10) / 10 : 0;
    return json(res, 200, { average: avg, count: list.length, reviews: list });
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
    if (db.users.some((u) => u.phone === phone)) return fail(res, 409, 'phone_taken');
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
    if (!DATE_RE.test(date)) return fail(res, 400, 'bad_date');
    const today = localDateStr(new Date());
    const max = localDateStr(new Date(Date.now() + c.bookingDaysAhead * 86400000));
    if (date < today || date > max) return fail(res, 400, 'date_out_of_range');
    if (salonClosed(date)) return json(res, 200, { date, closed: true, slots: [] });
    const svc = db.services.find((s) => s.id === q.get('serviceId'));
    const minutes = (svc && svc.minutes) || c.slotMinutes;
    const staffParam = q.get('staffId') || 'any';
    const now = new Date();
    const slots = slotTimes().map((time) => {
      let free;
      if (staffParam === 'any') {
        free = staffUsers().some((u) => slotFreeFor(u, date, time, minutes));
      } else {
        const su = staffById(staffParam);
        free = su ? slotFreeFor(su, date, time, minutes) : false;
      }
      if (free && date === today) {
        const dt = new Date(date + 'T' + time + ':00');
        if (dt.getTime() - now.getTime() < 60 * 60 * 1000) free = false;
      }
      return { time, available: free };
    });
    return json(res, 200, { date, closed: false, slots });
  }

  if (route === 'POST /api/bookings') {
    if (!user) return fail(res, 401, 'unauthorized');
    const b = await readJson(req);
    const svc = db.services.find((s) => s.id === b.serviceId && s.active);
    if (!svc) return fail(res, 400, 'bad_service');
    if (!DATE_RE.test(b.date || '') || !TIME_RE.test(b.time || '')) return fail(res, 400, 'bad_request');
    if (!slotTimes().includes(b.time)) return fail(res, 400, 'bad_time');
    const today = localDateStr(new Date());
    const max = localDateStr(new Date(Date.now() + c.bookingDaysAhead * 86400000));
    if (b.date < today || b.date > max) return fail(res, 400, 'date_out_of_range');
    if (salonClosed(b.date)) return fail(res, 400, 'date_out_of_range');
    const dt = new Date(b.date + 'T' + b.time + ':00');
    if (dt.getTime() - Date.now() < 60 * 60 * 1000) return fail(res, 400, 'too_soon');

    let staffUser = null;
    if (!b.staffId || b.staffId === 'any') {
      staffUser = pickStaff(b.date, b.time, svc.minutes, user.preferredStaffId);
      if (!staffUser) return fail(res, 409, 'slot_taken');
    } else {
      staffUser = staffById(b.staffId);
      if (!staffUser) return fail(res, 400, 'bad_staff');
      if (!slotFreeFor(staffUser, b.date, b.time, svc.minutes)) return fail(res, 409, 'slot_taken');
    }

    const payWith = walletOn() && ['balance', 'salon', 'package'].includes(b.payWith) ? b.payWith : 'salon';
    let userBundleId = null;
    if (payWith === 'package') {
      const ub = usableBundleFor(user.id, svc.id);
      if (!ub) return fail(res, 400, 'no_package');
      ub.remaining -= 1;
      userBundleId = ub.id;
    } else if (payWith === 'balance') {
      if (user.balance < svc.price) return fail(res, 400, 'insufficient_balance');
      user.balance -= svc.price;
      addTransaction(user.id, 'payment', 'balance', -svc.price, svc.nameEn);
    }

    const booking = {
      id: uid('bk'), userId: user.id, serviceId: svc.id, staffId: staffUser.id,
      date: b.date, time: b.time, minutes: svc.minutes,
      status: 'confirmed', paid: payWith, amount: svc.price,
      createdBy: 'app', createdAt: nowIso()
    };
    if (userBundleId) booking.userBundleId = userBundleId;
    db.bookings.push(booking);
    saveDb();
    return json(res, 200, { booking: bookingOut(booking), balance: user.balance });
  }

  if (route === 'GET /api/bookings') {
    if (!user) return fail(res, 401, 'unauthorized');
    const list = db.bookings
      .filter((b) => b.userId === user.id)
      .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))
      .map(bookingOut);
    return json(res, 200, list);
  }

  m = pathname.match(/^\/api\/bookings\/([\w-]+)\/cancel$/);
  if (m && method === 'POST') {
    if (!user) return fail(res, 401, 'unauthorized');
    const booking = db.bookings.find((b) => b.id === m[1] && b.userId === user.id);
    if (!booking) return fail(res, 404, 'not_found');
    if (booking.status !== 'confirmed') return fail(res, 400, 'bad_request');
    const hoursLeft = (bookingDateTime(booking).getTime() - Date.now()) / 3600000;
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
    const ownerStaff = db.users.find((u) => u.role === 'owner' && u.staff);
    const token = newSession(db.adminSessions, { role: 'owner', staffUserId: ownerStaff ? ownerStaff.id : null, name: ownerStaff ? ownerStaff.name : 'Owner' });
    saveDb();
    return json(res, 200, { token, role: 'owner', name: ownerStaff ? ownerStaff.name : 'Owner', staffUserId: ownerStaff ? ownerStaff.id : null });
  }

  if (route === 'POST /api/admin/login-staff') {
    const b = await readJson(req);
    const su = db.users.find((u) => u.phone === String(b.phone || '').trim() && (u.role === 'staff' || u.role === 'owner'));
    if (!su || !checkPassword(su, String(b.password || ''))) return fail(res, 401, 'invalid_credentials');
    if (!su.staff || su.staff.active === false) return fail(res, 403, 'staff_inactive');
    const role = su.role === 'owner' ? 'owner' : 'staff';
    const token = newSession(db.adminSessions, { role, staffUserId: su.id, name: su.name });
    saveDb();
    return json(res, 200, { token, role, name: su.name, staffUserId: su.id });
  }

  if (pathname.startsWith('/api/admin/') && pathname !== '/api/admin/login' && pathname !== '/api/admin/login-staff') {
    const sess = authAdmin(req, q);
    if (!sess) return fail(res, 401, 'unauthorized');
    const isOwner = sess.role === 'owner';
    const ownerOnly = () => fail(res, 403, 'owner_only');

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
      const today = localDateStr(new Date());
      const upcoming = db.bookings
        .filter((b) => b.status === 'confirmed' && b.date >= today && (isOwner || b.staffId === sess.staffUserId))
        .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
        .map(adminBookingOut);
      const past = db.bookings
        .filter((b) => !(b.status === 'confirmed' && b.date >= today) && (isOwner || b.staffId === sess.staffUserId))
        .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))
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
      const month = /^\d{4}-\d{2}$/.test(q.get('month') || '') ? q.get('month') : localDateStr(new Date()).slice(0, 7);
      const inMonth = (iso) => (iso || '').slice(0, 7) === month;
      const bks = db.bookings.filter((b) => b.date.slice(0, 7) === month);
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
      const date = DATE_RE.test(q.get('date') || '') ? q.get('date') : localDateStr(new Date());
      const staff = (isOwner ? staffUsers(true) : staffUsers(true).filter((u) => u.id === sess.staffUserId)).map((u) => {
        const win = staffWindow(u, date);
        return { id: u.id, name: u.name, color: (u.staff && u.staff.color) || '#b08c46', active: u.staff.active !== false, working: !!win, open: win ? win[0] : null, close: win ? win[1] : null };
      });
      const bookings = db.bookings.filter((b) => b.date === date && (isOwner || b.staffId === sess.staffUserId)).map(adminBookingOut);
      const blocks = db.blocks.filter((b) => b.date === date && (isOwner || b.staffId === sess.staffUserId));
      return json(res, 200, { date, closed: salonClosed(date), slotMinutes: c.slotMinutes, slots: slotTimes(), staff, bookings, blocks });
    }

    if (route === 'POST /api/admin/blocks') {
      const b = await readJson(req);
      if (!DATE_RE.test(b.date || '') || !TIME_RE.test(b.time || '')) return fail(res, 400, 'bad_request');
      if (!slotTimes().includes(b.time)) return fail(res, 400, 'bad_time');
      const su = staffById(b.staffId);
      if (!su) return fail(res, 400, 'bad_staff');
      if (!isOwner && su.id !== sess.staffUserId) return fail(res, 403, 'forbidden');
      if (db.blocks.some((x) => x.date === b.date && x.time === b.time && x.staffId === su.id)) return fail(res, 409, 'already_blocked');
      const block = { id: uid('bl'), date: b.date, time: b.time, staffId: su.id, note: String(b.note || '').trim().slice(0, 100), createdAt: nowIso() };
      db.blocks.push(block);
      saveDb();
      return json(res, 200, block);
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
      if (!DATE_RE.test(b.date || '') || !TIME_RE.test(b.time || '')) return fail(res, 400, 'bad_request');
      if (!slotTimes().includes(b.time)) return fail(res, 400, 'bad_time');
      const su = staffById(b.staffId);
      if (!su) return fail(res, 400, 'bad_staff');
      if (!isOwner && su.id !== sess.staffUserId) return fail(res, 403, 'forbidden');
      const today = localDateStr(new Date());
      const min = localDateStr(new Date(Date.now() - 60 * 86400000));
      const max = localDateStr(new Date(Date.now() + c.bookingDaysAhead * 86400000));
      if (b.date < min || b.date > max) return fail(res, 400, 'date_out_of_range');
      if (b.date >= today) {
        if (!slotFreeFor(su, b.date, b.time, svc.minutes)) return fail(res, 409, 'slot_taken');
      } else {
        const s0 = toMin(b.time);
        if (overlaps(staffBusy(su.id, b.date), s0, s0 + svc.minutes)) return fail(res, 409, 'slot_taken');
      }
      const phone = String(b.phone || '').trim();
      const existing = phone ? db.users.find((u) => u.phone === phone) : null;
      const booking = {
        id: uid('bk'), userId: existing ? existing.id : null,
        walkName: existing ? '' : String(b.name || phone || 'Walk-in').trim().slice(0, 60),
        walkPhone: existing ? '' : phone,
        serviceId: svc.id, staffId: su.id, date: b.date, time: b.time, minutes: svc.minutes,
        status: b.date < today ? 'done' : 'confirmed', paid: 'salon', amount: svc.price,
        createdBy: 'admin', createdAt: nowIso()
      };
      db.bookings.push(booking);
      saveDb();
      return json(res, 200, adminBookingOut(booking));
    }

    /* ----- bookings management ----- */
    m = pathname.match(/^\/api\/admin\/bookings\/([\w-]+)\/status$/);
    if (m && method === 'POST') {
      const b = await readJson(req);
      const booking = db.bookings.find((x) => x.id === m[1]);
      if (!booking) return fail(res, 404, 'not_found');
      if (!isOwner && booking.staffId !== sess.staffUserId) return fail(res, 403, 'forbidden');
      const allowed = ['confirmed', 'done', 'noshow', 'cancelled'];
      if (!allowed.includes(b.status)) return fail(res, 400, 'bad_request');
      if (b.status === 'cancelled' && booking.status !== 'cancelled') refundBooking(booking, 'cancelled by salon');
      booking.status = b.status;
      saveDb();
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
      if (booking.status === 'confirmed' && su.id !== booking.staffId) {
        const s0 = toMin(booking.time);
        if (overlaps(staffBusy(su.id, booking.date), s0, s0 + (booking.minutes || c.slotMinutes))) return fail(res, 409, 'slot_taken');
      }
      booking.staffId = su.id;
      saveDb();
      return json(res, 200, { ok: true, booking: adminBookingOut(booking) });
    }

    /* ----- clients ----- */
    if (route === 'GET /api/admin/users') {
      const qry = (q.get('q') || '').toLowerCase().trim();
      let list = db.users.filter((u) => u.role === 'customer');
      if (qry) list = list.filter((u) => u.name.toLowerCase().includes(qry) || u.phone.includes(qry));
      return json(res, 200, list.map((u) => {
        const myBks = db.bookings.filter((b) => b.userId === u.id);
        const doneBks = myBks.filter((b) => b.status === 'done');
        return {
          ...publicUser(u),
          bookings: myBks.length,
          visits: doneBks.length,
          lastVisit: (doneBks.sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))[0] || {}).date || '',
          nextBooking: (myBks.filter((b) => b.status === 'confirmed' && b.date >= localDateStr(new Date())).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))[0] || {}).date || ''
        };
      }));
    }

    m = pathname.match(/^\/api\/admin\/users\/([\w-]+)$/);
    if (m && method === 'GET') {
      const u = db.users.find((x) => x.id === m[1]);
      if (!u) return fail(res, 404, 'not_found');
      const bks = db.bookings.filter((b) => b.userId === u.id).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time)).map(adminBookingOut);
      const done = bks.filter((b) => b.status === 'done');
      const spent = done.filter((b) => b.paid === 'balance' || b.paid === 'salon').reduce((s, b) => s + b.amount, 0);
      const packages = db.userBundles.filter((ub) => ub.userId === u.id).map((ub) => {
        const bd = db.bundles.find((b) => b.id === ub.bundleId) || {};
        return { id: ub.id, name: bd.nameMn || '?', remaining: ub.remaining, sessions: bd.sessions || 0, expiresAt: ub.expiresAt, expired: new Date(ub.expiresAt).getTime() < Date.now() };
      });
      const reviews = db.reviews.filter((r) => r.userId === u.id).map((r) => ({ id: r.id, rating: r.rating, text: r.text, approved: r.approved, createdAt: r.createdAt }));
      const myNotes = db.notes.filter((n) => n.customerId === u.id && n.staffUserId === sess.staffUserId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const preferred = u.preferredStaffId ? staffById(u.preferredStaffId) : null;
      return json(res, 200, {
        user: publicUser(u),
        preferredStaffName: preferred ? preferred.name : '',
        stats: { visits: done.length, spent, total: bks.length, noshow: bks.filter((b) => b.status === 'noshow').length },
        bookings: bks.slice(0, 60),
        packages, reviews, myNotes
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

    /* ----- private notes (visible ONLY to their author) ----- */
    if (route === 'POST /api/admin/notes') {
      const b = await readJson(req);
      const cu = db.users.find((x) => x.id === b.customerId);
      if (!cu) return fail(res, 404, 'not_found');
      if (!sess.staffUserId) return fail(res, 403, 'forbidden');
      const text = String(b.text || '').trim().slice(0, 500);
      if (!text) return fail(res, 400, 'bad_request');
      const note = { id: uid('nt'), staffUserId: sess.staffUserId, customerId: cu.id, text, createdAt: nowIso(), updatedAt: nowIso() };
      db.notes.push(note);
      saveDb();
      return json(res, 200, note);
    }
    m = pathname.match(/^\/api\/admin\/notes\/([\w-]+)$/);
    if (m && (method === 'POST' || method === 'DELETE')) {
      const idx = db.notes.findIndex((n) => n.id === m[1]);
      if (idx === -1) return fail(res, 404, 'not_found');
      if (db.notes[idx].staffUserId !== sess.staffUserId) return fail(res, 403, 'forbidden');
      if (method === 'DELETE') {
        db.notes.splice(idx, 1);
        saveDb();
        return json(res, 200, { ok: true });
      }
      const b = await readJson(req);
      const text = String(b.text || '').trim().slice(0, 500);
      if (!text) return fail(res, 400, 'bad_request');
      db.notes[idx].text = text;
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
      if (b.minutes !== undefined) {
        const mn = Math.round(Number(b.minutes));
        if (!Number.isFinite(mn) || mn < 15 || mn > 240) return fail(res, 400, 'bad_request');
        svc.minutes = mn;
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
        upcoming: db.bookings.filter((b) => b.staffId === u.id && b.status === 'confirmed' && b.date >= localDateStr(new Date())).length
      })));
    }

    if (route === 'POST /api/admin/staff') {
      if (!isOwner) return ownerOnly();
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
      su.staff = {
        specialtyMn: String(b.specialtyMn || '').trim().slice(0, 80),
        specialtyEn: String(b.specialtyEn || '').trim().slice(0, 80),
        color: /^#[0-9a-fA-F]{6}$/.test(b.color || '') ? b.color : '#b08c46',
        hours: validHours(b.hours) || { ...DEFAULT_HOURS },
        daysOff: [], active: true
      };
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
        if (String(b.newPassword).length < 6) return fail(res, 400, 'bad_password');
        su.salt = crypto.randomBytes(16).toString('hex');
        su.hash = crypto.scryptSync(String(b.newPassword), su.salt, 32).toString('hex');
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
      const sender = sess.staffUserId ? db.users.find((u) => u.id === sess.staffUserId) : null;
      const msg = { id: uid('msg'), userId: cu.id, from: 'salon', fromName: sender ? firstName(sender.name) : c.salonName, staffUserId: sess.staffUserId || null, text, createdAt: nowIso(), readByCustomer: false, readBySalon: true };
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
        featureWallet: c.featureWallet === true
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
      if (b.featureWallet !== undefined) s.featureWallet = b.featureWallet === true;
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
function msgOut(msg) {
  return { id: msg.id, from: msg.from, fromName: msg.fromName, text: msg.text, createdAt: msg.createdAt };
}
function bookingOut(b) {
  const svc = db.services.find((s) => s.id === b.serviceId) || null;
  const st = b.staffId ? staffById(b.staffId) : null;
  return {
    id: b.id, serviceId: b.serviceId, staffId: b.staffId || null,
    staffName: st ? st.name : '', staffColor: st && st.staff ? st.staff.color : '',
    date: b.date, time: b.time, minutes: b.minutes, status: b.status, paid: b.paid, amount: b.amount,
    createdAt: b.createdAt, reviewId: b.reviewId || null, service: svc
  };
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
    minutes, price, emoji: String(b.emoji || '🌿').trim().slice(0, 8)
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
    order: Number.isFinite(Number(b.order)) ? Number(b.order) : 99
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

function serveStatic(res, pathname) {
  let p;
  try { p = decodeURIComponent(pathname); } catch (e) { p = pathname; }
  if (p === '/') p = '/index.html';
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

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  const pathname = u.pathname;
  try {
    if (pathname.startsWith('/api/')) return await handleApi(req, res, pathname, u.searchParams);
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    return serveStatic(res, pathname);
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
  console.log('  Admin   : http://localhost:' + PORT + '/admin   (owner PIN: ' + cfg().adminPin + ')');
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
  console.log('  Owner (staff login) : 91113958 / owner123   |   Example staff : 88000001 / staff123');
  console.log('  Payments are in DEMO mode (no real money). See docs/PAYMENTS-QPAY.md');
  console.log('');
});
