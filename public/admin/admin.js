/* B's Gua Sha — admin panel v3. Roles: superadmin ⊃ owner ⊃ staff (PIN = super admin, others log in by phone). Mongolian-first labels. */
(function () {
  'use strict';

  /* The login lives in localStorage so the panel added to a phone's home screen stays
     signed in for weeks (the server slides each session's 60-day expiry). A login kept
     in sessionStorage by the previous version moves over once. */
  var AUTH_KEYS = ['bg_admin', 'bg_admin_role', 'bg_admin_name', 'bg_admin_sid'];
  function sget(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function sset(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage blocked: this tab only */ } }
  function sdel(k) {
    try { localStorage.removeItem(k); } catch (e) { /* ignore */ }
    try { sessionStorage.removeItem(k); } catch (e) { /* ignore */ }
  }
  try {
    if (!sget('bg_admin') && sessionStorage.getItem('bg_admin')) {
      AUTH_KEYS.forEach(function (k) { var v = sessionStorage.getItem(k); if (v !== null) sset(k, v); sessionStorage.removeItem(k); });
    }
  } catch (e) { /* storage blocked */ }
  var token = sget('bg_admin') || null;
  var role = sget('bg_admin_role') || '';
  var meName = sget('bg_admin_name') || '';
  var meStaffId = sget('bg_admin_sid') || '';
  var tab = '';
  var root = document.getElementById('root');
  var modalHost = document.getElementById('modalHost');
  var theme = localStorage.getItem('bg_theme') || 'light';
  document.documentElement.setAttribute('data-theme', theme);

  var calDate = todayStr();
  var calCache = null;
  var servicesCache = null;
  var staffCache = null;
  var chatThreads = null, chatOpen = null, chatPoll = null;
  var featureWallet = false; /* mirrored from /api/config, owner toggles it in Тохиргоо */

  /* Dates on this panel are Ulaanbaatar dates (UTC+08:00, no DST) whatever the phone's
     own time zone, and date strings are stepped in UTC so no local offset can shift them. */
  function todayStr() { return new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10); }
  function nowHm() { return new Date(Date.now() + 8 * 3600000).toISOString().slice(11, 16); }
  function addDays(ds, n) { return new Date(Date.parse(ds + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10); }
  function weekday(ds) { return new Date(ds + 'T12:00:00Z').getUTCDay(); }
  function toMinutes(t) { var p = String(t).split(':').map(Number); return p[0] * 60 + (p[1] || 0); }
  function addMinutes(time, mins) { var t = toMinutes(time) + mins; return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); }
  var WD_SHORT = ['Ня', 'Да', 'Мя', 'Лх', 'Пү', 'Ба', 'Бя'];
  var WD_LONG = ['Ням', 'Даваа', 'Мягмар', 'Лхагва', 'Пүрэв', 'Баасан', 'Бямба'];
  function dayLabel(ds) {
    var t = todayStr();
    if (ds === t) return 'Өнөөдөр';
    if (ds === addDays(t, 1)) return 'Маргааш';
    if (ds === addDays(t, -1)) return 'Өчигдөр';
    return WD_SHORT[weekday(ds)] + ' ' + Number(ds.slice(5, 7)) + '/' + Number(ds.slice(8, 10));
  }
  /* two weeks of day buttons from today; a date outside that strip comes first */
  function dayChips(sel, attr) {
    var t = todayStr(), out = '', seen = false;
    for (var i = 0; i < 14; i++) {
      var ds = addDays(t, i);
      if (ds === sel) seen = true;
      out += '<button type="button" class="qb-chip' + (ds === sel ? ' on' : '') + '" ' + attr + '="' + ds + '">' + esc(dayLabel(ds)) + '</button>';
    }
    if (!seen) out = '<button type="button" class="qb-chip on" ' + attr + '="' + sel + '">' + esc(dayLabel(sel)) + '</button>' + out;
    return out;
  }
  function toast(msg, kind) {
    var host = document.getElementById('toastHost');
    var el = document.createElement('div');
    el.className = 'toast' + (kind ? ' ' + kind : '');
    el.textContent = msg;
    host.appendChild(el);
    setTimeout(function () { el.remove(); }, 2800);
  }
  function money(n) { return (n || 0).toLocaleString('en-US') + '₮'; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function stars(n) { var o = ''; for (var i = 1; i <= 5; i++) o += i <= n ? '★' : '☆'; return o; }
  function fmtShort(iso) {
    var d = new Date(Date.parse(iso) + 8 * 3600000); /* shown in Ulaanbaatar time */
    return (d.getUTCMonth() + 1) + '/' + d.getUTCDate() + ' ' + String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0');
  }

  function openModal(html) {
    modalHost.innerHTML = '<div class="modal-back"><div class="modal" style="max-width:560px">' + html + '</div></div>';
    var back = modalHost.firstChild;
    back.addEventListener('click', function (e) { if (e.target === back) closeModal(); });
    return back.querySelector('.modal');
  }
  function closeModal() { modalHost.innerHTML = ''; }
  /* Full screen on a phone, a wide dialog on a computer. It shares the modal host,
     so closeModal() closes it too. */
  function openSheet(html) {
    modalHost.innerHTML = '<div class="modal-back sheet-back"><div class="sheet">' + html + '</div></div>';
    var back = modalHost.firstChild;
    back.addEventListener('click', function (e) { if (e.target === back) closeModal(); });
    return back.querySelector('.sheet');
  }

  var machinesCache = null;
  function ensureMachines() {
    if (machinesCache) return Promise.resolve(machinesCache);
    return api('/api/admin/machines').then(function (list) { machinesCache = list; return list; }).catch(function () { return []; });
  }
  function machineName(id) { var m = (machinesCache || []).find(function (x) { return x.id === id; }); return m ? m.name : id; }
  var salonHours = { open: '10:00', close: '19:00' }; /* replaced from /api/config at start */
  function confirmDlg(msg) {
    return new Promise(function (resolve) {
      var m = openModal('<p>' + esc(msg) + '</p><div class="modal-actions">' +
        '<button class="btn btn-ghost" data-x="no">Болих</button>' +
        '<button class="btn btn-primary" data-x="yes">Тийм</button></div>');
      m.querySelector('[data-x="no"]').onclick = function () { closeModal(); resolve(false); };
      m.querySelector('[data-x="yes"]').onclick = function () { closeModal(); resolve(true); };
    });
  }

  function api(path, opts) {
    opts = opts || {};
    var headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    return fetch(path, { method: opts.method || 'GET', headers: headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) {
          if (!r.ok) {
            if (r.status === 401 && token) { doLogout(); }
            throw d;
          }
          return d;
        });
      });
  }
  function doLogout() {
    token = null; role = ''; meName = ''; meStaffId = ''; tab = '';
    AUTH_KEYS.forEach(sdel);
    if (chatPoll) { clearInterval(chatPoll); chatPoll = null; }
    render();
  }
  /* Гарах also ends the session on the server; it would otherwise stay valid for weeks */
  function signOut() {
    var t = token;
    doLogout();
    if (t) fetch('/api/admin/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + t } }).catch(function () {});
  }

  function isSuperRole() { return role === 'superadmin'; }
  function isOwnerRole() { return role === 'superadmin' || role === 'owner'; }
  function defaultTab() { return isOwnerRole() ? 'cal' : 'myday'; }
  /* the booking button starts on the day being looked at, never a past one */
  function viewDate() {
    var d = tab === 'cal' ? calDate : (tab === 'myday' ? myDate : (tab === 'machines' ? boardDate : todayStr()));
    return d < todayStr() ? todayStr() : d;
  }
  var ROLE_LABEL = { superadmin: '🛡 Супер админ', owner: '👑 Эзэмшигч', staff: '👤 Ажилтан', customer: '🙂 Үйлчлүүлэгч' };

  var ST_LABEL = { confirmed: 'Баталгаажсан', done: 'Болсон ✓', cancelled: 'Цуцалсан', noshow: 'Ирээгүй' };
  var PAID_LABEL = { balance: 'Үлдэгдлээс ✓', salon: 'Салон дээр', refunded: 'Буцаагдсан', package: 'Багцаас ✓', package_returned: 'Багц руу буцсан' };

  /* ================= shell ================= */
  function render() {
    if (chatPoll) { clearInterval(chatPoll); chatPoll = null; }
    if (!token) return renderLogin();
    var isOwner = isOwnerRole();
    var tabs = isOwner ? [
      ['cal', '🗓 Календарь'],
      ['myday', '🙋 Миний өдөр'],
      ['machines', '🔧 Машин'],
      ['bookings', '📋 Захиалга'],
      ['users', '👤 Үйлчлүүлэгч'],
      ['chat', '💬 Чат'],
      ['reviews', '⭐ Сэтгэгдэл'],
      ['services', '🌿 Үйлчилгээ'],
      ['products', '🛍 Бүтээгдэхүүн'],
      ['faq', '❓ Асуулт'],
      ['offers', '🎁 Багц · Код'],
      ['staff', '👥 Ажилтан'],
      ['stats', '📊 Тайлан'],
      ['settings', '⚙️ Тохиргоо']
    ] : [
      ['myday', '🙋 Миний өдөр'],
      ['machines', '🔧 Машин'],
      ['bookings', '📋 Захиалга'],
      ['users', '👤 Үйлчлүүлэгч'],
      ['chat', '💬 Чат']
    ];
    if (isSuperRole()) tabs.push(['accounts', '🔐 Бүртгэл']);
    tabs = tabs.filter(function (x) {
      if (x[0] === 'offers') return featureWallet;
      if (x[0] === 'myday') return !isOwner || !!meStaffId; /* an owner who does not treat clients has no day of their own */
      return true;
    });
    if (!tabs.some(function (x) { return x[0] === tab; })) tab = defaultTab();
    root.innerHTML =
      '<div class="row admin-head" style="gap:12px;flex-wrap:wrap"><h2 style="font-family:\'Playfair Display\',serif">B\'s Gua Sha<span class="hide-phone"> — Удирдлага</span></h2>' +
      '<span class="pill">' + (ROLE_LABEL[role] || ROLE_LABEL.staff) + (meName ? ' · ' + esc(meName) : '') + '</span>' +
      '<div class="spacer" style="flex:1"></div>' +
      (isOwner ? '<a class="icon-btn" href="/api/admin/export?token=' + encodeURIComponent(token) + '" download>⬇ Backup</a>' : '') +
      '<button class="btn btn-primary btn-sm" id="quickBtn" title="Утсаар ирсэн захиалга (N)">📞 Захиалга</button>' +
      '<button class="icon-btn" id="calFeedBtn" title="Google Calendar-т харуулах">📅 Google</button>' +
      '<button class="icon-btn" id="themeBtn">' + (theme === 'dark' ? '☀️' : '🌙') + '</button>' +
      '<button class="icon-btn" id="outBtn">Гарах</button></div>' +
      '<div class="admin-tabs">' + tabs.map(function (x) {
        return '<button data-tab="' + x[0] + '" class="' + (tab === x[0] ? 'active' : '') + '">' + x[1] + '</button>';
      }).join('') + '</div>' +
      '<div id="healthHost"></div>' +
      '<div id="content"><div class="skeleton"></div></div>' +
      '<button type="button" class="fab" id="fabBtn" aria-label="Утасны захиалга">📞</button>';

    if (isOwner) loadHealth();
    document.getElementById('quickBtn').onclick = function () { openQuickBook({ date: viewDate() }); };
    document.getElementById('fabBtn').onclick = function () { openQuickBook({ date: viewDate() }); };
    document.getElementById('calFeedBtn').onclick = function () { openCalFeed(false); };
    document.getElementById('themeBtn').onclick = function () {
      theme = theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem('bg_theme', theme);
      document.documentElement.setAttribute('data-theme', theme);
      render();
    };
    document.getElementById('outBtn').onclick = signOut;
    root.querySelectorAll('[data-tab]').forEach(function (b) {
      b.onclick = function () { tab = b.getAttribute('data-tab'); render(); };
    });

    var views = {
      cal: loadCalendar, myday: loadMyDay, machines: loadBoard, bookings: loadBookings, users: loadUsers, chat: loadChat, reviews: loadReviews,
      services: loadServices, products: loadProducts, faq: loadFaqAdmin, offers: loadOffers, staff: loadStaff, stats: loadStats, settings: loadSettings, accounts: loadAccounts
    };
    (views[tab] || views[defaultTab()])();
  }

  function renderLogin() {
    var mode = sessionStorage.getItem('bg_admin_mode') || 'staff';
    root.innerHTML =
      '<div class="pin-wrap"><img src="/assets/logo.svg" alt="">' +
      '<h2 style="font-family:\'Playfair Display\',serif;margin:12px 0">Удирдлагын хэсэг</h2>' +
      '<div class="auth-tabs" style="max-width:320px;margin:0 auto 16px">' +
      '<button id="mStaff" class="' + (mode === 'staff' ? 'active' : '') + '">Утсаар</button>' +
      '<button id="mPin" class="' + (mode === 'pin' ? 'active' : '') + '">Супер админ (PIN)</button></div>' +
      (mode === 'pin'
        ? '<form id="pinForm"><div class="field"><input id="pin" type="password" inputmode="numeric" placeholder="PIN" style="text-align:center;font-size:1.3rem;letter-spacing:0.4em"></div>' +
          '<button class="btn btn-primary btn-block" type="submit">Нэвтрэх</button></form>' +
          '<p class="muted small" style="margin-top:12px">PIN нь супер админы нөөц түлхүүр — config.json дотор солино</p>'
        : '<form id="staffForm"><div class="field"><input id="sfPhone" inputmode="numeric" maxlength="8" placeholder="Утасны дугаар"></div>' +
          '<div class="field"><input id="sfPass" type="password" placeholder="Нууц үг"></div>' +
          '<button class="btn btn-primary btn-block" type="submit">Нэвтрэх</button></form>' +
          '<p class="muted small" style="margin-top:12px">Супер админ, эзэмшигч, ажилтан бүгд утас + нууц үгээр нэвтэрнэ. Эрхийг супер админ "Бүртгэл" хэсгээс үүсгэнэ.</p>') +
      '</div>';
    document.getElementById('mPin').onclick = function () { sessionStorage.setItem('bg_admin_mode', 'pin'); renderLogin(); };
    document.getElementById('mStaff').onclick = function () { sessionStorage.setItem('bg_admin_mode', 'staff'); renderLogin(); };
    var pf = document.getElementById('pinForm');
    if (pf) pf.onsubmit = function (e) {
      e.preventDefault();
      api('/api/admin/login', { method: 'POST', body: { pin: document.getElementById('pin').value } })
        .then(afterLogin)
        .catch(function (err) {
          toast(err && err.error === 'try_later' ? 'Хэт олон оролдлого — 5 мин хүлээнэ үү' : 'PIN буруу байна', 'err');
        });
    };
    var sf = document.getElementById('staffForm');
    if (sf) sf.onsubmit = function (e) {
      e.preventDefault();
      api('/api/admin/login-staff', { method: 'POST', body: { phone: document.getElementById('sfPhone').value.trim(), password: document.getElementById('sfPass').value } })
        .then(afterLogin)
        .catch(function (err) {
          toast(err && (err.error === 'staff_inactive' || err.error === 'account_disabled') ? 'Энэ эрх идэвхгүй байна' : 'Утас эсвэл нууц үг буруу', 'err');
        });
    };
  }
  function afterLogin(d) {
    token = d.token; role = d.role; meName = d.name || ''; meStaffId = d.staffUserId || '';
    sset('bg_admin', token);
    sset('bg_admin_role', role);
    sset('bg_admin_name', meName);
    sset('bg_admin_sid', meStaffId);
    tab = defaultTab();
    render();
  }

  /* ================= calendar ================= */
  function shiftDate(days) { calDate = addDays(calDate, days); }

  function loadCalendar() {
    api('/api/admin/calendar?date=' + calDate).then(function (d) {
      calCache = d;
      ensureServices().then(renderCalendar);
    }).catch(function () { toast('Алдаа гарлаа', 'err'); });
  }
  function ensureServices() {
    if (servicesCache) return Promise.resolve(servicesCache);
    return api('/api/admin/services').then(function (list) { servicesCache = list; return list; });
  }

  function renderCalendar() {
    var c = document.getElementById('content');
    if (!c || !calCache) return;
    var d = calCache;
    var wd = WD_LONG[weekday(calDate)];

    var head = '<div class="cal-head">' +
      '<button class="icon-btn" id="calPrev">←</button>' +
      '<input type="date" id="calDate" class="cell-input" style="width:160px" value="' + calDate + '">' +
      '<button class="icon-btn" id="calNext">→</button>' +
      '<button class="mini-btn" id="calToday">Өнөөдөр</button>' +
      '<b>' + wd + '</b>' +
      (d.closed ? '<span class="chip cancelled">Амралтын өдөр</span>' : '') +
      '<span class="spacer" style="flex:1"></span>' +
      d.staff.map(function (s) {
        return '<span class="small"><span class="staff-dot" style="background:' + esc(s.color) + '"></span>' + esc(s.name) + (s.working ? '' : ' <span class="muted">(амарна)</span>') + '</span>';
      }).join(' ') + '</div>';

    /* Everything that holds a therapist's time that day, in minutes from midnight. A row
       lists whatever overlaps it, so a 10:15 start, a 90-minute treatment or a three-hour
       block all show up (the grid used to show exact row starts only). */
    var held = d.bookings.filter(function (b) { return b.status === 'confirmed' || b.status === 'done'; }).map(function (b) {
      return { bk: b, staffId: b.staffId, s: toMinutes(b.time), e: toMinutes(b.time) + b.minutes };
    }).concat(d.blocks.map(function (bl) {
      return { bl: bl, staffId: bl.staffId, s: toMinutes(bl.time), e: toMinutes(bl.time) + bl.minutes };
    }));
    var step = d.step || 15;

    var grid = '<div class="cal-grid"><table><tr><th></th>' +
      d.staff.map(function (s) { return '<th><span class="staff-dot" style="background:' + esc(s.color) + '"></span>' + esc(s.name) + '</th>'; }).join('') + '</tr>';
    d.slots.forEach(function (time) {
      var r0 = toMinutes(time), r1 = r0 + d.slotMinutes;
      grid += '<tr><td class="timecol">' + time + '</td>';
      d.staff.forEach(function (s) {
        var here = held.filter(function (x) { return x.staffId === s.id && x.s < r1 && r0 < x.e; }).sort(function (a, b) { return a.s - b.s; });
        /* first free start in this row, inside working hours, for the + button */
        var free = null;
        if (s.working && !d.closed) {
          for (var t = Math.max(r0, s.open); t < Math.min(r1, s.close) && free === null; t += step) {
            if (!here.some(function (x) { return x.s <= t && t < x.e; })) free = t;
          }
        }
        var items = here.map(function (x) {
          var cont = x.s < r0; /* began in an earlier row */
          if (x.bl) {
            return '<div class="cal-item blocked' + (cont ? ' cont' : '') + '" data-bl="' + esc(x.bl.id) + '">🚫 ' +
              (cont ? '⋯' : esc(x.bl.time) + '–' + esc(x.bl.until) + ' ' + esc(x.bl.note || 'Хаасан')) + '</div>';
          }
          var b = x.bk;
          return '<div class="cal-item busy' + (cont ? ' cont' : '') + '" style="background:' + esc(s.color) + '" data-bk="' + esc(b.id) + '">' +
            (cont ? '⋯ ' + esc(b.user.name)
              : '<b>' + esc(b.time) + '</b> ' + esc(b.user.name) + '<span class="sub">' + esc(b.service ? b.service.nameMn : '') + ' · ' + b.minutes + ' мин' +
                (b.machines && b.machines.length ? ' · 🔧' : '') + (b.status === 'done' ? ' ✓' : '') + '</span>') + '</div>';
        }).join('');
        var add = free !== null
          ? '<div class="cal-item add" data-free="' + esc(s.id) + '|' + addMinutes('00:00', free) + '">+' + (here.length ? ' ' + addMinutes('00:00', free) : '') + '</div>' : '';
        grid += '<td>' + (items || add ? '<div class="cal-stack">' + items + add + '</div>' : '<div class="cal-cell off"></div>') + '</td>';
      });
      grid += '</tr>';
    });
    grid += '</table></div>';

    c.innerHTML = head + grid +
      '<p class="muted small" style="margin-top:10px">+ дарж захиалга нэмэх эсвэл цаг хаана. Захиалга дарж төлөв солино. 🚫 дарж хаалтыг болиулна. 🔧 = машин ашиглана.</p>';

    document.getElementById('calPrev').onclick = function () { shiftDate(-1); loadCalendar(); };
    document.getElementById('calNext').onclick = function () { shiftDate(1); loadCalendar(); };
    document.getElementById('calToday').onclick = function () { calDate = todayStr(); loadCalendar(); };
    document.getElementById('calDate').onchange = function (e) { if (e.target.value) { calDate = e.target.value; loadCalendar(); } };

    c.querySelectorAll('[data-bk]').forEach(function (el) {
      el.onclick = function () {
        var bk = calCache.bookings.find(function (x) { return x.id === el.getAttribute('data-bk'); });
        if (bk) openBookingModal(bk, loadCalendar);
      };
    });
    c.querySelectorAll('[data-bl]').forEach(function (el) {
      el.onclick = function () {
        confirmDlg('Энэ хаалтыг болиулах уу?').then(function (yes) {
          if (!yes) return;
          api('/api/admin/blocks/' + el.getAttribute('data-bl'), { method: 'DELETE' })
            .then(function () { toast('Нээгдлээ ✓', 'ok'); loadCalendar(); })
            .catch(function () { toast('Алдаа гарлаа', 'err'); });
        });
      };
    });
    c.querySelectorAll('[data-free]').forEach(function (el) {
      el.onclick = function () {
        var p = el.getAttribute('data-free').split('|');
        openCellMenu(p[0], p[1]);
      };
    });
  }

  function openCellMenu(staffId, time) {
    var st = calCache.staff.find(function (s) { return s.id === staffId; }) || {};
    var m = openModal(
      '<h3>' + esc(dayLabel(calDate)) + ' · ' + time + ' — ' + esc(st.name || '') + '</h3>' +
      '<div class="modal-actions" style="flex-direction:column">' +
      '<button class="btn btn-primary big-btn" id="cmAdd">📞 Захиалга нэмэх</button>' +
      '<button class="btn btn-ghost big-btn" id="cmBlock">🚫 Цаг хаах</button></div>'
    );
    m.querySelector('#cmAdd').onclick = function () { closeModal(); openQuickBook({ date: calDate, time: time, staffId: staffId }); };
    m.querySelector('#cmBlock').onclick = function () { closeModal(); openBlockSheet({ date: calDate, staffId: staffId, from: time }); };
  }

  /* ================= setup health =================
     Stays on screen for the owner and super admin until each item is fixed. */
  var HEALTH_TEXT = {
    no_disk: '💾 <b>Өгөгдөл байнгын дискэн дээр биш.</b> Render дахин асах эсвэл шинэ хувилбар гарах бүрт бүртгэл, захиалга, зураг устана. Render → энэ сервис → <b>Disks → Add Disk</b>, Mount path: <code>/opt/render/project/src/data</code>. Бодит ажилтан, үйлчлүүлэгч нэмэхээс өмнө заавал.',
    default_pin: '🔑 Супер админы <b>PIN 1234</b> хэвээр (GitHub дээр ил харагддаг). Render → Environment → <code>ADMIN_PIN</code> нэмээд өөр тоо өгнө үү.',
    default_super: '🔑 Супер админы нууц үг анхных (<code>super123</code>). Супер админ: 🔐 Бүртгэл → Супер админ → шинэ нууц үг.',
    default_owner: '🔑 Эзэмшигчийн нууц үг анхных (<code>owner123</code>). Супер админ: 🔐 Бүртгэл → эзэмшигч → шинэ нууц үг.',
    example_staff: '👤 Жишээ ажилтан (88000001 / staff123) идэвхтэй. Жинхэнэ ажилтнаар сольж эсвэл хаана уу (🔐 Бүртгэл).',
    demo_customer: '🙂 Demo үйлчлүүлэгч (99000000 / demo123) идэвхтэй. Туршилт дууссаны дараа 🔐 Бүртгэл хэсгээс хаана уу.',
    machines_placeholder: '🔧 <b>Машины жагсаалт жишээ (PLACEHOLDER) хэвээр.</b> <code>config.json</code> → <code>machines</code>-д салоны жинхэнэ машин бүрийг (нэр, хэдэн ширхэг, цэвэрлэгээний минут) бичээд <code>"placeholder": true</code>-г устгана. Дараа нь 🌿 Үйлчилгээ → 🔧 Машин-аар үйлчилгээ бүр аль машиныг хэдээс хэдэн минут ашиглахыг тохируулна.',
    service_machine_problem: '🔧 Зарим үйлчилгээ <code>config.json</code>-д байхгүй машин, эсвэл үйлчилгээний хугацаанаас хэтэрсэн машины цагтай байна — тэдгээрийг захиалах боломжгүй. 🌿 Үйлчилгээ → 🔧 Машин-аар засна уу.'
  };
  var healthCache = null;
  function loadHealth() {
    var draw = function (h) {
      var host = document.getElementById('healthHost');
      if (!host || !h || !h.warnings.length) { if (host) host.innerHTML = ''; return; }
      var st = h.storage;
      host.innerHTML = '<div class="card health-card"><b>⚠️ Бодит ашиглалтын өмнө засах зүйлс</b><ul>' +
        h.warnings.map(function (k) { return '<li>' + (HEALTH_TEXT[k] || k) + '</li>'; }).join('') + '</ul>' +
        '<p class="muted small">Өгөгдлийн сан үүссэн: ' + (st.dbCreatedAt ? fmtShort(st.dbCreatedAt) : '—') +
        ' · сервер ' + st.boots + ' удаа асжээ · сүүлд ' + (st.lastBoot ? fmtShort(st.lastBoot) : '—') +
        (st.separateDisk === true ? ' · 💾 тусдаа диск ✓' : '') + '</p></div>';
    };
    if (healthCache) draw(healthCache);
    api('/api/admin/health').then(function (h) { healthCache = h; draw(h); }).catch(function () {});
  }

  /* ================= Google Calendar subscription ================= */
  function openCalFeed(reset) {
    api('/api/admin/calfeed' + (reset ? '/reset' : ''), { method: reset ? 'POST' : 'GET' }).then(function (d) {
      function box(title, url) {
        return '<div class="field"><label>' + title + '</label><div class="row">' +
          '<input class="cell-input" readonly value="' + esc(url) + '" onclick="this.select()">' +
          '<button type="button" class="mini-btn" data-copyurl="' + esc(url) + '">Хуулах</button></div></div>';
      }
      var m = openModal(
        '<h3>📅 Google Calendar-т харуулах</h3>' +
        '<p class="small muted" style="margin-bottom:12px">Энэ системд орсон захиалгууд таны өдөр бүр хардаг Google Calendar дээр автоматаар гарна. Нэг удаа тохируулахад болно.</p>' +
        (d.mine ? box('Миний захиалгууд', d.mine) : '') +
        (d.all ? box('Салоны бүх захиалга (эзэмшигч)', d.all) : '') +
        (!d.mine && !d.all ? '<p class="small">Танд эмчилгээ хийдэг ажилтны профайл алга тул хувийн календарь байхгүй.</p>' : '') +
        '<ol class="small" style="padding-left:18px;margin:10px 0;display:grid;gap:4px">' +
        '<li>Компьютерээс <b>calendar.google.com</b> нээнэ (утасны аппаас энэ тохиргоо байхгүй).</li>' +
        '<li>Зүүн талд <b>Бусад календарь ＋</b> → <b>URL-аас</b> (Other calendars → From URL).</li>' +
        '<li>Дээрх холбоосыг буулгаад <b>Календарь нэмэх</b>. Утсан дээрх Google Calendar-т өөрөө гарч ирнэ.</li></ol>' +
        '<p class="small" style="background:var(--brand-soft);border-radius:10px;padding:10px 12px">⏱ Google энэ календарийг өөрийн хуваариар (заримдаа хэдэн цагаар хоцорч) шинэчилдэг. ' +
        'Өдөр дотор өөрчлөгдсөн захиалгыг энэ системийн <b>Календарь</b> хэсгээс шалгаарай — үнэн мэдээлэл тэнд байна.</p>' +
        '<p class="small muted" style="margin-top:10px">🔒 Холбоос нь нууц түлхүүр. Хэн нэгэнд санамсаргүй өгсөн бол доороос шинэчилнэ үү — хуучин холбоос ажиллахаа болино.</p>' +
        '<div class="modal-actions"><button class="btn btn-ghost" id="cfReset">Холбоос шинэчлэх</button>' +
        '<button class="btn btn-primary" id="cfClose">Хаах</button></div>'
      );
      m.querySelector('#cfClose').onclick = closeModal;
      m.querySelector('#cfReset').onclick = function () {
        confirmDlg('Шинэ холбоос үүсгэх үү? Google Calendar-т нэмсэн хуучин холбоос ажиллахаа болино.').then(function (yes) {
          if (yes) openCalFeed(true);
        });
      };
      m.querySelectorAll('[data-copyurl]').forEach(function (b) {
        b.onclick = function () {
          var url = b.getAttribute('data-copyurl');
          var done = function () { toast('Хуулагдлаа ✓', 'ok'); };
          if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(url).then(done, function () { b.previousSibling.select(); });
          else { b.previousSibling.select(); document.execCommand('copy'); done(); }
        };
      });
    }).catch(function () { toast('Алдаа гарлаа', 'err'); });
  }

  /* ================= fast phone booking =================
     Three steps while the caller is still on the line: number → service → time.
     Phone-first: a full-screen sheet, big tap targets, no dropdowns, and the time
     step lists only start times the server says are free for the staff member AND
     every machine the service needs — a clash cannot be picked. A number we don't
     know becomes a client record when the booking is saved. */
  function openQuickBook(opts) {
    opts = opts || {};
    var st = {
      client: opts.client || null, newName: '', phone: '', serviceId: opts.serviceId || null,
      date: opts.date || todayStr(), time: opts.time || null,
      staffId: opts.staffId || meStaffId || '', staffList: [], slots: null, slotInfo: {}, matches: [], noPhone: false, note: '', jump: null
    };
    var lookupTimer = null, lookupSeq = 0;
    var host = openSheet('<div id="qb" class="sheet-inner"></div>').querySelector('#qb');

    function svcById(id) { return (servicesCache || []).find(function (x) { return x.id === id; }); }
    function hasWho() { return !!(st.client || st.phone.length === 8 || st.newName.trim()); }
    function ready() { return hasWho() && !!st.serviceId && !!st.staffId && !!st.time; }
    function missing() {
      if (!hasWho()) return '1 · Утасны дугаар оруулна уу';
      if (!st.serviceId) return '2 · Үйлчилгээ сонгоно уу';
      if (!st.time) return '3 · Цаг сонгоно уу';
      return '';
    }
    function okLabel() {
      var svc = svcById(st.serviceId);
      return ready() ? 'Захиалах · ' + dayLabel(st.date) + ' ' + st.time + ' · ' + (svc ? svc.nameMn : '') : missing();
    }

    function whoHtml() {
      var c = st.client;
      if (c) {
        return '<div class="qb-client"><div><b>' + esc(c.name) + '</b> <span class="muted small">' + esc(c.phone) + '</span>' +
          '<br><span class="muted small">' + (c.visits ? c.visits + ' удаа ирсэн' + (c.lastVisit ? ' · сүүлд ' + esc(c.lastVisit) + (c.lastServiceName ? ' ' + esc(c.lastServiceName) : '') : '') : 'Анх удаа') +
          (c.nextBooking ? ' · 📅 ' + esc(c.nextBooking) : '') + '</span>' +
          (c.desc ? '<div class="small" style="margin-top:4px">📋 ' + esc(c.desc) + '</div>' : '') + '</div>' +
          '<button type="button" class="qb-link" id="qbChange">Солих</button></div>';
      }
      if (st.noPhone) {
        return '<input id="qbName" class="qb-phone" maxlength="60" autocomplete="off" placeholder="Зочны нэр" value="' + esc(st.newName) + '">' +
          '<button type="button" class="qb-link" id="qbBackPhone">← Утсаар хайх</button>';
      }
      var isNew = st.phone.length === 8 && !st.matches.some(function (x) { return x.phone === st.phone; });
      return '<input id="qbPhone" class="qb-phone" type="tel" inputmode="numeric" autocomplete="off" maxlength="8" placeholder="Утасны дугаар" value="' + esc(st.phone) + '">' +
        st.matches.map(function (x, i) {
          return '<button type="button" class="qb-match" data-match="' + i + '"><b>' + esc(x.name) + '</b> <span class="muted">' + esc(x.phone) + '</span>' +
            (x.lastVisit ? '<span class="muted small"> · сүүлд ' + esc(x.lastVisit) + '</span>' : '') + '</button>';
        }).join('') +
        (isNew ? '<div class="qb-new">✨ Шинэ дугаар — захиалгатай хамт үйлчлүүлэгч бүртгэгдэнэ' +
          '<input id="qbName" class="cell-input big-input" maxlength="60" autocomplete="off" placeholder="Нэр (заавал биш)" value="' + esc(st.newName) + '"></div>' : '') +
        (!st.phone ? '<button type="button" class="qb-link" id="qbNoPhone">Утасгүй зочин</button>' : '');
    }

    function servicesHtml() {
      return '<div class="qb-svcs">' + (servicesCache || []).filter(function (s) { return s.active; }).map(function (s) {
        var prev = st.client && st.client.lastServiceId === s.id;
        var mach = (s.uses || []).map(function (u) { return machineName(u.machine); }).join(', ');
        return '<button type="button" class="qb-svc' + (s.id === st.serviceId ? ' on' : '') + '" data-svc="' + esc(s.id) + '">' +
          '<span class="qb-svc-name">' + esc(s.emoji || '🌿') + ' ' + esc(s.nameMn) + '</span>' +
          '<small>' + s.minutes + ' мин · ' + money(s.price) + (prev ? ' · өмнөх' : '') + '</small>' +
          (mach ? '<small class="qb-mach">🔧 ' + esc(mach) + '</small>' : '') + '</button>';
      }).join('') + '</div>';
    }

    function timesHtml() {
      var staffChips = isOwnerRole() && st.staffList.length > 1
        ? '<div class="qb-row wrap">' + st.staffList.map(function (s) {
            return '<button type="button" class="qb-chip' + (s.id === st.staffId ? ' on' : '') + '" data-staff="' + esc(s.id) + '"' + (s.working ? '' : ' disabled') + '>' +
              esc(s.name) + (s.working ? '' : ' · амарна') + '</button>';
          }).join('') + '</div>' : '';
      var days = '<div class="qb-row qb-days">' + dayChips(st.date, 'data-day') + '</div>';
      var body;
      if (!st.serviceId) body = '<p class="muted small">Эхлээд үйлчилгээгээ сонгоно уу.</p>';
      else if (!st.staffId) body = '<p class="qb-warn">Энэ өдөр ажиллах ажилтан алга.</p>';
      else if (!st.slots) body = '<p class="muted small">Чөлөөтэй цаг хайж байна…</p>';
      else if (st.slotInfo.problem) body = '<p class="qb-warn">Энэ үйлчилгээний машины тохиргоо буруу байна — эзэмшигчид хэлнэ үү.</p>';
      else if (st.slotInfo.closed) body = '<p class="qb-warn">🌙 Энэ өдөр амарна.</p>';
      else if (!st.slots.length) body = '<p class="qb-warn">Энэ өдөр чөлөөтэй цаг алга — өөр өдөр сонгоно уу.</p>';
      else {
        var byHour = {};
        st.slots.forEach(function (t) { (byHour[t.slice(0, 2)] = byHour[t.slice(0, 2)] || []).push(t); });
        body = Object.keys(byHour).sort().map(function (h) {
          return '<div class="qb-hour"><span class="qb-h">' + h + '</span><div class="qb-slots">' + byHour[h].map(function (t) {
            return '<button type="button" class="qb-slot' + (t === st.time ? ' on' : '') + '" data-time="' + t + '">' + t + '</button>';
          }).join('') + '</div></div>';
        }).join('');
      }
      return staffChips + days + body;
    }

    function draw() {
      /* lookups and slot loads redraw while the caller is typing: keep the cursor where it was */
      var act = document.activeElement;
      var keep = act && host.contains(act) && act.id ? { id: act.id, pos: act.selectionStart } : null;
      keepPlace(host, function () {
        host.innerHTML =
          '<div class="sheet-head"><b>📞 Утасны захиалга</b><button type="button" class="sheet-x" id="qbCancel" aria-label="Хаах">✕</button></div>' +
          '<div class="sheet-body">' +
          '<div class="qb-step" id="qbS1"><span class="qb-n">1</span><div class="qb-body">' + whoHtml() + '</div></div>' +
          '<div class="qb-step" id="qbS2"><span class="qb-n">2</span><div class="qb-body">' + servicesHtml() + '</div></div>' +
          '<div class="qb-step" id="qbS3"><span class="qb-n">3</span><div class="qb-body">' + timesHtml() + '</div></div>' +
          '<details class="qb-more"' + (st.note ? ' open' : '') + '><summary>+ Тэмдэглэл</summary><input id="qbNote" class="cell-input big-input" maxlength="500" placeholder="ж: анх удаа ирнэ, хүзүү өвддөг" value="' + esc(st.note) + '"></details>' +
          '</div>' +
          '<div class="sheet-foot"><button type="button" class="btn btn-primary btn-block big-btn" id="qbOk"' + (ready() ? '' : ' disabled') + '>' + esc(okLabel()) + '</button></div>';
      });
      bind();
      if (keep) {
        var el = host.querySelector('#' + keep.id);
        if (el) { el.focus(); try { el.setSelectionRange(keep.pos, keep.pos); } catch (e) { /* not a text field */ } }
      }
      /* after a pick, bring the next step into view (one thumb, no hunting) — for the times,
         once they have loaded, so the redraw that shows them cannot cut the scroll short */
      if (st.jump && (st.jump !== 'qbS3' || st.slots !== null || !st.serviceId || !st.staffId)) {
        var j = host.querySelector('#' + st.jump);
        st.jump = null;
        if (j && j.scrollIntoView) j.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }

    function loadSlots() {
      st.slots = null;
      if (!st.serviceId || !st.staffId) { draw(); return; }
      var key = st.date + st.serviceId + st.staffId;
      draw();
      api('/api/admin/free?date=' + st.date + '&serviceId=' + encodeURIComponent(st.serviceId) + '&staffId=' + encodeURIComponent(st.staffId))
        .then(function (d) {
          if (key !== st.date + st.serviceId + st.staffId) return;
          st.slots = d.slots;
          st.slotInfo = { closed: d.closed, problem: d.problem };
          if (st.time && d.slots.indexOf(st.time) < 0) st.time = null;
          draw();
        })
        .catch(function () { st.slots = []; st.slotInfo = {}; draw(); });
    }
    function loadStaff() {
      api('/api/admin/calendar?date=' + st.date).then(function (cal) {
        st.staffList = cal.staff;
        var cur = cal.staff.find(function (s) { return s.id === st.staffId; });
        if (!cur || !cur.working) {
          var w = cal.staff.find(function (s) { return s.working; }) || cal.staff[0];
          st.staffId = w ? w.id : '';
        }
        loadSlots();
      }).catch(function () { draw(); });
    }
    function lookup(qv) {
      clearTimeout(lookupTimer);
      var seq = ++lookupSeq;
      if (qv.length < 4) { st.matches = []; draw(); return; }
      lookupTimer = setTimeout(function () {
        api('/api/admin/lookup?q=' + encodeURIComponent(qv)).then(function (list) {
          if (seq !== lookupSeq) return;
          st.matches = list;
          var exact = qv.length === 8 && list.find(function (x) { return x.phone === qv; });
          if (exact) pick(exact); else draw();
        }).catch(function () {});
      }, 180);
    }
    function pick(c) {
      st.client = c; st.matches = [];
      if (!st.serviceId && c.lastServiceId && (servicesCache || []).some(function (s) { return s.id === c.lastServiceId && s.active; })) st.serviceId = c.lastServiceId;
      /* the number is complete: drop the keyboard and move on */
      if (document.activeElement && host.contains(document.activeElement)) document.activeElement.blur();
      st.jump = st.serviceId ? 'qbS3' : 'qbS2';
      loadSlots();
    }

    function bind() {
      var ph = host.querySelector('#qbPhone');
      if (ph) ph.oninput = function () { st.phone = ph.value.replace(/\D/g, '').slice(0, 8); lookup(st.phone); };
      var nm = host.querySelector('#qbName');
      if (nm) nm.oninput = function () {
        st.newName = nm.value;
        var ok = host.querySelector('#qbOk');
        ok.disabled = !ready();
        ok.textContent = okLabel();
      };
      host.querySelectorAll('[data-match]').forEach(function (b) {
        b.onclick = function () { pick(st.matches[Number(b.getAttribute('data-match'))]); };
      });
      var ch = host.querySelector('#qbChange');
      if (ch) ch.onclick = function () { st.client = null; st.phone = ''; draw(); focusPhone(); };
      var np = host.querySelector('#qbNoPhone');
      if (np) np.onclick = function () { st.noPhone = true; draw(); var n = host.querySelector('#qbName'); if (n) n.focus(); };
      var bp = host.querySelector('#qbBackPhone');
      if (bp) bp.onclick = function () { st.noPhone = false; st.newName = ''; draw(); focusPhone(); };
      host.querySelectorAll('[data-svc]').forEach(function (b) {
        b.onclick = function () { st.serviceId = b.getAttribute('data-svc'); st.jump = 'qbS3'; loadSlots(); };
      });
      host.querySelectorAll('[data-staff]').forEach(function (b) {
        b.onclick = function () { st.staffId = b.getAttribute('data-staff'); st.time = null; loadSlots(); };
      });
      host.querySelectorAll('[data-day]').forEach(function (b) {
        b.onclick = function () { st.date = b.getAttribute('data-day'); st.time = null; loadStaff(); };
      });
      host.querySelectorAll('[data-time]').forEach(function (b) {
        b.onclick = function () { st.time = b.getAttribute('data-time'); draw(); };
      });
      var note = host.querySelector('#qbNote');
      if (note) note.oninput = function () { st.note = note.value; };
      host.querySelector('#qbCancel').onclick = closeModal;
      host.querySelector('#qbOk').onclick = submit;
    }
    function focusPhone() {
      var p = host.querySelector('#qbPhone');
      if (p) { p.focus(); p.setSelectionRange(p.value.length, p.value.length); }
    }
    function submit() {
      if (!ready()) return;
      var btn = host.querySelector('#qbOk');
      btn.disabled = true;
      var body = { serviceId: st.serviceId, staffId: st.staffId, date: st.date, time: st.time, via: 'phone', note: st.note };
      if (st.client) body.customerId = st.client.id;
      else { body.phone = st.phone; body.name = st.newName.trim(); }
      api('/api/admin/walkin', { method: 'POST', body: body }).then(function (d) {
        closeModal();
        toast('Захиалга нэмэгдлээ ✓ ' + dayLabel(st.date) + ' ' + st.time + (d.customerCreated ? ' — шинэ үйлчлүүлэгч бүртгэгдлээ' : ''), 'ok');
        refreshCurrent(st.date);
      }).catch(function (e) {
        toast(bookingError(e), 'err');
        btn.disabled = false;
        if (e && e.error === 'slot_taken') { st.time = null; loadSlots(); }
      });
    }

    /* Enter books from anywhere in the sheet (focus often sits on a tapped button) */
    function onKey(e) {
      if (!document.contains(host)) { document.removeEventListener('keydown', onKey); return; }
      if (e.key === 'Enter' && e.target.id !== 'qbNote' && ready()) { e.preventDefault(); submit(); }
    }
    document.addEventListener('keydown', onKey);
    Promise.all([ensureServices(), ensureMachines()]).then(function () {
      draw();
      if (!st.client) focusPhone();
      loadStaff();
    });
  }

  /* redraw a sheet without losing the user's place: its scroll and the day strip's position */
  function keepPlace(host, fn) {
    var body = host.querySelector('.sheet-body'), strip = host.querySelector('.qb-days');
    var top = body ? body.scrollTop : 0, left = strip ? strip.scrollLeft : null;
    fn();
    body = host.querySelector('.sheet-body');
    strip = host.querySelector('.qb-days');
    if (body) body.scrollTop = top;
    if (strip) {
      if (left !== null) strip.scrollLeft = left;
      else { var on = strip.querySelector('.on'); if (on) strip.scrollLeft = Math.max(0, on.offsetLeft - 60); }
    }
  }

  function bookingError(e) {
    var reason = e && e.reason;
    if (reason === 'machine_busy') return 'Машин тэр цагт дөнгөж сая захиалагдлаа — өөр цаг сонгоно уу';
    if (reason === 'staff_busy') return 'Тэр цагт ажилтан завгүй болсон байна — өөр цаг сонгоно уу';
    var map = {
      slot_taken: 'Энэ цаг дөнгөж сая авагдлаа — өөр цаг сонгоно уу', date_out_of_range: 'Огноо захиалгын хугацаанаас хол байна',
      bad_time: 'Цаг сонгоно уу', bad_staff: 'Ажилтан сонгоно уу', outside_hours: 'Ажлын цагаас гадуур байна', staff_off: 'Ажилтан тэр өдөр амарна', closed: 'Салон тэр өдөр амарна',
      machine_not_configured: 'Энэ үйлчилгээний машин тохируулагдаагүй байна', machine_window_outside_service: 'Үйлчилгээний машины цаг буруу тохируулагдсан'
    };
    return (e && map[e.error]) || 'Алдаа гарлаа';
  }
  /* reload whatever view is open after a booking / block change */
  function refreshCurrent(date) {
    if (tab === 'cal') { if (date) calDate = date; loadCalendar(); }
    else if (tab === 'myday') { if (date) myDate = date; loadMyDay(); }
    else if (tab === 'machines') { if (date) boardDate = date; loadBoard(); }
    else if (tab === 'bookings') loadBookings();
    else if (tab === 'users') loadUsers();
  }

  /* ================= my day (own bookings only — enforced by the server) ================= */
  var myDate = todayStr();
  function dateNavHtml(ds) {
    return '<div class="day-nav"><button type="button" class="day-arrow" data-nav="-1" aria-label="Өмнөх өдөр">‹</button>' +
      '<button type="button" class="day-title" data-nav="0"><b>' + esc(dayLabel(ds)) + '</b><small>' + esc(ds) + ' · ' + WD_LONG[weekday(ds)] + '</small></button>' +
      '<button type="button" class="day-arrow" data-nav="1" aria-label="Дараагийн өдөр">›</button></div>';
  }
  function bindDateNav(c, get, set, reload) {
    c.querySelectorAll('[data-nav]').forEach(function (b) {
      b.onclick = function () {
        var n = Number(b.getAttribute('data-nav'));
        set(n === 0 ? todayStr() : addDays(get(), n));
        reload();
      };
    });
  }

  function loadMyDay() {
    var c = document.getElementById('content');
    api('/api/admin/myday?date=' + myDate).then(function (d) {
      var s = d.staff;
      var meta = d.closed ? '<span class="chip cancelled">Салон амарна</span>'
        : (s && s.working ? '🕙 ' + esc(s.open) + '–' + esc(s.close) + ' ажиллана' : (s ? '<span class="chip noshow">Та энэ өдөр амарна</span>' : '<span class="muted">Танд эмчилгээний хуваарь алга</span>'));
      var list = d.items.length ? d.items.map(dayItemHtml).join('') : '<div class="empty-day">Энэ өдөр захиалга алга 🌿</div>';
      c.innerHTML = dateNavHtml(myDate) + '<div class="day-meta">' + meta + '</div>' +
        (s ? '<div class="big-actions"><button class="btn btn-primary big-btn" id="mdBook">📞 Захиалга нэмэх</button>' +
          '<button class="btn btn-ghost big-btn" id="mdBlock">🚫 Цаг хаах</button></div>' : '') +
        '<div class="day-list">' + list + '</div>';
      bindDateNav(c, function () { return myDate; }, function (v) { myDate = v; }, loadMyDay);
      var mb = document.getElementById('mdBook');
      if (mb) mb.onclick = function () { openQuickBook({ date: myDate }); };
      var mk = document.getElementById('mdBlock');
      if (mk) mk.onclick = function () { openBlockSheet({ date: myDate, items: d.items, staff: s }); };
      c.querySelectorAll('[data-item]').forEach(function (el) {
        el.onclick = function (e) {
          if (e.target.closest('a')) return; /* tapping the phone number calls */
          var bk = d.items.find(function (x) { return x.id === el.getAttribute('data-item'); });
          if (bk) openBookingModal(bk, loadMyDay);
        };
      });
      c.querySelectorAll('[data-unblock]').forEach(function (b) {
        b.onclick = function () {
          confirmDlg('Энэ хаалтыг болиулах уу?').then(function (yes) {
            if (!yes) return;
            api('/api/admin/blocks/' + b.getAttribute('data-unblock'), { method: 'DELETE' })
              .then(function () { toast('Нээгдлээ ✓', 'ok'); loadMyDay(); })
              .catch(function () { toast('Алдаа гарлаа', 'err'); });
          });
        };
      });
    }).catch(function () { toast('Алдаа гарлаа', 'err'); });
  }
  function dayItemHtml(x) {
    if (x.kind === 'block') {
      return '<div class="day-item is-block"><div class="di-time">' + esc(x.time) + '<small>' + esc(x.until) + '</small></div>' +
        '<div class="di-body"><b>🚫 ' + esc(x.note || 'Хаасан цаг') + '</b><div class="muted small">Зөвхөн таны цаг — машин чөлөөтэй хэвээр</div></div>' +
        '<button type="button" class="mini-btn di-act" data-unblock="' + esc(x.id) + '">Нээх</button></div>';
    }
    var dim = x.status === 'cancelled' || x.status === 'noshow';
    return '<div class="day-item' + (dim ? ' is-dim' : '') + '" data-item="' + esc(x.id) + '" role="button" tabindex="0">' +
      '<div class="di-time">' + esc(x.time) + '<small>' + esc(addMinutes(x.time, x.minutes)) + '</small></div>' +
      '<div class="di-body"><b>' + esc(x.user.name) + '</b>' + (x.walkIn ? ' <span class="pill">зочин</span>' : '') +
      (x.user.phone ? ' <a class="di-call" href="tel:' + esc(x.user.phone) + '">📞 ' + esc(x.user.phone) + '</a>' : '') +
      '<div class="small">' + esc(x.service ? x.service.nameMn : '') + ' · ' + x.minutes + ' мин</div>' +
      (x.machines && x.machines.length ? '<div class="di-mach">' + x.machines.map(function (h) {
        return '<span>🔧 ' + esc(h.name) + ' ' + esc(h.from) + '–' + esc(h.to) + '</span>';
      }).join('') + '</div>' : '') + '</div>' +
      '<span class="chip ' + esc(x.status) + '">' + (ST_LABEL[x.status] || x.status) + '</span></div>';
  }

  /* ================= block time =================
     A block makes only that staff member unavailable — every machine stays bookable
     by the others. Staff block their own time; the owner can block anyone's. */
  function openBlockSheet(opts) {
    var st = { date: opts.date || myDate, staffId: opts.staffId || '', from: opts.from ? toMinutes(opts.from) : null, dur: 60, note: '', items: null, staff: null };
    var host = openSheet('<div id="bs" class="sheet-inner"></div>').querySelector('#bs');
    var DURS = [[30, '30 мин'], [60, '1 цаг'], [90, '1.5 цаг'], [120, '2 цаг'], [180, '3 цаг'], [0, 'Өдрийн үлдсэн хэсэг']];
    function bounds() {
      var s = st.staff;
      return s && s.working ? [toMinutes(s.open), toMinutes(s.close)] : [toMinutes(salonHours.open), toMinutes(salonHours.close)];
    }
    function endOf(fromMin) { var b = bounds(); return st.dur ? fromMin + st.dur : Math.max(b[1], fromMin + 15); }
    /* that day's bookings that still hold time, and earlier blocks */
    function busy() {
      return (st.items || []).filter(function (x) { return x.kind === 'block' || x.status === 'confirmed' || x.status === 'done'; })
        .map(function (x) { var s0 = toMinutes(x.time); return [s0, s0 + x.minutes]; });
    }
    function clashes(fromMin) {
      var e = endOf(fromMin);
      return busy().some(function (b) { return fromMin < b[1] && b[0] < e; });
    }
    function draw() {
      var b = bounds(), times = [];
      for (var t = b[0]; t < b[1]; t += 15) times.push(t);
      var byHour = {};
      times.forEach(function (t) { var h = String(Math.floor(t / 60)).padStart(2, '0'); (byHour[h] = byHour[h] || []).push(t); });
      var to = st.from !== null ? endOf(st.from) : null;
      var who = st.staffId && st.staff ? ' — ' + esc(st.staff.name) : '';
      keepPlace(host, function () {
        host.innerHTML =
          '<div class="sheet-head"><b>🚫 Цаг хаах' + who + '</b><button type="button" class="sheet-x" id="bsX" aria-label="Хаах">✕</button></div>' +
          '<div class="sheet-body">' +
          '<p class="muted small" style="margin:10px 0 8px">Зөвхөн ажилтныг завгүй болгоно — машиныг бусад ажилтан ашиглаж болно.</p>' +
          '<div class="qb-row qb-days">' + dayChips(st.date, 'data-day') + '</div>' +
          '<h4 class="bs-h">Хэр удаан</h4><div class="qb-row wrap">' + DURS.map(function (d) {
            return '<button type="button" class="qb-chip' + (st.dur === d[0] ? ' on' : '') + '" data-dur="' + d[0] + '">' + d[1] + '</button>';
          }).join('') + '</div>' +
          '<h4 class="bs-h">Хэдээс</h4>' +
          (st.items === null ? '<p class="muted small">Ачаалж байна…</p>' : Object.keys(byHour).sort().map(function (h) {
            return '<div class="qb-hour"><span class="qb-h">' + h + '</span><div class="qb-slots">' + byHour[h].map(function (t) {
              var bad = clashes(t);
              return '<button type="button" class="qb-slot' + (st.from === t ? ' on' : '') + '" data-from="' + t + '"' + (bad ? ' disabled title="Захиалга эсвэл хаалттай давхцана"' : '') + '>' + addMinutes('00:00', t) + '</button>';
            }).join('') + '</div></div>';
          }).join('')) +
          '<input id="bsNote" class="cell-input big-input" maxlength="100" placeholder="Шалтгаан (заавал биш): хувийн, эмч, завсарлага…" value="' + esc(st.note) + '">' +
          '</div>' +
          '<div class="sheet-foot"><button type="button" class="btn btn-primary btn-block big-btn" id="bsOk"' + (st.from !== null ? '' : ' disabled') + '>' +
          (st.from !== null ? 'Хаах · ' + esc(dayLabel(st.date)) + ' ' + addMinutes('00:00', st.from) + '–' + addMinutes('00:00', to) : 'Эхлэх цагаа сонгоно уу') + '</button></div>';
      });
      host.querySelector('#bsX').onclick = closeModal;
      host.querySelectorAll('[data-day]').forEach(function (x) {
        x.onclick = function () { st.date = x.getAttribute('data-day'); st.from = null; st.items = null; draw(); reloadDay(); };
      });
      host.querySelectorAll('[data-from]').forEach(function (x) {
        x.onclick = function () { st.from = Number(x.getAttribute('data-from')); draw(); };
      });
      host.querySelectorAll('[data-dur]').forEach(function (x) {
        x.onclick = function () { st.dur = Number(x.getAttribute('data-dur')); if (st.from !== null && clashes(st.from)) st.from = null; draw(); };
      });
      host.querySelector('#bsNote').oninput = function (e) { st.note = e.target.value; };
      host.querySelector('#bsOk').onclick = submit;
    }
    function reloadDay() {
      api('/api/admin/myday?date=' + st.date + (st.staffId ? '&staffId=' + encodeURIComponent(st.staffId) : ''))
        .then(function (d) { st.items = d.items; st.staff = d.staff; if (st.from !== null && clashes(st.from)) st.from = null; draw(); })
        .catch(function () { st.items = []; draw(); });
    }
    function submit() {
      if (st.from === null) return;
      var btn = host.querySelector('#bsOk');
      btn.disabled = true;
      var to = endOf(st.from);
      var body = { date: st.date, from: addMinutes('00:00', st.from), to: to >= 1440 ? '24:00' : addMinutes('00:00', to), note: st.note };
      if (st.staffId) body.staffId = st.staffId;
      api('/api/admin/blocks', { method: 'POST', body: body })
        .then(function () { closeModal(); toast('Цаг хаагдлаа ✓', 'ok'); refreshCurrent(st.date); })
        .catch(function (e) {
          btn.disabled = false;
          toast(e && e.error === 'staff_busy' ? 'Энэ хугацаанд захиалга эсвэл өөр хаалт байна' : 'Алдаа гарлаа', 'err');
          if (e && e.error === 'staff_busy') reloadDay();
        });
    }
    if (opts.items) {
      st.items = opts.items; st.staff = opts.staff || null;
      if (st.from !== null && clashes(st.from)) st.from = null;
      draw();
    } else { draw(); reloadDay(); }
  }

  /* ================= machine board (shared, anonymous) ================= */
  var boardDate = todayStr();
  function loadBoard() {
    var c = document.getElementById('content');
    api('/api/admin/machines/board?date=' + boardDate).then(function (d) {
      var o = toMinutes(salonHours.open), cl = toMinutes(salonHours.close), span = Math.max(cl - o, 60);
      function pct(t) { return Math.max(0, Math.min(100, ((toMinutes(t) - o) / span) * 100)); }
      var ticks = '';
      for (var h = Math.ceil(o / 60); h * 60 <= cl; h++) ticks += '<i style="left:' + pct(String(h).padStart(2, '0') + ':00') + '%"><span>' + h + '</span></i>';
      var cards = d.machines.map(function (mc) {
        var segs = mc.busy.map(function (x) {
          var l = pct(x.from), w = Math.max(pct(x.to) - l, 0.8);
          return '<b class="seg' + (x.full ? ' full' : '') + '" style="left:' + l + '%;width:' + w + '%" title="' + esc(x.from + '–' + x.to) + '"></b>';
        }).join('');
        return '<div class="card mboard">' +
          '<div class="mb-head"><b>' + esc(mc.name) + '</b>' + (mc.placeholder ? ' <span class="chip noshow">PLACEHOLDER</span>' : '') +
          '<span class="muted small">' + mc.units + ' ширхэг</span></div>' +
          '<div class="mtrack">' + ticks + segs + '</div>' +
          (mc.busy.length ? '<ul class="mlist">' + mc.busy.map(function (x) {
            return '<li>' + (x.full ? '🔴' : '🟡') + ' ' + esc(mc.name) + ' — ашиглагдаж байна <b>' + esc(x.from) + '–' + esc(x.to) + '</b>' +
              (mc.units > 1 ? ' <span class="muted">(' + x.inUse + '/' + mc.units + ')</span>' : '') + '</li>';
          }).join('') + '</ul>' : '<p class="muted small">Өдөржин чөлөөтэй ✓</p>') +
          (mc.cleaning.length ? '<p class="muted small">🧽 Цэвэрлэгээ: ' + mc.cleaning.map(function (x) { return esc(x.from) + '–' + esc(x.to); }).join(', ') + '</p>' : '') +
          '</div>';
      }).join('');
      c.innerHTML = dateNavHtml(boardDate) +
        '<p class="muted small" style="margin:6px 0 12px">Бүх ажилтанд харагдана. Хэн, ямар үйлчлүүлэгч гэдэг нь харагдахгүй — зөвхөн машин хэзээ завгүйг.</p>' +
        (cards || '<p class="muted">Машин бүртгэгдээгүй байна (config.json → machines).</p>');
      bindDateNav(c, function () { return boardDate; }, function (v) { boardDate = v; }, loadBoard);
    }).catch(function () { toast('Алдаа гарлаа', 'err'); });
  }

  /* change a booking's status; cancelling asks first because it frees the time and machines at once */
  function setStatus(id, status, after) {
    var go = function () {
      api('/api/admin/bookings/' + id + '/status', { method: 'POST', body: { status: status } })
        .then(function () { toast(status === 'cancelled' ? 'Цуцлагдлаа — цаг, машин чөлөөлөгдлөө' : 'Хадгалагдлаа ✓', 'ok'); after(); })
        .catch(function (e) { toast(bookingError(e), 'err'); after(); });
    };
    if (status !== 'cancelled') return go();
    confirmDlg('Захиалгыг цуцлах уу? Цаг болон машин шууд чөлөөлөгдөнө.').then(function (yes) { if (yes) go(); });
  }

  function openBookingModal(bk, after) {
    var staffList = isOwnerRole() && bk.status === 'confirmed' && calCache && calCache.date === bk.date ? calCache.staff : [];
    var mach = (bk.machines || []).map(function (h) {
      return '<div>🔧 ' + esc(h.name) + ' <b>' + esc(h.from) + '–' + esc(h.to) + '</b>' +
        (h.until !== h.to ? ' <span class="muted">· цэвэрлэгээ ' + esc(h.until) + ' хүртэл</span>' : '') + '</div>';
    }).join('');
    var m = openModal(
      '<h3>' + esc(bk.user.name) + (bk.walkIn ? ' <span class="pill">зочин</span>' : '') + '</h3>' +
      '<p class="small"><b>' + esc(dayLabel(bk.date)) + ' ' + esc(bk.time) + '–' + esc(addMinutes(bk.time, bk.minutes)) + '</b> · ' +
      esc(bk.service ? bk.service.nameMn : '') + ' · ' + money(bk.amount) + '</p>' +
      (mach ? '<div class="small bm-mach">' + mach + '</div>' : '') +
      '<p class="small muted">Төлбөр: ' + (PAID_LABEL[bk.paid] || bk.paid) + ' · Төлөв: ' + (ST_LABEL[bk.status] || bk.status) + '</p>' +
      (bk.user.phone ? '<a class="btn btn-ghost btn-block mt" href="tel:' + esc(bk.user.phone) + '">📞 ' + esc(bk.user.phone) + '</a>' : '') +
      (staffList.length > 1 ? '<div class="field mt"><label>Ажилтан солих</label><div class="qb-row wrap">' + staffList.map(function (s) {
        return '<button type="button" class="qb-chip' + (s.id === bk.staffId ? ' on' : '') + '" data-assign="' + esc(s.id) + '">' + esc(s.name) + '</button>';
      }).join('') + '</div></div>' : '') +
      '<div class="bm-actions mt">' +
      (bk.status === 'confirmed'
        ? '<button class="btn btn-primary" data-st="done">Болсон ✓</button><button class="btn btn-ghost" data-st="noshow">Ирээгүй</button><button class="btn btn-danger" data-st="cancelled">Цуцлах</button>'
        : '<button class="btn btn-ghost" data-st="confirmed">Сэргээх</button>') +
      '</div>' +
      (bk.user.id ? '<button class="btn btn-ghost btn-block mt" id="bmProfile">👤 Үйлчлүүлэгчийн түүх</button>' : '') +
      '<div class="modal-actions"><button class="btn btn-ghost" id="bmClose">Хаах</button></div>'
    );
    m.querySelector('#bmClose').onclick = closeModal;
    m.querySelectorAll('[data-st]').forEach(function (btn) {
      btn.onclick = function () { closeModal(); setStatus(bk.id, btn.getAttribute('data-st'), after); };
    });
    m.querySelectorAll('[data-assign]').forEach(function (b) {
      b.onclick = function () {
        var sid = b.getAttribute('data-assign');
        if (sid === bk.staffId) return;
        api('/api/admin/bookings/' + bk.id + '/assign', { method: 'POST', body: { staffId: sid } })
          .then(function () { closeModal(); toast('Ажилтан солигдлоо ✓', 'ok'); after(); })
          .catch(function (e) { toast(e && e.reason === 'staff_busy' ? 'Тэр ажилтан тэр цагт завгүй байна' : bookingError(e), 'err'); });
      };
    });
    var pf = m.querySelector('#bmProfile');
    if (pf) pf.onclick = function () { closeModal(); openClientProfile(bk.user.id); };
  }

  /* ================= bookings list ================= */
  function loadBookings() {
    api('/api/admin/overview').then(function (d) {
      var c = document.getElementById('content');
      var s = d.stats;
      function bkRow(b) {
        return '<tr><td><b>' + esc(b.date) + '</b><br>' + esc(b.time) + '–' + esc(addMinutes(b.time, b.minutes)) + '</td>' +
          '<td>' + esc(b.user.name) + (b.walkIn ? ' <span class="pill">зочин</span>' : '') + '<br>' +
          (b.user.phone ? '<a href="tel:' + esc(b.user.phone) + '" class="muted small">' + esc(b.user.phone) + '</a>' : '') + '</td>' +
          '<td>' + esc(b.service ? b.service.nameMn : '?') + '<br><span class="muted small">' + money(b.amount) + ' · ' + (PAID_LABEL[b.paid] || b.paid) + '</span></td>' +
          '<td>' + (b.staffName ? '<span class="staff-dot" style="background:' + esc(b.staffColor || '#b08c46') + '"></span>' + esc(b.staffName) : '—') + '</td>' +
          '<td><span class="chip ' + b.status + '">' + (ST_LABEL[b.status] || b.status) + '</span><div class="bk-actions" style="margin-top:6px">' +
          (b.status === 'confirmed' ? '<button data-st="done" data-id="' + b.id + '">Болсон ✓</button><button data-st="noshow" data-id="' + b.id + '">Ирээгүй</button><button data-st="cancelled" data-id="' + b.id + '">Цуцлах</button>' : '<button data-st="confirmed" data-id="' + b.id + '">Сэргээх</button>') +
          '</div></td></tr>';
      }
      c.innerHTML =
        (s ? '<div class="stat-grid">' +
          '<div class="stat"><b>' + d.upcoming.length + '</b><span>Ирэх захиалга</span></div>' +
          '<div class="stat"><b>' + s.users + '</b><span>Үйлчлүүлэгч</span></div>' +
          '<div class="stat"><b>' + money(s.topupTotal) + '</b><span>Нийт цэнэглэлт</span></div>' +
          '<div class="stat"><b>' + money(s.balancesTotal) + '</b><span>Хэтэвчний үлдэгдэл</span></div>' +
          '<div class="stat"><b>' + s.pendingReviews + '</b><span>Хүлээгдэж буй сэтгэгдэл</span></div>' +
          '<div class="stat"><b>' + s.unreadChats + '</b><span>Уншаагүй чат</span></div></div>' : '') +
        '<div class="card"><h3 style="margin-bottom:10px">Ирэх захиалгууд</h3>' +
        (d.upcoming.length ? '<table><tr><th>Огноо</th><th>Үйлчлүүлэгч</th><th>Үйлчилгээ</th><th>Ажилтан</th><th>Төлөв</th></tr>' + d.upcoming.map(bkRow).join('') + '</table>' : '<p class="muted">Одоогоор захиалга алга.</p>') + '</div>' +
        '<div class="card"><h3 style="margin-bottom:10px">Өмнөх / бусад</h3>' +
        (d.past.length ? '<table><tr><th>Огноо</th><th>Үйлчлүүлэгч</th><th>Үйлчилгээ</th><th>Ажилтан</th><th>Төлөв</th></tr>' + d.past.map(bkRow).join('') + '</table>' : '<p class="muted">Хоосон.</p>') + '</div>';
      c.querySelectorAll('[data-st]').forEach(function (btn) {
        btn.onclick = function () { setStatus(btn.getAttribute('data-id'), btn.getAttribute('data-st'), loadBookings); };
      });
    }).catch(function () { toast('Алдаа гарлаа', 'err'); });
  }

  /* ================= clients ================= */
  /* Everyone on the admin side (staff too) can create a customer record by phone,
     describe them, plan repeat services and record visits. */
  var usersDueOnly = false;
  var DUE_LABEL = { overdue: '⏰ хоцорсон', due: '🔔 ойртсон', booked: '📅 захиалсан', ok: '' };
  function dueChip(state, date) {
    if (!state || state === 'ok') return date ? '<span class="muted small">' + esc(date) + '</span>' : '—';
    var cls = state === 'overdue' ? 'cancelled' : (state === 'due' ? 'noshow' : 'confirmed');
    return '<span class="chip ' + cls + '">' + DUE_LABEL[state] + '</span><br><span class="muted small">' + esc(date) + '</span>';
  }
  function loadUsers(q) {
    var qs = [];
    if (q) qs.push('q=' + encodeURIComponent(q));
    if (usersDueOnly) qs.push('due=1');
    api('/api/admin/users' + (qs.length ? '?' + qs.join('&') : '')).then(function (list) {
      var c = document.getElementById('content');
      c.innerHTML =
        '<div class="row" style="margin-bottom:10px;flex-wrap:wrap">' +
        '<input id="userQ" class="cell-input" style="max-width:280px" placeholder="🔍 Нэр, утас эсвэл тайлбараар хайх…" value="' + esc(q || '') + '">' +
        '<label class="small" style="display:flex;gap:6px;align-items:center;cursor:pointer"><input type="checkbox" id="dueOnly"' + (usersDueOnly ? ' checked' : '') + '> ⏰ Давтан үйлчилгээ ойртсон / хоцорсон</label>' +
        '<div class="spacer" style="flex:1"></div>' +
        '<button class="btn btn-primary btn-sm" id="addCust">＋ Шинэ үйлчлүүлэгч</button></div>' +
        '<div class="card"><table><tr><th>Нэр</th><th>Утас</th>' + (featureWallet ? '<th>Үлдэгдэл</th>' : '') + '<th>Ирсэн</th><th>Сүүлд</th><th>Дараагийн</th><th>Давтан</th><th></th></tr>' +
        list.map(function (u) {
          return '<tr><td><b>' + esc(u.name) + '</b>' + (u.isDemo ? ' <span class="muted small">(demo)</span>' : '') +
            (u.noLogin ? ' <span class="pill" title="Апп-д бүртгүүлээгүй — ажилтан үүсгэсэн">апп-гүй</span>' : '') +
            (u.desc ? '<br><span class="muted small">' + esc(u.desc.slice(0, 70)) + (u.desc.length > 70 ? '…' : '') + '</span>' : '') + '</td>' +
            '<td><a href="tel:' + esc(u.phone) + '">' + esc(u.phone) + '</a></td>' +
            (featureWallet ? '<td>' + money(u.balance) + '</td>' : '') + '<td>' + u.visits + '</td>' +
            '<td>' + esc(u.lastVisit || '—') + '</td><td>' + esc(u.nextBooking || '—') + '</td>' +
            '<td>' + (u.nextDue ? dueChip(u.dueState, u.nextDue) + '<br><span class="muted small">' + esc(u.dueService) + '</span>' : '—') + '</td>' +
            '<td><button class="mini-btn" data-prof="' + esc(u.id) + '">Карт →</button></td></tr>';
        }).join('') + '</table>' + (list.length ? '' : '<p class="muted" style="padding:10px">' + (usersDueOnly ? 'Одоогоор хугацаа болсон давтан үйлчилгээ алга.' : 'Олдсонгүй.') + '</p>') + '</div>';
      var inp = document.getElementById('userQ');
      var tmr = null;
      inp.oninput = function () {
        clearTimeout(tmr);
        tmr = setTimeout(function () { loadUsers(inp.value.trim()); }, 350);
      };
      inp.focus();
      if (q) inp.setSelectionRange(q.length, q.length);
      document.getElementById('dueOnly').onchange = function (e) { usersDueOnly = e.target.checked; loadUsers(inp.value.trim()); };
      document.getElementById('addCust').onclick = function () { openCustomerForm(null, inp.value.trim()); };
      c.querySelectorAll('[data-prof]').forEach(function (b) {
        b.onclick = function () { openClientProfile(b.getAttribute('data-prof')); };
      });
    }).catch(function () { toast('Алдаа гарлаа', 'err'); });
  }

  function customerError(e) {
    var map = { phone_taken: 'Энэ дугаар бүртгэлтэй байна — хайлтаар олоорой', bad_phone: 'Утас 8 оронтой байх ёстой', bad_name: 'Нэрээ оруулна уу' };
    toast((e && map[e.error]) || 'Алдаа гарлаа', 'err');
  }
  /* new customer (u = null) or edit basic info */
  function openCustomerForm(u, prefill) {
    var x = u || { name: '', phone: /^\d+$/.test(prefill || '') ? prefill : '', desc: '', skinType: '', allergies: '', birthday: '' };
    if (!u && prefill && !/^\d+$/.test(prefill)) x.name = prefill;
    var m = openModal(
      '<h3>' + (u ? '✎ Мэдээлэл засах' : '＋ Шинэ үйлчлүүлэгч') + '</h3>' +
      '<div class="row"><div class="field grow"><label>Нэр</label><input id="cfName" maxlength="60" value="' + esc(x.name) + '"></div>' +
      '<div class="field grow"><label>Утас</label><input id="cfPhone" inputmode="numeric" maxlength="8" value="' + esc(x.phone) + '"></div></div>' +
      '<div class="field"><label>Тайлбар (бүх ажилтанд харагдана)</label><textarea id="cfDesc" rows="3" maxlength="1000" placeholder="ж: сард 2 удаа нүүрний гуаша хийлгэдэг, мөр нь чангардаг, орой ирэх дуртай">' + esc(x.desc || '') + '</textarea></div>' +
      '<div class="row"><div class="field grow"><label>Арьсны төрөл</label><input id="cfSkin" maxlength="40" value="' + esc(x.skinType || '') + '"></div>' +
      '<div class="field grow"><label>Төрсөн өдөр</label><input id="cfBday" type="date" value="' + esc(x.birthday || '') + '"></div></div>' +
      '<div class="field"><label>Харшил</label><input id="cfAllergy" maxlength="200" value="' + esc(x.allergies || '') + '"></div>' +
      (u ? '' : '<p class="muted small">Нууц үг хэрэггүй. Үйлчлүүлэгч хожим апп-д энэ дугаараараа бүртгүүлбэл энэ карт, түүх нь түүний бүртгэл болно.</p>') +
      '<div class="modal-actions"><button class="btn btn-ghost" id="cfCancel">Болих</button>' +
      '<button class="btn btn-primary" id="cfSave">' + (u ? 'Хадгалах' : 'Үүсгэх') + '</button></div>'
    );
    m.querySelector('#cfCancel').onclick = function () { closeModal(); if (u) openClientProfile(u.id); };
    m.querySelector('#cfSave').onclick = function () {
      var body = {
        name: m.querySelector('#cfName').value, phone: m.querySelector('#cfPhone').value.trim(),
        desc: m.querySelector('#cfDesc').value, skinType: m.querySelector('#cfSkin').value,
        birthday: m.querySelector('#cfBday').value, allergies: m.querySelector('#cfAllergy').value
      };
      api('/api/admin/customers' + (u ? '/' + u.id : ''), { method: 'POST', body: body })
        .then(function (d) {
          closeModal(); toast(u ? 'Хадгалагдлаа ✓' : 'Үйлчлүүлэгч нэмэгдлээ ✓', 'ok');
          if (tab === 'users') loadUsers();
          openClientProfile(u ? u.id : d.id);
        })
        .catch(customerError);
    };
  }

  /* record a visit (past/today → done) or book the next one (future → confirmed) */
  function openRecordVisit(u, presetServiceId) {
    var date = todayStr();
    ensureServices().then(function (svcs) {
      var svcOpts = svcs.filter(function (s) { return s.active; }).map(function (s) {
        return '<option value="' + esc(s.id) + '"' + (s.id === presetServiceId ? ' selected' : '') + '>' + esc(s.nameMn) + ' · ' + s.minutes + 'мин · ' + money(s.price) + '</option>';
      }).join('');
      var m = openModal(
        '<h3>✅ Үйлчилгээ бүртгэх — ' + esc(u.name) + '</h3>' +
        '<p class="muted small">Өнгөрсөн эсвэл өнөөдрийн үйлчилгээг "болсон" гэж бүртгэнэ. Ирэх цагийг 📅 Цаг товлох-оор захиална.</p>' +
        '<div class="field"><label>Үйлчилгээ</label><select id="rvSvc">' + svcOpts + '</select></div>' +
        '<div class="row"><div class="field grow"><label>Огноо</label><input id="rvDate" type="date" max="' + date + '" value="' + date + '"></div>' +
        '<div class="field grow"><label>Цаг</label><select id="rvTime"></select></div>' +
        '<div class="field grow"><label>Ажилтан</label><select id="rvStaff"></select></div></div>' +
        '<div class="field"><label>Тэмдэглэл (заавал биш — багтай хуваалцана)</label><input id="rvNote" maxlength="500" placeholder="ж: хүзүүнд анхаарсан, дараа удаа LED нэмэх"></div>' +
        '<div class="modal-actions"><button class="btn btn-ghost" id="rvCancel">Болих</button>' +
        '<button class="btn btn-primary" id="rvOk">Бүртгэх</button></div>'
      );
      function fillSlots() {
        var d = m.querySelector('#rvDate').value;
        api('/api/admin/calendar?date=' + d).then(function (cal) {
          var hm = nowHm();
          var slots = cal.slots || [];
          /* default to the latest slot already started today, else the first one */
          var pick = d === todayStr() ? (slots.filter(function (t) { return t <= hm; }).pop() || slots[0]) : slots[0];
          m.querySelector('#rvTime').innerHTML = slots.map(function (t) { return '<option' + (t === pick ? ' selected' : '') + '>' + t + '</option>'; }).join('');
          var cur = m.querySelector('#rvStaff').value || meStaffId;
          m.querySelector('#rvStaff').innerHTML = cal.staff.map(function (s) {
            return '<option value="' + esc(s.id) + '"' + (s.id === cur ? ' selected' : '') + '>' + esc(s.name) + '</option>';
          }).join('');
        }).catch(function () { toast('Алдаа гарлаа', 'err'); });
      }
      fillSlots();
      m.querySelector('#rvDate').onchange = fillSlots;
      m.querySelector('#rvCancel').onclick = function () { closeModal(); openClientProfile(u.id); };
      m.querySelector('#rvOk').onclick = function () {
        var btn = this;
        var d = m.querySelector('#rvDate').value;
        var note = m.querySelector('#rvNote').value.trim();
        if (d > todayStr()) { toast('Ирэх цагийг 📅 Цаг товлох-оор захиална уу', 'err'); return; }
        btn.disabled = true;
        api('/api/admin/walkin', {
          method: 'POST',
          body: { customerId: u.id, serviceId: m.querySelector('#rvSvc').value, date: d, time: m.querySelector('#rvTime').value, staffId: m.querySelector('#rvStaff').value, done: d <= todayStr() }
        }).then(function () {
          return note ? api('/api/admin/notes', { method: 'POST', body: { customerId: u.id, text: note, shared: true } }) : null;
        }).then(function () {
          closeModal(); toast(d <= todayStr() ? 'Үйлчилгээ бүртгэгдлээ ✓' : 'Захиалга нэмэгдлээ ✓', 'ok'); openClientProfile(u.id);
        }).catch(function (e) {
          toast(e && e.error === 'date_out_of_range' ? 'Огноо хэт хуучин байна (60 хоногоос өмнөх)' : bookingError(e), 'err'); btn.disabled = false;
        });
      };
    });
  }

  function openAddPlan(u) {
    ensureServices().then(function (svcs) {
      var m = openModal(
        '<h3>🔁 Давтан үйлчилгээ — ' + esc(u.name) + '</h3>' +
        '<p class="muted small">Хугацаа ойртоход үйлчлүүлэгчийн жагсаалтад "⏰" тэмдэгтэй гарна — залгаж цаг товлоорой.</p>' +
        '<div class="field"><label>Үйлчилгээ</label><select id="plSvc">' + svcs.filter(function (s) { return s.active; }).map(function (s) {
          return '<option value="' + esc(s.id) + '">' + esc(s.nameMn) + '</option>';
        }).join('') + '</select></div>' +
        '<div class="row"><div class="field grow"><label>Хэдэн хоног тутам</label><select id="plEvery">' +
        [[7, '7 хоног тутам'], [14, '2 долоо хоног тутам'], [21, '3 долоо хоног тутам'], [30, 'Сар тутам'], [60, '2 сар тутам'], [90, '3 сар тутам']].map(function (o) {
          return '<option value="' + o[0] + '"' + (o[0] === 14 ? ' selected' : '') + '>' + o[1] + '</option>';
        }).join('') + '</select></div>' +
        '<div class="field grow"><label>Эхлэх огноо</label><input id="plStart" type="date" value="' + todayStr() + '"></div></div>' +
        '<div class="field"><label>Тэмдэглэл (заавал биш)</label><input id="plNote" maxlength="200" placeholder="ж: 10 удаагийн курс"></div>' +
        '<div class="modal-actions"><button class="btn btn-ghost" id="plCancel">Болих</button><button class="btn btn-primary" id="plOk">Нэмэх</button></div>'
      );
      m.querySelector('#plCancel').onclick = function () { closeModal(); openClientProfile(u.id); };
      m.querySelector('#plOk').onclick = function () {
        api('/api/admin/customers/' + u.id + '/plans', { method: 'POST', body: {
          serviceId: m.querySelector('#plSvc').value, everyDays: Number(m.querySelector('#plEvery').value),
          startDate: m.querySelector('#plStart').value, note: m.querySelector('#plNote').value
        } }).then(function () { closeModal(); toast('Нэмэгдлээ ✓', 'ok'); openClientProfile(u.id); })
          .catch(function () { toast('Алдаа гарлаа', 'err'); });
      };
    });
  }

  function openClientProfile(userId) {
    api('/api/admin/users/' + userId).then(function (d) {
      var u = d.user;
      var bksHtml = d.bookings.slice(0, 25).map(function (b) {
        return '<tr><td>' + esc(b.date) + '<br><span class="muted small">' + esc(b.time) + '</span></td>' +
          '<td>' + esc(b.service ? b.service.nameMn : '?') + '<br><span class="muted small">' + (b.staffName ? esc(b.staffName) : '') + '</span></td>' +
          '<td>' + money(b.amount) + '<br><span class="muted small">' + (PAID_LABEL[b.paid] || b.paid) + '</span></td>' +
          '<td><span class="chip ' + b.status + '">' + (ST_LABEL[b.status] || b.status) + '</span></td></tr>';
      }).join('');
      var pkgHtml = d.packages.map(function (p) {
        return '<div class="row small" style="padding:4px 0"><span>🎁 ' + esc(p.name) + '</span><span class="spacer" style="flex:1"></span>' +
          '<b>' + p.remaining + '/' + p.sessions + '</b>' + (p.expired ? ' <span class="chip cancelled">дууссан</span>' : '<span class="muted"> · ' + (p.expiresAt || '').slice(0, 10) + ' хүртэл</span>') + '</div>';
      }).join('') || '<p class="muted small">Багц алга.</p>';
      var notesHtml = d.myNotes.map(function (n) {
        return '<div class="card" style="padding:10px;margin-bottom:8px" data-note="' + esc(n.id) + '">' +
          '<div class="small">' + esc(n.text) + '</div>' +
          '<div class="row" style="margin-top:6px"><span class="muted" style="font-size:0.72rem">' + fmtShort(n.createdAt) + ' · ' + (n.shared ? '👥 багтай хуваалцсан' : '🔒 зөвхөн би') + '</span>' +
          '<span class="spacer" style="flex:1"></span>' +
          '<button class="mini-btn" data-editnote="' + esc(n.id) + '">✎</button>' +
          '<button class="mini-btn" data-delnote="' + esc(n.id) + '">🗑</button></div></div>';
      }).join('');

      var sharedHtml = (d.sharedNotes || []).map(function (n) {
        return '<div class="card" style="padding:10px;margin-bottom:8px"><div class="small">' + esc(n.text) + '</div>' +
          '<div class="muted" style="font-size:0.72rem;margin-top:6px">👥 ' + esc(n.author) + ' · ' + fmtShort(n.createdAt) + '</div></div>';
      }).join('');
      var plansHtml = (d.plans || []).map(function (p) {
        return '<div class="row" style="padding:6px 0;border-bottom:1px solid var(--line);flex-wrap:wrap">' +
          '<div class="grow"><b class="small">' + esc(p.serviceName) + '</b> <span class="muted small">· ' + p.everyDays + ' хоног тутам' + (p.note ? ' · ' + esc(p.note) : '') + '</span><br>' +
          '<span class="muted small">Сүүлд: ' + esc(p.lastVisit || '—') + ' · Дараагийн: <b>' + esc(p.nextDue) + '</b></span></div>' +
          (p.state !== 'ok' ? '<span class="chip ' + (p.state === 'overdue' ? 'cancelled' : (p.state === 'due' ? 'noshow' : 'confirmed')) + '">' + DUE_LABEL[p.state] + '</span>' : '') +
          (p.state !== 'booked' ? '<button class="mini-btn" data-plbook="' + esc(p.serviceId) + '">📅 Цаг товлох</button>' : '') +
          '<button class="mini-btn" data-pldel="' + esc(p.id) + '">🗑</button></div>';
      }).join('') || '<p class="muted small">Давтан үйлчилгээ тохируулаагүй.</p>';

      var m = openModal(
        '<h3>' + esc(u.name) + ' <span class="muted small">' + esc(u.phone) + '</span>' + (d.noLogin ? ' <span class="pill">апп-гүй</span>' : '') + '</h3>' +
        '<div class="row" style="flex-wrap:wrap;margin:8px 0">' +
        '<button class="btn btn-primary btn-sm" id="cpBook">📅 Цаг товлох</button>' +
        '<button class="btn btn-ghost btn-sm" id="cpVisit">✅ Болсон үйлчилгээ бүртгэх</button>' +
        '<button class="btn btn-ghost btn-sm" id="cpPlan">🔁 Давтан үйлчилгээ</button>' +
        '<button class="btn btn-ghost btn-sm" id="cpEdit">✎ Мэдээлэл засах</button>' +
        '<a class="btn btn-ghost btn-sm" href="tel:' + esc(u.phone) + '">📞 Залгах</a></div>' +
        '<div class="card" style="padding:12px;background:var(--brand-soft)"><b class="small">📋 Тайлбар</b> <span class="muted small">(бүх ажилтанд харагдана)</span>' +
        '<p class="small" style="margin-top:4px;white-space:pre-wrap">' + (d.desc ? esc(d.desc) : '<span class="muted">Тайлбар алга — "Мэдээлэл засах"-аар нэмнэ үү.</span>') + '</p></div>' +
        '<div class="stat-grid" style="margin:10px 0">' +
        '<div class="stat"><b>' + d.stats.visits + '</b><span>Ирсэн</span></div>' +
        '<div class="stat"><b>' + money(d.stats.spent) + '</b><span>Нийт зарцуулсан</span></div>' +
        (featureWallet ? '<div class="stat"><b>' + money(u.balance) + '</b><span>Үлдэгдэл</span></div>' : '') +
        '<div class="stat"><b>' + d.stats.noshow + '</b><span>Ирээгүй</span></div></div>' +

        '<div class="card" style="padding:12px">' +
        '<div class="list-row"><span class="lbl">Арьс</span><span>' + esc(u.skinType || '—') + '</span></div>' +
        '<div class="list-row"><span class="lbl">Харшил</span><span>' + esc(u.allergies || '—') + '</span></div>' +
        '<div class="list-row"><span class="lbl">Төрсөн өдөр</span><span>' + esc(u.birthday || '—') + '</span></div>' +
        '<div class="list-row"><span class="lbl">Хүсэлт</span><span class="small">' + esc(u.prefNote || '—') + '</span></div>' +
        '<div class="list-row"><span class="lbl">Дуртай ажилтан</span><span>' + esc(d.preferredStaffName || '—') + '</span></div></div>' +

        (isOwnerRole() && featureWallet ? '<div class="row" style="margin:10px 0"><input id="adjAmount" class="cell-input" style="max-width:130px" inputmode="numeric" placeholder="± дүн ₮">' +
          '<input id="adjNote" class="cell-input" placeholder="Тайлбар (ж: бэлэн мөнгөөр цэнэглэв)">' +
          '<button class="mini-btn" id="adjBtn">Хэтэвч засах</button></div>' : '') +

        '<h3 style="font-size:1rem;margin:14px 0 6px">🔁 Давтан үйлчилгээ</h3>' + plansHtml +

        '<h3 style="font-size:1rem;margin:14px 0 6px">📝 Тэмдэглэл</h3>' +
        '<div id="notesHost">' + notesHtml + sharedHtml + '</div>' +
        '<div class="row" style="flex-wrap:wrap"><input id="newNote" class="cell-input" style="flex:1;min-width:200px" maxlength="500" placeholder="ж: хүчтэй массаж таалагддаг, нуруу эмзэг…">' +
        '<label class="small" style="display:flex;gap:4px;align-items:center"><input type="checkbox" id="noteShared" checked> 👥 багтай хуваалцах</label>' +
        '<button class="mini-btn" id="addNote">+ Нэмэх</button></div>' +

        (featureWallet ? '<h3 style="font-size:1rem;margin:14px 0 6px">🎁 Багцууд</h3>' + pkgHtml : '') +

        '<h3 style="font-size:1rem;margin:14px 0 6px">📅 Үйлчилгээний түүх</h3>' +
        (d.bookings.length ? '<div style="max-height:300px;overflow-y:auto"><table><tr><th>Огноо</th><th>Үйлчилгээ</th><th>Төлбөр</th><th>Төлөв</th></tr>' + bksHtml + '</table></div>' : '<p class="muted small">Захиалга алга.</p>') +

        '<div class="modal-actions"><button class="btn btn-ghost" id="cpClose">Хаах</button></div>'
      );
      m.querySelector('#cpClose').onclick = closeModal;
      var lastDone = d.bookings.find(function (b) { return b.status === 'done'; });
      var cu = {
        id: userId, name: u.name, phone: u.phone, desc: d.desc, skinType: u.skinType, allergies: u.allergies, birthday: u.birthday,
        visits: d.stats.visits, lastVisit: lastDone ? lastDone.date : '', lastServiceName: lastDone && lastDone.service ? lastDone.service.nameMn : ''
      };
      m.querySelector('#cpBook').onclick = function () { closeModal(); openQuickBook({ client: cu }); };
      m.querySelector('#cpVisit').onclick = function () { closeModal(); openRecordVisit(cu); };
      m.querySelector('#cpPlan').onclick = function () { closeModal(); openAddPlan(cu); };
      m.querySelector('#cpEdit').onclick = function () { closeModal(); openCustomerForm(cu); };
      m.querySelectorAll('[data-plbook]').forEach(function (b) {
        b.onclick = function () { closeModal(); openQuickBook({ client: cu, serviceId: b.getAttribute('data-plbook') }); };
      });
      m.querySelectorAll('[data-pldel]').forEach(function (b) {
        b.onclick = function () {
          confirmDlg('Давтан үйлчилгээг устгах уу?').then(function (yes) {
            if (!yes) return;
            api('/api/admin/customers/' + userId + '/plans/' + b.getAttribute('data-pldel'), { method: 'DELETE' })
              .then(function () { closeModal(); openClientProfile(userId); })
              .catch(function () { toast('Алдаа гарлаа', 'err'); });
          });
        };
      });

      var adj = m.querySelector('#adjBtn');
      if (adj) adj.onclick = function () {
        var amt = parseInt(m.querySelector('#adjAmount').value.replace(/[^\d-]/g, ''), 10);
        if (!amt) { toast('Дүн оруулна уу (ж: 50000 эсвэл -10000)', 'err'); return; }
        api('/api/admin/users/' + userId + '/adjust', { method: 'POST', body: { amount: amt, note: m.querySelector('#adjNote').value } })
          .then(function () { toast('Хадгалагдлаа ✓', 'ok'); closeModal(); openClientProfile(userId); })
          .catch(function (e) { toast(e && e.error === 'insufficient_balance' ? 'Үлдэгдэл хасах дүнд хүрэхгүй' : 'Алдаа гарлаа', 'err'); });
      };

      m.querySelector('#addNote').onclick = function () {
        var txt = m.querySelector('#newNote').value.trim();
        if (!txt) return;
        api('/api/admin/notes', { method: 'POST', body: { customerId: userId, text: txt, shared: m.querySelector('#noteShared').checked } })
          .then(function () { toast('Тэмдэглэл нэмэгдлээ ✓', 'ok'); closeModal(); openClientProfile(userId); })
          .catch(function () { toast('Алдаа гарлаа', 'err'); });
      };
      m.querySelectorAll('[data-delnote]').forEach(function (b) {
        b.onclick = function () {
          confirmDlg('Тэмдэглэлийг устгах уу?').then(function (yes) {
            if (!yes) return;
            api('/api/admin/notes/' + b.getAttribute('data-delnote'), { method: 'DELETE' })
              .then(function () { closeModal(); openClientProfile(userId); })
              .catch(function () { toast('Алдаа гарлаа', 'err'); });
          });
        };
      });
      m.querySelectorAll('[data-editnote]').forEach(function (b) {
        b.onclick = function () {
          var card = m.querySelector('[data-note="' + b.getAttribute('data-editnote') + '"]');
          var cur = card.querySelector('.small').textContent;
          var txt = prompt('Тэмдэглэл засах:', cur);
          if (txt === null || !txt.trim()) return;
          api('/api/admin/notes/' + b.getAttribute('data-editnote'), { method: 'POST', body: { text: txt.trim() } })
            .then(function () { closeModal(); openClientProfile(userId); })
            .catch(function () { toast('Алдаа гарлаа', 'err'); });
        };
      });
    }).catch(function () { toast('Алдаа гарлаа', 'err'); });
  }

  /* ================= chat ================= */
  /* Two kinds of chat in one list: app customers (key 'u:<user id>') and website visitors
     (key 'w:<conversation id>'), where the AI answers until someone from the salon steps in. */
  function loadChat() {
    fetchThreads().then(function () {
      renderChatShell();
      if (chatOpen) openThread(chatOpen, true);
      chatPoll = setInterval(function () {
        if (tab !== 'chat') return;
        fetchThreads().then(function () {
          var host = document.getElementById('threadList');
          if (host) host.innerHTML = threadsHtml();
          bindThreads();
          if (chatOpen) refreshConv();
        }).catch(function () {});
      }, 7000);
    }).catch(function () { toast('Алдаа гарлаа', 'err'); });
  }
  function fetchThreads() {
    return Promise.all([api('/api/admin/chat'), api('/api/admin/webchats').catch(function () { return []; })]).then(function (r) {
      var app = r[0].map(function (th) {
        return { key: 'u:' + th.userId, name: th.name, lastText: th.lastText, mine: th.lastFrom === 'salon', lastAt: th.lastAt, unread: th.unread };
      });
      var web = r[1].map(function (th) {
        return { key: 'w:' + th.id, web: true, name: th.user ? th.user.name : 'Вэбсайт зочин', lastText: th.lastText, mine: th.lastFrom === 'staff', ai: th.lastFrom === 'ai',
          lastAt: th.lastAt, unread: th.unread, waiting: th.waiting, aiPaused: th.aiPaused };
      });
      chatThreads = app.concat(web).sort(function (x, y) { return String(y.lastAt || '').localeCompare(String(x.lastAt || '')); });
    });
  }

  function threadsHtml() {
    if (!chatThreads || !chatThreads.length) return '<p class="muted small" style="padding:10px">Чат алга. Үйлчлүүлэгч аппаас эсвэл вэбсайтын чатаас бичих боломжтой.</p>';
    return chatThreads.map(function (th) {
      return '<div class="thread' + (chatOpen === th.key ? ' active' : '') + '" data-th="' + esc(th.key) + '">' +
        '<div style="min-width:0"><div class="tn">' + (th.web ? '🌐 ' : '') + esc(th.name) +
        (th.waiting ? ' <span class="pill" style="font-size:.66rem">хүлээж байна</span>' : '') + '</div>' +
        '<div class="tl">' + (th.mine ? 'Та: ' : th.ai ? '🤖 ' : '') + esc(th.lastText) + '</div></div>' +
        (th.unread ? '<span class="badge">' + th.unread + '</span>' : '') + '</div>';
    }).join('');
  }

  function renderChatShell() {
    var c = document.getElementById('content');
    c.innerHTML = '<div class="chat-cols">' +
      '<div class="card" style="padding:8px" id="threadList">' + threadsHtml() + '</div>' +
      '<div class="card" id="convPane"><p class="muted">Харилцан яриа сонгоно уу.</p></div></div>';
    bindThreads();
  }
  function bindThreads() {
    document.querySelectorAll('[data-th]').forEach(function (el) {
      el.onclick = function () { openThread(el.getAttribute('data-th')); };
    });
  }

  function convHtml(msgs) {
    return msgs.map(function (msg) {
      var me = msg.from === 'salon';
      return '<div class="bubble ' + (me ? 'me' : 'them') + '" style="max-width:75%">' + esc(msg.text) +
        '<span class="bmeta">' + esc(msg.fromName || '') + ' · ' + fmtShort(msg.createdAt) + '</span></div>';
    }).join('');
  }
  /* website chat: the visitor on the left; the AI and staff on the right, each labelled */
  var WEB_AI_NOTE = { paused: 'AI зогссон үед ирсэн — та хариулна', capped: 'AI хариулаагүй: зардлын хязгаар', unavailable: 'AI хариулаагүй: туслах ажиллахгүй байна', error: 'AI хариулаагүй: алдаа', superseded: 'AI-ийн хариуг орхив — ажилтан хариулсан', pending: 'AI хариулж байна…' };
  function webConvHtml(msgs) {
    return msgs.map(function (msg) {
      if (msg.from === 'visitor') {
        var note = msg.ai && msg.ai !== 'answered' && WEB_AI_NOTE[msg.ai] ? '<span class="bmeta">⚠️ ' + esc(WEB_AI_NOTE[msg.ai]) + '</span>' : '';
        return '<div class="bubble them" style="max-width:75%">' + esc(msg.text) + '<span class="bmeta">Зочин · ' + fmtShort(msg.at) + '</span>' + note + '</div>';
      }
      var isAi = msg.from === 'ai';
      return '<div class="bubble me" style="max-width:75%' + (isAi ? ';opacity:.8' : '') + '">' + esc(msg.text) +
        '<span class="bmeta">' + (isAi ? '🤖 AI туслах' : esc(msg.name || '')) + ' · ' + fmtShort(msg.at) + '</span></div>';
    }).join('');
  }
  function webHeadHtml(d) {
    var until = d.aiPausedUntil ? fmtShort(d.aiPausedUntil).split(' ')[1] : '';
    return '<div class="row" style="margin-bottom:6px;flex-wrap:wrap;gap:8px"><b>🌐 ' + (d.user ? esc(d.user.name) : 'Вэбсайт зочин') + '</b>' +
      (d.user && d.user.phone ? '<a class="muted small" href="tel:' + esc(d.user.phone) + '">📞 ' + esc(d.user.phone) + '</a>' : '<span class="muted small">' + esc(fmtShort(d.createdAt)) + '-с</span>') +
      '<span class="spacer" style="flex:1"></span>' +
      (d.aiPaused ? '<button class="mini-btn" id="webAiOn">🤖 AI-д буцааж өгөх</button>' : '<button class="mini-btn" id="webAiOff">✋ Би хариулъя</button>') +
      (isOwnerRole() ? '<button class="mini-btn" id="webDel">🗑</button>' : '') + '</div>' +
      '<p class="small" style="margin:0 0 8px;padding:6px 10px;border-radius:8px;background:var(--surface2)">' +
      (d.aiPaused ? '✋ AI зогссон — та хариулна' + (until ? ' (' + esc(until) + ' хүртэл, дараа нь AI өөрөө үргэлжлүүлнэ)' : '') : '🤖 AI автоматаар хариулж байна. Таны хариу бичихэд AI 2 цаг зогсоно.') + '</p>';
  }

  function openThread(key, keep) {
    chatOpen = key;
    (chatThreads || []).forEach(function (th) { if (th.key === key) th.unread = 0; }); /* opening reads it */
    var host = document.getElementById('threadList');
    if (host) { host.innerHTML = threadsHtml(); bindThreads(); }
    if (key.indexOf('w:') === 0) return openWebThread(key.slice(2));
    var userId = key.slice(2);
    api('/api/admin/chat/' + userId).then(function (d) {
      var pane = document.getElementById('convPane');
      if (!pane || chatOpen !== key) return;
      pane.innerHTML = '<div class="row" style="margin-bottom:8px"><b>' + esc(d.user.name) + '</b>' +
        '<a class="muted small" href="tel:' + esc(d.user.phone) + '">📞 ' + esc(d.user.phone) + '</a>' +
        '<span class="spacer" style="flex:1"></span>' +
        '<button class="mini-btn" id="convProfile">👤 Түүх</button></div>' +
        '<div class="conv" id="convList">' + convHtml(d.messages) + '</div>' +
        '<div class="chat-input" style="position:static;margin-top:10px"><input id="convText" maxlength="1000" placeholder="Хариу бичих…"><button id="convSend">➤</button></div>';
      var list = pane.querySelector('#convList');
      list.scrollTop = list.scrollHeight;
      pane.querySelector('#convProfile').onclick = function () { openClientProfile(userId); };
      pane.querySelector('#convSend').onclick = sendThreadMsg;
      pane.querySelector('#convText').addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); sendThreadMsg(); }
      });
    }).catch(function () { toast('Алдаа гарлаа', 'err'); });
  }
  function openWebThread(id) {
    api('/api/admin/webchats/' + id).then(function (d) {
      var pane = document.getElementById('convPane');
      if (!pane || chatOpen !== 'w:' + id) return;
      pane.innerHTML = '<div id="webHead">' + webHeadHtml(d) + '</div>' +
        '<div class="conv" id="convList">' + webConvHtml(d.messages) + '</div>' +
        '<div class="chat-input" style="position:static;margin-top:10px"><input id="convText" maxlength="1000" placeholder="Хариу бичих… (AI 2 цаг зогсоно)"><button id="convSend">➤</button></div>';
      var list = pane.querySelector('#convList');
      list.scrollTop = list.scrollHeight;
      bindWebHead(id);
      pane.querySelector('#convSend').onclick = sendThreadMsg;
      pane.querySelector('#convText').addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); sendThreadMsg(); }
      });
    }).catch(function () { toast('Алдаа гарлаа', 'err'); });
  }
  function bindWebHead(id) {
    function setAi(paused) {
      api('/api/admin/webchats/' + id + '/ai', { method: 'POST', body: { paused: paused } })
        .then(function () { toast(paused ? 'AI зогслоо — та хариулна' : 'AI дахин хариулна', 'ok'); refreshConv(); })
        .catch(function () { toast('Алдаа гарлаа', 'err'); });
    }
    var off = document.getElementById('webAiOff'), on = document.getElementById('webAiOn'), del = document.getElementById('webDel');
    if (off) off.onclick = function () { setAi(true); };
    if (on) on.onclick = function () { setAi(false); };
    if (del) del.onclick = function () {
      confirmDlg('Энэ яриаг бүрмөсөн устгах уу? Зочны талд ч алга болно.').then(function (yes) {
        if (!yes) return;
        api('/api/admin/webchats/' + id + '/delete', { method: 'POST', body: {} })
          .then(function () { chatOpen = null; toast('Устгалаа', 'ok'); loadChatList(); })
          .catch(function () { toast('Алдаа гарлаа', 'err'); });
      });
    };
  }
  function loadChatList() {
    fetchThreads().then(function () {
      var host = document.getElementById('threadList');
      if (host) { host.innerHTML = threadsHtml(); bindThreads(); }
      var pane = document.getElementById('convPane');
      if (pane && !chatOpen) pane.innerHTML = '<p class="muted">Харилцан яриа сонгоно уу.</p>';
    }).catch(function () {});
  }
  function refreshConv() {
    if (!chatOpen) return;
    var key = chatOpen, web = key.indexOf('w:') === 0;
    api(web ? '/api/admin/webchats/' + key.slice(2) : '/api/admin/chat/' + key.slice(2)).then(function (d) {
      var list = document.getElementById('convList');
      if (!list || chatOpen !== key) return;
      var atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 60;
      list.innerHTML = web ? webConvHtml(d.messages) : convHtml(d.messages);
      if (web) { var h = document.getElementById('webHead'); if (h) { h.innerHTML = webHeadHtml(d); bindWebHead(key.slice(2)); } }
      if (atBottom) list.scrollTop = list.scrollHeight;
    }).catch(function () {});
  }
  function sendThreadMsg() {
    var inp = document.getElementById('convText');
    var text = (inp.value || '').trim();
    if (!text || !chatOpen) return;
    inp.value = '';
    var key = chatOpen, web = key.indexOf('w:') === 0;
    api(web ? '/api/admin/webchats/' + key.slice(2) + '/reply' : '/api/admin/chat/' + key.slice(2), { method: 'POST', body: { text: text } })
      .then(function () { refreshConv(); })
      .catch(function () { toast('Алдаа гарлаа', 'err'); inp.value = text; });
  }

  /* ================= reviews ================= */
  function loadReviews() {
    api('/api/admin/reviews').then(function (list) {
      var c = document.getElementById('content');
      var pending = list.filter(function (r) { return r.approved === null; });
      var rest = list.filter(function (r) { return r.approved !== null; });
      function rvCard(r) {
        var stat = r.approved === true ? '<span class="chip done">Сайтад гарсан ✓</span>' : (r.approved === false ? '<span class="chip cancelled">Нуусан</span>' : '<span class="chip confirmed">Хүлээгдэж байна</span>');
        return '<div class="card" style="padding:13px">' +
          '<div class="row"><span class="star-lg">' + stars(r.rating) + '</span><b>' + esc(r.userName) + '</b>' +
          (r.sample ? '<span class="pill">жишээ</span>' : '') +
          '<span class="muted small">' + esc(r.serviceName || '') + (r.staffName ? ' · ' + esc(r.staffName) : '') + '</span>' +
          '<span class="spacer" style="flex:1"></span>' + stat + '</div>' +
          (r.text ? '<p class="small" style="margin-top:6px">' + esc(r.text) + '</p>' : '') +
          '<div class="bk-actions" style="margin-top:8px">' +
          (r.approved !== true ? '<button data-ap="true" data-id="' + r.id + '">✓ Сайтад гаргах</button>' : '') +
          (r.approved !== false ? '<button data-ap="false" data-id="' + r.id + '">Нуух</button>' : '') +
          '<button data-del="' + r.id + '">🗑 Устгах</button></div></div>';
      }
      c.innerHTML =
        '<p class="muted small" style="margin-bottom:10px">Зөвхөн "Сайтад гаргах" гэснийг зочид вэбсайт дээр харна. Шинэ сэтгэгдэл автоматаар хүлээгдэж байна төлөвтэй ирнэ.</p>' +
        (pending.length ? '<h3 style="margin-bottom:8px">🕐 Хүлээгдэж буй (' + pending.length + ')</h3>' + pending.map(rvCard).join('') : '') +
        '<h3 style="margin:14px 0 8px">Бүх сэтгэгдэл</h3>' +
        (rest.length ? rest.map(rvCard).join('') : '<p class="muted">Одоогоор алга.</p>');
      c.querySelectorAll('[data-ap]').forEach(function (b) {
        b.onclick = function () {
          api('/api/admin/reviews/' + b.getAttribute('data-id'), { method: 'POST', body: { approved: b.getAttribute('data-ap') === 'true' } })
            .then(function () { toast('Хадгалагдлаа ✓', 'ok'); loadReviews(); })
            .catch(function () { toast('Алдаа гарлаа', 'err'); });
        };
      });
      c.querySelectorAll('[data-del]').forEach(function (b) {
        b.onclick = function () {
          confirmDlg('Энэ сэтгэгдлийг бүр мөсөн устгах уу?').then(function (yes) {
            if (!yes) return;
            api('/api/admin/reviews/' + b.getAttribute('data-del'), { method: 'DELETE' })
              .then(function () { loadReviews(); })
              .catch(function () { toast('Алдаа гарлаа', 'err'); });
          });
        };
      });
    }).catch(function () { toast('Алдаа гарлаа', 'err'); });
  }

  /* ================= services CRUD ================= */
  var GROUPS = { facial: 'Нүүр', body: 'Бие', other: 'Бусад' };
  function loadServices() {
    Promise.all([api('/api/admin/services'), ensureMachines()]).then(function (res) {
      var list = res[0];
      servicesCache = list;
      var c = document.getElementById('content');
      c.innerHTML =
        '<div class="row" style="margin-bottom:10px"><p class="muted small" style="flex:1">Шууд мөрөн дээр зас — "Хадгалах" дар. Идэвхгүй үйлчилгээ апп/сайтад харагдахгүй.</p>' +
        '<button class="btn btn-primary btn-sm" id="addSvc">＋ Шинэ үйлчилгээ</button></div>' +
        '<div class="card table-scroll"><table><tr><th></th><th>Нэр (МН / EN)</th><th>Бүлэг</th><th>Мин</th><th>Үнэ (₮)</th><th>Машин</th><th></th><th>Идэвхтэй</th></tr>' +
        list.map(function (s) {
          return '<tr data-row="' + s.id + '">' +
            '<td><input class="cell-input" style="width:46px" data-f="emoji" value="' + esc(s.emoji || '') + '"></td>' +
            '<td><input class="cell-input" data-f="nameMn" value="' + esc(s.nameMn) + '" style="margin-bottom:4px"><input class="cell-input" data-f="nameEn" value="' + esc(s.nameEn) + '"></td>' +
            '<td><select class="cell-input" data-f="group">' + Object.keys(GROUPS).map(function (g) {
              return '<option value="' + g + '"' + (s.group === g ? ' selected' : '') + '>' + GROUPS[g] + '</option>';
            }).join('') + '</select></td>' +
            '<td><input class="cell-input" style="width:64px" type="number" data-f="minutes" value="' + s.minutes + '" min="15" max="240" step="15"></td>' +
            '<td><input class="cell-input" style="width:100px" type="number" data-f="price" value="' + s.price + '" step="1000" min="0"></td>' +
            '<td class="small" style="min-width:130px">' + usesSummary(s) + '<br><button class="mini-btn" data-mach="' + s.id + '" style="margin-top:4px">🔧 Машин</button></td>' +
            '<td><button class="mini-btn" data-save="' + s.id + '">Хадгалах</button><br><button class="mini-btn" data-desc="' + s.id + '" style="margin-top:4px">Тайлбар…</button></td>' +
            '<td><input type="checkbox" data-active="' + s.id + '"' + (s.active ? ' checked' : '') + ' style="width:18px;height:18px"></td></tr>';
        }).join('') + '</table></div>';

      function collect(id) {
        var row = c.querySelector('[data-row="' + id + '"]');
        var body = {};
        row.querySelectorAll('[data-f]').forEach(function (inp) {
          var f = inp.getAttribute('data-f');
          body[f] = (f === 'minutes' || f === 'price') ? Number(inp.value) : inp.value;
        });
        return body;
      }
      c.querySelectorAll('[data-save]').forEach(function (btn) {
        btn.onclick = function () {
          var id = btn.getAttribute('data-save');
          api('/api/admin/services/' + id, { method: 'POST', body: collect(id) })
            .then(function () { toast('Хадгалагдлаа ✓', 'ok'); })
            .catch(function (e) {
              toast(e && e.error === 'machine_window_outside_service' ? 'Машины цаг энэ хугацаанаас хэтэрнэ — эхлээд 🔧 Машин тохиргоог засна уу' : 'Алдаа гарлаа — талбаруудаа шалгана уу', 'err');
            });
        };
      });
      c.querySelectorAll('[data-active]').forEach(function (cb) {
        cb.onchange = function () {
          api('/api/admin/services/' + cb.getAttribute('data-active'), { method: 'POST', body: { active: cb.checked } })
            .then(function () { toast('Хадгалагдлаа ✓', 'ok'); })
            .catch(function () { toast('Алдаа гарлаа', 'err'); });
        };
      });
      c.querySelectorAll('[data-desc]').forEach(function (btn) {
        btn.onclick = function () {
          var s = servicesCache.find(function (x) { return x.id === btn.getAttribute('data-desc'); });
          openSvcDesc(s);
        };
      });
      c.querySelectorAll('[data-mach]').forEach(function (btn) {
        btn.onclick = function () { openMachineUses(servicesCache.find(function (x) { return x.id === btn.getAttribute('data-mach'); })); };
      });
      document.getElementById('addSvc').onclick = openNewService;
    }).catch(function () { toast('Алдаа гарлаа', 'err'); });
  }

  function openSvcDesc(s) {
    var m = openModal(
      '<h3>' + esc(s.nameMn) + ' — тайлбар</h3>' +
      '<div class="field"><label>Монгол тайлбар</label><textarea id="dMn" rows="3" maxlength="300">' + esc(s.descMn || '') + '</textarea></div>' +
      '<div class="field"><label>Англи тайлбар</label><textarea id="dEn" rows="3" maxlength="300">' + esc(s.descEn || '') + '</textarea></div>' +
      '<div class="modal-actions"><button class="btn btn-ghost" id="dCancel">Болих</button>' +
      '<button class="btn btn-primary" id="dSave">Хадгалах</button></div>'
    );
    m.querySelector('#dCancel').onclick = closeModal;
    m.querySelector('#dSave').onclick = function () {
      api('/api/admin/services/' + s.id, { method: 'POST', body: { descMn: m.querySelector('#dMn').value, descEn: m.querySelector('#dEn').value } })
        .then(function () { closeModal(); toast('Хадгалагдлаа ✓', 'ok'); loadServices(); })
        .catch(function () { toast('Алдаа гарлаа', 'err'); });
    };
  }

  function openNewService() {
    var m = openModal(
      '<h3>＋ Шинэ үйлчилгээ</h3>' +
      '<div class="row"><div class="field" style="flex:0 0 70px"><label>Тэмдэг</label><input id="nEmoji" value="🌿" maxlength="4"></div>' +
      '<div class="field grow"><label>Бүлэг</label><select id="nGroup"><option value="facial">Нүүр</option><option value="body">Бие</option><option value="other">Бусад</option></select></div></div>' +
      '<div class="field"><label>Нэр (Монгол)</label><input id="nNameMn" maxlength="80"></div>' +
      '<div class="field"><label>Нэр (Англи)</label><input id="nNameEn" maxlength="80"></div>' +
      '<div class="row"><div class="field grow"><label>Минут</label><input id="nMin" type="number" value="60" min="15" max="240" step="15"></div>' +
      '<div class="field grow"><label>Үнэ (₮)</label><input id="nPrice" type="number" value="90000" step="1000" min="0"></div></div>' +
      '<div class="field"><label>Тайлбар (МН)</label><textarea id="nDescMn" rows="2" maxlength="300"></textarea></div>' +
      '<div class="field"><label>Тайлбар (EN)</label><textarea id="nDescEn" rows="2" maxlength="300"></textarea></div>' +
      '<div class="modal-actions"><button class="btn btn-ghost" id="nCancel">Болих</button>' +
      '<button class="btn btn-primary" id="nSave">Нэмэх</button></div>'
    );
    m.querySelector('#nCancel').onclick = closeModal;
    m.querySelector('#nSave').onclick = function () {
      api('/api/admin/services', {
        method: 'POST',
        body: {
          emoji: m.querySelector('#nEmoji').value, group: m.querySelector('#nGroup').value,
          nameMn: m.querySelector('#nNameMn').value, nameEn: m.querySelector('#nNameEn').value,
          minutes: Number(m.querySelector('#nMin').value), price: Number(m.querySelector('#nPrice').value),
          descMn: m.querySelector('#nDescMn').value, descEn: m.querySelector('#nDescEn').value
        }
      }).then(function () { closeModal(); toast('Нэмэгдлээ ✓', 'ok'); loadServices(); })
        .catch(function () { toast('Алдаа — нэр, минут, үнээ шалгана уу', 'err'); });
    };
  }

  /* ================= service machine usage (owner) =================
     Which machines a service occupies and for which part of it: startOffset minutes
     after the appointment starts, for `minutes`. The machine's own cleaning buffer
     (config.json) is added after each window automatically. */
  function usesSummary(s) {
    var u = s.uses || [];
    if (!u.length) return '<span class="muted">машингүй</span>';
    return u.map(function (x) {
      return esc(machineName(x.machine)) + ' <span class="muted">' + x.startOffset + '–' + (x.startOffset + x.minutes) + ' мин</span>';
    }).join('<br>');
  }
  function openMachineUses(s) {
    ensureMachines().then(function (machines) {
      var rows = (s.uses || []).map(function (u) { return { machine: u.machine, minutes: u.minutes, startOffset: u.startOffset }; });
      var host = openModal('<div id="mu"></div>').querySelector('#mu');
      function draw() {
        host.innerHTML = '<h3>🔧 ' + esc(s.nameMn) + ' — машин</h3>' +
          '<p class="muted small">Үйлчилгээ нийт <b>' + s.minutes + ' мин</b>. Машиныг эхнээсээ хэдэн минутын дараа, хэр удаан эзлэхийг заана. ' +
          'Жишээ: 90 мин үйлчилгээ, машин 15-р минутаас 60 мин → 15–75-р минут. Машингүй бол хоосон үлдээнэ — ажилтны цаг л эзэлнэ.</p>' +
          (machines.length ? '' : '<p class="qb-warn">config.json-д машин алга.</p>') +
          rows.map(function (r, i) {
            return '<div class="mu-row"><div class="qb-row wrap">' + machines.map(function (mc) {
              return '<button type="button" class="qb-chip' + (r.machine === mc.id ? ' on' : '') + '" data-mrow="' + i + '" data-mid="' + esc(mc.id) + '">' + esc(mc.name) + '</button>';
            }).join('') + '</div>' +
              '<div class="row"><label class="small">Хэддүгээр минутаас<input type="number" inputmode="numeric" min="0" step="5" class="cell-input" data-off="' + i + '" value="' + r.startOffset + '"></label>' +
              '<label class="small">Хэдэн минут<input type="number" inputmode="numeric" min="5" step="5" class="cell-input" data-len="' + i + '" value="' + r.minutes + '"></label>' +
              '<button type="button" class="mini-btn" data-del="' + i + '" aria-label="Хасах">🗑</button></div></div>';
          }).join('') +
          (machines.length && rows.length < 4 ? '<button type="button" class="btn btn-ghost btn-sm" id="muAdd">＋ Машин нэмэх</button>' : '') +
          '<div class="modal-actions"><button class="btn btn-ghost" id="muCancel">Болих</button><button class="btn btn-primary" id="muSave">Хадгалах</button></div>';
        host.querySelectorAll('[data-mrow]').forEach(function (b) {
          b.onclick = function () { rows[Number(b.getAttribute('data-mrow'))].machine = b.getAttribute('data-mid'); draw(); };
        });
        host.querySelectorAll('[data-off]').forEach(function (inp) { inp.oninput = function () { rows[Number(inp.getAttribute('data-off'))].startOffset = Number(inp.value); }; });
        host.querySelectorAll('[data-len]').forEach(function (inp) { inp.oninput = function () { rows[Number(inp.getAttribute('data-len'))].minutes = Number(inp.value); }; });
        host.querySelectorAll('[data-del]').forEach(function (b) { b.onclick = function () { rows.splice(Number(b.getAttribute('data-del')), 1); draw(); }; });
        var add = host.querySelector('#muAdd');
        if (add) add.onclick = function () {
          var free = machines.find(function (mc) { return !rows.some(function (r) { return r.machine === mc.id; }); });
          rows.push({ machine: (free || machines[0]).id, minutes: s.minutes, startOffset: 0 });
          draw();
        };
        host.querySelector('#muCancel').onclick = closeModal;
        host.querySelector('#muSave').onclick = function () {
          api('/api/admin/services/' + s.id, { method: 'POST', body: { uses: rows } })
            .then(function () { closeModal(); toast('Хадгалагдлаа ✓', 'ok'); loadServices(); })
            .catch(function (e) {
              var map = { machine_window_outside_service: 'Машины цаг үйлчилгээний ' + s.minutes + ' минутаас хэтэрч байна', unknown_machine: 'Машин сонгоно уу', duplicate_machine: 'Нэг машиныг хоёр удаа сонгох боломжгүй', bad_uses: 'Утгаа шалгана уу' };
              toast((e && map[e.error]) || 'Алдаа гарлаа', 'err');
            });
        };
      }
      draw();
    });
  }

  /* ================= bundles / promos / giftcards ================= */
  function loadOffers() {
    Promise.all([
      api('/api/admin/bundles'),
      api('/api/admin/promos'),
      api('/api/admin/giftcards'),
      ensureServices()
    ]).then(function (res) {
      var bundles = res[0], promos = res[1], gcs = res[2];
      var c = document.getElementById('content');

      var bHtml = bundles.map(function (b) {
        return '<tr><td>' + (b.emoji || '🎁') + ' <b>' + esc(b.nameMn) + '</b><br><span class="muted small">' + esc(b.nameEn) + '</span></td>' +
          '<td>' + b.sessions + ' удаа</td><td>' + money(b.price) + '</td><td>' + b.validDays + ' хоног</td>' +
          '<td>' + b.sold + ' зарагдсан<br><span class="muted small">' + b.activeOwned + ' идэвхтэй</span></td>' +
          '<td><button class="mini-btn" data-editb="' + b.id + '">✎ Засах</button></td>' +
          '<td><input type="checkbox" data-bact="' + b.id + '"' + (b.active ? ' checked' : '') + ' style="width:18px;height:18px"></td></tr>';
      }).join('');

      var pHtml = promos.map(function (p) {
        var exp = p.expiresAt ? p.expiresAt.slice(0, 10) : '—';
        return '<tr><td><b>' + esc(p.code) + '</b><br><span class="muted small">' + esc(p.note || '') + '</span></td>' +
          '<td>' + money(p.amount) + '</td><td>' + p.used + ' / ' + p.maxUses + '</td><td>' + exp + '</td>' +
          '<td><input type="checkbox" data-pact="' + p.id + '"' + (p.active ? ' checked' : '') + ' style="width:18px;height:18px"></td></tr>';
      }).join('');

      var GSTAT = { active: '<span class="chip confirmed">Идэвхтэй</span>', redeemed: '<span class="chip done">Ашигласан</span>', disabled: '<span class="chip cancelled">Хаасан</span>' };
      var gHtml = gcs.map(function (g) {
        return '<tr><td><b>' + esc(g.code) + '</b></td><td>' + money(g.amount) + '</td>' +
          '<td>' + esc(g.fromName) + (g.toName ? ' → ' + esc(g.toName) : '') + '</td>' +
          '<td>' + (GSTAT[g.status] || g.status) + (g.redeemedByName ? '<br><span class="muted small">' + esc(g.redeemedByName) + '</span>' : '') + '</td>' +
          '<td>' + (g.status === 'active' ? '<button class="mini-btn" data-gdis="' + g.id + '">Хаах</button>' : '') + '</td></tr>';
      }).join('');

      c.innerHTML =
        '<div class="row" style="margin-bottom:10px"><h3 style="flex:1">🎁 Багц үйлчилгээ</h3><button class="btn btn-primary btn-sm" id="addBundle">＋ Шинэ багц</button></div>' +
        '<div class="card">' + (bundles.length ? '<table><tr><th>Нэр</th><th>Хэмжээ</th><th>Үнэ</th><th>Хүчинтэй</th><th>Борлуулалт</th><th></th><th>Идэвхтэй</th></tr>' + bHtml + '</table>' : '<p class="muted">Багц алга.</p>') + '</div>' +

        '<div class="row" style="margin:18px 0 10px"><h3 style="flex:1">🎟 Промо код <span class="muted small">(хэтэвчинд мөнгө нэмдэг)</span></h3><button class="btn btn-primary btn-sm" id="addPromo">＋ Шинэ код</button></div>' +
        '<div class="card">' + (promos.length ? '<table><tr><th>Код</th><th>Дүн</th><th>Ашиглалт</th><th>Дуусах</th><th>Идэвхтэй</th></tr>' + pHtml + '</table>' : '<p class="muted">Промо код алга.</p>') + '</div>' +

        '<h3 style="margin:18px 0 10px">💝 Бэлгийн картууд <span class="muted small">(үйлчлүүлэгчид аппаас авдаг)</span></h3>' +
        '<div class="card">' + (gcs.length ? '<table><tr><th>Код</th><th>Дүн</th><th>Хэнээс → Хэнд</th><th>Төлөв</th><th></th></tr>' + gHtml + '</table>' : '<p class="muted">Одоогоор бэлгийн карт алга.</p>') + '</div>';

      document.getElementById('addBundle').onclick = function () { openBundleModal(null); };
      document.getElementById('addPromo').onclick = openPromoModal;
      c.querySelectorAll('[data-editb]').forEach(function (b) {
        b.onclick = function () {
          var bd = bundles.find(function (x) { return x.id === b.getAttribute('data-editb'); });
          openBundleModal(bd);
        };
      });
      c.querySelectorAll('[data-bact]').forEach(function (cb) {
        cb.onchange = function () {
          api('/api/admin/bundles/' + cb.getAttribute('data-bact'), { method: 'POST', body: { active: cb.checked } })
            .then(function () { toast('Хадгалагдлаа ✓', 'ok'); })
            .catch(function () { toast('Алдаа гарлаа', 'err'); });
        };
      });
      c.querySelectorAll('[data-pact]').forEach(function (cb) {
        cb.onchange = function () {
          api('/api/admin/promos/' + cb.getAttribute('data-pact'), { method: 'POST', body: { active: cb.checked } })
            .then(function () { toast('Хадгалагдлаа ✓', 'ok'); })
            .catch(function () { toast('Алдаа гарлаа', 'err'); });
        };
      });
      c.querySelectorAll('[data-gdis]').forEach(function (b) {
        b.onclick = function () {
          confirmDlg('Энэ бэлгийн картыг хаах уу? Дахин ашиглах боломжгүй болно.').then(function (yes) {
            if (!yes) return;
            api('/api/admin/giftcards/' + b.getAttribute('data-gdis') + '/disable', { method: 'POST' })
              .then(function () { loadOffers(); })
              .catch(function () { toast('Алдаа гарлаа', 'err'); });
          });
        };
      });
    }).catch(function () { toast('Алдаа гарлаа', 'err'); });
  }

  function openBundleModal(bd) {
    var isNew = !bd;
    bd = bd || { nameMn: '', nameEn: '', descMn: '', descEn: '', emoji: '🎁', sessions: 5, price: 250000, validDays: 90, serviceIds: [] };
    var svcChecks = (servicesCache || []).filter(function (s) { return s.active; }).map(function (s) {
      var on = (bd.serviceIds || []).indexOf(s.id) >= 0;
      return '<label class="row small" style="padding:4px 0;cursor:pointer"><input type="checkbox" class="bsvc" value="' + esc(s.id) + '"' + (on ? ' checked' : '') + '> ' + esc(s.nameMn) + '</label>';
    }).join('');
    var m = openModal(
      '<h3>' + (isNew ? '＋ Шинэ багц' : '✎ ' + esc(bd.nameMn)) + '</h3>' +
      '<div class="row"><div class="field" style="flex:0 0 70px"><label>Тэмдэг</label><input id="bEmoji" value="' + esc(bd.emoji || '🎁') + '" maxlength="4"></div>' +
      '<div class="field grow"><label>Нэр (МН)</label><input id="bNameMn" maxlength="80" value="' + esc(bd.nameMn) + '"></div></div>' +
      '<div class="field"><label>Нэр (EN)</label><input id="bNameEn" maxlength="80" value="' + esc(bd.nameEn) + '"></div>' +
      '<div class="row"><div class="field grow"><label>Хэдэн удаа</label><input id="bSessions" type="number" min="1" max="50" value="' + bd.sessions + '"></div>' +
      '<div class="field grow"><label>Үнэ (₮)</label><input id="bPrice" type="number" step="1000" min="0" value="' + bd.price + '"></div>' +
      '<div class="field grow"><label>Хүчинтэй (хоног)</label><input id="bDays" type="number" min="7" max="365" value="' + bd.validDays + '"></div></div>' +
      '<div class="field"><label>Тайлбар (МН)</label><input id="bDescMn" maxlength="300" value="' + esc(bd.descMn || '') + '"></div>' +
      '<div class="field"><label>Тайлбар (EN)</label><input id="bDescEn" maxlength="300" value="' + esc(bd.descEn || '') + '"></div>' +
      '<label class="small" style="font-weight:600;color:var(--muted)">Аль үйлчилгээнд хүчинтэй вэ? (юу ч сонгохгүй бол бүгдэд)</label>' +
      '<div style="max-height:160px;overflow-y:auto;margin-top:4px">' + svcChecks + '</div>' +
      '<div class="modal-actions"><button class="btn btn-ghost" id="bCancel">Болих</button>' +
      '<button class="btn btn-primary" id="bSave">Хадгалах</button></div>'
    );
    m.querySelector('#bCancel').onclick = closeModal;
    m.querySelector('#bSave').onclick = function () {
      var serviceIds = [];
      m.querySelectorAll('.bsvc:checked').forEach(function (cb) { serviceIds.push(cb.value); });
      var body = {
        emoji: m.querySelector('#bEmoji').value,
        nameMn: m.querySelector('#bNameMn').value, nameEn: m.querySelector('#bNameEn').value,
        sessions: Number(m.querySelector('#bSessions').value), price: Number(m.querySelector('#bPrice').value),
        validDays: Number(m.querySelector('#bDays').value),
        descMn: m.querySelector('#bDescMn').value, descEn: m.querySelector('#bDescEn').value,
        serviceIds: serviceIds
      };
      api(isNew ? '/api/admin/bundles' : '/api/admin/bundles/' + bd.id, { method: 'POST', body: body })
        .then(function () { closeModal(); toast('Хадгалагдлаа ✓', 'ok'); loadOffers(); })
        .catch(function () { toast('Алдаа — талбаруудаа шалгана уу', 'err'); });
    };
  }

  function openPromoModal() {
    var m = openModal(
      '<h3>＋ Шинэ промо код</h3>' +
      '<p class="muted small">Код оруулсан хэрэглэгчийн хэтэвчинд заасан дүн нэмэгдэнэ. Нэг хүн нэг л удаа ашиглана.</p>' +
      '<div class="field mt"><label>Код (хоосон бол автоматаар үүсгэнэ)</label><input id="pCode" maxlength="20" placeholder="ж: SUMMER25" style="text-transform:uppercase"></div>' +
      '<div class="row"><div class="field grow"><label>Дүн (₮)</label><input id="pAmount" type="number" step="1000" min="1000" value="10000"></div>' +
      '<div class="field grow"><label>Хэдэн хүн ашиглах</label><input id="pMax" type="number" min="1" value="50"></div></div>' +
      '<div class="field"><label>Дуусах огноо (заавал биш)</label><input id="pExp" type="date"></div>' +
      '<div class="field"><label>Тэмдэглэл</label><input id="pNote" maxlength="100" placeholder="ж: зуны урамшуулал"></div>' +
      '<div class="modal-actions"><button class="btn btn-ghost" id="pCancel">Болих</button>' +
      '<button class="btn btn-primary" id="pSave">Үүсгэх</button></div>'
    );
    m.querySelector('#pCancel').onclick = closeModal;
    m.querySelector('#pSave').onclick = function () {
      api('/api/admin/promos', {
        method: 'POST',
        body: {
          code: m.querySelector('#pCode').value.trim(),
          amount: Number(m.querySelector('#pAmount').value),
          maxUses: Number(m.querySelector('#pMax').value),
          expiresAt: m.querySelector('#pExp').value,
          note: m.querySelector('#pNote').value
        }
      }).then(function (pr) {
        closeModal();
        var m2 = openModal('<h3>🎟 Код үүслээ</h3><div class="code-box"><span>' + esc(pr.code) + '</span></div>' +
          '<p class="small muted">Энэ кодыг Facebook пэйж дээрээ зарлаарай — хэрэглэгчид аппын "Код идэвхжүүлэх" хэсэгт оруулна.</p>' +
          '<div class="modal-actions"><button class="btn btn-primary" id="pOk">За</button></div>');
        m2.querySelector('#pOk').onclick = function () { closeModal(); loadOffers(); };
      }).catch(function (e) { toast(e && e.error === 'code_taken' ? 'Энэ код аль хэдийн байна' : 'Алдаа гарлаа', 'err'); });
    };
  }

  /* ================= staff management ================= */
  var WD_NAMES = ['Ня', 'Да', 'Мя', 'Лх', 'Пү', 'Ба', 'Бя'];
  function loadStaff() {
    api('/api/admin/staff').then(function (list) {
      staffCache = list;
      var c = document.getElementById('content');
      c.innerHTML =
        '<div class="row" style="margin-bottom:10px"><p class="muted small" style="flex:1">Ажилтан бүр өөрийн утас + нууц үгээрээ энэ хуудсанд нэвтэрч зөвхөн өөрийн календарь, үйлчлүүлэгч, чатыг харна.</p>' +
        (isSuperRole() ? '<button class="btn btn-primary btn-sm" id="addStaff">＋ Шинэ ажилтан</button>' : '<span class="muted small">Шинэ эрхийг супер админ үүсгэнэ</span>') + '</div>' +
        list.map(function (s) {
          var hoursTxt = [];
          for (var d = 0; d <= 6; d++) {
            var h = s.hours[d] !== undefined ? s.hours[d] : s.hours[String(d)];
            hoursTxt.push('<span class="' + (h ? '' : 'muted') + '">' + WD_NAMES[d] + (h ? ' ' + h[0] + '–' + h[1] : ' амарна') + '</span>');
          }
          return '<div class="card">' +
            '<div class="row" style="flex-wrap:wrap">' +
            '<div class="staff-avatar" style="background:' + esc(s.color) + '">' + esc((s.name || '?')[0].toUpperCase()) + '</div>' +
            '<div class="grow"><b>' + esc(s.name) + '</b>' + (s.role === 'owner' ? ' <span class="pill">👑 эзэн</span>' : '') +
            (!s.active ? ' <span class="chip cancelled">идэвхгүй</span>' : '') +
            '<br><span class="muted small">📱 ' + esc(s.phone) + ' · ' + esc(s.specialtyMn || '') + '</span>' +
            (s.rating ? '<br><span class="star-lg small">' + stars(Math.round(s.rating)) + '</span> <span class="muted small">' + s.rating + ' (' + s.reviewCount + ' сэтгэгдэл)</span>' : '') +
            '</div>' +
            '<div class="small muted">' + s.upcoming + ' ирэх захиалга</div>' +
            '<button class="mini-btn" data-edits="' + s.id + '">✎ Засах / Цагийн хуваарь</button></div>' +
            '<p class="small" style="margin-top:8px;display:flex;gap:10px;flex-wrap:wrap">' + hoursTxt.join(' ') + '</p>' +
            (s.daysOff && s.daysOff.length ? '<p class="muted small">Амрах өдрүүд: ' + s.daysOff.join(', ') + '</p>' : '') +
            '</div>';
        }).join('');
      var addBtn = document.getElementById('addStaff');
      if (addBtn) addBtn.onclick = openNewStaff;
      c.querySelectorAll('[data-edits]').forEach(function (b) {
        b.onclick = function () {
          var s = staffCache.find(function (x) { return x.id === b.getAttribute('data-edits'); });
          openStaffModal(s);
        };
      });
    }).catch(function () { toast('Алдаа гарлаа', 'err'); });
  }

  function hoursEditor(hours) {
    var html = '';
    for (var d = 0; d <= 6; d++) {
      var h = hours[d] !== undefined ? hours[d] : hours[String(d)];
      html += '<div class="hours-row" data-wd="' + d + '">' +
        '<span class="wd">' + WD_NAMES[d] + '</span>' +
        '<label class="small"><input type="checkbox" class="wdOn"' + (h ? ' checked' : '') + '> ажиллана</label>' +
        '<input type="time" class="wdOpen" value="' + (h ? h[0] : '10:00') + '"' + (h ? '' : ' disabled') + '>' +
        '<span>–</span>' +
        '<input type="time" class="wdClose" value="' + (h ? h[1] : '19:00') + '"' + (h ? '' : ' disabled') + '></div>';
    }
    return html;
  }
  function readHours(m) {
    var hours = {};
    var ok = true;
    m.querySelectorAll('[data-wd]').forEach(function (row) {
      var d = row.getAttribute('data-wd');
      if (!row.querySelector('.wdOn').checked) { hours[d] = null; return; }
      var o = row.querySelector('.wdOpen').value, cl = row.querySelector('.wdClose').value;
      if (!o || !cl || cl <= o) { ok = false; return; }
      hours[d] = [o, cl];
    });
    return ok ? hours : null;
  }

  function openStaffModal(s) {
    var daysOff = (s.daysOff || []).slice();
    var m = openModal(
      '<h3>✎ ' + esc(s.name) + '</h3>' +
      '<div class="field"><label>Нэр</label><input id="sName" maxlength="60" value="' + esc(s.name) + '"></div>' +
      '<div class="row"><div class="field grow"><label>Мэргэшил (МН)</label><input id="sSpMn" maxlength="80" value="' + esc(s.specialtyMn) + '"></div>' +
      '<div class="field grow"><label>Specialty (EN)</label><input id="sSpEn" maxlength="80" value="' + esc(s.specialtyEn) + '"></div></div>' +
      '<div class="row"><div class="field"><label>Өнгө</label><input id="sColor" type="color" value="' + esc(s.color) + '" style="width:60px;height:40px;padding:2px"></div>' +
      (s.role !== 'owner' ? '<label class="small" style="margin-top:18px"><input type="checkbox" id="sActive"' + (s.active ? ' checked' : '') + '> Идэвхтэй (захиалга авна)</label>' : '') + '</div>' +
      '<h3 style="font-size:1rem;margin:10px 0 6px">🕐 Долоо хоногийн хуваарь</h3>' + hoursEditor(s.hours) +
      '<h3 style="font-size:1rem;margin:12px 0 6px">🏖 Амрах өдрүүд (тодорхой огноо)</h3>' +
      '<div class="row"><input type="date" id="sOffDate" class="cell-input" style="max-width:170px"><button class="mini-btn" id="sOffAdd">+ Нэмэх</button></div>' +
      '<div class="chipline" id="offList"></div>' +
      (isSuperRole() ? '<div class="field mt"><label>Шинэ нууц үг (солих бол л бөглөнө)</label><input id="sPass" type="password" placeholder="••••••"></div>' : '') +
      '<div class="modal-actions"><button class="btn btn-ghost" id="sCancel">Болих</button>' +
      '<button class="btn btn-primary" id="sSave">Хадгалах</button></div>'
    );
    function renderOff() {
      m.querySelector('#offList').innerHTML = daysOff.map(function (d) {
        return '<span class="datechip">' + d + ' <b data-rm="' + d + '">×</b></span>';
      }).join('');
      m.querySelectorAll('[data-rm]').forEach(function (x) {
        x.onclick = function () {
          daysOff = daysOff.filter(function (d) { return d !== x.getAttribute('data-rm'); });
          renderOff();
        };
      });
    }
    renderOff();
    m.querySelectorAll('.wdOn').forEach(function (cb) {
      cb.onchange = function () {
        var row = cb.closest('[data-wd]');
        row.querySelector('.wdOpen').disabled = !cb.checked;
        row.querySelector('.wdClose').disabled = !cb.checked;
      };
    });
    m.querySelector('#sOffAdd').onclick = function () {
      var v = m.querySelector('#sOffDate').value;
      if (v && daysOff.indexOf(v) < 0) { daysOff.push(v); daysOff.sort(); renderOff(); }
    };
    m.querySelector('#sCancel').onclick = closeModal;
    m.querySelector('#sSave').onclick = function () {
      var hours = readHours(m);
      if (!hours) { toast('Цагийн хуваарь буруу байна (нээх < хаах)', 'err'); return; }
      var body = {
        name: m.querySelector('#sName').value,
        specialtyMn: m.querySelector('#sSpMn').value,
        specialtyEn: m.querySelector('#sSpEn').value,
        color: m.querySelector('#sColor').value,
        hours: hours,
        daysOff: daysOff
      };
      var act = m.querySelector('#sActive');
      if (act) body.active = act.checked;
      var np = m.querySelector('#sPass') ? m.querySelector('#sPass').value : '';
      if (np) body.newPassword = np;
      api('/api/admin/staff/' + s.id, { method: 'POST', body: body })
        .then(function () { closeModal(); toast('Хадгалагдлаа ✓', 'ok'); loadStaff(); })
        .catch(function (e) { toast(e && e.error === 'bad_password' ? 'Нууц үг 6+ тэмдэгт' : 'Алдаа гарлаа', 'err'); });
    };
  }

  function openNewStaff() {
    var m = openModal(
      '<h3>＋ Шинэ ажилтан</h3>' +
      '<div class="field"><label>Нэр</label><input id="nsName" maxlength="60"></div>' +
      '<div class="row"><div class="field grow"><label>Утас (нэвтрэхэд хэрэглэнэ)</label><input id="nsPhone" inputmode="numeric" maxlength="8"></div>' +
      '<div class="field grow"><label>Нууц үг (6+)</label><input id="nsPass" type="password"></div></div>' +
      '<div class="row"><div class="field grow"><label>Мэргэшил (МН)</label><input id="nsSpMn" maxlength="80" placeholder="ж: Нүүрний гуаша"></div>' +
      '<div class="field" style="flex:0 0 90px"><label>Өнгө</label><input id="nsColor" type="color" value="#b08c46" style="width:60px;height:40px;padding:2px"></div></div>' +
      '<div class="modal-actions"><button class="btn btn-ghost" id="nsCancel">Болих</button>' +
      '<button class="btn btn-primary" id="nsSave">Үүсгэх</button></div>'
    );
    m.querySelector('#nsCancel').onclick = closeModal;
    m.querySelector('#nsSave').onclick = function () {
      api('/api/admin/staff', {
        method: 'POST',
        body: {
          name: m.querySelector('#nsName').value,
          phone: m.querySelector('#nsPhone').value.trim(),
          password: m.querySelector('#nsPass').value,
          specialtyMn: m.querySelector('#nsSpMn').value,
          color: m.querySelector('#nsColor').value
        }
      }).then(function () { closeModal(); toast('Ажилтан нэмэгдлээ ✓', 'ok'); loadStaff(); })
        .catch(function (e) {
          var msg = 'Алдаа гарлаа';
          if (e && e.error === 'phone_taken') msg = 'Энэ дугаар бүртгэлтэй байна';
          if (e && e.error === 'bad_phone') msg = 'Утас 8 оронтой байх ёстой';
          if (e && e.error === 'bad_password') msg = 'Нууц үг 6+ тэмдэгт';
          if (e && e.error === 'bad_name') msg = 'Нэрээ оруулна уу';
          toast(msg, 'err');
        });
    };
  }

  /* ================= products ("What we use" — shown on the website and in the app) ================= */
  var EDU_CAT = { product: 'Бүтээгдэхүүн', tool: 'Багаж', machine: 'Аппарат', method: 'Арга барил' };
  function loadProducts() {
    api('/api/admin/edu').then(function (list) {
      var c = document.getElementById('content');
      c.innerHTML =
        '<div class="row" style="margin-bottom:10px"><p class="muted small" style="flex:1">Вэбсайт болон апп-ын "Бидний хэрэглэдэг" хэсэгт харагдана. Идэвхгүй бол нуугдана.</p>' +
        '<button class="btn btn-primary btn-sm" id="addEdu">＋ Шинэ бүтээгдэхүүн</button></div>' +
        (list.length ? '<div class="card"><table><tr><th></th><th>Нэр</th><th>Ангилал</th><th>Дараалал</th><th>Төлөв</th><th></th></tr>' +
          list.map(function (it) {
            return '<tr><td style="font-size:1.3rem">' + esc(it.emoji) + '</td>' +
              '<td><b>' + esc(it.nameMn) + '</b><br><span class="muted small">' + esc(it.nameEn) + '</span>' + (it.benefitMn ? '<br><span class="pill">' + esc(it.benefitMn) + '</span>' : '') + '</td>' +
              '<td>' + esc(EDU_CAT[it.category] || it.category) + '</td><td>' + (it.order || 0) + '</td>' +
              '<td>' + (it.active ? '<span class="chip confirmed">идэвхтэй</span>' : '<span class="chip cancelled">нуусан</span>') + '</td>' +
              '<td><button class="mini-btn" data-edu="' + it.id + '">✎ Засах</button> <button class="mini-btn" data-edudel="' + it.id + '">🗑</button></td></tr>';
          }).join('') + '</table></div>' : '<p class="muted">Бүтээгдэхүүн алга.</p>');
      document.getElementById('addEdu').onclick = function () { openEduModal(null); };
      c.querySelectorAll('[data-edu]').forEach(function (b) {
        b.onclick = function () { openEduModal(list.find(function (x) { return x.id === b.getAttribute('data-edu'); })); };
      });
      c.querySelectorAll('[data-edudel]').forEach(function (b) {
        b.onclick = function () {
          confirmDlg('Энэ бүтээгдэхүүнийг устгах уу?').then(function (ok) {
            if (!ok) return;
            api('/api/admin/edu/' + b.getAttribute('data-edudel'), { method: 'DELETE' })
              .then(function () { toast('Устгалаа', 'ok'); loadProducts(); })
              .catch(function () { toast('Алдаа гарлаа', 'err'); });
          });
        };
      });
    }).catch(function () { toast('Алдаа гарлаа', 'err'); });
  }
  function openEduModal(it) {
    var x = it || { category: 'product', emoji: '🌿', nameMn: '', nameEn: '', benefitMn: '', benefitEn: '', descMn: '', descEn: '', order: 99, active: true };
    var m = openModal(
      '<h3>' + (it ? '✎ Засах' : '＋ Шинэ бүтээгдэхүүн') + '</h3>' +
      '<div class="row"><div class="field" style="flex:0 0 80px"><label>Эможи</label><input id="eEmoji" maxlength="8" value="' + esc(x.emoji) + '"></div>' +
      '<div class="field grow"><label>Ангилал</label><select id="eCat" class="cell-input">' + Object.keys(EDU_CAT).map(function (k) {
        return '<option value="' + k + '"' + (x.category === k ? ' selected' : '') + '>' + EDU_CAT[k] + '</option>';
      }).join('') + '</select></div>' +
      '<div class="field" style="flex:0 0 90px"><label>Дараалал</label><input id="eOrder" type="number" value="' + (x.order || 0) + '"></div></div>' +
      '<div class="row"><div class="field grow"><label>Нэр (МН)</label><input id="eNameMn" maxlength="80" value="' + esc(x.nameMn) + '"></div>' +
      '<div class="field grow"><label>Name (EN)</label><input id="eNameEn" maxlength="80" value="' + esc(x.nameEn) + '"></div></div>' +
      '<div class="row"><div class="field grow"><label>Гол үр нөлөө (МН, богино)</label><input id="eBenMn" maxlength="40" placeholder="ж: Хаван бууруулна" value="' + esc(x.benefitMn || '') + '"></div>' +
      '<div class="field grow"><label>Key benefit (EN)</label><input id="eBenEn" maxlength="40" placeholder="e.g. De-puffs" value="' + esc(x.benefitEn || '') + '"></div></div>' +
      '<div class="field"><label>Тайлбар (МН)</label><textarea id="eDescMn" rows="3" maxlength="500">' + esc(x.descMn) + '</textarea></div>' +
      '<div class="field"><label>Description (EN)</label><textarea id="eDescEn" rows="3" maxlength="500">' + esc(x.descEn) + '</textarea></div>' +
      '<label class="small"><input type="checkbox" id="eActive"' + (x.active ? ' checked' : '') + '> Идэвхтэй (сайт, апп дээр харагдана)</label>' +
      '<div class="modal-actions"><button class="btn btn-ghost" id="eCancel">Болих</button>' +
      '<button class="btn btn-primary" id="eSave">Хадгалах</button></div>'
    );
    m.querySelector('#eCancel').onclick = closeModal;
    m.querySelector('#eSave').onclick = function () {
      var body = {
        emoji: m.querySelector('#eEmoji').value, category: m.querySelector('#eCat').value,
        order: Number(m.querySelector('#eOrder').value),
        nameMn: m.querySelector('#eNameMn').value, nameEn: m.querySelector('#eNameEn').value,
        benefitMn: m.querySelector('#eBenMn').value, benefitEn: m.querySelector('#eBenEn').value,
        descMn: m.querySelector('#eDescMn').value, descEn: m.querySelector('#eDescEn').value,
        active: m.querySelector('#eActive').checked
      };
      if (!body.nameMn.trim()) { toast('Монгол нэрээ оруулна уу', 'err'); return; }
      api('/api/admin/edu' + (it ? '/' + it.id : ''), { method: 'POST', body: body })
        .then(function () { closeModal(); toast('Хадгалагдлаа ✓', 'ok'); loadProducts(); })
        .catch(function () { toast('Алдаа гарлаа', 'err'); });
    };
  }

  /* ================= FAQ (shown on the website and in the app) ================= */
  var FAQ_GROUP = { treatment: 'Эмчилгээ', booking: 'Захиалга ба төлбөр', care: 'Бэлтгэл ба арчилгаа' };
  var FAQ_SHOW = { always: 'Үргэлж', wallet_on: 'Хэтэвч асаалттай үед', wallet_off: 'Хэтэвч унтраалттай үед' };
  function loadFaqAdmin() {
    api('/api/admin/faq').then(function (list) {
      var c = document.getElementById('content');
      c.innerHTML =
        '<div class="row" style="margin-bottom:10px"><p class="muted small" style="flex:1">Вэбсайтын "Түгээмэл асуулт" хэсэг болон апп-д харагдана. ' +
        'Хариултад <b>{cancelHours}</b>, <b>{phone}</b>, <b>{hoursOpen}</b>, <b>{hoursClose}</b> бичвэл тохиргооны утгаар автоматаар солигдоно.</p>' +
        '<button class="btn btn-primary btn-sm" id="addFaq">＋ Шинэ асуулт</button></div>' +
        Object.keys(FAQ_GROUP).map(function (g) {
          var items = list.filter(function (f) { return f.group === g; });
          if (!items.length) return '';
          return '<div class="card"><h3 style="margin-bottom:8px">' + FAQ_GROUP[g] + '</h3><table>' +
            '<tr><th>#</th><th>Асуулт</th><th>Харагдах</th><th>Төлөв</th><th></th></tr>' +
            items.map(function (f) {
              return '<tr><td>' + (f.order || 0) + '</td><td><b>' + esc(f.qMn) + '</b><br><span class="muted small">' + esc(f.aMn.slice(0, 110)) + (f.aMn.length > 110 ? '…' : '') + '</span></td>' +
                '<td class="small">' + FAQ_SHOW[f.show || 'always'] + '</td>' +
                '<td>' + (f.active ? '<span class="chip confirmed">идэвхтэй</span>' : '<span class="chip cancelled">нуусан</span>') + '</td>' +
                '<td style="white-space:nowrap"><button class="mini-btn" data-faq="' + f.id + '">✎ Засах</button> <button class="mini-btn" data-faqdel="' + f.id + '">🗑</button></td></tr>';
            }).join('') + '</table></div>';
        }).join('');
      document.getElementById('addFaq').onclick = function () { openFaqModal(null); };
      c.querySelectorAll('[data-faq]').forEach(function (b) {
        b.onclick = function () { openFaqModal(list.find(function (x) { return x.id === b.getAttribute('data-faq'); })); };
      });
      c.querySelectorAll('[data-faqdel]').forEach(function (b) {
        b.onclick = function () {
          confirmDlg('Энэ асуултыг устгах уу?').then(function (ok) {
            if (!ok) return;
            api('/api/admin/faq/' + b.getAttribute('data-faqdel'), { method: 'DELETE' })
              .then(function () { toast('Устгалаа', 'ok'); loadFaqAdmin(); })
              .catch(function () { toast('Алдаа гарлаа', 'err'); });
          });
        };
      });
    }).catch(function () { toast('Алдаа гарлаа', 'err'); });
  }
  function openFaqModal(f) {
    var x = f || { group: 'treatment', show: 'always', order: 99, qMn: '', qEn: '', aMn: '', aEn: '', active: true };
    function opts(map, sel) {
      return Object.keys(map).map(function (k) { return '<option value="' + k + '"' + (sel === k ? ' selected' : '') + '>' + map[k] + '</option>'; }).join('');
    }
    var m = openModal(
      '<h3>' + (f ? '✎ Асуулт засах' : '＋ Шинэ асуулт') + '</h3>' +
      '<div class="row"><div class="field grow"><label>Бүлэг</label><select id="fqGroup" class="cell-input">' + opts(FAQ_GROUP, x.group) + '</select></div>' +
      '<div class="field grow"><label>Хэзээ харагдах</label><select id="fqShow" class="cell-input">' + opts(FAQ_SHOW, x.show || 'always') + '</select></div>' +
      '<div class="field" style="flex:0 0 90px"><label>Дараалал</label><input id="fqOrder" type="number" value="' + (x.order || 0) + '"></div></div>' +
      '<div class="field"><label>Асуулт (МН)</label><input id="fqQMn" maxlength="160" value="' + esc(x.qMn) + '"></div>' +
      '<div class="field"><label>Хариулт (МН)</label><textarea id="fqAMn" rows="4" maxlength="1200">' + esc(x.aMn) + '</textarea></div>' +
      '<div class="field"><label>Question (EN)</label><input id="fqQEn" maxlength="160" value="' + esc(x.qEn) + '"></div>' +
      '<div class="field"><label>Answer (EN)</label><textarea id="fqAEn" rows="4" maxlength="1200">' + esc(x.aEn) + '</textarea></div>' +
      '<label class="small"><input type="checkbox" id="fqActive"' + (x.active ? ' checked' : '') + '> Идэвхтэй (сайт, апп дээр харагдана)</label>' +
      '<div class="modal-actions"><button class="btn btn-ghost" id="fqCancel">Болих</button>' +
      '<button class="btn btn-primary" id="fqSave">Хадгалах</button></div>'
    );
    m.querySelector('#fqCancel').onclick = closeModal;
    m.querySelector('#fqSave').onclick = function () {
      var body = {
        group: m.querySelector('#fqGroup').value, show: m.querySelector('#fqShow').value,
        order: Number(m.querySelector('#fqOrder').value),
        qMn: m.querySelector('#fqQMn').value, aMn: m.querySelector('#fqAMn').value,
        qEn: m.querySelector('#fqQEn').value, aEn: m.querySelector('#fqAEn').value,
        active: m.querySelector('#fqActive').checked
      };
      if (!body.qMn.trim() || !body.aMn.trim()) { toast('Монгол асуулт, хариултаа бөглөнө үү', 'err'); return; }
      api('/api/admin/faq' + (f ? '/' + f.id : ''), { method: 'POST', body: body })
        .then(function () { closeModal(); toast('Хадгалагдлаа ✓', 'ok'); loadFaqAdmin(); })
        .catch(function () { toast('Алдаа гарлаа', 'err'); });
    };
  }

  /* ================= accounts (super admin only) ================= */
  var accFilter = { q: '', role: '' };
  function accountError(e) {
    var map = {
      phone_taken: 'Энэ дугаар бүртгэлтэй байна', bad_phone: 'Утас 8 оронтой байх ёстой',
      bad_password: 'Нууц үг 6+ тэмдэгт', bad_name: 'Нэрээ оруулна уу', bad_role: 'Эрхийг өөрчлөх боломжгүй',
      cannot_disable_self: 'Өөрийгөө идэвхгүй болгох боломжгүй'
    };
    toast((e && map[e.error]) || 'Алдаа гарлаа', 'err');
  }
  function loadAccounts() {
    var qs = [];
    if (accFilter.q) qs.push('q=' + encodeURIComponent(accFilter.q));
    if (accFilter.role) qs.push('role=' + accFilter.role);
    api('/api/admin/accounts' + (qs.length ? '?' + qs.join('&') : '')).then(function (list) {
      var c = document.getElementById('content');
      c.innerHTML =
        '<div class="row" style="margin-bottom:10px;flex-wrap:wrap">' +
        '<input id="accQ" class="cell-input" style="max-width:220px" placeholder="Нэр эсвэл утас" value="' + esc(accFilter.q) + '">' +
        '<select id="accRole" class="cell-input" style="max-width:170px"><option value="">Бүх эрх</option>' +
        ['superadmin', 'owner', 'staff', 'customer'].map(function (r) {
          return '<option value="' + r + '"' + (accFilter.role === r ? ' selected' : '') + '>' + ROLE_LABEL[r] + '</option>';
        }).join('') + '</select>' +
        '<div class="spacer" style="flex:1"></div>' +
        '<button class="btn btn-primary btn-sm" id="addAcc">＋ Шинэ бүртгэл</button></div>' +
        '<div class="card"><table><tr><th>Нэр</th><th>Утас</th><th>Эрх</th><th>Төлөв</th><th></th></tr>' +
        list.map(function (u) {
          return '<tr><td><b>' + esc(u.name) + '</b>' + (u.isMe ? ' <span class="muted small">(та)</span>' : '') + '</td>' +
            '<td>' + esc(u.phone) + '</td>' +
            '<td>' + ROLE_LABEL[u.role] + (u.role === 'owner' && u.therapist ? ' <span class="muted small">+ эмчилгээ хийнэ</span>' : '') + '</td>' +
            '<td>' + (u.disabled ? '<span class="chip cancelled">хаасан</span>' : '<span class="chip confirmed">идэвхтэй</span>') + '</td>' +
            '<td><button class="mini-btn" data-acc="' + u.id + '">✎ Засах</button></td></tr>';
        }).join('') + '</table>' + (list.length ? '' : '<p class="muted">Олдсонгүй.</p>') + '</div>';
      var qEl = document.getElementById('accQ');
      qEl.onkeydown = function (e) { if (e.key === 'Enter') { accFilter.q = qEl.value.trim(); loadAccounts(); } };
      document.getElementById('accRole').onchange = function (e) { accFilter.role = e.target.value; loadAccounts(); };
      document.getElementById('addAcc').onclick = openNewAccount;
      c.querySelectorAll('[data-acc]').forEach(function (b) {
        b.onclick = function () { openAccountModal(list.find(function (x) { return x.id === b.getAttribute('data-acc'); })); };
      });
    }).catch(function () { toast('Алдаа гарлаа', 'err'); });
  }
  function roleOptions(sel) {
    return ['customer', 'staff', 'owner'].map(function (r) {
      return '<option value="' + r + '"' + (sel === r ? ' selected' : '') + '>' + ROLE_LABEL[r] + '</option>';
    }).join('');
  }
  function openNewAccount() {
    var m = openModal(
      '<h3>＋ Шинэ бүртгэл</h3>' +
      '<div class="field"><label>Эрх</label><select id="naRole" class="cell-input">' + roleOptions('customer') + '</select></div>' +
      '<div class="field"><label>Нэр</label><input id="naName" maxlength="60"></div>' +
      '<div class="row"><div class="field grow"><label>Утас (нэвтрэх нэр)</label><input id="naPhone" inputmode="numeric" maxlength="8"></div>' +
      '<div class="field grow"><label>Нууц үг (6+)</label><input id="naPass" type="text" autocomplete="off"></div></div>' +
      '<div id="naStaffBox"><div class="field"><label>Мэргэшил (МН)</label><input id="naSpMn" maxlength="80" placeholder="ж: Нүүрний гуаша"></div></div>' +
      '<label class="small" id="naTherBox" hidden><input type="checkbox" id="naTher"> Эмчилгээ хийнэ (календарьт харагдаж, захиалга авна)</label>' +
      '<p class="muted small" style="margin-top:8px" id="naHint"></p>' +
      '<div class="modal-actions"><button class="btn btn-ghost" id="naCancel">Болих</button>' +
      '<button class="btn btn-primary" id="naSave">Үүсгэх</button></div>'
    );
    var HINT = {
      customer: 'Үйлчлүүлэгч /app дээр утас + нууц үгээр нэвтэрнэ.',
      staff: 'Ажилтан /admin дээр нэвтэрч зөвхөн өөрийн календарь, үйлчлүүлэгч, чатыг харна.',
      owner: 'Эзэмшигч /admin дээр нэвтэрч үйлчилгээ, бүтээгдэхүүн, хаяг, тохиргоо, ажилтны хуваарийг удирдана.'
    };
    function sync() {
      var r = m.querySelector('#naRole').value;
      m.querySelector('#naHint').textContent = HINT[r];
      m.querySelector('#naTherBox').hidden = r !== 'owner';
      m.querySelector('#naStaffBox').hidden = !(r === 'staff' || (r === 'owner' && m.querySelector('#naTher').checked));
    }
    m.querySelector('#naRole').onchange = sync;
    m.querySelector('#naTher').onchange = sync;
    sync();
    m.querySelector('#naCancel').onclick = closeModal;
    m.querySelector('#naSave').onclick = function () {
      api('/api/admin/accounts', {
        method: 'POST',
        body: {
          role: m.querySelector('#naRole').value,
          name: m.querySelector('#naName').value,
          phone: m.querySelector('#naPhone').value.trim(),
          password: m.querySelector('#naPass').value,
          therapist: m.querySelector('#naTher').checked,
          specialtyMn: m.querySelector('#naSpMn').value
        }
      }).then(function () { closeModal(); toast('Бүртгэл үүслээ ✓', 'ok'); loadAccounts(); })
        .catch(accountError);
    };
  }
  function openAccountModal(u) {
    var locked = u.role === 'superadmin';
    var m = openModal(
      '<h3>✎ ' + esc(u.name) + '</h3>' +
      '<div class="row"><div class="field grow"><label>Нэр</label><input id="eaName" maxlength="60" value="' + esc(u.name) + '"></div>' +
      '<div class="field grow"><label>Утас</label><input id="eaPhone" inputmode="numeric" maxlength="8" value="' + esc(u.phone) + '"></div></div>' +
      (locked ? '<p class="small">Эрх: ' + ROLE_LABEL.superadmin + '</p>'
        : '<div class="field"><label>Эрх</label><select id="eaRole" class="cell-input">' + roleOptions(u.role) + '</select></div>' +
          '<label class="small" id="eaTherBox"' + (u.role === 'owner' ? '' : ' hidden') + '><input type="checkbox" id="eaTher"' + (u.therapist ? ' checked' : '') + '> Эмчилгээ хийнэ (захиалга авна)</label>') +
      '<div class="field mt"><label>Шинэ нууц үг (солих бол л бөглөнө)</label><input id="eaPass" type="text" autocomplete="off" placeholder="••••••"></div>' +
      (u.isMe ? '' : '<label class="small"><input type="checkbox" id="eaDisabled"' + (u.disabled ? ' checked' : '') + '> Бүртгэлийг хаах (нэвтэрч чадахгүй)</label>') +
      '<div class="modal-actions"><button class="btn btn-ghost" id="eaCancel">Болих</button>' +
      '<button class="btn btn-primary" id="eaSave">Хадгалах</button></div>'
    );
    var roleSel = m.querySelector('#eaRole');
    if (roleSel) roleSel.onchange = function () { m.querySelector('#eaTherBox').hidden = roleSel.value !== 'owner'; };
    m.querySelector('#eaCancel').onclick = closeModal;
    m.querySelector('#eaSave').onclick = function () {
      var body = { name: m.querySelector('#eaName').value, phone: m.querySelector('#eaPhone').value.trim() };
      if (roleSel) {
        body.role = roleSel.value;
        if (body.role === 'owner') body.therapist = m.querySelector('#eaTher').checked;
      }
      var np = m.querySelector('#eaPass').value;
      if (np) body.newPassword = np;
      var dis = m.querySelector('#eaDisabled');
      if (dis && dis.checked !== u.disabled) body.disabled = dis.checked;
      api('/api/admin/accounts/' + u.id, { method: 'POST', body: body })
        .then(function () {
          closeModal(); toast('Хадгалагдлаа ✓', 'ok');
          staffCache = null;
          if (u.isMe) { meName = body.name; sset('bg_admin_name', meName); }
          loadAccounts();
        })
        .catch(accountError);
    };
  }

  /* ================= stats ================= */
  function loadStats(month) {
    var url = '/api/admin/stats' + (month ? '?month=' + month : '');
    api(url).then(function (d) {
      var c = document.getElementById('content');
      var maxSvc = Math.max.apply(null, d.topServices.map(function (x) { return x.count; }).concat([1]));
      c.innerHTML =
        '<div class="row" style="margin-bottom:12px"><label class="small muted">Сар сонгох:</label>' +
        '<input type="month" id="statMonth" class="cell-input" style="max-width:170px" value="' + d.month + '"></div>' +
        '<div class="stat-grid">' +
        '<div class="stat"><b>' + money(d.revenue.total) + '</b><span>Нийт орлого (болсон үйлчилгээ + багц + бэлгийн карт)</span></div>' +
        '<div class="stat"><b>' + money(d.revenue.services) + '</b><span>Үйлчилгээний орлого</span></div>' +
        '<div class="stat"><b>' + money(d.revenue.bundles) + '</b><span>Багцын борлуулалт</span></div>' +
        '<div class="stat"><b>' + money(d.revenue.giftcards) + '</b><span>Бэлгийн карт</span></div>' +
        '<div class="stat"><b>' + money(d.revenue.topups) + '</b><span>Цэнэглэлт (QPay орж ирсэн)</span></div></div>' +
        '<div class="stat-grid">' +
        '<div class="stat"><b>' + d.bookings.done + '</b><span>Болсон үйлчилгээ</span></div>' +
        '<div class="stat"><b>' + d.bookings.total + '</b><span>Нийт захиалга</span></div>' +
        '<div class="stat"><b>' + d.bookings.noshow + '</b><span>Ирээгүй</span></div>' +
        '<div class="stat"><b>' + d.bookings.cancelled + '</b><span>Цуцлагдсан</span></div>' +
        '<div class="stat"><b>' + d.newUsers + '</b><span>Шинэ үйлчлүүлэгч</span></div>' +
        '<div class="stat"><b>' + d.returningCustomers + '</b><span>Байнгын (2+ ирсэн)</span></div></div>' +
        '<div class="card"><h3 style="margin-bottom:10px">Эрэлттэй үйлчилгээ</h3>' +
        (d.topServices.length ? d.topServices.map(function (x) {
          return '<div class="bar-row"><span style="min-width:200px">' + esc(x.name) + '</span>' +
            '<div class="bar"><i style="width:' + Math.round((x.count / maxSvc) * 100) + '%"></i></div><b>' + x.count + '</b></div>';
        }).join('') : '<p class="muted">Энэ сард болсон үйлчилгээ алга.</p>') + '</div>' +
        '<div class="card"><h3 style="margin-bottom:10px">Ажилтнуудын гүйцэтгэл</h3>' +
        (d.topStaff.length ? '<table><tr><th>Ажилтан</th><th>Болсон үйлчилгээ</th><th>Үнэлгээ</th></tr>' +
          d.topStaff.map(function (x) {
            return '<tr><td>' + esc(x.name) + '</td><td>' + x.count + '</td>' +
              '<td>' + (x.rating ? '<span class="star-lg">' + stars(Math.round(x.rating)) + '</span> ' + x.rating + ' (' + x.reviews + ')' : '—') + '</td></tr>';
          }).join('') + '</table>' : '<p class="muted">Мэдээлэл алга.</p>') + '</div>';
      document.getElementById('statMonth').onchange = function (e) { if (e.target.value) loadStats(e.target.value); };
    }).catch(function () { toast('Алдаа гарлаа', 'err'); });
  }

  /* ================= settings ================= */
  function loadSettings() {
    api('/api/admin/settings').then(function (s) {
      var c = document.getElementById('content');
      var closedDates = (s.closedDates || []).slice();
      var ct = s.contact || {};
      c.innerHTML =
        '<div class="card" style="max-width:640px">' +
        '<h3 style="margin-bottom:12px">⚙️ Салоны тохиргоо</h3>' +
        '<div class="row"><div class="field grow"><label>Нээх цаг</label><input type="time" id="stOpen" class="cell-input" value="' + s.hoursOpen + '"></div>' +
        '<div class="field grow"><label>Хаах цаг</label><input type="time" id="stClose" class="cell-input" value="' + s.hoursClose + '"></div>' +
        '<div class="field grow"><label>Нэг цагийн алхам</label><select id="stSlot" class="cell-input">' +
        [30, 45, 60, 90].map(function (v) { return '<option value="' + v + '"' + (s.slotMinutes === v ? ' selected' : '') + '>' + v + ' мин</option>'; }).join('') +
        '</select></div></div>' +
        '<label class="small" style="font-weight:600;color:var(--muted)">Долоо хоног бүр амрах өдрүүд</label>' +
        '<div class="row" style="flex-wrap:wrap;margin:6px 0 12px">' +
        WD_NAMES.map(function (n, i) {
          return '<label class="small" style="margin-right:8px"><input type="checkbox" class="cwd" value="' + i + '"' + (s.closedWeekdays.indexOf(i) >= 0 ? ' checked' : '') + '> ' + n + '</label>';
        }).join('') + '</div>' +
        '<label class="small" style="font-weight:600;color:var(--muted)">Тусгай амралтын өдрүүд (баяр гэх мэт)</label>' +
        '<div class="row" style="margin-top:6px"><input type="date" id="cdDate" class="cell-input" style="max-width:170px"><button class="mini-btn" id="cdAdd">+ Нэмэх</button></div>' +
        '<div class="chipline" id="cdList"></div>' +
        '<div class="row mt"><div class="field grow"><label>Хэдэн хоногийн өмнө захиалга авах</label><input type="number" id="stAhead" class="cell-input" min="3" max="90" value="' + s.bookingDaysAhead + '"></div>' +
        '<div class="field grow"><label>Цуцлах боломж (цагийн өмнө)</label><input type="number" id="stCancel" class="cell-input" min="0" max="96" value="' + s.cancelHours + '"></div></div>' +
        '<div class="row" id="bonusRow"' + (s.featureWallet ? '' : ' hidden') + '><div class="field grow"><label>Бонус босго (₮)</label><input type="number" id="stBth" class="cell-input" step="10000" min="0" value="' + s.topupBonusThreshold + '"></div>' +
        '<div class="field grow"><label>Бонус хувь (%)</label><input type="number" id="stBpc" class="cell-input" min="0" max="50" value="' + s.topupBonusPercent + '"></div></div>' +
        '<hr style="border:none;border-top:1px solid var(--line);margin:16px 0">' +
        '<h3 style="margin-bottom:10px">📍 Холбоо барих мэдээлэл</h3>' +
        '<p class="muted small" style="margin-bottom:8px">Вэбсайт болон апп дээр шууд харагдана.</p>' +
        '<div class="field"><label>Хаяг (МН)</label><textarea id="ctAddrMn" class="cell-input" rows="2" maxlength="300">' + esc(ct.addressMn) + '</textarea></div>' +
        '<div class="field"><label>Address (EN)</label><textarea id="ctAddrEn" class="cell-input" rows="2" maxlength="300">' + esc(ct.addressEn) + '</textarea></div>' +
        '<div class="row"><div class="field grow"><label>Утас (харагдах)</label><input id="ctPhoneDisp" class="cell-input" maxlength="40" value="' + esc(ct.phoneDisplay) + '" placeholder="+976 9911-2233"></div>' +
        '<div class="field grow"><label>Утас (залгах, зөвхөн тоо)</label><input id="ctPhoneTel" class="cell-input" maxlength="16" value="' + esc(ct.phoneTel) + '" placeholder="+97699112233"></div></div>' +
        '<div class="field"><label>Google Maps холбоос (заавал биш)</label><input id="ctMap" class="cell-input" maxlength="120" value="' + esc(ct.mapUrl || '') + '" placeholder="https://maps.app.goo.gl/..."><span class="muted small">Google Business Profile үүссэний дараа "Share" холбоосыг энд тавина. Хоосон бол "Замаа олох" товч харагдахгүй.</span></div>' +
        '<div class="field"><label>Цаг авах утаснууд (таслалаар)</label><input id="ctBookPhones" class="cell-input" maxlength="120" value="' + esc(ct.bookingPhones || '') + '" placeholder="91113859, 99083070"></div>' +
        '<div class="row"><div class="field grow"><label>Имэйл</label><input id="ctEmail" class="cell-input" maxlength="120" value="' + esc(ct.email) + '"></div>' +
        '<div class="field grow"><label>Facebook холбоос</label><input id="ctFb" class="cell-input" maxlength="120" value="' + esc(ct.facebook) + '" placeholder="https://facebook.com/..."></div></div>' +
        '<hr style="border:none;border-top:1px solid var(--line);margin:16px 0">' +
        '<label class="small" style="font-weight:600;color:var(--muted)">Нэмэлт боломж</label>' +
        (s.canToggleFeatures
          ? '<label class="small" style="display:flex;gap:8px;align-items:flex-start;margin:8px 0 2px;cursor:pointer">' +
            '<input type="checkbox" id="stWallet"' + (s.featureWallet ? ' checked' : '') + ' style="margin-top:3px">' +
            '<span><b>Хэтэвч — цэнэглэлт, багц, бэлгийн карт, урамшууллын код</b><br>' +
            '<span class="muted">Унтраавал үйлчлүүлэгч зөвхөн цаг захиална, төлбөрийг утсаар эсвэл салон дээр авна. ' +
            'Одоо байгаа үлдэгдэл устахгүй — дахин асаахад бүгд буцаж ирнэ.</span></span></label>'
          : '<p class="small" style="margin:8px 0">Хэтэвч: <b>' + (s.featureWallet ? 'асаалттай' : 'унтраалттай') + '</b> <span class="muted">— зөвхөн супер админ өөрчилнө</span></p>') +
        '<button class="btn btn-primary mt" id="stSave">Хадгалах</button>' +
        '<p class="muted small" style="margin-top:12px">PIN, QPay тохиргоог <b>config.json</b> файлд солино.</p>' +
        '</div>' +
        '<div id="aiCard"></div>';
      loadAssistantCard();
      function renderCd() {
        document.getElementById('cdList').innerHTML = closedDates.map(function (d) {
          return '<span class="datechip">' + d + ' <b data-rm="' + d + '">×</b></span>';
        }).join('');
        c.querySelectorAll('#cdList [data-rm]').forEach(function (x) {
          x.onclick = function () {
            closedDates = closedDates.filter(function (d) { return d !== x.getAttribute('data-rm'); });
            renderCd();
          };
        });
      }
      renderCd();
      var walletBox = document.getElementById('stWallet');
      if (walletBox) walletBox.onchange = function () {
        var br = document.getElementById('bonusRow');
        if (br) br.hidden = !this.checked;
      };
      document.getElementById('cdAdd').onclick = function () {
        var v = document.getElementById('cdDate').value;
        if (v && closedDates.indexOf(v) < 0) { closedDates.push(v); closedDates.sort(); renderCd(); }
      };
      document.getElementById('stSave').onclick = function () {
        var closedWeekdays = [];
        c.querySelectorAll('.cwd:checked').forEach(function (cb) { closedWeekdays.push(Number(cb.value)); });
        var body = {
            hoursOpen: document.getElementById('stOpen').value,
            hoursClose: document.getElementById('stClose').value,
            slotMinutes: Number(document.getElementById('stSlot').value),
            closedWeekdays: closedWeekdays,
            closedDates: closedDates,
            bookingDaysAhead: Number(document.getElementById('stAhead').value),
            cancelHours: Number(document.getElementById('stCancel').value),
            topupBonusThreshold: Number(document.getElementById('stBth').value),
            topupBonusPercent: Number(document.getElementById('stBpc').value),
            contact: {
              addressMn: document.getElementById('ctAddrMn').value,
              addressEn: document.getElementById('ctAddrEn').value,
              phoneDisplay: document.getElementById('ctPhoneDisp').value,
              phoneTel: document.getElementById('ctPhoneTel').value,
              bookingPhones: document.getElementById('ctBookPhones').value,
              mapUrl: document.getElementById('ctMap').value,
              email: document.getElementById('ctEmail').value,
              facebook: document.getElementById('ctFb').value
            }
        };
        if (walletBox) body.featureWallet = walletBox.checked;
        api('/api/admin/settings', { method: 'POST', body: body }).then(function () {
          var wasOn = featureWallet;
          if (walletBox) featureWallet = walletBox.checked;
          toast('Хадгалагдлаа ✓ — шинэ тохиргоо шууд үйлчилнэ', 'ok');
          if (wasOn !== featureWallet) render();
        })
          .catch(function (e) {
            var msg = 'Алдаа — утгуудаа шалгана уу';
            if (e && e.error === 'bad_url') msg = 'Facebook / Maps холбоос https:// -ээр эхлэх ёстой';
            if (e && e.error === 'bad_email') msg = 'Имэйл буруу байна';
            if (e && e.error === 'bad_phone') msg = 'Залгах утас зөвхөн тоо (+976...)';
            toast(msg, 'err');
          });
      };
    }).catch(function () { toast('Алдаа гарлаа', 'err'); });
  }

  /* ----- customer assistant (AI): switch, cap, notes, spend, test question ----- */
  var AI_REASON = {
    no_key: 'OpenAI API түлхүүр алга (.env → OPENAI_API_KEY). Асаасан ч вэбсайт "утсаар залгана уу" гэж харуулна.',
    no_model: 'config.json → assistant.model хоосон байна.',
    bad_prices: 'config.json → assistant.priceUsdPerMTok буруу — зардлын хязгаар ажиллахгүй тул туслах зогссон.',
    bad_caps: 'Сар/өдрийн хязгаар 0-ээс их байх ёстой.'
  };
  /* spend is often a fraction of a cent: three decimals below $10 */
  function usd(x, d) { var n = Number(x) || 0; return '$' + n.toFixed(d === undefined ? (Math.abs(n) < 10 ? 3 : 2) : d); }
  /* spend, limits and health — re-rendered on its own after a test question */
  function aiStatusHtml(st) {
    var pct = st.monthlyCapUsd > 0 ? Math.min(100, Math.round(st.monthUsd / st.monthlyCapUsd * 100)) : 0;
    var row = function (k, v) { return '<tr><td class="muted" style="padding:3px 12px 3px 0;white-space:nowrap;vertical-align:top">' + k + '</td><td style="padding:3px 0">' + v + '</td></tr>'; };
    var err = st.lastError ? esc(String(st.lastError.status || '-') + ' ' + (st.lastError.code || '')) + ' · ' + esc(fmtShort(st.lastError.at)) : '—';
    var note = function (txt) { return '<p class="small" style="background:var(--brand-soft);padding:8px 12px;border-radius:10px;margin-bottom:10px">' + txt + '</p>'; };
    return (st.unavailableReason ? note('⚠️ ' + esc(AI_REASON[st.unavailableReason] || st.unavailableReason)) : '') +
      (st.mock ? note('🧪 Туршилтын горим (mock): жинхэнэ AI-д хандахгүй, бэлэн хариу өгнө.') : '') +
      (st.knowledgeTruncated || st.notesTruncated ? note('⚠️ Салоны мэдээлэл ' + Math.round(st.knowledgeLimitBytes / 1024) + ' KB-аас хэтэрсэн тул ' + (st.knowledgeTruncated ? 'төгсгөлийг' : 'тэмдэглэлийг') + ' таслав. Тэмдэглэлээ богиносгоно уу.') : '') +
      '<div style="margin-bottom:6px"><b>Энэ сар: ' + usd(st.monthUsd) + ' / ' + usd(st.monthlyCapUsd, 2) + '</b> <span class="muted small">(' + pct + '%)</span></div>' +
      '<div style="height:8px;border-radius:6px;background:var(--line);overflow:hidden;margin-bottom:10px"><div style="height:100%;width:' + pct + '%;background:' + (pct >= 80 ? '#c0573e' : 'var(--brand)') + '"></div></div>' +
      '<table class="small" style="margin-bottom:12px">' +
      row('Өнөөдөр', usd(st.dayUsd) + ' / ' + usd(st.dailyCapUsd, 2)) +
      row('Асуулт', st.calls + ' энэ сар · ' + st.callsToday + ' өнөөдөр') +
      row('Загвар', esc(st.model) + (st.reasoningEffort ? ' · reasoning ' + esc(st.reasoningEffort) : '')) +
      row('Нэг асуултын дээд зардал', '≈ ' + usd(st.worstCaseUsdPerMessage, 4)) +
      row('Туршилтын горим', st.mock ? 'тийм' : 'үгүй') +
      row('API түлхүүр', st.keyPresent ? 'байна' : 'байхгүй') +
      row('Telegram мэдэгдэл', (st.telegramConfigured ? 'тохируулсан' : 'тохируулаагүй — мэдэгдэл зөвхөн энд харагдана') + (st.lastAlert ? '<br><span class="muted">Сүүлд: ' + esc(st.lastAlert.kind) + ' · ' + esc(fmtShort(st.lastAlert.at)) + '</span>' : '')) +
      row('Сүүлийн алдаа', err) +
      row('Салоны мэдээлэл', Math.round(st.knowledgeBytes / 102.4) / 10 + ' KB / ' + Math.round(st.knowledgeLimitBytes / 1024) + ' KB') +
      '</table>';
  }
  function loadAssistantCard() {
    var host = document.getElementById('aiCard');
    if (!host) return;
    Promise.all([api('/api/admin/assistant'), api('/api/admin/settings')]).then(function (r) {
      var st = r[0], s = r[1];
      host.innerHTML =
        '<div class="card" style="max-width:640px;margin-top:16px">' +
        '<h3 style="margin-bottom:6px">🤖 Туслах (AI)</h3>' +
        '<p class="muted small" style="margin-bottom:10px">Вэбсайт дээрх чат. Үнэ, цаг, байршил, эмчилгээ, арчилгааны асуултад зөвхөн салоны мэдээллээс (үйлчилгээ, асуулт, бүтээгдэхүүн, доорх тэмдэглэл) хариулж, мэдэхгүй зүйлд утасны дугаар өгнө. Үйлчлүүлэгч, захиалга, ажилтны мэдээлэл түүнд огт очдоггүй.</p>' +
        '<label class="small" style="display:flex;gap:8px;align-items:flex-start;margin:4px 0 12px;cursor:pointer">' +
        '<input type="checkbox" id="aiOn"' + (s.assistantEnabled ? ' checked' : '') + ' style="margin-top:3px">' +
        '<span><b>Асаах — вэбсайт дээр чатын товч харагдана</b><br><span class="muted">Анхдагчаар унтраалттай.</span></span></label>' +
        '<div id="aiStatus">' + aiStatusHtml(st) + '</div>' +
        '<div class="row"><div class="field grow"><label>Сарын дээд хязгаар (USD)</label><input type="number" id="aiCap" class="cell-input" min="0.01" max="100" step="0.5" value="' + (s.assistantMonthlyCapUsd === null ? '' : esc(String(s.assistantMonthlyCapUsd))) + '" placeholder="' + esc(String(s.assistantMonthlyCapDefaultUsd)) + ' (config.json)">' +
        '<span class="muted small">Хоосон орхивол config.json-ий утга (' + esc(usd(s.assistantMonthlyCapDefaultUsd, 2)) + ') үйлчилнэ.</span></div></div>' +
        '<div class="field"><label>Туслахад зориулсан нэмэлт мэдээлэл</label>' +
        '<span class="muted small" style="display:block;margin-bottom:4px">Facebook пост, шинэ эмчилгээ, бүтээгдэхүүн, зогсоол, баярын цаг… — хуулж буулгаад Хадгалах дарна. Үнэ бичээгүй зүйлийн үнийг туслах хэлэхгүй, утсаар лавлахыг санал болгоно. Энд бичсэн нь хуучин мэдээллээс давуу эрхтэй.</span>' +
        '<span class="muted small" style="display:block;margin-bottom:4px">⚠️ Энд бичсэн бүхнийг үйлчлүүлэгч туслахаас асууж мэдэж болно — нууц зүйл бүү бич.</span>' +
        '<textarea id="aiNotes" class="cell-input" rows="14" style="min-height:240px;font-size:.92rem;line-height:1.45" maxlength="' + st.notesMaxChars + '" placeholder="Жишээ:\nAquapeel — гүн цэвэрлэгээ, … (үнэ: утсаар лавлана)\nХас Мөнх төвийн урд талд үнэгүй зогсоол бий.">' + esc(s.assistantNotes || '') + '</textarea>' +
        '<span class="muted small" id="aiNotesN"></span></div>' +
        '<div class="row" style="flex-wrap:wrap;gap:8px"><button class="btn btn-primary" id="aiSave">Хадгалах</button>' +
        '<button class="btn btn-ghost" id="aiAlert"' + (st.telegramConfigured ? '' : ' disabled') + '>Туршилтын мэдэгдэл</button></div>' +
        '<hr style="border:none;border-top:1px solid var(--line);margin:16px 0">' +
        '<label class="small" style="font-weight:600;color:var(--muted)">Туршиж асуух (унтраалттай үед ч ажиллана, зардал энэ сард тооцогдоно)</label>' +
        '<div class="row" style="margin-top:6px"><input id="aiQ" class="cell-input grow" maxlength="' + st.maxMessageChars + '" placeholder="une hed ve / Үнэ хэд вэ? / Do you treat men?">' +
        '<button class="btn btn-ghost" id="aiAsk">Туршиж асуух</button></div>' +
        '<p id="aiA" style="white-space:pre-wrap;margin-top:8px"></p><p class="muted small" id="aiAm"></p>' +
        '</div>';
      var notes = document.getElementById('aiNotes'), notesN = document.getElementById('aiNotesN');
      function count() { notesN.textContent = notes.value.length.toLocaleString('en-US') + ' / ' + st.notesMaxChars.toLocaleString('en-US') + ' тэмдэгт'; }
      notes.oninput = count; count();
      document.getElementById('aiSave').onclick = function () {
        var on = document.getElementById('aiOn').checked;
        var capRaw = document.getElementById('aiCap').value.trim();
        var body = { assistantEnabled: on, assistantMonthlyCapUsd: capRaw === '' ? null : Number(capRaw), assistantNotes: notes.value };
        var go = (on && !s.assistantEnabled)
          ? confirmDlg('Анхаар: үйлчилгээ, үнэ, асуулт, бүтээгдэхүүний зарим мэдээлэл одоогоор жишээ (placeholder) хэвээр байна (docs/INFO-TO-FILL-IN.md). Туслах эдгээр үнийг үйлчлүүлэгчдэд яг тэр чигээр нь хэлнэ. Шалгасан бол асаах уу?')
          : Promise.resolve(true);
        go.then(function (yes) {
          if (!yes) return;
          api('/api/admin/settings', { method: 'POST', body: body })
            .then(function () { toast('Хадгалагдлаа ✓', 'ok'); loadAssistantCard(); })
            .catch(function (e) {
              toast(e && e.error === 'bad_cap' ? 'Хязгаар 0.01–100 USD байх ёстой' : e && e.error === 'notes_too_long' ? 'Тэмдэглэл хэт урт байна' : 'Алдаа гарлаа', 'err');
            });
        });
      };
      document.getElementById('aiAlert').onclick = function () {
        api('/api/admin/assistant/test-alert', { method: 'POST', body: {} })
          .then(function (d) { toast(d.sent ? 'Telegram мэдэгдэл илгээгдлээ ✓' : 'Илгээж чадсангүй — токен, chat ID-гаа шалгана уу', d.sent ? 'ok' : 'err'); })
          .catch(function () { toast('Алдаа гарлаа', 'err'); });
      };
      document.getElementById('aiAsk').onclick = function () {
        var q = document.getElementById('aiQ').value.trim();
        var a = document.getElementById('aiA'), am = document.getElementById('aiAm'), btn = this;
        if (!q) return;
        btn.disabled = true; a.textContent = '…'; am.textContent = '';
        api('/api/admin/assistant/ask', { method: 'POST', body: { message: q } })
          .then(function (d) {
            a.textContent = d.reply || '';
            var u = d.usage;
            am.textContent = (d.fallback ? '⚠️ ' + (d.reason || '') + (d.detail ? ' (' + d.detail + ')' : '') + ' · ' : '') +
              (u ? 'tokens: ' + u.inputTokens + ' in (' + u.cachedTokens + ' cached) · ' + u.outputTokens + ' out · ' : '') +
              (d.costUsd !== undefined ? usd(d.costUsd, 5) : '');
          })
          .catch(function (e) { a.textContent = ''; am.textContent = e && e.error === 'busy' ? 'Түр хүлээгээд дахин оролдоно уу' : 'Алдаа: ' + ((e && e.error) || ''); })
          .then(function () {
            btn.disabled = false;
            return api('/api/admin/assistant').then(function (st2) { var box = document.getElementById('aiStatus'); if (box) box.innerHTML = aiStatusHtml(st2); });
          })
          .catch(function () {});
      };
    }).catch(function () { host.innerHTML = ''; });
  }

  document.addEventListener('keydown', function (e) {
    if (!token || modalHost.innerHTML || e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^(input|textarea|select)$/i.test((e.target.tagName || ''))) return;
    if (e.key === 'n' || e.key === 'N' || e.key === 'т' || e.key === 'Т') { e.preventDefault(); openQuickBook({ date: viewDate() }); }
  });

  fetch('/api/config')
    .then(function (r) { return r.json(); })
    .then(function (c) {
      featureWallet = c && c.featureWallet === true;
      if (c && c.hoursOpen && c.hoursClose) salonHours = { open: c.hoursOpen, close: c.hoursClose };
    })
    .catch(function () {})
    .then(function () { render(); });
})();
