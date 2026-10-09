/* B's Gua Sha — website chat: one saved conversation per visitor.
 *
 * The chat bubble on the website used to be one question in, one answer out. Now each
 * visitor has a conversation stored in db.webchats: the AI answers automatically (through
 * assistant.answer(), so the same knowledge whitelist, spending cap and rate limits apply),
 * and staff can open the conversation in Админ → Чат and reply themselves.
 *
 * Staff and AI never talk over each other:
 *  - a staff reply pauses the AI in that conversation for AI_PAUSE_MS (sliding), and staff
 *    can pause it before typing ("I'll answer") or hand back early;
 *  - an AI reply that comes back after a staff member answered the same question is dropped;
 *  - the AI sees staff messages as notes from a person, and the visitor sees who wrote what.
 *
 * Visitors are anonymous: the browser keeps a random token (localStorage) and the server
 * stores only its SHA-256, so the db alone can't be used to read someone's conversation.
 * Storage is bounded: old conversations expire, long ones are trimmed, and the total text
 * kept has a ceiling (oldest conversations go first).
 */
'use strict';

const crypto = require('crypto');

const AI_PAUSE_MS = 2 * 3600000;          /* a staff reply keeps the AI quiet this long */
const RETENTION_DAYS = 90;                /* conversations idle this long are deleted */
const MAX_MESSAGES = 200;                 /* per conversation; older ones are dropped */
const MAX_TOTAL_CHARS = 2000000;          /* all conversations together (~4 MB in db.json) */
const MAX_CONVERSATIONS = 2000;
const STAFF_TEXT_MAX = 1000;
const POLL_PER_IP_PER_HOUR = 900;         /* the open widget checks every 8 s */
const NOTIFY_EVERY_MS = 30 * 60000;       /* "a visitor is waiting" ping, per conversation */
const NOTIFY_MAX_PER_HOUR = 10;           /* … and overall */
const TOKEN_RE = /^[a-f0-9]{64}$/;

