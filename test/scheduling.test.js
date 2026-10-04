/*
 * Acceptance tests for machine-aware scheduling.
 * Run with `npm test` or `node --test` (Node 18+, no dependencies).
 *
 * Each suite starts the real server on a free port with a throwaway data folder and a
 * test config (1 HIFU, 2 steamers, 1 LED with a 15-minute cleaning buffer). The server
 * runs with TZ=America/Los_Angeles on purpose: every scheduling rule must work in
 * Ulaanbaatar time (+08:00) no matter what clock the host uses.
 */
'use strict';

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');

const ROOT = path.join(__dirname, '..');
const SUPER_PASS = 'Test#Super-2026';
const UB_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+08:00$/;

/* a date in Ulaanbaatar, n days from now — computed without the host timezone */
function ubDay(n) { return new Date(Date.now() + 8 * 3600e3 + n * 86400e3).toISOString().slice(0, 10); }

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
  });
}

function writeConfig(dir) {
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
  Object.assign(cfg, {
    machines: [
      { id: 'hifu', name: 'HIFU', units: 1, bufferMinutes: 0 },
      { id: 'steamer', name: 'Steamer', units: 2, bufferMinutes: 0 },
      { id: 'led', name: 'LED', units: 1, bufferMinutes: 15 }
    ],
    bookingStepMinutes: 15,
    closedWeekdays: [], closedDates: [],
    hoursOpen: '09:00', hoursClose: '20:00', bookingDaysAhead: 21
  });
  const file = path.join(dir, 'config.test.json');
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2));
  return file;
}

