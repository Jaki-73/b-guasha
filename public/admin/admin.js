/* B's Gua Sha — admin panel v3 (owner PIN or staff phone login). Mongolian-first labels. */
(function () {
  'use strict';

  var token = sessionStorage.getItem('bg_admin') || null;
  var role = sessionStorage.getItem('bg_admin_role') || '';
  var meName = sessionStorage.getItem('bg_admin_name') || '';
  var meStaffId = sessionStorage.getItem('bg_admin_sid') || '';
  var tab = 'cal';
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

  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
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
    var d = new Date(iso);
    return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function openModal(html) {
    modalHost.innerHTML = '<div class="modal-back"><div class="modal" style="max-width:560px">' + html + '</div></div>';
    var back = modalHost.firstChild;
    back.addEventListener('click', function (e) { if (e.target === back) closeModal(); });
    return back.querySelector('.modal');
  }
  function closeModal() { modalHost.innerHTML = ''; }
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
    token = null; role = ''; meName = ''; meStaffId = '';
    sessionStorage.removeItem('bg_admin');
    sessionStorage.removeItem('bg_admin_role');
    sessionStorage.removeItem('bg_admin_name');
    sessionStorage.removeItem('bg_admin_sid');
    if (chatPoll) { clearInterval(chatPoll); chatPoll = null; }
    render();
  }

  var ST_LABEL = { confirmed: 'Баталгаажсан', done: 'Болсон ✓', cancelled: 'Цуцалсан', noshow: 'Ирээгүй' };
  var PAID_LABEL = { balance: 'Үлдэгдлээс ✓', salon: 'Салон дээр', refunded: 'Буцаагдсан', package: 'Багцаас ✓', package_returned: 'Багц руу буцсан' };

  /* ================= shell ================= */
  function render() {
    if (chatPoll) { clearInterval(chatPoll); chatPoll = null; }
    if (!token) return renderLogin();
    var isOwner = role === 'owner';
    var tabs = isOwner ? [
      ['cal', '🗓 Календарь'],
      ['bookings', '📋 Захиалга'],
      ['users', '👤 Үйлчлүүлэгч'],
      ['chat', '💬 Чат'],
      ['reviews', '⭐ Сэтгэгдэл'],
      ['services', '🌿 Үйлчилгээ'],
      ['offers', '🎁 Багц · Код'],
      ['staff', '👥 Ажилтан'],
      ['stats', '📊 Тайлан'],
      ['settings', '⚙️ Тохиргоо']
    ] : [
      ['cal', '🗓 Календарь'],
      ['bookings', '📋 Захиалга'],
      ['users', '👤 Үйлчлүүлэгч'],
      ['chat', '💬 Чат']
    ];
    tabs = tabs.filter(function (x) { return x[0] !== 'offers' || featureWallet; });
    if (!tabs.some(function (x) { return x[0] === tab; })) tab = 'cal';
    root.innerHTML =
      '<div class="row" style="gap:12px;flex-wrap:wrap"><h2 style="font-family:\'Playfair Display\',serif">B\'s Gua Sha — Удирдлага</h2>' +
      '<span class="pill">' + (isOwner ? '👑 Эзэмшигч' : '👤 Ажилтан') + (meName ? ' · ' + esc(meName) : '') + '</span>' +
      '<div class="spacer" style="flex:1"></div>' +
      (isOwner ? '<a class="icon-btn" href="/api/admin/export?token=' + encodeURIComponent(token) + '" download>⬇ Backup</a>' : '') +
      '<button class="icon-btn" id="themeBtn">' + (theme === 'dark' ? '☀️' : '🌙') + '</button>' +
      '<button class="icon-btn" id="outBtn">Гарах</button></div>' +
      '<div class="admin-tabs">' + tabs.map(function (x) {
        return '<button data-tab="' + x[0] + '" class="' + (tab === x[0] ? 'active' : '') + '">' + x[1] + '</button>';
      }).join('') + '</div>' +
      '<div id="content"><div class="skeleton"></div></div>';

    document.getElementById('themeBtn').onclick = function () {
      theme = theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem('bg_theme', theme);
      document.documentElement.setAttribute('data-theme', theme);
      render();
    };
    document.getElementById('outBtn').onclick = doLogout;
    root.querySelectorAll('[data-tab]').forEach(function (b) {
      b.onclick = function () { tab = b.getAttribute('data-tab'); render(); };
    });

    ({ cal: loadCalendar, bookings: loadBookings, users: loadUsers, chat: loadChat, reviews: loadReviews, services: loadServices, offers: loadOffers, staff: loadStaff, stats: loadStats, settings: loadSettings }[tab] || loadCalendar)();
  }

  function renderLogin() {
    var mode = sessionStorage.getItem('bg_admin_mode') || 'pin';
    root.innerHTML =
      '<div class="pin-wrap"><img src="/assets/logo.svg" alt="">' +
      '<h2 style="font-family:\'Playfair Display\',serif;margin:12px 0">Удирдлагын хэсэг</h2>' +
      '<div class="auth-tabs" style="max-width:320px;margin:0 auto 16px">' +
      '<button id="mPin" class="' + (mode === 'pin' ? 'active' : '') + '">Эзэмшигч (PIN)</button>' +
      '<button id="mStaff" class="' + (mode === 'staff' ? 'active' : '') + '">Ажилтан</button></div>' +
      (mode === 'pin'
        ? '<form id="pinForm"><div class="field"><input id="pin" type="password" inputmode="numeric" placeholder="PIN" style="text-align:center;font-size:1.3rem;letter-spacing:0.4em"></div>' +
          '<button class="btn btn-primary btn-block" type="submit">Нэвтрэх</button></form>' +
          '<p class="muted small" style="margin-top:12px">Анхны PIN: 1234 — config.json дотор солино</p>'
        : '<form id="staffForm"><div class="field"><input id="sfPhone" inputmode="numeric" maxlength="8" placeholder="Утасны дугаар"></div>' +
          '<div class="field"><input id="sfPass" type="password" placeholder="Нууц үг"></div>' +
          '<button class="btn btn-primary btn-block" type="submit">Нэвтрэх</button></form>' +
          '<p class="muted small" style="margin-top:12px">Ажилтны эрхийг эзэмшигч "Ажилтан" хэсгээс үүсгэнэ</p>') +
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
          toast(err && err.error === 'staff_inactive' ? 'Энэ ажилтны эрх идэвхгүй байна' : 'Утас эсвэл нууц үг буруу', 'err');
        });
    };
  }
  function afterLogin(d) {
    token = d.token; role = d.role; meName = d.name || ''; meStaffId = d.staffUserId || '';
    sessionStorage.setItem('bg_admin', token);
    sessionStorage.setItem('bg_admin_role', role);
    sessionStorage.setItem('bg_admin_name', meName);
    sessionStorage.setItem('bg_admin_sid', meStaffId);
    tab = 'cal';
    render();
  }

  /* ================= calendar ================= */
  function shiftDate(days) {
    var p = calDate.split('-').map(Number);
    var d = new Date(p[0], p[1] - 1, p[2] + days);
    calDate = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

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
    var wd = ['Ням', 'Даваа', 'Мягмар', 'Лхагва', 'Пүрэв', 'Баасан', 'Бямба'][new Date(calDate + 'T12:00:00').getDay()];

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

    var bkByKey = {};
    d.bookings.forEach(function (b) { if (b.status === 'confirmed' || b.status === 'done') bkByKey[b.staffId + '|' + b.time] = b; });
    var blByKey = {};
    d.blocks.forEach(function (b) { blByKey[b.staffId + '|' + b.time] = b; });
    function toMin(t) { var p = t.split(':').map(Number); return p[0] * 60 + p[1]; }

    var grid = '<div class="cal-grid"><table><tr><th></th>' +
      d.staff.map(function (s) { return '<th><span class="staff-dot" style="background:' + esc(s.color) + '"></span>' + esc(s.name) + '</th>'; }).join('') + '</tr>';
    d.slots.forEach(function (time) {
      grid += '<tr><td class="timecol">' + time + '</td>';
      d.staff.forEach(function (s) {
        var key = s.id + '|' + time;
        var bk = bkByKey[key];
        var bl = blByKey[key];
        var tMin = toMin(time);
        // a longer booking earlier may cover this slot
        if (!bk) {
          for (var i = 0; i < d.bookings.length; i++) {
            var b2 = d.bookings[i];
            if (b2.staffId === s.id && (b2.status === 'confirmed' || b2.status === 'done')) {
              var st = toMin(b2.time), en = st + (b2.minutes || d.slotMinutes);
              if (tMin > st && tMin < en) { bk = b2; break; }
            }
          }
        }
        if (bk) {
          var cont = toMin(bk.time) !== tMin;
          grid += '<td><div class="cal-cell busy" style="background:' + esc(s.color) + (cont ? ';opacity:0.55' : '') + '" data-bk="' + esc(bk.id) + '">' +
            (cont ? '⋯' : esc(bk.user.name)) +
            (cont ? '' : '<span class="sub">' + esc(bk.service ? bk.service.nameMn : '') + (bk.status === 'done' ? ' ✓' : '') + '</span>') +
            '</div></td>';
        } else if (bl) {
          grid += '<td><div class="cal-cell blocked" data-bl="' + esc(bl.id) + '">🚫 ' + esc(bl.note || 'Хаасан') + '</div></td>';
        } else if (!s.working || d.closed || tMin < s.open || tMin + d.slotMinutes > s.close) {
          grid += '<td><div class="cal-cell off"></div></td>';
        } else {
          grid += '<td><div class="cal-cell empty" data-free="' + esc(s.id) + '|' + time + '">+</div></td>';
        }
      });
      grid += '</tr>';
    });
    grid += '</table></div>';

    c.innerHTML = head + grid +
      '<p class="muted small" style="margin-top:10px">Хоосон нүд дарж захиалга нэмэх эсвэл цаг хаана. Захиалга дарж төлөв солино. 🚫 дарж хаалтыг болиулна.</p>';

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
      '<h3>' + calDate + ' · ' + time + ' — ' + esc(st.name || '') + '</h3>' +
      '<div class="modal-actions" style="flex-direction:column">' +
      '<button class="btn btn-primary" id="cmAdd">➕ Захиалга нэмэх (утсаар/ирсэн)</button>' +
      '<button class="btn btn-ghost" id="cmBlock">🚫 Энэ цагийг хаах</button></div>'
    );
    m.querySelector('#cmAdd').onclick = function () { closeModal(); openWalkin(staffId, time); };
    m.querySelector('#cmBlock').onclick = function () {
      closeModal();
      var m2 = openModal(
        '<h3>🚫 Цаг хаах — ' + time + '</h3>' +
        '<div class="field"><label>Шалтгаан (заавал биш)</label><input id="blNote" maxlength="100" placeholder="ж: цайны цаг, завсарлага…"></div>' +
        '<div class="modal-actions"><button class="btn btn-ghost" id="blCancel">Болих</button>' +
        '<button class="btn btn-primary" id="blOk">Хаах</button></div>'
      );
      m2.querySelector('#blCancel').onclick = closeModal;
      m2.querySelector('#blOk').onclick = function () {
        api('/api/admin/blocks', { method: 'POST', body: { date: calDate, time: time, staffId: staffId, note: m2.querySelector('#blNote').value } })
          .then(function () { closeModal(); toast('Цаг хаагдлаа ✓', 'ok'); loadCalendar(); })
          .catch(function () { toast('Алдаа гарлаа', 'err'); });
      };
    };
  }

  function openWalkin(staffId, time) {
    var svcOpts = (servicesCache || []).filter(function (s) { return s.active; }).map(function (s) {
      return '<option value="' + esc(s.id) + '">' + esc(s.nameMn) + ' · ' + money(s.price) + '</option>';
    }).join('');
    var m = openModal(
      '<h3>➕ Захиалга нэмэх — ' + calDate + ' ' + time + '</h3>' +
      '<div class="field"><label>Утасны дугаар (бүртгэлтэй бол автоматаар холбоно)</label><input id="wiPhone" inputmode="numeric" maxlength="8"></div>' +
      '<div class="field"><label>Нэр (бүртгэлгүй зочинд)</label><input id="wiName" maxlength="60"></div>' +
      '<div class="field"><label>Үйлчилгээ</label><select id="wiSvc">' + svcOpts + '</select></div>' +
      '<div class="modal-actions"><button class="btn btn-ghost" id="wiCancel">Болих</button>' +
      '<button class="btn btn-primary" id="wiOk">Нэмэх</button></div>'
    );
    m.querySelector('#wiCancel').onclick = closeModal;
    m.querySelector('#wiOk').onclick = function () {
      var btn = this;
      btn.disabled = true;
      api('/api/admin/walkin', {
        method: 'POST',
        body: { date: calDate, time: time, staffId: staffId, serviceId: m.querySelector('#wiSvc').value, phone: m.querySelector('#wiPhone').value.trim(), name: m.querySelector('#wiName').value.trim() }
      }).then(function () { closeModal(); toast('Захиалга нэмэгдлээ ✓', 'ok'); loadCalendar(); })
        .catch(function (e) { toast(e && e.error === 'slot_taken' ? 'Энэ цаг давхцаж байна' : 'Алдаа гарлаа', 'err'); btn.disabled = false; });
    };
  }

  function openBookingModal(bk, after) {
    var staffOpts = (calCache ? calCache.staff : []).map(function (s) {
      return '<option value="' + esc(s.id) + '"' + (bk.staffId === s.id ? ' selected' : '') + '>' + esc(s.name) + '</option>';
    }).join('');
    var m = openModal(
      '<h3>' + esc(bk.user.name) + (bk.walkIn ? ' <span class="pill">зочин</span>' : '') + '</h3>' +
      '<p class="small muted">' + esc(bk.service ? bk.service.nameMn : '') + ' · ' + bk.date + ' ' + bk.time + ' · ' + money(bk.amount) +
      '<br>Төлбөр: ' + (PAID_LABEL[bk.paid] || bk.paid) + ' · Төлөв: ' + (ST_LABEL[bk.status] || bk.status) + '</p>' +
      (bk.user.phone ? '<p><a href="tel:' + esc(bk.user.phone) + '">📞 ' + esc(bk.user.phone) + '</a></p>' : '') +
      (role === 'owner' && bk.status === 'confirmed' ? '<div class="field mt"><label>Ажилтан солих</label><select id="bmStaff">' + staffOpts + '</select></div>' : '') +
      '<div class="bk-actions mt">' +
      (bk.status === 'confirmed'
        ? '<button data-st="done">Болсон ✓</button><button data-st="noshow">Ирээгүй</button><button data-st="cancelled">Цуцлах</button>'
        : '<button data-st="confirmed">Сэргээх</button>') +
      '</div>' +
      (bk.user.id ? '<button class="btn btn-ghost btn-block mt" id="bmProfile">👤 Үйлчлүүлэгчийн түүх үзэх</button>' : '') +
      '<div class="modal-actions"><button class="btn btn-ghost" id="bmClose">Хаах</button></div>'
    );
    m.querySelector('#bmClose').onclick = closeModal;
    m.querySelectorAll('[data-st]').forEach(function (btn) {
      btn.onclick = function () {
        api('/api/admin/bookings/' + bk.id + '/status', { method: 'POST', body: { status: btn.getAttribute('data-st') } })
          .then(function () { closeModal(); toast('Хадгалагдлаа ✓', 'ok'); after(); })
          .catch(function () { toast('Алдаа гарлаа', 'err'); });
      };
    });
    var sel = m.querySelector('#bmStaff');
    if (sel) sel.onchange = function () {
      api('/api/admin/bookings/' + bk.id + '/assign', { method: 'POST', body: { staffId: sel.value } })
        .then(function () { toast('Ажилтан солигдлоо ✓', 'ok'); after(); })
        .catch(function (e) { toast(e && e.error === 'slot_taken' ? 'Тэр ажилтны цаг давхцаж байна' : 'Алдаа гарлаа', 'err'); });
    };
    var pf = m.querySelector('#bmProfile');
    if (pf) pf.onclick = function () { closeModal(); openClientProfile(bk.user.id); };
  }

  /* ================= bookings list ================= */
  function loadBookings() {
    api('/api/admin/overview').then(function (d) {
      var c = document.getElementById('content');
      var s = d.stats;
      function bkRow(b) {
        return '<tr><td><b>' + esc(b.date) + '</b><br>' + esc(b.time) + '</td>' +
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
        btn.onclick = function () {
          api('/api/admin/bookings/' + btn.getAttribute('data-id') + '/status', { method: 'POST', body: { status: btn.getAttribute('data-st') } })
            .then(function () { toast('Хадгалагдлаа ✓', 'ok'); loadBookings(); })
            .catch(function () { toast('Алдаа гарлаа', 'err'); });
        };
      });
    }).catch(function () { toast('Алдаа гарлаа', 'err'); });
  }

  /* ================= clients ================= */
  function loadUsers(q) {
    api('/api/admin/users' + (q ? '?q=' + encodeURIComponent(q) : '')).then(function (list) {
      var c = document.getElementById('content');
      c.innerHTML =
        '<div class="row" style="margin-bottom:10px"><input id="userQ" class="cell-input" style="max-width:280px" placeholder="🔍 Нэр эсвэл утсаар хайх…" value="' + esc(q || '') + '"></div>' +
        '<div class="card"><table><tr><th>Нэр</th><th>Утас</th><th>Үлдэгдэл</th><th>Ирсэн</th><th>Сүүлд</th><th>Дараагийн</th><th></th></tr>' +
        list.map(function (u) {
          return '<tr><td><b>' + esc(u.name) + '</b>' + (u.isDemo ? ' <span class="muted small">(demo)</span>' : '') + '</td>' +
            '<td><a href="tel:' + esc(u.phone) + '">' + esc(u.phone) + '</a></td>' +
            '<td>' + money(u.balance) + '</td><td>' + u.visits + '</td>' +
            '<td>' + esc(u.lastVisit || '—') + '</td><td>' + esc(u.nextBooking || '—') + '</td>' +
            '<td><button class="mini-btn" data-prof="' + esc(u.id) + '">Түүх →</button></td></tr>';
        }).join('') + '</table>' + (list.length ? '' : '<p class="muted" style="padding:10px">Олдсонгүй.</p>') + '</div>';
      var inp = document.getElementById('userQ');
      var tmr = null;
      inp.oninput = function () {
        clearTimeout(tmr);
        tmr = setTimeout(function () { loadUsers(inp.value.trim()); }, 350);
      };
      inp.focus();
      if (q) inp.setSelectionRange(q.length, q.length);
      c.querySelectorAll('[data-prof]').forEach(function (b) {
        b.onclick = function () { openClientProfile(b.getAttribute('data-prof')); };
      });
    }).catch(function () { toast('Алдаа гарлаа', 'err'); });
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
          '<div class="row" style="margin-top:6px"><span class="muted" style="font-size:0.72rem">' + fmtShort(n.createdAt) + '</span>' +
          '<span class="spacer" style="flex:1"></span>' +
          '<button class="mini-btn" data-editnote="' + esc(n.id) + '">✎</button>' +
          '<button class="mini-btn" data-delnote="' + esc(n.id) + '">🗑</button></div></div>';
      }).join('');

      var m = openModal(
        '<h3>' + esc(u.name) + ' <span class="muted small">' + esc(u.phone) + '</span></h3>' +
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

        (role === 'owner' && featureWallet ? '<div class="row" style="margin:10px 0"><input id="adjAmount" class="cell-input" style="max-width:130px" inputmode="numeric" placeholder="± дүн ₮">' +
          '<input id="adjNote" class="cell-input" placeholder="Тайлбар (ж: бэлэн мөнгөөр цэнэглэв)">' +
          '<button class="mini-btn" id="adjBtn">Хэтэвч засах</button></div>' : '') +

        '<h3 style="font-size:1rem;margin:12px 0 6px">📝 Миний тэмдэглэл <span class="muted small">(зөвхөн танд харагдана)</span></h3>' +
        '<div id="notesHost">' + notesHtml + '</div>' +
        '<div class="row"><input id="newNote" class="cell-input" maxlength="500" placeholder="ж: хүчтэй массаж таалагддаг, нуруу эмзэг…">' +
        '<button class="mini-btn" id="addNote">+ Нэмэх</button></div>' +

        (featureWallet ? '<h3 style="font-size:1rem;margin:14px 0 6px">🎁 Багцууд</h3>' + pkgHtml : '') +

        '<h3 style="font-size:1rem;margin:14px 0 6px">📅 Үйлчилгээний түүх</h3>' +
        (d.bookings.length ? '<div style="max-height:300px;overflow-y:auto"><table><tr><th>Огноо</th><th>Үйлчилгээ</th><th>Төлбөр</th><th>Төлөв</th></tr>' + bksHtml + '</table></div>' : '<p class="muted small">Захиалга алга.</p>') +

        '<div class="modal-actions"><button class="btn btn-ghost" id="cpClose">Хаах</button></div>'
      );
      m.querySelector('#cpClose').onclick = closeModal;

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
        api('/api/admin/notes', { method: 'POST', body: { customerId: userId, text: txt } })
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
  function loadChat() {
    api('/api/admin/chat').then(function (list) {
      chatThreads = list;
      renderChatShell();
      if (chatOpen) openThread(chatOpen, true);
      chatPoll = setInterval(function () {
        if (tab !== 'chat') return;
        api('/api/admin/chat').then(function (l2) {
          chatThreads = l2;
          var host = document.getElementById('threadList');
          if (host) host.innerHTML = threadsHtml();
          bindThreads();
          if (chatOpen) refreshConv();
        }).catch(function () {});
      }, 7000);
    }).catch(function () { toast('Алдаа гарлаа', 'err'); });
  }

  function threadsHtml() {
    if (!chatThreads || !chatThreads.length) return '<p class="muted small" style="padding:10px">Чат алга. Үйлчлүүлэгч аппаасаа бичих боломжтой.</p>';
    return chatThreads.map(function (th) {
      return '<div class="thread' + (chatOpen === th.userId ? ' active' : '') + '" data-th="' + esc(th.userId) + '">' +
        '<div><div class="tn">' + esc(th.name) + '</div><div class="tl">' + (th.lastFrom === 'salon' ? 'Та: ' : '') + esc(th.lastText) + '</div></div>' +
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

  function openThread(userId, keep) {
    chatOpen = userId;
    api('/api/admin/chat/' + userId).then(function (d) {
      var pane = document.getElementById('convPane');
      if (!pane) return;
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
      var host = document.getElementById('threadList');
      if (host) { host.innerHTML = threadsHtml(); bindThreads(); }
    }).catch(function () { toast('Алдаа гарлаа', 'err'); });
  }
  function refreshConv() {
    if (!chatOpen) return;
    api('/api/admin/chat/' + chatOpen).then(function (d) {
      var list = document.getElementById('convList');
      if (!list) return;
      var atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 60;
      list.innerHTML = convHtml(d.messages);
      if (atBottom) list.scrollTop = list.scrollHeight;
    }).catch(function () {});
  }
  function sendThreadMsg() {
    var inp = document.getElementById('convText');
    var text = (inp.value || '').trim();
    if (!text || !chatOpen) return;
    inp.value = '';
    api('/api/admin/chat/' + chatOpen, { method: 'POST', body: { text: text } })
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
    api('/api/admin/services').then(function (list) {
      servicesCache = list;
      var c = document.getElementById('content');
      c.innerHTML =
        '<div class="row" style="margin-bottom:10px"><p class="muted small" style="flex:1">Шууд мөрөн дээр зас — "Хадгалах" дар. Идэвхгүй үйлчилгээ апп/сайтад харагдахгүй.</p>' +
        '<button class="btn btn-primary btn-sm" id="addSvc">＋ Шинэ үйлчилгээ</button></div>' +
        '<div class="card"><table><tr><th></th><th>Нэр (МН / EN)</th><th>Бүлэг</th><th>Мин</th><th>Үнэ (₮)</th><th></th><th>Идэвхтэй</th></tr>' +
        list.map(function (s) {
          return '<tr data-row="' + s.id + '">' +
            '<td><input class="cell-input" style="width:46px" data-f="emoji" value="' + esc(s.emoji || '') + '"></td>' +
            '<td><input class="cell-input" data-f="nameMn" value="' + esc(s.nameMn) + '" style="margin-bottom:4px"><input class="cell-input" data-f="nameEn" value="' + esc(s.nameEn) + '"></td>' +
            '<td><select class="cell-input" data-f="group">' + Object.keys(GROUPS).map(function (g) {
              return '<option value="' + g + '"' + (s.group === g ? ' selected' : '') + '>' + GROUPS[g] + '</option>';
            }).join('') + '</select></td>' +
            '<td><input class="cell-input" style="width:64px" type="number" data-f="minutes" value="' + s.minutes + '" min="15" max="240" step="15"></td>' +
            '<td><input class="cell-input" style="width:100px" type="number" data-f="price" value="' + s.price + '" step="1000" min="0"></td>' +
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
            .catch(function () { toast('Алдаа гарлаа — талбаруудаа шалгана уу', 'err'); });
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
        '<button class="btn btn-primary btn-sm" id="addStaff">＋ Шинэ ажилтан</button></div>' +
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
      document.getElementById('addStaff').onclick = openNewStaff;
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
      '<div class="field mt"><label>Шинэ нууц үг (солих бол л бөглөнө)</label><input id="sPass" type="password" placeholder="••••••"></div>' +
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
      var np = m.querySelector('#sPass').value;
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
        '<label class="small" style="font-weight:600;color:var(--muted)">Нэмэлт боломж</label>' +
        '<label class="small" style="display:flex;gap:8px;align-items:flex-start;margin:8px 0 2px;cursor:pointer">' +
        '<input type="checkbox" id="stWallet"' + (s.featureWallet ? ' checked' : '') + ' style="margin-top:3px">' +
        '<span><b>Хэтэвч — цэнэглэлт, багц, бэлгийн карт, урамшууллын код</b><br>' +
        '<span class="muted">Унтраавал үйлчлүүлэгч зөвхөн цаг захиална, төлбөрийг утсаар эсвэл салон дээр авна. ' +
        'Одоо байгаа үлдэгдэл устахгүй — дахин асаахад бүгд буцаж ирнэ.</span></span></label>' +
        '<button class="btn btn-primary mt" id="stSave">Хадгалах</button>' +
        '<p class="muted small" style="margin-top:12px">📍 Хаяг, утас, имэйл, PIN, QPay тохиргоог <b>config.json</b> файлд солино (апп ажиллаж байгаа фолдер дотор бий).</p>' +
        '</div>';
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
      document.getElementById('stWallet').onchange = function () {
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
        api('/api/admin/settings', {
          method: 'POST',
          body: {
            hoursOpen: document.getElementById('stOpen').value,
            hoursClose: document.getElementById('stClose').value,
            slotMinutes: Number(document.getElementById('stSlot').value),
            closedWeekdays: closedWeekdays,
            closedDates: closedDates,
            bookingDaysAhead: Number(document.getElementById('stAhead').value),
            cancelHours: Number(document.getElementById('stCancel').value),
            topupBonusThreshold: Number(document.getElementById('stBth').value),
            topupBonusPercent: Number(document.getElementById('stBpc').value),
            featureWallet: document.getElementById('stWallet').checked
          }
        }).then(function () {
          var wasOn = featureWallet;
          featureWallet = document.getElementById('stWallet').checked;
          toast('Хадгалагдлаа ✓ — шинэ тохиргоо шууд үйлчилнэ', 'ok');
          if (wasOn !== featureWallet) render();
        })
          .catch(function () { toast('Алдаа — утгуудаа шалгана уу', 'err'); });
      };
    }).catch(function () { toast('Алдаа гарлаа', 'err'); });
  }

  fetch('/api/config')
    .then(function (r) { return r.json(); })
    .then(function (c) { featureWallet = c && c.featureWallet === true; })
    .catch(function () {})
    .then(function () { render(); });
})();