function createWebchat(deps) {
  const { getDb, saveDb, assistant, json, fail, authUser, firstName } = deps;
  const now = deps.now || Date.now;
  const log = deps.log || console;
  const pollLimit = assistant.createLimiter(POLL_PER_IP_PER_HOUR, 3600000);
  const notifyLimit = assistant.createLimiter(NOTIFY_MAX_PER_HOUR, 3600000);

  function list() {
    const db = getDb();
    if (!Array.isArray(db.webchats)) db.webchats = [];
    return db.webchats;
  }
  function iso(ms) { return new Date(ms).toISOString(); }
  function newId(p) { return p + '-' + crypto.randomBytes(8).toString('hex'); }
  function hash(token) { return crypto.createHash('sha256').update(token).digest('hex'); }
  function byToken(token) {
    if (!TOKEN_RE.test(String(token || ''))) return null;
    const h = hash(token);
    return list().find((c) => c.tokenHash === h) || null;
  }
  function byId(id) { return list().find((c) => c.id === id) || null; }
  function aiPaused(c) { return !!(c.aiPausedUntil && Date.parse(c.aiPausedUntil) > now()); }

  /* ---------- storage limits ---------- */
  function chars(c) { return c.messages.reduce((n, m) => n + String(m.text || '').length, 0); }
  function prune() {
    const db = getDb();
    const cutoff = now() - RETENTION_DAYS * 86400000;
    let all = list().filter((c) => Date.parse(c.lastAt) >= cutoff);
    for (const c of all) if (c.messages.length > MAX_MESSAGES) c.messages = c.messages.slice(-MAX_MESSAGES);
    all.sort((a, b) => Date.parse(b.lastAt) - Date.parse(a.lastAt)); /* newest first */
    let total = 0;
    const keep = [];
    for (const c of all) {
      const n = chars(c);
      if (keep.length && (keep.length >= MAX_CONVERSATIONS || total + n > MAX_TOTAL_CHARS)) continue;
      keep.push(c); total += n;
    }
    if (keep.length !== db.webchats.length) log.log('webchat: removed ' + (db.webchats.length - keep.length) + ' old conversation(s)');
    db.webchats = keep;
  }

  /* ---------- shapes sent out ---------- */
  /* visitor view: who wrote it (AI, a named staff member, the visitor), never ids of staff accounts */
  function msgOut(m) {
    const o = { id: m.id, from: m.from, text: m.text, at: m.at };
    if (m.from === 'staff') o.name = m.name || '';
    if (m.from === 'visitor' && m.ai && m.ai !== 'answered') o.ai = m.ai;
    return o;
  }
  function convOut(c, afterId) {
    let msgs = c.messages;
    if (afterId) {
      const i = msgs.findIndex((m) => m.id === afterId);
      msgs = i >= 0 ? msgs.slice(i + 1) : msgs;
    }
    return { messages: msgs.map(msgOut), aiPaused: aiPaused(c) };
  }

  /* ---------- "a visitor is waiting for a person" ---------- */
  function notifyStaff(c) {
    if (!assistant.telegramConfigured()) return;
    if (c.notifiedAt && now() - Date.parse(c.notifiedAt) < NOTIFY_EVERY_MS) return;
    if (!notifyLimit.take('all')) return;
    c.notifiedAt = iso(now());
    /* no message text: the alert only says where to look */
    assistant.sendTelegram("B's Gua Sha: вэбсайтын чатад үйлчлүүлэгч хариу хүлээж байна — Админ → 💬 Чат. / A website visitor is waiting for a reply.").catch(() => {});
  }

  /* ---------- public: the visitor ---------- */
  function tokenOf(req) { return String(req.headers['x-chat-token'] || '').trim(); }

  /* POST /api/assistant  { message }   header X-Chat-Token (absent → a new conversation) */
  async function handlePost(req, res, ip) {
    const s = assistant.settings();
    if (!s.enabled) return fail(res, 403, 'assistant_off');
    if (!assistant.isJson(req)) return fail(res, 415, 'json_only');
    const rl = assistant.rateLimit(ip, s);
    if (rl) return fail(res, 429, rl);
    let body;
    try { body = await assistant.readSmallJson(req); } catch (e) {
      if (e.message === 'too_large') return fail(res, 413, 'too_large');
      if (e.message === 'slow_body') return;
      return fail(res, 400, 'bad_json');
    }
    /* history comes from the stored conversation now; the browser sends only its message */
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((k) => k !== 'message')) return fail(res, 400, 'bad_request');
    const v = assistant.validate({ message: body.message }, s);
    if (v.error) return fail(res, 400, v.error);

    let c = byToken(tokenOf(req));
    let token = null;
    if (!c) {
      token = crypto.randomBytes(32).toString('hex');
      c = { id: newId('wc'), tokenHash: hash(token), createdAt: iso(now()), lastAt: iso(now()), userId: null, aiPausedUntil: null, staffReadAt: null, notifiedAt: null, messages: [] };
      list().push(c);
      prune();
    }
    const user = authUser ? authUser(req) : null;
    if (user) c.userId = user.id; /* a signed-in customer: staff see who it is */
    const vm = { id: newId('wm'), from: 'visitor', text: v.message, at: iso(now()), ai: 'pending' };
    c.messages.push(vm);
    c.lastAt = vm.at;
    if (c.messages.length > MAX_MESSAGES) c.messages = c.messages.slice(-MAX_MESSAGES);

    if (aiPaused(c)) {
      vm.ai = 'paused';
      notifyStaff(c);
      saveDb();
      return json(res, 200, { ...(token ? { token } : {}), ...convOut(c, prevId(c, vm)) });
    }
    saveDb();

    /* the model sees the stored conversation before this message (last historyTurns turns) */
    const history = [];
    for (const m of c.messages.slice(0, -1)) {
      if (m.from === 'visitor') history.push({ role: 'user', content: m.text });
      else if (m.from === 'ai') history.push({ role: 'assistant', content: m.text });
      else if (m.from === 'staff') history.push({ role: 'staff', content: m.text, name: m.name });
    }
    const out = await assistant.answer({ message: v.message, history: s.historyTurns > 0 ? history.slice(-s.historyTurns) : [] });

    /* the conversation may have changed (or gone) while the model was thinking */
    c = byId(c.id);
    if (!c) return json(res, 200, { ...(token ? { token } : {}), messages: [], aiPaused: false });
    const at = c.messages.findIndex((m) => m.id === vm.id);
    const staffSince = at >= 0 && c.messages.slice(at + 1).some((m) => m.from === 'staff');
    const vmNow = at >= 0 ? c.messages[at] : null;
    if (vmNow) {
      if (staffSince) vmNow.ai = 'superseded';                    /* a person answered meanwhile: drop the AI reply */
      else if (aiPaused(c)) vmNow.ai = 'paused';                  /* staff took over meanwhile: they will answer */
      else if (out.fallback) { vmNow.ai = out.reason || 'error'; notifyStaff(c); }
      else {
        vmNow.ai = 'answered';
        const am = { id: newId('wm'), from: 'ai', text: out.reply, at: iso(now()), replyTo: vm.id };
        c.messages.splice(at + 1, 0, am);
        c.lastAt = am.at;
      }
    }
    saveDb();
    return json(res, 200, { ...(token ? { token } : {}), ...convOut(c, prevId(c, vm)) });
  }
  function prevId(c, m) {
    const i = c.messages.findIndex((x) => x.id === m.id);
    return i > 0 ? c.messages[i - 1].id : null;
  }

  /* GET /api/assistant/conversation?after=<message id>   header X-Chat-Token */
  function handleGet(req, res, ip, q) {
    const s = assistant.settings();
    if (!s.enabled) return fail(res, 403, 'assistant_off');
    if (!pollLimit.take(ip)) return fail(res, 429, 'rate_limited');
    const c = byToken(tokenOf(req));
    if (!c) return fail(res, 404, 'no_conversation');
    const after = String((q && q.get('after')) || '');
    return json(res, 200, convOut(c, /^wm-[a-f0-9]{16}$/.test(after) ? after : null));
  }

  /* ---------- staff (owner, super admin, staff) ---------- */
  function who(c) {
    if (!c.userId) return null;
    const u = getDb().users.find((x) => x.id === c.userId);
    return u ? { name: u.name, phone: u.phone } : null;
  }
  function unread(c) {
    const since = c.staffReadAt ? Date.parse(c.staffReadAt) : 0;
    return c.messages.filter((m) => m.from === 'visitor' && Date.parse(m.at) > since).length;
  }
  /* waiting = the visitor's last message has no answer from the AI or a person yet */
  function waiting(c) {
    const last = c.messages[c.messages.length - 1];
    return !!(last && last.from === 'visitor' && last.ai !== 'pending');
  }
  function threads() {
    return list().slice().sort((a, b) => Date.parse(b.lastAt) - Date.parse(a.lastAt)).map((c) => {
      const last = c.messages[c.messages.length - 1];
      return {
        id: c.id, createdAt: c.createdAt, lastAt: c.lastAt, user: who(c),
        lastText: last ? String(last.text).slice(0, 80) : '', lastFrom: last ? last.from : '',
        unread: unread(c), waiting: waiting(c), aiPaused: aiPaused(c), count: c.messages.length
      };
    });
  }
  function staffMsgOut(m) {
    const o = { id: m.id, from: m.from, text: m.text, at: m.at };
    if (m.from === 'staff') o.name = m.name || '';
    if (m.from === 'visitor') o.ai = m.ai || null;
    return o;
  }
  function unreadThreads() { return list().filter((c) => unread(c) > 0).length; }

  async function handleAdmin(route, pathname, req, res, sess, isOwner, readJson) {
    if (route === 'GET /api/admin/webchats') return json(res, 200, threads());
    const m = pathname.match(/^\/api\/admin\/webchats\/(wc-[a-f0-9]{16})(\/(reply|ai|delete))?$/);
    if (!m) return fail(res, 404, 'not_found');
    const c = byId(m[1]);
    if (!c) return fail(res, 404, 'not_found');
    const action = m[3] || '';
    if (req.method === 'GET' && !action) {
      c.staffReadAt = iso(now());
      saveDb();
      return json(res, 200, { id: c.id, createdAt: c.createdAt, user: who(c), aiPaused: aiPaused(c), aiPausedUntil: aiPaused(c) ? c.aiPausedUntil : null, messages: c.messages.map(staffMsgOut) });
    }
    if (req.method !== 'POST') return fail(res, 404, 'not_found');
    const b = await readJson(req);
    if (action === 'reply') {
      const text = String((b && b.text) || '').trim();
      if (!text || text.length > STAFF_TEXT_MAX) return fail(res, 400, 'bad_request');
      const sender = sess.userId ? getDb().users.find((u) => u.id === sess.userId) : null;
      const name = sender && sess.role !== 'superadmin' ? firstName(sender.name) : "B's Gua Sha";
      const sm = { id: newId('wm'), from: 'staff', text, at: iso(now()), name, staffUserId: sess.userId || null };
      c.messages.push(sm);
      if (c.messages.length > MAX_MESSAGES) c.messages = c.messages.slice(-MAX_MESSAGES);
      c.lastAt = sm.at;
      c.staffReadAt = sm.at;
      c.aiPausedUntil = iso(now() + AI_PAUSE_MS);
      saveDb();
      return json(res, 200, { ok: true, aiPausedUntil: c.aiPausedUntil });
    }
    if (action === 'ai') {
      /* { paused: true } = "I'll answer" before typing; { paused: false } = hand back to the AI */
      if (!b || typeof b.paused !== 'boolean') return fail(res, 400, 'bad_request');
      c.aiPausedUntil = b.paused ? iso(now() + AI_PAUSE_MS) : null;
      saveDb();
      return json(res, 200, { ok: true, aiPaused: aiPaused(c), aiPausedUntil: aiPaused(c) ? c.aiPausedUntil : null });
    }
    if (action === 'delete') {
      if (!isOwner) return fail(res, 403, 'owner_only');
      const db = getDb();
      db.webchats = list().filter((x) => x.id !== c.id);
      saveDb();
      return json(res, 200, { ok: true });
    }
    return fail(res, 404, 'not_found');
  }

  return { handlePost, handleGet, handleAdmin, threads, unreadThreads, prune, byToken, AI_PAUSE_MS };
}

module.exports = { createWebchat, AI_PAUSE_MS, RETENTION_DAYS, MAX_MESSAGES, MAX_TOTAL_CHARS };
