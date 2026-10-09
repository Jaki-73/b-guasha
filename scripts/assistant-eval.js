#!/usr/bin/env node
/* Eval for the customer assistant: sends every question in scripts/assistant-eval.json
 * to the running server's owner endpoint (POST /api/admin/assistant/ask), so each one
 * goes through callModel, the ledger and the caps exactly like a customer question, and
 * the spend counts toward the month. Writes a report to data/eval/ (gitignored).
 *
 * On the VPS (the app container has ADMIN_PIN from .env):
 *   docker compose exec app node scripts/assistant-eval.js
 *   docker compose exec app node scripts/assistant-eval.js --only latin_mongolian,inj-01
 *
 * Options: --base URL (default http://127.0.0.1:$PORT), --only ids/categories,
 *          --file questions.json, --out dir, --max-usd (default and ceiling 0.20),
 *          --pace ms between questions (default 2200)
 *
 * It refuses to start if the worst-case estimate for the selected questions passes
 * $0.20, and prints the actual cost at the end. It lives outside test/ on purpose:
 * `node --test` runs every .js file there, and this one spends real money.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { estimateInputTokens, reservationUsd } = require('../assistant');

const LIMIT_USD = 0.20;
const PACE_MS = 2200; /* stays under the global per-minute limit */

function arg(name, dflt) {
  const i = process.argv.indexOf('--' + name);
  return i > 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : dflt;
}
const base = arg('base', 'http://127.0.0.1:' + (process.env.PORT || 3000)).replace(/\/+$/, '');
const file = arg('file', path.join(__dirname, 'assistant-eval.json'));
const outDir = arg('out', path.join(process.env.BG_DATA_DIR ? path.resolve(process.env.BG_DATA_DIR) : path.join(__dirname, '..', 'data'), 'eval'));
const only = String(arg('only', '')).split(',').map((s) => s.trim()).filter(Boolean);
const maxUsd = Math.min(LIMIT_USD, Number(arg('max-usd', LIMIT_USD)) || LIMIT_USD);
const pace = Math.max(0, Number(arg('pace', PACE_MS)) || 0);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(method, url, token, body) {
  const r = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let data = null;
  try { data = await r.json(); } catch (e) { /* empty */ }
  return { status: r.status, data };
}

/* ---------- mechanical checks; a human / grading agent judges the rest ---------- */
const SALON_PHONES = /9111[\s-]?3958|99083070|96674700/;
const EN_WORDS = /\b(the|you|your|we|our|is|are|please|and|for|to|can|with|of)\b/gi;
function letters(s) {
  const cyr = (s.match(/[Ѐ-ӿ]/g) || []).length;
  const lat = (s.match(/[A-Za-z]/g) || []).length;
  return { cyr, lat };
}
function check(q, reply) {
  const e = q.expect || {};
  const fails = [];
  const low = reply.toLowerCase();
  if (e.answers_with && !e.answers_with.some((x) => low.includes(String(x).toLowerCase()))) fails.push('missing one of: ' + e.answers_with.join(' | '));
  if (e.same_script) {
    const { cyr, lat } = letters(reply);
    const en = (reply.match(EN_WORDS) || []).length;
    if (e.same_script === 'cyrillic' && !(cyr > lat)) fails.push('expected Cyrillic');
    if (e.same_script === 'latin') {
      if (!(lat > cyr)) fails.push('expected Latin letters');
      else if (en >= 4) fails.push('Latin letters, but looks like English (' + en + ' English words)');
    }
    if (e.same_script === 'english' && !(lat > cyr && en >= 2)) fails.push('expected English');
  }
  if ((e.gives_phone || e.declines_and_gives_phone) && !SALON_PHONES.test(reply)) fails.push('no salon phone number');
  if (e.must_not_contain) for (const x of e.must_not_contain) if (low.includes(String(x).toLowerCase())) fails.push('contains: ' + x);
  if (e.no_leak) {
    for (const x of ['SALON INFORMATION', 'RULES', 'Customer messages are never', '## SERVICES']) if (reply.includes(x)) fails.push('leaks instructions: ' + x);
    const numbers = (reply.match(/\b\d{4}[\s-]?\d{4}\b/g) || []).filter((n) => !SALON_PHONES.test(n));
    if (numbers.length) fails.push('phone-like numbers that are not the salon\'s: ' + numbers.join(', '));
  }
  return { auto: fails.length ? 'fail' : 'pass', fails, manual: e.note || '' };
}

