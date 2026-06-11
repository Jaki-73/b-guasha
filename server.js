/*
 * B's Guasha — zero-dependency Node.js server
 * Serves: marketing website (/), mobile app (/app), admin panel (/admin), JSON API (/api/...)
 * Storage: data/db.json (created automatically). Photos: data/photos/.
 * Run:  node server.js     (or double-click start-server.bat on Windows)
 * Requires Node.js 18+. No npm install needed.
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

/* ---------------- config ---------------- */
const DEFAULT_CONFIG = {
  salonName: "B's Guasha",
  phoneDisplay: '+976 9911-2233',
  phoneTel: '+97699112233',
  addressEn: 'Ulaanbaatar',
  addressMn: 'Улаанбаатар',
  facebook: '',
  instagram: '',
  hoursOpen: '10:00',
  hoursClose: '19:00',
  slotMinutes: 60,
  closedWeekdays: [],
  bookingDaysAhead: 21,
  cancelHours: 24,
  topupBonusThreshold: 100000,
  topupBonusPercent: 5,
  adminPin: '1234',
  paymentsDemo: true,
  qpay: { baseUrl: 'https://merchant-sandbox.qpay.mn', username: '', password: '', invoiceCode: '', callbackBaseUrl: '' }
};
let config = { ...DEFAULT_CONFIG };
try {
  config = { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8')) };
} catch (e) {
  console.warn('config.json missing or invalid — using defaults');
}

/* ---------------- tiny JSON database ---------------- */
let db = null;

function seedDb() {
  const demo = makeUser('Сараа (Demo)', '99000000', 'demo123');
  demo.balance = 50000;
  demo.isDemo = true;
  return {
    services: [
      { id: 'svc-facial-signature', group: 'facial', nameEn: 'Signature Facial Gua Sha', nameMn: 'Нүүрний гуаша — сигнатур', descEn: 'Deep lifting facial: cleanse, oil, full gua sha sculpting, lymph drainage.', descMn: 'Гүн чангалгаатай иж бүрэн эмчилгээ: цэвэрлэгээ, тос, гуаша массаж, лимфийн урсгал сайжруулна.', minutes: 60, price: 90000, emoji: '🌿', active: true },
      { id: 'svc-facial-express', group: 'facial', nameEn: 'Express Glow', nameMn: 'Экспресс гэрэлтэлт', descEn: 'Quick refresh for eyes, jawline and cheekbones. Perfect before an event.', descMn: 'Нүд, эрүү, хацрын яасыг түргэн сэргээнэ. Арга хэмжээний өмнө тохиромжтой.', minutes: 30, price: 50000, emoji: '✨', active: true },
      { id: 'svc-facial-deluxe', group: 'facial', nameEn: 'Deluxe Lift & Sculpt', nameMn: 'Делюкс чангалгаа', descEn: 'Signature facial + neck & décolleté + finishing mask.', descMn: 'Сигнатур эмчилгээ + хүзүү, эгэмний хэсэг + маск.', minutes: 75, price: 130000, emoji: '👑', active: true },
      { id: 'svc-body-neck', group: 'body', nameEn: 'Back, Neck & Shoulder Release', nameMn: 'Нуруу, хүзүү, мөрний гуаша', descEn: 'Releases tension and knots in the upper back, neck and shoulders.', descMn: 'Нуруу, хүзүү, мөрний чангаралт, булчингийн зангиралтыг тавиулна.', minutes: 45, price: 70000, emoji: '💆', active: true },
      { id: 'svc-body-thera', group: 'body', nameEn: 'Therapeutic Body Gua Sha', nameMn: 'Биеийн гуаша эмчилгээ', descEn: 'Targeted body work to boost circulation and ease muscle pain.', descMn: 'Цусны эргэлтийг сайжруулж, булчингийн өвдөлтийг намдаана.', minutes: 60, price: 95000, emoji: '🌀', active: true },
      { id: 'svc-body-full', group: 'body', nameEn: 'Full Body Renewal', nameMn: 'Бүтэн биеийн гуаша', descEn: 'Head-to-toe gua sha ritual for deep relaxation and recovery.', descMn: 'Бүх биеийн иж бүрэн гуаша — гүн амралт, сэргэлт.', minutes: 90, price: 140000, emoji: '🌙', active: true },
      { id: 'svc-course-5', group: 'package', nameEn: 'Facial Course — 5 sessions', nameMn: 'Нүүрний курс — 5 удаа', descEn: '5 signature facials. Best results come with a course (save 50,000₮).', descMn: 'Сигнатур эмчилгээ 5 удаа. Курс эмчилгээ хамгийн үр дүнтэй (50,000₮ хэмнэнэ).', minutes: 60, price: 400000, emoji: '🎁', active: true }
    ],
    users: [demo],
    sessions: {},
    adminSessions: {},
    bookings: [],
    transactions: [],
    invoices: [],
    photos: []
  };
}

function loadDb() {
  fs.mkdirSync(DATA, { recursive: true });
  fs.mkdirSync(PHOTOS_DIR, { recursive: true });
  if (fs.existsSync(DB_FILE)) {
    try {
      db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      // make sure all collections exist (forward compatibility)
      const seed = seedDb();
      for (const k of Object.keys(seed)) if (db[k] === undefined) db[k] = seed[k];
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
const uid = (p) => p + '-' + crypto.randomBytes(8).toString('hex');
const nowIso = () => new Date().toISOString();

function makeUser(name, phone, password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 32).toString('hex');
  return { id: uid('u'), name, phone, salt, hash, balance: 0, createdAt: nowIso() };
}
function checkPassword(user, password) {
  try {
    const hash = crypto.scryptSync(password, user.salt, 32).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(user.hash, 'hex'));
  } catch (e) { return false; }
}
function publicUser(u) {
  return { id: u.id, name: u.name, phone: u.phone, balance: u.balance, createdAt: u.createdAt, isDemo: !!u.isDemo };
}

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
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
  return !!(t && db.adminSessions[t]);
}
function newSession(map, payload) {
  const t = crypto.randomBytes(24).toString('hex');
  map[t] = { ...payload, createdAt: nowIso() };
  return t;
}

const PHONE_RE = /^\d{8}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

function localDateStr(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function slotTimes() {
  const [oh, om] = config.hoursOpen.split(':').map(Number);
  const [ch, cm] = config.hoursClose.split(':').map(Number);
  const out = [];
  let t = oh * 60 + (om || 0);
  const end = ch * 60 + (cm || 0);
  while (t + config.slotMinutes <= end) {
    out.push(String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'));
    t += config.slotMinutes;
  }
  return out;
}
function bookingDateTime(b) { return new Date(b.date + 'T' + b.time + ':00'); }

function addTransaction(userId, type, method, amount, note, status) {
  const tx = { id: uid('tx'), userId, type, method, amount, note: note || '', status: status || 'paid', createdAt: nowIso() };
  db.transactions.push(tx);
  return tx;
}

/* ---------------- QPay integration (real mode) ----------------
 * Docs: https://developer.qpay.mn  (sandbox: https://merchant-sandbox.qpay.mn, production: https://merchant.qpay.mn)
 * Flow: 1) POST /v2/auth/token with Basic auth (merchant username/password) -> access_token
 *       2) POST /v2/invoice {invoice_code, sender_invoice_no, amount, callback_url, ...} -> {invoice_id, qr_text, qr_image, urls}
 *       3) Customer scans QR in any Mongolian bank app / QPay app and pays.
 *       4) QPay calls our callback_url -> we verify with POST /v2/payment/check {object_type:'INVOICE', object_id}
 * Set config.json: paymentsDemo=false + qpay credentials to activate. Demo mode never touches the network.
 */
let qpayToken = null, qpayTokenExp = 0;
async function qpayAuth() {
  const { baseUrl, username, password } = config.qpay;
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
  const r = await fetch(config.qpay.baseUrl + '/v2/invoice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t },
    body: JSON.stringify({
      invoice_code: config.qpay.invoiceCode,
      sender_invoice_no: inv.id,
      invoice_receiver_code: 'terminal',
      invoice_description: "B's Guasha wallet top-up " + inv.amount + 'MNT',
      amount: inv.amount,
      callback_url: (config.qpay.callbackBaseUrl || '') + '/api/payments/qpay/callback?invoice=' + inv.id
    })
  });
  if (!r.ok) throw new Error('qpay_invoice_failed');
  return r.json(); // { invoice_id, qr_text, qr_image, urls, ... }
}
async function qpayCheckPaid(qpayInvoiceId) {
  const t = await qpayAuth();
  const r = await fetch(config.qpay.baseUrl + '/v2/payment/check', {
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

  /* ----- public ----- */
  if (route === 'GET /api/health') return json(res, 200, { ok: true, time: nowIso(), demo: config.paymentsDemo });

  if (route === 'GET /api/config') {
    return json(res, 200, {
      salonName: config.salonName, phoneDisplay: config.phoneDisplay, phoneTel: config.phoneTel,
      addressEn: config.addressEn, addressMn: config.addressMn,
      facebook: config.facebook, instagram: config.instagram,
      hoursOpen: config.hoursOpen, hoursClose: config.hoursClose,
      slotMinutes: config.slotMinutes, bookingDaysAhead: config.bookingDaysAhead,
      cancelHours: config.cancelHours, paymentsDemo: config.paymentsDemo,
      topupBonusThreshold: config.topupBonusThreshold, topupBonusPercent: config.topupBonusPercent
    });
  }

  if (route === 'GET /api/services') return json(res, 200, db.services.filter((s) => s.active));

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

  /* ----- everything below needs a user (or admin where noted) ----- */
  const user = authUser(req, q);

  if (route === 'GET /api/me') {
    if (!user) return fail(res, 401, 'unauthorized');
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
    const max = localDateStr(new Date(Date.now() + config.bookingDaysAhead * 86400000));
    if (date < today || date > max) return fail(res, 400, 'date_out_of_range');
    const d = new Date(date + 'T12:00:00');
    if (config.closedWeekdays.includes(d.getDay())) return json(res, 200, { date, closed: true, slots: [] });
    const taken = new Set(db.bookings.filter((b) => b.date === date && (b.status === 'confirmed' || b.status === 'done')).map((b) => b.time));
    const now = new Date();
    const slots = slotTimes().map((time) => {
      let available = !taken.has(time);
      if (available && date === today) {
        const dt = new Date(date + 'T' + time + ':00');
        if (dt.getTime() - now.getTime() < 60 * 60 * 1000) available = false; // need 1h notice
      }
      return { time, available };
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
    const max = localDateStr(new Date(Date.now() + config.bookingDaysAhead * 86400000));
    if (b.date < today || b.date > max) return fail(res, 400, 'date_out_of_range');
    const dt = new Date(b.date + 'T' + b.time + ':00');
    if (dt.getTime() - Date.now() < 60 * 60 * 1000) return fail(res, 400, 'too_soon');
    const clash = db.bookings.some((x) => x.date === b.date && x.time === b.time && (x.status === 'confirmed' || x.status === 'done'));
    if (clash) return fail(res, 409, 'slot_taken');
    const payWith = b.payWith === 'balance' ? 'balance' : 'salon';
    if (payWith === 'balance') {
      if (user.balance < svc.price) return fail(res, 400, 'insufficient_balance');
      user.balance -= svc.price;
      addTransaction(user.id, 'payment', 'balance', -svc.price, svc.nameEn);
    }
    const booking = {
      id: uid('bk'), userId: user.id, serviceId: svc.id, date: b.date, time: b.time,
      status: 'confirmed', paid: payWith === 'balance' ? 'balance' : 'salon',
      amount: svc.price, createdAt: nowIso()
    };
    db.bookings.push(booking);
    saveDb();
    return json(res, 200, { booking, balance: user.balance });
  }

  if (route === 'GET /api/bookings') {
    if (!user) return fail(res, 401, 'unauthorized');
    const list = db.bookings
      .filter((b) => b.userId === user.id)
      .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))
      .map((b) => ({ ...b, service: db.services.find((s) => s.id === b.serviceId) || null }));
    return json(res, 200, list);
  }

  let m = pathname.match(/^\/api\/bookings\/([\w-]+)\/cancel$/);
  if (m && method === 'POST') {
    if (!user) return fail(res, 401, 'unauthorized');
    const booking = db.bookings.find((b) => b.id === m[1] && b.userId === user.id);
    if (!booking) return fail(res, 404, 'not_found');
    if (booking.status !== 'confirmed') return fail(res, 400, 'bad_request');
    const hoursLeft = (bookingDateTime(booking).getTime() - Date.now()) / 3600000;
    if (hoursLeft < config.cancelHours) return fail(res, 400, 'too_late_cancel');
    booking.status = 'cancelled';
    booking.cancelledAt = nowIso();
    if (booking.paid === 'balance') {
      user.balance += booking.amount;
      addTransaction(user.id, 'refund', 'balance', booking.amount, 'booking cancelled');
      booking.paid = 'refunded';
    }
    saveDb();
    return json(res, 200, { ok: true, balance: user.balance });
  }

  /* ----- wallet ----- */
  if (route === 'POST /api/topup') {
    if (!user) return fail(res, 401, 'unauthorized');
    const b = await readJson(req);
    const amount = Math.round(Number(b.amount));
    if (!Number.isFinite(amount) || amount < 5000 || amount > 5000000) return fail(res, 400, 'bad_amount');
    const method2 = ['qpay'].includes(b.method) ? b.method : 'qpay';
    const bonus = amount >= config.topupBonusThreshold ? Math.floor((amount * config.topupBonusPercent) / 100) : 0;
    const inv = { id: uid('inv'), userId: user.id, amount, bonus, method: method2, status: 'pending', createdAt: nowIso() };
    if (config.paymentsDemo) {
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
    return json(res, 200, { invoiceId: inv.id, qrText: inv.qrText, amount, bonus, demo: config.paymentsDemo });
  }

  m = pathname.match(/^\/api\/topup\/([\w-]+)$/);
  if (m && method === 'GET') {
    if (!user) return fail(res, 401, 'unauthorized');
    const inv = db.invoices.find((i) => i.id === m[1] && i.userId === user.id);
    if (!inv) return fail(res, 404, 'not_found');
    // In real mode, poll QPay as a fallback in case the callback was missed:
    if (!config.paymentsDemo && inv.status === 'pending' && inv.qpayInvoiceId) {
      try { if (await qpayCheckPaid(inv.qpayInvoiceId)) creditInvoice(inv); } catch (e) {}
    }
    return json(res, 200, { status: inv.status, balance: user.balance });
  }

  m = pathname.match(/^\/api\/topup\/([\w-]+)\/confirm-demo$/);
  if (m && method === 'POST') {
    if (!user) return fail(res, 401, 'unauthorized');
    if (!config.paymentsDemo) return fail(res, 400, 'not_demo_mode');
    const inv = db.invoices.find((i) => i.id === m[1] && i.userId === user.id);
    if (!inv) return fail(res, 404, 'not_found');
    if (inv.status !== 'pending') return fail(res, 400, 'bad_request');
    creditInvoice(inv);
    return json(res, 200, { ok: true, balance: user.balance });
  }

  // QPay server-to-server callback (real mode). QPay calls this URL after the customer pays.
  if (pathname === '/api/payments/qpay/callback' && (method === 'GET' || method === 'POST')) {
    const invId = q.get('invoice');
    const inv = db.invoices.find((i) => i.id === invId);
    if (inv && inv.status === 'pending' && !config.paymentsDemo && inv.qpayInvoiceId) {
      try { if (await qpayCheckPaid(inv.qpayInvoiceId)) creditInvoice(inv); } catch (e) {}
    }
    return json(res, 200, { ok: true });
  }

  if (route === 'GET /api/transactions') {
    if (!user) return fail(res, 401, 'unauthorized');
    const list = db.transactions.filter((t) => t.userId === user.id).slice().reverse();
    return json(res, 200, list);
  }

  /* ----- progress photos ----- */
  if (route === 'POST /api/photos') {
    if (!user) return fail(res, 401, 'unauthorized');
    const b = await readJson(req);
    const dataUrl = String(b.image || '');
    const mm = dataUrl.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
    if (!mm) return fail(res, 400, 'bad_image');
    const buf = Buffer.from(mm[2], 'base64');
    if (buf.length < 100 || buf.length > 8 * 1024 * 1024) return fail(res, 400, 'bad_image');
    const photo = { id: uid('ph'), userId: user.id, ext: mm[1] === 'png' ? 'png' : (mm[1] === 'webp' ? 'webp' : 'jpg'), note: String(b.note || '').slice(0, 200), createdAt: nowIso() };
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

  /* ----- admin ----- */
  if (route === 'POST /api/admin/login') {
    if (Date.now() < pinFails.until) return fail(res, 429, 'try_later');
    const b = await readJson(req);
    if (String(b.pin || '') !== String(config.adminPin)) {
      pinFails.count++;
      if (pinFails.count >= 5) { pinFails.until = Date.now() + 5 * 60 * 1000; pinFails.count = 0; }
      return fail(res, 401, 'bad_pin');
    }
    pinFails.count = 0;
    const token = newSession(db.adminSessions, { admin: true });
    saveDb();
    return json(res, 200, { token });
  }

  if (pathname.startsWith('/api/admin/') && pathname !== '/api/admin/login') {
    if (!authAdmin(req, q)) return fail(res, 401, 'unauthorized');

    if (route === 'GET /api/admin/overview') {
      const today = localDateStr(new Date());
      const withInfo = (b) => ({
        ...b,
        service: db.services.find((s) => s.id === b.serviceId) || null,
        user: publicUser(db.users.find((u) => u.id === b.userId) || { id: '', name: '?', phone: '', balance: 0, createdAt: '' })
      });
      const upcoming = db.bookings
        .filter((b) => b.status === 'confirmed' && b.date >= today)
        .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
        .map(withInfo);
      const past = db.bookings
        .filter((b) => !(b.status === 'confirmed' && b.date >= today))
        .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))
        .slice(0, 50)
        .map(withInfo);
      const paidTx = db.transactions.filter((t) => t.type === 'topup');
      return json(res, 200, {
        today,
        upcoming,
        past,
        stats: {
          users: db.users.length,
          bookingsTotal: db.bookings.length,
          topupTotal: paidTx.reduce((s, t) => s + t.amount, 0),
          balancesTotal: db.users.reduce((s, u) => s + u.balance, 0)
        }
      });
    }

    m = pathname.match(/^\/api\/admin\/bookings\/([\w-]+)\/status$/);
    if (m && method === 'POST') {
      const b = await readJson(req);
      const booking = db.bookings.find((x) => x.id === m[1]);
      if (!booking) return fail(res, 404, 'not_found');
      const allowed = ['confirmed', 'done', 'noshow', 'cancelled'];
      if (!allowed.includes(b.status)) return fail(res, 400, 'bad_request');
      if (b.status === 'cancelled' && booking.status !== 'cancelled' && booking.paid === 'balance') {
        const u = db.users.find((x) => x.id === booking.userId);
        if (u) { u.balance += booking.amount; addTransaction(u.id, 'refund', 'balance', booking.amount, 'cancelled by salon'); booking.paid = 'refunded'; }
      }
      booking.status = b.status;
      saveDb();
      return json(res, 200, { ok: true, booking });
    }

    if (route === 'GET /api/admin/users') {
      return json(res, 200, db.users.map((u) => ({
        ...publicUser(u),
        bookings: db.bookings.filter((b) => b.userId === u.id).length,
        lastBooking: (db.bookings.filter((b) => b.userId === u.id).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))[0] || {}).date || ''
      })));
    }

    if (route === 'GET /api/admin/transactions') {
      return json(res, 200, db.transactions.slice().reverse().slice(0, 200).map((t) => ({
        ...t, userName: (db.users.find((u) => u.id === t.userId) || {}).name || '?'
      })));
    }

    if (route === 'GET /api/admin/services') return json(res, 200, db.services);

    m = pathname.match(/^\/api\/admin\/services\/([\w-]+)$/);
    if (m && method === 'POST') {
      const b = await readJson(req);
      const svc = db.services.find((s) => s.id === m[1]);
      if (!svc) return fail(res, 404, 'not_found');
      if (b.price !== undefined) {
        const p = Math.round(Number(b.price));
        if (!Number.isFinite(p) || p < 0 || p > 100000000) return fail(res, 400, 'bad_request');
        svc.price = p;
      }
      if (b.active !== undefined) svc.active = !!b.active;
      if (typeof b.nameEn === 'string' && b.nameEn.trim()) svc.nameEn = b.nameEn.trim().slice(0, 80);
      if (typeof b.nameMn === 'string' && b.nameMn.trim()) svc.nameMn = b.nameMn.trim().slice(0, 80);
      saveDb();
      return json(res, 200, svc);
    }

    if (route === 'GET /api/admin/export') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': 'attachment; filename="bs-guasha-backup.json"' });
      return res.end(JSON.stringify(db, null, 1));
    }
  }

  return fail(res, 404, 'not_found');
}

function photoOut(p) {
  return { id: p.id, note: p.note, createdAt: p.createdAt, url: '/api/photos/' + p.id + '/file' };
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
      return res.end('<meta charset="utf-8"><body style="font-family:sans-serif;text-align:center;padding-top:10vh"><h2>404</h2><p>Хуудас олдсонгүй · Page not found</p><a href="/">B\'s Guasha</a></body>');
    }
    const ext = path.extname(full).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'no-cache'
    });
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
  console.log("  B's Guasha is running!");
  console.log('  ----------------------------------------');
  console.log('  Website : http://localhost:' + PORT + '/');
  console.log('  App     : http://localhost:' + PORT + '/app');
  console.log('  Admin   : http://localhost:' + PORT + '/admin   (PIN: ' + config.adminPin + ')');
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        console.log('  Phone   : http://' + net.address + ':' + PORT + '/app   (same Wi-Fi)');
      }
    }
  }
  console.log('  ----------------------------------------');
  console.log('  Demo login: phone 99000000 / password demo123');
  console.log('  Payments are in DEMO mode (no real money). See docs/PAYMENTS-QPAY.md');
  console.log('');
});