async function startServer(dataDir, configFile) {
  const port = await freePort();
  const child = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
    env: { ...process.env, PORT: String(port), BG_DATA_DIR: dataDir, BG_CONFIG: configFile, SUPER_ADMIN_PASSWORD: SUPER_PASS, ADMIN_PIN: '975310', TZ: 'America/Los_Angeles' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let log = '';
  child.stdout.on('data', (d) => { log += d; });
  child.stderr.on('data', (d) => { log += d; });
  const base = 'http://127.0.0.1:' + port;
  for (let i = 0; i < 200; i++) {
    try { const r = await fetch(base + '/api/health'); if (r.ok) return { child, base, log: () => log }; } catch (e) { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 50));
  }
  child.kill();
  throw new Error('server did not start:\n' + log);
}
function stopServer(srv) {
  return new Promise((resolve) => {
    if (srv.child.exitCode !== null) return resolve();
    srv.child.once('exit', resolve);
    srv.child.kill();
  });
}
function api(base) {
  return async (method, url, token, body) => {
    const r = await fetch(base + url, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch (e) { data = text; }
    return { status: r.status, data, text };
  };
}

describe('machine-aware scheduling', () => {
  const D = ubDay(1);   /* main test day (tomorrow) */
  const D2 = ubDay(2);  /* race-condition day */
  let tmp, dataDir, srv, call;
  const tok = {}, id = {}, svc = {};
  const bk = {};        /* booking ids by label */
  let phoneSeq = 0;

  async function login(phone, password) {
    const r = await call('POST', '/api/admin/login-staff', null, { phone, password });
    assert.equal(r.status, 200, 'login ' + phone + ': ' + r.text);
    return r.data;
  }
  /* staff (or the owner) books `service` for `staffKey` at `time` with a fresh phone number */
  function book(asKey, staffKey, service, date, time, extra) {
    phoneSeq++;
    return call('POST', '/api/admin/walkin', tok[asKey], {
      staffId: id[staffKey], serviceId: svc[service], date, time,
      phone: '99' + String(100000 + phoneSeq), name: 'Client ' + phoneSeq, via: 'phone', ...(extra || {})
    });
  }
  async function bookOk(asKey, staffKey, service, date, time, label) {
    const r = await book(asKey, staffKey, service, date, time);
    assert.equal(r.status, 200, `${staffKey} ${service} ${date} ${time} should be allowed: ${r.text}`);
    if (label) bk[label] = r.data;
    return r.data;
  }
  async function bookRefused(asKey, staffKey, service, date, time, reason) {
    const r = await book(asKey, staffKey, service, date, time);
    assert.equal(r.status, 409, `${staffKey} ${service} ${date} ${time} should be refused: ${r.text}`);
    assert.equal(r.data.reason, reason);
  }
  async function free(asKey, staffKey, service, date) {
    const r = await call('GET', `/api/admin/free?date=${date}&serviceId=${svc[service]}&staffId=${id[staffKey]}`, tok[asKey]);
    assert.equal(r.status, 200, r.text);
    return r.data.slots;
  }

  before(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bg-sched-'));
    dataDir = path.join(tmp, 'data');
    srv = await startServer(dataDir, writeConfig(tmp));
    call = api(srv.base);

    const sa = await login('80000000', SUPER_PASS);
    tok.super = sa.token;
    const ow = await login('91113958', 'owner123');
    tok.owner = ow.token; id.owner = ow.staffUserId;
    const ex = await login('88000001', 'staff123');
    tok.tuya = ex.token; id.tuya = ex.staffUserId;
    for (const [k, phone] of [['A', '88110001'], ['B', '88110002'], ['C', '88110003']]) {
      const r = await call('POST', '/api/admin/accounts', tok.super, { role: 'staff', name: 'Staff ' + k, phone, password: 'pass-' + k + '-123' });
      assert.equal(r.status, 200, r.text);
      const s = await login(phone, 'pass-' + k + '-123');
      tok[k] = s.token; id[k] = s.staffUserId;
    }
    const services = {
      hifu60: { minutes: 60, uses: [{ machine: 'hifu', minutes: 60, startOffset: 0 }] },
      hifuFacial: { minutes: 90, uses: [{ machine: 'hifu', minutes: 60, startOffset: 15 }] },
      hifuShort: { minutes: 15, uses: [{ machine: 'hifu', minutes: 15, startOffset: 0 }] },
      steam60: { minutes: 60, uses: [{ machine: 'steamer', minutes: 60, startOffset: 0 }] },
      combo: { minutes: 60, uses: [{ machine: 'steamer', minutes: 30, startOffset: 0 }, { machine: 'hifu', minutes: 30, startOffset: 30 }] },
      led30: { minutes: 30, uses: [{ machine: 'led', minutes: 30, startOffset: 0 }] },
      plain: { minutes: 60, uses: [] }
    };
    for (const [k, v] of Object.entries(services)) {
      const r = await call('POST', '/api/admin/services', tok.owner, { nameMn: 'Svc-' + k, nameEn: 'Svc-' + k, group: 'facial', price: 1000, ...v });
      assert.equal(r.status, 200, r.text);
      svc[k] = r.data.id;
    }
  });
  after(async () => {
    if (srv) await stopServer(srv);
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  });

  test('service machine usage is validated against the registry and the duration', async () => {
    const bad = [
      [{ machine: 'nope', minutes: 30, startOffset: 0 }, 'unknown_machine'],
      [{ machine: 'hifu', minutes: 60, startOffset: 15 }, 'machine_window_outside_service'],
      [[{ machine: 'hifu', minutes: 10, startOffset: 0 }, { machine: 'hifu', minutes: 10, startOffset: 20 }], 'duplicate_machine']
    ];
    for (const [uses, err] of bad) {
      const r = await call('POST', '/api/admin/services', tok.owner, { nameMn: 'Bad', price: 1, minutes: 60, uses: Array.isArray(uses) ? uses : [uses] });
      assert.equal(r.status, 400);
      assert.equal(r.data.error, err);
    }
    /* shortening a service so its machine window no longer fits is refused */
    const r = await call('POST', '/api/admin/services/' + svc.hifuFacial, tok.owner, { minutes: 60 });
    assert.equal(r.status, 400);
    assert.equal(r.data.error, 'machine_window_outside_service');
  });

  test('1. A books HIFU 14:00–15:00: B is offered nothing overlapping that window, but is offered 15:00', async () => {
    await bookOk('A', 'A', 'hifu60', D, '14:00', 'a14');
    const slots = await free('B', 'B', 'hifu60', D);
    for (const t of ['13:15', '13:30', '13:45', '14:00', '14:15', '14:30', '14:45']) {
      assert.ok(!slots.includes(t), `${t} overlaps A's HIFU window and must not be offered`);
    }
    assert.ok(slots.includes('15:00'), '15:00 must be offered');
    assert.ok(slots.includes('13:00'), '13:00 (ending exactly at 14:00) must be offered');
    /* the server refuses it even if the screen is bypassed */
    await bookRefused('B', 'B', 'hifu60', D, '14:30', 'machine_busy');
  });

  test('3. a machine window ending at 15:00 and another starting at 15:00 are both allowed', async () => {
    await bookOk('B', 'B', 'hifu60', D, '15:00', 'b15');   /* starts when A's ends */
    await bookOk('C', 'C', 'hifu60', D, '13:00', 'c13');   /* ends when A's starts */
  });

  test('2. two steamer bookings overlap successfully; a third overlapping one is refused', async () => {
    await bookOk('A', 'A', 'steam60', D, '10:00');
    await bookOk('B', 'B', 'steam60', D, '10:30');
    await bookRefused('C', 'C', 'steam60', D, '10:45', 'machine_busy');
    /* at 11:00 A's steamer is released (half-open), so one unit is free again */
    await bookOk('C', 'C', 'steam60', D, '11:00');
  });

  test('4. with startOffset 15, another booking can use the machine in the first 15 minutes of the earlier appointment', async () => {
    const facial = await bookOk('A', 'A', 'hifuFacial', D, '16:00', 'a16');
    assert.equal(facial.time, '16:00');
    assert.equal(facial.minutes, 90);
    assert.deepEqual(facial.machines.map((m) => [m.machine, m.from, m.to]), [['hifu', '16:15', '17:15']]);
    await bookOk('B', 'B', 'hifuShort', D, '16:00');                        /* HIFU 16:00–16:15 */
    await bookRefused('C', 'C', 'hifuShort', D, '16:15', 'machine_busy');   /* HIFU held 16:15–17:15 */
    /* the machine window is not the appointment window: HIFU is free at 17:15
       although A's appointment runs until 17:30 */
    await bookOk('C', 'C', 'hifuShort', D, '17:15');
  });

  test('5. cancelling the 14:00 HIFU booking makes 14:00 available again', async () => {
    assert.ok(!(await free('B', 'B', 'hifu60', D)).includes('14:00'));
    const r = await call('POST', `/api/admin/bookings/${bk.a14.id}/status`, tok.A, { status: 'cancelled' });
    assert.equal(r.status, 200, r.text);
    assert.ok((await free('B', 'B', 'hifu60', D)).includes('14:00'), '14:00 must be offered once the booking is cancelled');
    const board = await call('GET', '/api/admin/machines/board?date=' + D, tok.B);
    const hifu = board.data.machines.find((m) => m.id === 'hifu');
    assert.ok(!hifu.busy.some((x) => x.from <= '14:30' && '14:30' < x.to), 'the cancelled booking must not hold HIFU');
  });

  test('restoring a cancelled booking re-checks availability', async () => {
    await bookOk('B', 'B', 'hifu60', D, '14:00', 'b14');                 /* B takes the freed slot */
    const r = await call('POST', `/api/admin/bookings/${bk.a14.id}/status`, tok.A, { status: 'confirmed' });
    assert.equal(r.status, 409, r.text);
    assert.equal(r.data.reason, 'machine_busy');
  });

  test('6. a staff block stops bookings for that staff member but leaves the machine bookable by someone else', async () => {
    const blk = await call('POST', '/api/admin/blocks', tok.B, { date: D, from: '17:00', to: '18:00', note: 'personal' });
    assert.equal(blk.status, 200, blk.text);
    assert.equal(blk.data.time, '17:00');
    assert.equal(blk.data.until, '18:00');
    await bookRefused('B', 'B', 'plain', D, '17:00', 'staff_busy');
    const slots = await free('B', 'B', 'plain', D);
    for (const t of ['16:15', '16:30', '17:00', '17:45']) assert.ok(!slots.includes(t), `${t} runs into B's block`);
    assert.ok(slots.includes('18:00'));
    /* someone else uses HIFU in the middle of B's block */
    await bookOk('A', 'A', 'hifuShort', D, '17:30');
    /* a block cannot be laid over the staff member's own booking */
    const clash = await call('POST', '/api/admin/blocks', tok.B, { date: D, from: '15:30', to: '16:30' });
    assert.equal(clash.status, 409);
    /* and it reserves no machine */
    const board = await call('GET', '/api/admin/machines/board?date=' + D, tok.C);
    for (const m of board.data.machines) {
      assert.ok(!m.busy.some((x) => x.from < '18:00' && '17:45' < x.to), `${m.id} must not be held by the block 17:45–18:00`);
    }
  });

  test('cleaning buffer keeps the machine after its window', async () => {
    await bookOk('A', 'A', 'led30', D, '11:00');                          /* LED 11:00–11:30 + 15 */
    await bookRefused('B', 'B', 'led30', D, '11:30', 'machine_busy');
    await bookOk('B', 'B', 'led30', D, '11:45');
    const board = await call('GET', '/api/admin/machines/board?date=' + D, tok.A);
    const led = board.data.machines.find((m) => m.id === 'led');
    assert.ok(led.cleaning.some((x) => x.from === '11:30' && x.to === '11:45'));
  });

  test('a service may need two machines; each is held for its own sub-window', async () => {
    const combo = await bookOk('A', 'A', 'combo', D, '12:00');
    assert.deepEqual(combo.machines.map((m) => [m.machine, m.from, m.to]), [['steamer', '12:00', '12:30'], ['hifu', '12:30', '13:00']]);
    await bookRefused('owner', 'owner', 'hifu60', D, '12:00', 'machine_busy'); /* would reach 12:30 */
    await bookOk('owner', 'owner', 'hifuShort', D, '12:00');                   /* HIFU 12:00–12:15 is free */
    await bookOk('C', 'C', 'steam60', D, '12:00');                             /* second steamer */
    await bookRefused('tuya', 'tuya', 'steam60', D, '12:15', 'machine_busy');  /* both steamers taken */
  });

  test('a service with no machine still reserves the staff member', async () => {
    const p = await bookOk('A', 'A', 'plain', D, '18:00');
    assert.deepEqual(p.machines, []);
    await bookRefused('A', 'A', 'plain', D, '17:45', 'staff_busy');   /* runs into A's own 18:00 */
    await bookOk('B', 'B', 'plain', D, '18:00');
  });

  test('7. staff B cannot reach staff A\'s booking details by changing an id or URL', async () => {
    const aBooking = bk.a16;                       /* A's 16:00 HIFU facial */
    const aClient = aBooking.user;
    /* acting on A's booking id: indistinguishable from an id that does not exist */
    for (const st of ['cancelled', 'done', 'noshow', 'confirmed']) {
      const r = await call('POST', `/api/admin/bookings/${aBooking.id}/status`, tok.B, { status: st });
      assert.equal(r.status, 404);
    }
    const still = await call('GET', '/api/admin/myday?date=' + D + '&staffId=' + id.A, tok.owner);
    assert.equal(still.data.items.find((x) => x.id === aBooking.id).status, 'confirmed');
    /* own day view ignores another staffId */
    const md = await call('GET', `/api/admin/myday?date=${D}&staffId=${id.A}`, tok.B);
    assert.equal(md.status, 200);
    assert.ok(md.data.items.length > 0);
    assert.ok(md.data.items.every((x) => x.staffId === id.B));
    /* calendar and booking lists */
    const cal = await call('GET', '/api/admin/calendar?date=' + D, tok.B);
    assert.ok(cal.data.bookings.every((x) => x.staffId === id.B));
    assert.ok(cal.data.blocks.every((x) => x.staffId === id.B));
    assert.deepEqual(cal.data.staff.map((s) => s.id), [id.B]);
    const ov = await call('GET', '/api/admin/overview', tok.B);
    assert.ok(ov.data.upcoming.concat(ov.data.past).every((x) => x.staffId === id.B));
    /* A's client: B sees the client, but none of A's visits */
    const cu = await call('GET', '/api/admin/users/' + aClient.id, tok.B);
    assert.equal(cu.status, 200);
    assert.deepEqual(cu.data.bookings, []);
    assert.equal(cu.data.stats.visits, 0);
    const list = await call('GET', '/api/admin/users?q=' + aClient.phone, tok.B);
    assert.equal(list.data[0].nextBooking, '');
    assert.equal(list.data[0].bookings, 0);
    const look = await call('GET', '/api/admin/lookup?q=' + aClient.phone, tok.B);
    assert.equal(look.data[0].nextBooking, '');
    assert.equal(look.data[0].lastServiceId, '');
    /* A's free slots, A's staff record, blocking A's time */
    assert.equal((await call('GET', `/api/admin/free?date=${D}&serviceId=${svc.plain}&staffId=${id.A}`, tok.B)).status, 403);
    assert.equal((await call('GET', '/api/admin/users/' + id.A, tok.B)).status, 404);
    assert.equal((await call('POST', '/api/admin/blocks', tok.B, { staffId: id.A, date: D, from: '09:00', to: '09:30' })).status, 403);
    const ablk = await call('POST', '/api/admin/blocks', tok.A, { date: D2, from: '18:00', to: '19:00', note: 'A private' });
    assert.equal((await call('DELETE', '/api/admin/blocks/' + ablk.data.id, tok.B)).status, 403);
    /* B's calendar subscription contains only B's bookings */
    const feed = await call('GET', '/api/admin/calfeed', tok.B);
    const ics = await (await fetch(feed.data.mine.replace(/^https?:\/\/[^/]+/, srv.base))).text();
    assert.ok(!ics.includes(aBooking.id));
    assert.ok(ics.includes(bk.b15.id));
    /* the owner still sees everything */
    const ownerCu = await call('GET', '/api/admin/users/' + aClient.id, tok.owner);
    assert.ok(ownerCu.data.bookings.some((x) => x.id === aBooking.id));
  });

  test('moving a booking re-checks staff and machines and frees the old time', async () => {
    const D5 = ubDay(5);
    const move = (asKey, bookingId, body) => call('POST', `/api/admin/bookings/${bookingId}/move`, tok[asKey], body);
    const freeFor = async (asKey, staffKey, service, exclude) =>
      (await call('GET', `/api/admin/free?date=${D5}&serviceId=${svc[service]}&staffId=${id[staffKey]}&exclude=${exclude}`, tok[asKey])).data.slots;
    const a = await bookOk('A', 'A', 'hifu60', D5, '10:00');
    const b = await bookOk('B', 'B', 'hifu60', D5, '12:00');
    /* into A's HIFU hour: refused */
    let r = await move('B', b.id, { date: D5, time: '10:30' });
    assert.equal(r.status, 409, r.text);
    assert.equal(r.data.reason, 'machine_busy');
    /* sliding 15 minutes over its own old time: offered when moving, and allowed */
    assert.ok(!(await free('B', 'B', 'hifu60', D5)).includes('12:15'));
    assert.ok((await freeFor('B', 'B', 'hifu60', b.id)).includes('12:15'));
    /* excluding someone else's booking is ignored — it reveals nothing */
    assert.ok(!(await freeFor('B', 'B', 'hifu60', a.id)).includes('10:30'));
    r = await move('B', b.id, { date: D5, time: '12:15' });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.data.booking.time, '12:15');
    assert.deepEqual(r.data.booking.machines.map((x) => [x.from, x.to]), [['12:15', '13:15']]);
    /* the old 12:00–12:15 is free for someone else straight away */
    await bookOk('C', 'C', 'hifuShort', D5, '12:00');
    /* another staff member's booking behaves like a missing one; staff cannot hand it on, the owner can */
    assert.equal((await move('A', b.id, { date: D5, time: '15:00' })).status, 404);
    assert.equal((await move('B', b.id, { date: D5, time: '15:00', staffId: id.C })).status, 403);
    r = await move('owner', b.id, { date: D5, time: '15:00', staffId: id.C });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.data.booking.staffId, id.C);
    /* a cancelled booking holds nothing and cannot be moved */
    await call('POST', `/api/admin/bookings/${a.id}/status`, tok.A, { status: 'cancelled' });
    assert.equal((await move('A', a.id, { date: D5, time: '16:00' })).status, 400);
  });

  test('machine board is shared but anonymous', async () => {
    const r = await call('GET', '/api/admin/machines/board?date=' + D, tok.C);
    assert.equal(r.status, 200);
    const hifu = r.data.machines.find((m) => m.id === 'hifu');
    assert.ok(hifu.busy.some((x) => x.from === '12:00'));
    for (const secret of ['Svc-', 'Client ', 'Staff ', 'bk-', 'u-', '99100', 'personal']) {
      assert.ok(!r.text.includes(secret), `board must not contain "${secret}"`);
    }
    for (const m of r.data.machines) {
      for (const x of m.busy) assert.deepEqual(Object.keys(x).sort(), ['from', 'full', 'inUse', 'to']);
    }
  });

  test('two staff racing for the last unit: exactly one succeeds', async () => {
    const two = await Promise.all([book('B', 'B', 'hifu60', D2, '10:00'), book('C', 'C', 'hifu60', D2, '10:00')]);
    assert.deepEqual(two.map((r) => r.status).sort(), [200, 409]);
    assert.equal(two.find((r) => r.status === 409).data.reason, 'machine_busy');
    /* five therapists at once for one HIFU */
    const five = await Promise.all(['owner', 'tuya', 'A', 'B', 'C'].map((k) => book('owner', k, 'hifu60', D2, '14:00')));
    assert.equal(five.filter((r) => r.status === 200).length, 1);
    /* three at once for two steamers */
    const three = await Promise.all(['A', 'B', 'C'].map((k) => book(k, k, 'steam60', D2, '12:00')));
    assert.equal(three.filter((r) => r.status === 200).length, 2);
  });

  test('stored timestamps carry an explicit +08:00 offset; no bare local time is stored', async () => {
    const db = JSON.parse(fs.readFileSync(path.join(dataDir, 'db.json'), 'utf8'));
    assert.ok(db.bookings.length >= 20);
    for (const b of db.bookings) {
      assert.match(b.startsAt, UB_ISO);
      assert.match(b.endsAt, UB_ISO);
      assert.ok(!('date' in b) && !('time' in b) && !('minutes' in b), 'no bare date/time on ' + b.id);
      for (const h of b.machines) { assert.match(h.startsAt, UB_ISO); assert.match(h.endsAt, UB_ISO); assert.match(h.releasesAt, UB_ISO); }
    }
    for (const bl of db.blocks) {
      assert.match(bl.startsAt, UB_ISO);
      assert.match(bl.endsAt, UB_ISO);
      assert.ok(!('date' in bl) && !('time' in bl));
    }
    /* cancelled bookings keep their times for history but hold nothing (checked above) */
    assert.ok(db.bookings.some((b) => b.status === 'cancelled'));
  });

  test('a block to midnight ends at the next day 00:00+08:00 and reads 24:00', async () => {
    const r = await call('POST', '/api/admin/blocks', tok.C, { date: ubDay(4), from: '18:00', to: '24:00', note: 'evening' });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.data.endsAt, ubDay(5) + 'T00:00:00+08:00');
    assert.equal(r.data.until, '24:00');
    assert.equal(r.data.minutes, 360);
  });
});

