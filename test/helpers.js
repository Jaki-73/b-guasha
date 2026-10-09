/*
 * Shared by the assistant and website-chat tests: the real server on a free port with a
 * throwaway data folder, and a fake OpenAI (Responses API) + Telegram server in this
 * process. The child's environment never carries a real OPENAI_*, TELEGRAM_* or
 * ASSISTANT_* value, and OPENAI_BASE_URL / TELEGRAM_API_BASE always point at the fake.
 * (Not a test file itself: node --test loads it and finds no tests.)
 */
'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const http = require('node:http');

const ROOT = path.join(__dirname, '..');
const SUPER_PASS = 'Test#Super-2026';
const ADMIN_PIN = '975310';
const KEY = 'sk-test-DO-NOT-LEAK-7f3a9c11e0';
const TG_TOKEN = '999000:TG-SECRET-TOKEN-b41d';
const TG_CHAT = '424242';
/* test prices ($ per 1M tokens) — round numbers so expected costs are easy to compute */
const PRICE = { input: 1.0, cachedInput: 0.1, output: 2.0 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function ubDay(n) { return new Date(Date.now() + 8 * 3600e3 + n * 86400e3).toISOString().slice(0, 10); }
function near(a, b, eps) { return Math.abs(a - b) <= (eps || 1e-6); }

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
  });
}

/* ---------- fake OpenAI (Responses API) + Telegram Bot API ---------- */
async function startFake() {
  const state = {
    mode: 'ok', delayMs: 0, reply: 'Сигнатур нүүрний гуаша 90,000₮, 60 минут.',
    usage: { input_tokens: 3000, input_tokens_details: { cached_tokens: 1000 }, output_tokens: 50, output_tokens_details: { reasoning_tokens: 0 } },
    requests: [], telegram: []
  };
  const port = await freePort();
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', async () => {
      const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
      if (req.url.startsWith('/bot')) {
        if (state.telegramFails) return send(500, { ok: false });
        state.telegram.push({ url: req.url, body: JSON.parse(raw || '{}') });
        return send(200, { ok: true, result: {} });
      }
      if (req.method !== 'POST' || req.url !== '/v1/responses') return send(404, { error: { code: 'not_found' } });
      state.requests.push({ headers: req.headers, body: JSON.parse(raw || '{}'), raw });
      const mode = state.mode;
      if (mode === 'timeout') { await sleep(1500); if (!res.writableEnded) send(200, okBody()); return; }
      if (state.delayMs) await sleep(state.delayMs);
      if (mode === 'ok') return send(200, okBody());
      /* a real 401 echoes part of the key in its message — it must never be stored or shown */
      if (mode === '401') return send(401, { error: { message: 'Incorrect API key provided: ' + KEY + '. You can find your API key at …', type: 'invalid_request_error', param: null, code: 'invalid_api_key' } });
      if (mode === 'quota') return send(429, { error: { message: 'You exceeded your current quota, please check your plan and billing details.', type: 'insufficient_quota', param: null, code: 'insufficient_quota' } });
      if (mode === '500') return send(500, { error: { message: 'The server had an error while processing your request.', type: 'server_error', param: null, code: null } });
      if (mode === 'rate') return send(429, { error: { message: 'Rate limit reached for requests', type: 'requests', param: null, code: 'rate_limit_exceeded' } });
      if (mode === 'empty') return send(200, { id: 'resp_empty', object: 'response', status: 'completed', output: [], usage: state.usage });
      if (mode === 'drop') { req.socket.destroy(); return; }
      if (mode === 'incomplete') {
        return send(200, { id: 'resp_inc', object: 'response', status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output: [], usage: state.usage });
      }
      return send(500, {});
    });
  });
  function okBody() {
    return {
      id: 'resp_test', object: 'response', status: 'completed', model: 'test-model',
      output: [{ type: 'message', id: 'msg_1', status: 'completed', role: 'assistant', content: [{ type: 'output_text', text: state.reply, annotations: [] }] }],
      usage: state.usage
    };
  }
  await new Promise((r) => server.listen(port, '127.0.0.1', r));
  return { state, base: 'http://127.0.0.1:' + port, close: () => new Promise((r) => { server.closeAllConnections && server.closeAllConnections(); server.close(r); }) };
}
async function waitFor(fn, ms) {
  const end = Date.now() + (ms || 2000);
  while (Date.now() < end) { if (fn()) return true; await sleep(25); }
  return fn();
}

