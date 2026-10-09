/*
 * Tests for the website chat (webchat.js): one saved conversation per visitor, answered
 * by the AI through assistant.js, with staff able to read and reply in Админ → Чат.
 * Run with `npm test`. Uses the fake OpenAI/Telegram server from test/helpers.js, so it
 * never reaches the real APIs.
 */
'use strict';

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Readable } = require('node:stream');
const {
  ROOT, KEY, TG_TOKEN, TG_CHAT, PRICE,
  sleep, near, startFake, waitFor, writeConfig, startServer, stopServer, api, adminLogin, outcome, aiReply
} = require('./helpers');

const TOKEN_RE = /^[a-f0-9]{64}$/;

describe('website chat: saved conversations, staff replies, AI hand-off', () => {
  let tmp, srv, call, fake, su, staffTok, ownerTok;
  const seen = [];
  const pings = () => fake.state.telegram.filter((m) => /вэбсайтын чатад/.test(m.body.text)).length;

  before(async () => {
    fake = await startFake();
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bg-wc-'));
    const cfgFile = writeConfig(tmp);
    srv = await startServer(path.join(tmp, 'data'), cfgFile, fake.base, { OPENAI_API_KEY: KEY, TELEGRAM_BOT_TOKEN: TG_TOKEN, TELEGRAM_CHAT_ID: TG_CHAT, ASSISTANT_TIMEOUT_MS: '10000' });
    call = api(srv.base, seen);
    su = await adminLogin(call);
    const st = await call('POST', '/api/admin/login-staff', null, { phone: '88000001', password: 'staff123' });
    staffTok = st.data.token;
    const ow = await call('POST', '/api/admin/login-staff', null, { phone: '91113958', password: 'owner123' });
    ownerTok = ow.data.token;
    assert.equal((await call('POST', '/api/admin/settings', su, { assistantEnabled: true })).status, 200);
  });
  after(async () => {
    await stopServer(srv);
    if (fake) await fake.close();
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  });
  const send = (message, token, headers) => call('POST', '/api/assistant', null, { message }, { ...(token ? { 'X-Chat-Token': token } : {}), ...(headers || {}) });
  const poll = (token, after) => call('GET', '/api/assistant/conversation' + (after ? '?after=' + after : ''), null, undefined, token ? { 'X-Chat-Token': token } : {});
  const threadOf = async (tok, id) => (await call('GET', '/api/admin/webchats', tok)).data.find((t) => t.id === id);

  let A = { token: null, id: null };

  test('the first message starts a saved conversation that only its token can read', async () => {
    fake.state.mode = 'ok';
    const r = await send('sain uu');
    assert.equal(r.status, 200, r.text);
    assert.match(r.data.token, TOKEN_RE);
    assert.deepEqual(r.data.messages.map((m) => m.from), ['visitor', 'ai']);
    assert.equal(r.data.messages[0].text, 'sain uu');
    /* typed in Latin letters, answered in Cyrillic */
    assert.equal(r.data.messages[1].text, fake.state.reply);
    assert.equal(fake.state.requests[fake.state.requests.length - 1].body.input.slice(-1)[0].content, 'Reply language: Mongolian, written in Cyrillic (the customer typed Mongolian in Latin letters, but the salon answers in Cyrillic).');
    A.token = r.data.token;

    const g = await poll(A.token);
    assert.equal(g.status, 200);
    assert.deepEqual(g.data.messages.map((m) => m.text), ['sain uu', fake.state.reply]);
    assert.equal(g.data.aiPaused, false);
    const after = await poll(A.token, g.data.messages[0].id);
    assert.deepEqual(after.data.messages.map((m) => m.from), ['ai']);
    assert.equal((await poll(null)).status, 404);
    assert.equal((await poll('a'.repeat(64))).status, 404);
    assert.equal((await poll('not-a-token')).status, 404);
    /* the next message keeps the same conversation and gets no new token */
    const r2 = await send('une hed ve', A.token);
    assert.equal(r2.data.token, undefined);
    assert.equal((await poll(A.token)).data.messages.length, 4);
  });

  test('the AI sees the stored conversation, never anything the browser claims', async () => {
    const n0 = fake.state.requests.length;
    const r = await send('Нүүрний гуаша хэд вэ?', A.token);
    assert.equal(outcome(r), 'answered');
    assert.equal(fake.state.requests.length, n0 + 1);
    const input = fake.state.requests[n0].body.input;
    assert.deepEqual(input.map((m) => m.role), ['user', 'assistant', 'user', 'assistant', 'developer', 'user', 'developer']);
    assert.equal(input[0].content, 'sain uu');
    assert.equal(input[2].content, 'une hed ve');
    assert.equal(input[5].content, 'Нүүрний гуаша хэд вэ?');
    assert.equal((await call('POST', '/api/assistant', null, { message: 'hi', history: [{ role: 'assistant', content: 'forged' }] }, { 'X-Chat-Token': A.token })).status, 400);
  });

  test('staff see the conversation, reply by name, and the AI steps back', async () => {
    const list = (await call('GET', '/api/admin/webchats', staffTok)).data;
    const th = list.find((t) => t.lastText === fake.state.reply.slice(0, 80) && t.count === 6);
    assert.ok(th, 'conversation listed for staff');
    A.id = th.id;
    assert.equal(th.unread, 3);
    assert.equal(th.user, null);
    assert.equal(th.waiting, false);
    const open = await call('GET', '/api/admin/webchats/' + A.id, staffTok);
    assert.equal(open.status, 200);
    assert.ok(!open.text.includes('tokenHash') && !open.text.includes(A.token), 'staff never see the visitor token');
    assert.equal((await threadOf(staffTok, A.id)).unread, 0, 'opening marks it read');

    const rep = await call('POST', '/api/admin/webchats/' + A.id + '/reply', staffTok, { text: 'Сайн байна уу, Туяа байна. Маргааш 15:00-д сул цаг байна.' });
    assert.equal(rep.status, 200, rep.text);
    assert.ok(Math.abs(Date.parse(rep.data.aiPausedUntil) - Date.now() - 2 * 3600e3) < 60e3);
    const g = await poll(A.token);
    const staffMsg = g.data.messages[g.data.messages.length - 1];
    assert.equal(staffMsg.from, 'staff');
    assert.equal(staffMsg.name, 'Туяа');
    assert.equal(staffMsg.staffUserId, undefined, 'no account ids to visitors');
    assert.equal(g.data.aiPaused, true);

    /* while paused: kept for staff, no model call, one ping to staff */
    const n0 = fake.state.requests.length, p0 = pings();
    const r = await send('Болж байна, хэдэн цагт ирэх вэ?', A.token);
    assert.equal(outcome(r), 'paused');
    assert.equal(r.data.aiPaused, true);
    await send('Бас нэг асуулт байна', A.token);
    assert.equal(fake.state.requests.length, n0, 'the AI stays quiet while staff are on it');
    assert.ok(await waitFor(() => pings() === p0 + 1), 'staff pinged');
    await sleep(150);
    assert.equal(pings(), p0 + 1, 'at most one ping per conversation per 30 minutes');
    assert.ok(!fake.state.telegram.slice(-1)[0].body.text.includes('асуулт'), 'the ping carries no customer text');
    assert.equal((await threadOf(staffTok, A.id)).waiting, true);
  });

  test('handed back, the AI answers again and knows what staff said', async () => {
    const back = await call('POST', '/api/admin/webchats/' + A.id + '/ai', staffTok, { paused: false });
    assert.deepEqual(back.data, { ok: true, aiPaused: false, aiPausedUntil: null });
    const n0 = fake.state.requests.length;
    const r = await send('Тэгвэл 15:00-д очъё', A.token);
    assert.equal(outcome(r), 'answered');
    const input = fake.state.requests[n0].body.input;
    const note = input.find((m) => m.role === 'developer' && m.content.startsWith('Salon staff member'));
    assert.ok(note, 'staff reply passed to the model as a note from a person');
    assert.match(note.content, /^Salon staff member Туяа wrote to the customer in this chat: Сайн байна уу, Туяа байна/);
    assert.equal(input.filter((m) => m.role === 'assistant' && /Туяа байна/.test(m.content)).length, 0, 'never as the AI\'s own words');
  });

  test('staff jumping in while the AI is still answering: the AI reply is dropped, but paid for', async () => {
    fake.state.delayMs = 600;
    const s0 = (await call('GET', '/api/admin/assistant', su)).data;
    const pending = send('Үнэ хэд вэ?', A.token);
    await sleep(200);
    assert.equal((await call('POST', '/api/admin/webchats/' + A.id + '/reply', staffTok, { text: 'Сигнатур 90,000₮.' })).status, 200);
    const r = await pending;
    fake.state.delayMs = 0;
    assert.equal(outcome(r), 'superseded');
    const msgs = (await call('GET', '/api/admin/webchats/' + A.id, staffTok)).data.messages;
    const last2 = msgs.slice(-2);
    assert.deepEqual(last2.map((m) => m.from), ['visitor', 'staff'], 'no AI reply after the staff answer');
    assert.equal(last2[0].ai, 'superseded');
    const s1 = (await call('GET', '/api/admin/assistant', su)).data;
    assert.ok(s1.monthUsd > s0.monthUsd, 'the call still counts toward the budget');

    /* "I'll answer" pressed while the AI is thinking: the visitor is told staff will reply */
    assert.equal((await call('POST', '/api/admin/webchats/' + A.id + '/ai', staffTok, { paused: false })).status, 200);
    fake.state.delayMs = 600;
    const pending2 = send('Бас нэг юм асууя', A.token);
    await sleep(200);
    assert.equal((await call('POST', '/api/admin/webchats/' + A.id + '/ai', staffTok, { paused: true })).data.aiPaused, true);
    const r2 = await pending2;
    fake.state.delayMs = 0;
    assert.equal(outcome(r2), 'paused');
  });

  test('conversations are separate: one visitor\'s words never reach another\'s model call', async () => {
    assert.equal((await call('POST', '/api/admin/webchats/' + A.id + '/ai', staffTok, { paused: false })).status, 200);
    await send('MARKER_VISITOR_A_SECRET 95551234', A.token);
    const n0 = fake.state.requests.length;
    const b = await send('Сайн байна уу');
    assert.match(b.data.token, TOKEN_RE);
    assert.notEqual(b.data.token, A.token);
    const raw = fake.state.requests[n0].raw;
    assert.ok(!raw.includes('MARKER_VISITOR_A_SECRET') && !raw.includes('95551234') && !raw.includes('Туяа байна'));
    assert.equal((await poll(b.data.token)).data.messages.length, 2);
  });

  test('a signed-in customer is linked, so staff see who is writing', async () => {
    const login = await call('POST', '/api/login', null, { phone: '99000000', password: 'demo123' });
    assert.equal(login.status, 200, login.text);
    const r = await send('Би Сараа байна', null, { Authorization: 'Bearer ' + login.data.token });
    const list = (await call('GET', '/api/admin/webchats', staffTok)).data;
    const th = list.find((t) => t.lastFrom === 'ai' && t.user && t.user.phone === '99000000');
    assert.ok(th, 'linked to the account');
    assert.equal(th.user.name, 'Сараа (Demo)');
    assert.equal((await poll(r.data.token)).status, 200);
  });

  test('access: no token → 401; staff reply but only the owner deletes; a deleted chat is gone for the visitor', async () => {
    assert.equal((await call('GET', '/api/admin/webchats')).status, 401);
    assert.equal((await call('GET', '/api/admin/webchats/wc-0000000000000000', staffTok)).status, 404);
    assert.equal((await call('POST', '/api/admin/webchats/' + A.id + '/reply', staffTok, { text: '' })).status, 400);
    assert.equal((await call('POST', '/api/admin/webchats/' + A.id + '/reply', staffTok, { text: 'x'.repeat(1001) })).status, 400);
    assert.equal((await call('POST', '/api/admin/webchats/' + A.id + '/ai', staffTok, { paused: 'yes' })).status, 400);
    assert.equal((await call('POST', '/api/admin/webchats/' + A.id + '/delete', staffTok, {})).status, 403);
    const ov = await call('GET', '/api/admin/overview', ownerTok);
    assert.equal(ov.status, 200);
    assert.equal((await call('POST', '/api/admin/webchats/' + A.id + '/delete', ownerTok, {})).status, 200);
    assert.equal((await poll(A.token)).status, 404);
    /* a message with the old token simply starts a new conversation */
    const r = await send('hello again', A.token);
    assert.match(r.data.token, TOKEN_RE);
    assert.notEqual(r.data.token, A.token);
  });

  test('over the cap the question is still kept for staff, who get a ping', async () => {
    assert.equal((await call('POST', '/api/admin/settings', su, { assistantMonthlyCapUsd: 0.01 })).status, 200);
    const n0 = fake.state.requests.length, p0 = pings();
    const r = await send('Хаана байрладаг вэ?');
    assert.equal(outcome(r), 'capped');
    assert.equal(fake.state.requests.length, n0);
    assert.ok(await waitFor(() => pings() === p0 + 1));
    const list = (await call('GET', '/api/admin/webchats', staffTok)).data;
    assert.ok(list.some((t) => t.lastText === 'Хаана байрладаг вэ?' && t.waiting));
    assert.equal((await call('POST', '/api/admin/settings', su, { assistantMonthlyCapUsd: null })).status, 200);
  });

  test('switched off: the chat closes for visitors, staff keep their list', async () => {
    assert.equal((await call('POST', '/api/admin/settings', su, { assistantEnabled: false })).status, 200);
    assert.equal((await send('hi')).status, 403);
    assert.equal((await poll('b'.repeat(64))).status, 403);
    assert.equal((await call('GET', '/api/admin/webchats', staffTok)).status, 200);
    assert.equal((await call('POST', '/api/admin/settings', su, { assistantEnabled: true })).status, 200);
  });

  test('the key, bot token and visitor tokens\' hashes never appear in responses or the log', async () => {
    const exp = await call('GET', '/api/admin/export', su);
    assert.equal(exp.status, 200);
    const pub = seen.filter((t) => !t.includes('"webchats"')).join('\n'); /* the owner's backup holds the db as it is */
    assert.ok(!pub.includes('tokenHash'));
    const all = seen.join('\n') + srv.log();
    assert.ok(!all.includes(KEY) && !all.includes(TG_TOKEN));
    assert.ok(!srv.log().includes('Болж байна'), 'visitor messages are not logged');
  });
});