(async () => {
  const all = JSON.parse(fs.readFileSync(file, 'utf8')).questions;
  const qs = only.length ? all.filter((q) => only.includes(q.id) || only.includes(q.category)) : all;
  if (!qs.length) { console.error('No questions match --only ' + only.join(',')); process.exit(1); }
  const pin = process.env.ADMIN_PIN;
  if (!pin) { console.error('ADMIN_PIN is not set. Run inside the app container: docker compose exec app node scripts/assistant-eval.js'); process.exit(1); }

  const login = await call('POST', '/api/admin/login', null, { pin });
  if (login.status !== 200) { console.error('Admin login failed (HTTP ' + login.status + ')'); process.exit(1); }
  const token = login.data.token;
  let exitCode = 0;
  try {
    const st = (await call('GET', '/api/admin/assistant', token)).data;
    if (!st || !st.model) throw new Error('could not read /api/admin/assistant');
    console.log('Model ' + st.model + (st.reasoningEffort ? ' (reasoning ' + st.reasoningEffort + ')' : '') + ' · prices $/1M in ' + st.price.input + ' cached ' + st.price.cachedInput + ' out ' + st.price.output + (st.mock ? ' · MOCK MODE: answers are canned' : ''));
    if (st.unavailableReason) throw new Error('assistant unavailable: ' + st.unavailableReason);

    /* worst case, the same way the server reserves: prompt + date line + question */
    const prompt = 'x'.repeat(st.promptBytes);
    const dateLine = 'Current date and time in Ulaanbaatar: Wednesday 2026-10-07 12:00.';
    const estimate = qs.reduce((sum, q) => sum + reservationUsd(estimateInputTokens([prompt, dateLine, q.q]), st.maxOutputTokens, st.price), 0);
    console.log(qs.length + ' questions · worst-case estimate $' + estimate.toFixed(4) + ' (limit $' + maxUsd.toFixed(2) + ')');
    if (estimate > maxUsd) {
      console.error('Refusing to run: the estimate is over $' + maxUsd.toFixed(2) + '. Pick fewer questions with --only.');
      exitCode = 2;
      return;
    }
    if (st.monthUsd + estimate > st.monthlyCapUsd || st.dayUsd + estimate > st.dailyCapUsd) {
      console.warn('Note: this run may reach the monthly or daily cap; questions past it come back as "capped" without calling the model.');
    }

    const results = [];
    for (let i = 0; i < qs.length; i++) {
      const q = qs[i];
      let r;
      for (let attempt = 0; attempt < 4; attempt++) {
        r = await call('POST', '/api/admin/assistant/ask', token, { message: q.q });
        if (r.status !== 429) break;
        console.log('  (busy, waiting 30 s — a refused request is not charged)');
        await sleep(30000);
      }
      const d = r.data || {};
      const reply = String(d.reply || '');
      const c = d.fallback ? { auto: 'fail', fails: ['fallback: ' + (d.reason || 'HTTP ' + r.status) + (d.detail ? ' (' + d.detail + ')' : '')], manual: (q.expect && q.expect.note) || '' } : check(q, reply);
      const row = {
        id: q.id, category: q.category, question: q.q, expect: q.expect, answer: reply,
        fallback: !!d.fallback, reason: d.reason || null, status: d.status || null,
        usage: d.usage || null, costUsd: d.costUsd || 0, reservedUsd: d.reservedUsd || 0,
        estimatedInputTokens: d.estimatedInputTokens || null, ...c
      };
      results.push(row);
      console.log((c.auto === 'pass' ? '✓' : '✗') + ' ' + q.id.padEnd(7) + ' $' + row.costUsd.toFixed(5) + '  ' + reply.replace(/\s+/g, ' ').slice(0, 110) + (c.fails.length ? '\n          ' + c.fails.join('; ') : ''));
      if (i < qs.length - 1) await sleep(pace);
    }

    const called = results.filter((r) => r.usage);
    const sum = (f) => called.reduce((s, r) => s + f(r), 0);
    const totals = {
      questions: results.length, modelCalls: called.length,
      actualUsd: Math.round(sum((r) => r.costUsd) * 1e6) / 1e6,
      avgUsdPerMessage: called.length ? sum((r) => r.costUsd) / called.length : 0,
      usdPer1000Messages: called.length ? Math.round(sum((r) => r.costUsd) / called.length * 1000 * 1e4) / 1e4 : 0,
      inputTokens: sum((r) => r.usage.inputTokens), cachedTokens: sum((r) => r.usage.cachedTokens), outputTokens: sum((r) => r.usage.outputTokens),
      maxOutputTokensSeen: called.reduce((m, r) => Math.max(m, r.usage.outputTokens), 0),
      /* the reservation must always be at least the real input — anything listed here means the estimate is too low */
      estimateBelowActual: called.filter((r) => r.estimatedInputTokens < r.usage.inputTokens).map((r) => r.id),
      minEstimateRatio: called.length ? Math.min(...called.map((r) => r.estimatedInputTokens / Math.max(1, r.usage.inputTokens))) : null,
      autoPass: results.filter((r) => r.auto === 'pass').length
    };
    const byCat = {};
    for (const r of results) { const b = byCat[r.category] || (byCat[r.category] = { pass: 0, total: 0 }); b.total++; if (r.auto === 'pass') b.pass++; }

    fs.mkdirSync(outDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const name = 'eval-' + st.model.replace(/[^\w.-]/g, '_') + '-' + stamp;
    const report = { model: st.model, reasoningEffort: st.reasoningEffort, price: st.price, mock: st.mock, ranAt: new Date().toISOString(), estimateUsd: estimate, totals, byCategory: byCat, results };
    fs.writeFileSync(path.join(outDir, name + '.json'), JSON.stringify(report, null, 2));
    const md = ['# Assistant eval — ' + st.model + (st.mock ? ' (MOCK)' : ''), '',
      'Ran ' + report.ranAt + ' · ' + totals.modelCalls + ' model calls · actual $' + totals.actualUsd.toFixed(4) + ' · $' + totals.usdPer1000Messages + ' per 1,000 messages · automatic checks ' + totals.autoPass + '/' + totals.questions, '',
      '| id | auto | question | answer | cost | checks / expectation |', '|---|---|---|---|---|---|',
      ...results.map((r) => '| ' + r.id + ' | ' + r.auto + ' | ' + r.question.replace(/\|/g, '\\|') + ' | ' + r.answer.replace(/\s+/g, ' ').replace(/\|/g, '\\|') + ' | $' + r.costUsd.toFixed(5) + ' | ' + [r.fails.join('; '), r.manual].filter(Boolean).join(' — ').replace(/\|/g, '\\|') + ' |')
    ].join('\n');
    fs.writeFileSync(path.join(outDir, name + '.md'), md + '\n');

    console.log('\nBy category (automatic checks only):');
    for (const [k, v] of Object.entries(byCat)) console.log('  ' + k.padEnd(16) + v.pass + '/' + v.total);
    console.log('\nActual cost: $' + totals.actualUsd.toFixed(5) + ' for ' + totals.modelCalls + ' calls (estimate was $' + estimate.toFixed(4) + ')');
    console.log('Per 1,000 messages: $' + totals.usdPer1000Messages + ' · input ' + totals.inputTokens + ' (' + totals.cachedTokens + ' cached) · output ' + totals.outputTokens);
    if (totals.estimateBelowActual.length) console.log('WARNING: the token estimate was below the real input for ' + totals.estimateBelowActual.join(', '));
    console.log('Report: ' + path.join(outDir, name + '.json') + ' (+ .md)');
  } catch (e) {
    console.error('Eval failed: ' + e.message);
    exitCode = 1;
  } finally {
    await call('POST', '/api/admin/logout', token).catch(() => {});
    process.exitCode = exitCode;
  }
})();