describe('upgrading an existing database', () => {
  let tmp, dataDir, cfgFile, srv, call;
  const D = ubDay(3);
  before(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bg-migr-'));
    dataDir = path.join(tmp, 'data');
    cfgFile = writeConfig(tmp);
    srv = await startServer(dataDir, cfgFile);
    call = api(srv.base);
  });
  after(async () => {
    if (srv) await stopServer(srv);
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  });

  test('legacy bare date/time bookings and blocks become +08:00 instants and keep blocking', async () => {
    const owner = (await call('POST', '/api/admin/login-staff', null, { phone: '91113958', password: 'owner123' })).data;
    await stopServer(srv);
    const file = path.join(dataDir, 'db.json');
    const db = JSON.parse(fs.readFileSync(file, 'utf8'));
    db.bookings.push({ id: 'bk-legacy1', userId: null, walkName: 'Legacy', walkPhone: '', serviceId: 'svc-facial-signature', staffId: owner.staffUserId, date: D, time: '11:00', minutes: 60, status: 'confirmed', paid: 'salon', amount: 90000, createdBy: 'admin', createdAt: new Date().toISOString() });
    db.blocks.push({ id: 'bl-legacy1', date: D, time: '15:00', staffId: owner.staffUserId, note: 'old block', createdAt: new Date().toISOString() });
    delete db.meta.scheduleVersion;
    fs.writeFileSync(file, JSON.stringify(db));

    srv = await startServer(dataDir, cfgFile);
    call = api(srv.base);
    const after = JSON.parse(fs.readFileSync(file, 'utf8'));
    const b = after.bookings.find((x) => x.id === 'bk-legacy1');
    assert.equal(b.startsAt, D + 'T11:00:00+08:00');
    assert.equal(b.endsAt, D + 'T12:00:00+08:00');
    assert.ok(!('date' in b) && !('time' in b) && !('minutes' in b));
    const bl = after.blocks.find((x) => x.id === 'bl-legacy1');
    assert.equal(bl.startsAt, D + 'T15:00:00+08:00');
    assert.equal(bl.endsAt, D + 'T16:00:00+08:00');

    const cal = await call('GET', '/api/admin/calendar?date=' + D, owner.token);
    assert.equal(cal.data.bookings.find((x) => x.id === 'bk-legacy1').time, '11:00');
    const r = await call('POST', '/api/admin/walkin', owner.token, { staffId: owner.staffUserId, serviceId: 'svc-facial-express', date: D, time: '11:30', phone: '99555001' });
    assert.equal(r.status, 409);
    assert.equal(r.data.reason, 'staff_busy');
    const r2 = await call('POST', '/api/admin/walkin', owner.token, { staffId: owner.staffUserId, serviceId: 'svc-facial-express', date: D, time: '15:15', phone: '99555002' });
    assert.equal(r2.data.reason, 'staff_busy');

    /* the file as it was before the upgrade is kept next to db.json, byte for byte */
    const copies = fs.readdirSync(dataDir).filter((f) => f.startsWith('db.before-upgrade-'));
    assert.equal(copies.length, 1);
    const kept = JSON.parse(fs.readFileSync(path.join(dataDir, copies[0]), 'utf8'));
    assert.equal(kept.bookings.find((x) => x.id === 'bk-legacy1').time, '11:00');
    assert.ok(!('scheduleVersion' in kept.meta));
    /* an ordinary restart with nothing to upgrade makes no new copy */
    await stopServer(srv);
    srv = await startServer(dataDir, cfgFile);
    call = api(srv.base);
    assert.equal(fs.readdirSync(dataDir).filter((f) => f.startsWith('db.before-upgrade-')).length, 1);
  });

  test('sessions stay valid for weeks of use and expire after 60 idle days', async () => {
    const fresh = (await call('POST', '/api/admin/login-staff', null, { phone: '88000001', password: 'staff123' })).data.token;
    const stale = (await call('POST', '/api/admin/login-staff', null, { phone: '88000001', password: 'staff123' })).data.token;
    await stopServer(srv);
    const file = path.join(dataDir, 'db.json');
    const db = JSON.parse(fs.readFileSync(file, 'utf8'));
    db.adminSessions[fresh].lastSeenAt = new Date(Date.now() - 59 * 86400e3).toISOString();
    db.adminSessions[stale].lastSeenAt = new Date(Date.now() - 61 * 86400e3).toISOString();
    fs.writeFileSync(file, JSON.stringify(db));
    srv = await startServer(dataDir, cfgFile);
    call = api(srv.base);
    assert.equal((await call('GET', '/api/admin/overview', fresh)).status, 200);
    assert.equal((await call('GET', '/api/admin/overview', stale)).status, 401);
  });

  test('signing out ends that session on the server; the same person\'s other sessions stay', async () => {
    const a = (await call('POST', '/api/admin/login-staff', null, { phone: '88000001', password: 'staff123' })).data.token;
    const b = (await call('POST', '/api/admin/login-staff', null, { phone: '88000001', password: 'staff123' })).data.token;
    assert.equal((await call('POST', '/api/admin/logout', a)).status, 200);
    assert.equal((await call('GET', '/api/admin/myday', a)).status, 401);
    assert.equal((await call('GET', '/api/admin/myday', b)).status, 200);
  });
});