/* ---------- the real server ---------- */
function writeConfig(dir, assistantOverrides, extra) {
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
  Object.assign(cfg, {
    closedWeekdays: [], closedDates: [], hoursOpen: '10:00', hoursClose: '19:00',
    qpay: { ...cfg.qpay, password: 'MARKER_QPAY_PASSWORD', username: 'MARKER_QPAY_USER' },
    assistant: {
      model: 'test-model', reasoningEffort: 'none',
      priceUsdPerMTok: { ...PRICE },
      monthlyCapUsd: 5, dailyCapUsd: 5, maxOutputTokens: 400, maxMessageChars: 500, historyTurns: 6,
      perIpPerHour: 1000, globalPerMinute: 1000,
      ...(assistantOverrides || {})
    },
    ...(extra || {})
  });
  const file = path.join(dir, 'config.test.json');
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2));
  return file;
}
function childEnv(extra) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (/^(OPENAI_|TELEGRAM_|ASSISTANT_)/.test(k)) continue;
    env[k] = v;
  }
  return { ...env, ...extra };
}
async function startServer(dataDir, configFile, fakeBase, extraEnv) {
  const port = await freePort();
  const child = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
    env: childEnv({
      PORT: String(port), BG_DATA_DIR: dataDir, BG_CONFIG: configFile,
      SUPER_ADMIN_PASSWORD: SUPER_PASS, ADMIN_PIN, TZ: 'America/Los_Angeles',
      OPENAI_BASE_URL: fakeBase, TELEGRAM_API_BASE: fakeBase, ASSISTANT_TIMEOUT_MS: '400',
      ...(extraEnv || {})
    }),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let log = '';
  child.stdout.on('data', (d) => { log += d; });
  child.stderr.on('data', (d) => { log += d; });
  const base = 'http://127.0.0.1:' + port;
  for (let i = 0; i < 200; i++) {
    try { const r = await fetch(base + '/api/health'); if (r.ok) return { child, base, log: () => log }; } catch (e) { /* not up yet */ }
    await sleep(50);
  }
  child.kill();
  throw new Error('server did not start:\n' + log);
}
function stopServer(srv) {
  return new Promise((resolve) => {
    if (!srv || srv.child.exitCode !== null) return resolve();
    srv.child.once('exit', resolve);
    srv.child.kill();
  });
}
/* every response body is kept, so the suites can assert the key never appears in any */
function api(base, seen) {
  return async (method, url, token, body, headers) => {
    const r = await fetch(base + url, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(headers || {}) },
      body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body))
    });
    const text = await r.text();
    if (seen) seen.push(text);
    let data;
    try { data = JSON.parse(text); } catch (e) { data = text; }
    return { status: r.status, data, text };
  };
}
async function adminLogin(call) {
  const r = await call('POST', '/api/admin/login', null, { pin: ADMIN_PIN });
  assert.equal(r.status, 200, r.text);
  return r.data.token;
}

/* what happened to a question sent to POST /api/assistant: 'answered', or the
   visitor message's ai status ('paused', 'capped', 'unavailable', 'error', …) */
function outcome(r) {
  const ms = (r.data && r.data.messages) || [];
  if (ms.some((m) => m.from === 'ai')) return 'answered';
  const v = ms.find((m) => m.from === 'visitor');
  return v ? v.ai : null;
}
function aiReply(r) { const m = ((r.data && r.data.messages) || []).find((x) => x.from === 'ai'); return m ? m.text : null; }

module.exports = {
  ROOT, SUPER_PASS, ADMIN_PIN, KEY, TG_TOKEN, TG_CHAT, PRICE,
  sleep, ubDay, near, freePort, startFake, waitFor, writeConfig, childEnv, startServer, stopServer, api, adminLogin, outcome, aiReply
};