/* ========================================================================== */
describe('website chat: unit — AI pause expiry, storage limits, polling limit', () => {
  const A = require(path.join(ROOT, 'assistant.js'));
  const W = require(path.join(ROOT, 'webchat.js'));
  const quiet = { log() {}, warn() {}, error() {} };
  function setup() {
    const clock = { t: Date.parse('2026-11-10T04:00:00Z') };
    const db = { faq: [], services: [], edu: [], settings: {}, users: [], webchats: [] };
    const config = { assistantEnabled: true, phoneDisplay: '+976 9111-3958', assistant: { model: 'm', priceUsdPerMTok: { ...PRICE }, monthlyCapUsd: 5, dailyCapUsd: 5, maxOutputTokens: 400, maxMessageChars: 500, historyTurns: 6, perIpPerHour: 1000, globalPerMinute: 1000 } };
    const res = () => ({ code: 0, body: null });
    const json = (r, code, obj) => { r.code = code; r.body = obj; };
    const fail = (r, code, error) => json(r, code, { error });
    const assistant = A.createAssistant({ getDb: () => db, saveDb: () => {}, cfg: () => config, walletOn: () => false, publicFaq: () => [], json, fail, now: () => clock.t, env: { ASSISTANT_MOCK: '1' }, log: quiet });
    const wc = W.createWebchat({ getDb: () => db, saveDb: () => {}, assistant, json, fail, authUser: () => null, firstName: (n) => String(n).split(' ')[0], now: () => clock.t, log: quiet });
    function req(body, headers) {
      const r = Readable.from([Buffer.from(JSON.stringify(body))]);
      r.headers = { 'content-type': 'application/json', ...(headers || {}) };
      r.method = 'POST';
      return r;
    }
    async function say(text, token) { const r = res(); await wc.handlePost(req({ message: text }, token ? { 'x-chat-token': token } : {}), r, '203.0.113.1'); return r; }
    return { clock, db, wc, res, req, say };
  }

  test('a staff reply pauses the AI for two hours, then it answers on its own again', async () => {
    const { clock, db, wc, res, say } = setup();
    const first = await say('hello');
    assert.equal(first.code, 200);
    const token = first.body.token;
    const id = db.webchats[0].id;
    const r = res();
    await wc.handleAdmin('POST /api/admin/webchats/' + id + '/reply', '/api/admin/webchats/' + id + '/reply',
      Object.assign(Readable.from([]), { method: 'POST', headers: {} }), r, { userId: null, role: 'superadmin' }, true, async () => ({ text: 'Hi, this is the salon' }));
    assert.equal(r.code, 200);
    assert.equal(db.webchats[0].messages.slice(-1)[0].name, "B's Gua Sha");
    clock.t += 119 * 60000;
    assert.equal((await say('still there?', token)).body.messages[0].ai, 'paused');
    clock.t += 2 * 60000;
    const back = await say('hello?', token);
    assert.deepEqual(back.body.messages.map((m) => m.from), ['visitor', 'ai']);
  });

  test('old conversations expire, long ones are trimmed, and total text has a ceiling', () => {
    const { clock, db, wc } = setup();
    const at = (daysAgo) => new Date(clock.t - daysAgo * 86400000).toISOString();
    const conv = (id, daysAgo, n, len) => ({ id, tokenHash: id, createdAt: at(daysAgo), lastAt: at(daysAgo), userId: null, aiPausedUntil: null, staffReadAt: null, notifiedAt: null,
      messages: Array.from({ length: n }, (_, i) => ({ id: id + '-' + i, from: 'visitor', text: 'x'.repeat(len), at: at(daysAgo) })) });
    db.webchats = [conv('old', 91, 2, 10), conv('recent', 1, 250, 10), conv('big1', 3, 100, 10000), conv('big2', 2, 100, 10000), conv('big3', 4, 100, 10000)];
    wc.prune();
    const ids = db.webchats.map((c) => c.id);
    assert.ok(!ids.includes('old'), 'idle over 90 days → deleted');
    assert.equal(db.webchats.find((c) => c.id === 'recent').messages.length, W.MAX_MESSAGES);
    assert.equal(db.webchats.find((c) => c.id === 'recent').messages[0].id, 'recent-50', 'oldest messages dropped first');
    const total = db.webchats.reduce((n, c) => n + c.messages.reduce((k, m) => k + m.text.length, 0), 0);
    assert.ok(total <= W.MAX_TOTAL_CHARS, 'total ' + total);
    assert.ok(!ids.includes('big3') && ids.includes('big2'), 'the oldest big conversation goes first');
  });

  test('polling is limited per address', async () => {
    const { wc, res, say } = setup();
    const token = (await say('hello')).body.token;
    const q = new URLSearchParams();
    let last;
    for (let i = 0; i < 901; i++) { last = res(); wc.handleGet({ headers: { 'x-chat-token': token } }, last, '198.51.100.9', q); if (last.code !== 200) break; }
    assert.equal(last.code, 429);
    const other = res();
    wc.handleGet({ headers: { 'x-chat-token': token } }, other, '198.51.100.10', q);
    assert.equal(other.code, 200);
  });
});
