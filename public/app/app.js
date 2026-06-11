/* B's Guasha — mobile app (PWA). Vanilla JS single-page app. */
(function () {
  'use strict';

  /* ================= state ================= */
  var state = {
    token: localStorage.getItem('bg_token') || null,
    lang: localStorage.getItem('bg_lang') || 'mn',
    theme: localStorage.getItem('bg_theme') || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
    user: null,
    config: null,
    services: [],
    view: 'home',
    book: { step: 1, service: null, date: null, time: null, payWith: null, slots: null, loadingSlots: false },
    walletAmount: 50000,
    photos: null,
    bookings: null,
    editor: null
  };

  var $app = document.getElementById('app');
  var $tabbar = document.getElementById('tabbar');
  var $modalHost = document.getElementById('modalHost');
  var $toastHost = document.getElementById('toastHost');

  /* ================= helpers ================= */
  function t(key) {
    var d = window.I18N[state.lang] || {};
    return d[key] !== undefined ? d[key] : (window.I18N.mn[key] !== undefined ? window.I18N.mn[key] : key);
  }
  function money(n) { return (n || 0).toLocaleString('en-US') + '₮'; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  var WD_MN = ['Ня', 'Да', 'Мя', 'Лх', 'Пү', 'Ба', 'Бя'];
  var WD_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MO_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function fmtDate(dateStr) { // 'YYYY-MM-DD'
    var p = dateStr.split('-').map(Number);
    var wd = new Date(p[0], p[1] - 1, p[2]).getDay();
    if (state.lang === 'mn') return p[1] + '-р сарын ' + p[2] + ' (' + WD_MN[wd] + ')';
    return WD_EN[wd] + ', ' + MO_EN[p[1] - 1] + ' ' + p[2];
  }
  function fmtShort(iso) {
    var d = new Date(iso);
    var hh = String(d.getHours()).padStart(2, '0'), mm = String(d.getMinutes()).padStart(2, '0');
    return (d.getMonth() + 1) + '/' + d.getDate() + ' · ' + hh + ':' + mm;
  }
  function dateOffset(days) {
    var d = new Date(Date.now() + days * 86400000);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function svcName(s) { return state.lang === 'mn' ? s.nameMn : s.nameEn; }
  function svcDesc(s) { return state.lang === 'mn' ? (s.descMn || '') : (s.descEn || ''); }

  function toast(msg, kind) {
    var el = document.createElement('div');
    el.className = 'toast' + (kind ? ' ' + kind : '');
    el.textContent = msg;
    $toastHost.appendChild(el);
    setTimeout(function () { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; }, 2600);
    setTimeout(function () { el.remove(); }, 3000);
  }
  function errMsg(e) {
    var code = (e && e.error) || 'error_generic';
    var key = 'err.' + code;
    var msg = t(key);
    return msg === key ? t('err.error_generic') : msg;
  }

  function openModal(html) {
    $modalHost.innerHTML = '<div class="modal-back"><div class="modal">' + html + '</div></div>';
    var back = $modalHost.firstChild;
    back.addEventListener('click', function (e) { if (e.target === back) closeModal(); });
    return back.querySelector('.modal');
  }
  function closeModal() { $modalHost.innerHTML = ''; }

  function confirmDlg(msg) {
    return new Promise(function (resolve) {
      var m = openModal(
        '<p style="font-size:1rem">' + esc(msg) + '</p>' +
        '<div class="modal-actions">' +
        '<button class="btn btn-ghost" data-x="no">' + t('common.cancel') + '</button>' +
        '<button class="btn btn-primary" data-x="yes">' + t('common.yes') + '</button></div>'
      );
      m.querySelector('[data-x="no"]').onclick = function () { closeModal(); resolve(false); };
      m.querySelector('[data-x="yes"]').onclick = function () { closeModal(); resolve(true); };
    });
  }

  /* ================= api ================= */
  function api(path, opts) {
    opts = opts || {};
    var headers = { 'Content-Type': 'application/json' };
    if (state.token) headers['Authorization'] = 'Bearer ' + state.token;
    return fetch(path, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined
    }).then(
      function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) {
          if (!r.ok) {
            if (r.status === 401 && state.token && path !== '/api/login') doLogout(true);
            throw d && d.error ? d : { error: 'error_generic' };
          }
          return d;
        });
      },
      function () { throw { error: 'network' }; }
    );
  }

  /* ================= theme / lang ================= */
  function applyTheme() {
    document.documentElement.setAttribute('data-theme', state.theme);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', state.theme === 'dark' ? '#1b2522' : '#2f7d6b');
  }
  function applyTabbarLang() {
    $tabbar.querySelectorAll('[data-i18n]').forEach(function (el) {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
  }
  function setLang(l) {
    state.lang = l;
    localStorage.setItem('bg_lang', l);
    document.documentElement.lang = l;
    applyTabbarLang();
    render();
  }
  function setTheme(th) {
    state.theme = th;
    localStorage.setItem('bg_theme', th);
    applyTheme();
    render();
  }

  /* ================= navigation ================= */
  function setView(v) {
    state.view = v;
    if (v === 'book') state.book = { step: 1, service: null, date: null, time: null, payWith: null, slots: null, loadingSlots: false };
    $tabbar.querySelectorAll('.tab').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-view') === v);
    });
    render();
    window.scrollTo(0, 0);
  }
  $tabbar.addEventListener('click', function (e) {
    var b = e.target.closest('.tab');
    if (b) setView(b.getAttribute('data-view'));
  });

  function render() {
    if (!state.user) { $tabbar.hidden = true; return vAuth(); }
    $tabbar.hidden = false;
    ({ home: vHome, book: vBook, wallet: vWallet, progress: vProgress, profile: vProfile }[state.view] || vHome)();
  }

  function appbar(titleHtml) {
    return '<div class="appbar"><div class="logo"><img src="/assets/favicon.svg" alt="">' + (titleHtml || esc(t('app.name'))) + '</div><div class="spacer"></div>' +
      '<button class="icon-btn" id="abLang">' + (state.lang === 'mn' ? 'EN' : 'МН') + '</button>' +
      '<button class="icon-btn" id="abTheme">' + (state.theme === 'dark' ? '☀️' : '🌙') + '</button></div>';
  }
  function bindAppbar() {
    var l = document.getElementById('abLang'), th = document.getElementById('abTheme');
    if (l) l.onclick = function () { setLang(state.lang === 'mn' ? 'en' : 'mn'); };
    if (th) th.onclick = function () { setTheme(state.theme === 'dark' ? 'light' : 'dark'); };
  }

  /* ================= auth view ================= */
  var authMode = 'login';
  function vAuth() {
    $app.innerHTML =
      '<div class="auth-wrap">' +
      '<div class="auth-logo"><img src="/assets/favicon.svg" alt=""><h1>' + esc(t('app.name')) + '</h1><p>' + esc(t('app.tagline')) + '</p></div>' +
      '<div class="row" style="justify-content:center;margin-bottom:16px">' +
      '<button class="icon-btn" id="abLang">' + (state.lang === 'mn' ? 'EN' : 'МН') + '</button>' +
      '<button class="icon-btn" id="abTheme">' + (state.theme === 'dark' ? '☀️' : '🌙') + '</button></div>' +
      '<div class="auth-tabs">' +
      '<button id="tabLogin" class="' + (authMode === 'login' ? 'active' : '') + '">' + t('auth.login') + '</button>' +
      '<button id="tabReg" class="' + (authMode === 'register' ? 'active' : '') + '">' + t('auth.register') + '</button></div>' +
      '<form id="authForm">' +
      (authMode === 'register' ? '<div class="field"><input id="fName" autocomplete="name" placeholder="' + esc(t('auth.name')) + '" maxlength="60"></div>' : '') +
      '<div class="field"><input id="fPhone" inputmode="numeric" autocomplete="tel" placeholder="' + esc(t('auth.phone')) + '" maxlength="8"></div>' +
      '<div class="field"><input id="fPass" type="password" autocomplete="current-password" placeholder="' + esc(t('auth.password')) + '"></div>' +
      '<button class="btn btn-primary btn-block" type="submit">' + (authMode === 'login' ? t('auth.login_btn') : t('auth.register_btn')) + '</button>' +
      '</form>' +
      '<p class="center mt small muted">' + (authMode === 'login' ? t('auth.no_account') + ' <a href="#" id="swap">' + t('auth.register') + '</a>' : t('auth.have_account') + ' <a href="#" id="swap">' + t('auth.login') + '</a>') + '</p>' +
      '<p class="demo-hint">' + esc(t('auth.demo_hint')) + '</p>' +
      '</div>';
    bindAppbar();
    document.getElementById('tabLogin').onclick = function () { authMode = 'login'; render(); };
    document.getElementById('tabReg').onclick = function () { authMode = 'register'; render(); };
    document.getElementById('swap').onclick = function (e) { e.preventDefault(); authMode = authMode === 'login' ? 'register' : 'login'; render(); };
    document.getElementById('authForm').onsubmit = function (e) {
      e.preventDefault();
      var phone = document.getElementById('fPhone').value.trim();
      var pass = document.getElementById('fPass').value;
      var btn = e.target.querySelector('button[type="submit"]');
      btn.disabled = true;
      var p;
      if (authMode === 'register') {
        p = api('/api/register', { method: 'POST', body: { name: document.getElementById('fName').value.trim(), phone: phone, password: pass } });
      } else {
        p = api('/api/login', { method: 'POST', body: { phone: phone, password: pass } });
      }
      p.then(function (d) {
        state.token = d.token;
        state.user = d.user;
        localStorage.setItem('bg_token', d.token);
        state.bookings = null; state.photos = null;
        setView('home');
      }).catch(function (e2) { toast(errMsg(e2), 'err'); btn.disabled = false; });
    };
  }

  function doLogout(silent) {
    if (state.token) api('/api/logout', { method: 'POST' }).catch(function () {});
    state.token = null; state.user = null; state.bookings = null; state.photos = null;
    localStorage.removeItem('bg_token');
    closeModal();
    if (!silent) toast(t('prof.logout') + ' ✓');
    render();
  }

  /* ================= home view ================= */
  function vHome() {
    var u = state.user;
    var next = (state.bookings || []).filter(function (b) {
      return b.status === 'confirmed' && new Date(b.date + 'T' + b.time + ':00') > new Date();
    }).sort(function (a, b) { return (a.date + a.time).localeCompare(b.date + b.time); })[0];

    var nextHtml;
    if (next) {
      var svc = next.service || {};
      var dp = next.date.split('-');
      nextHtml = '<div class="card appt-card">' +
        '<div class="appt-date"><div class="d">' + Number(dp[2]) + '</div><div class="m">' + (state.lang === 'mn' ? dp[1] + '-р сар' : MO_EN[Number(dp[1]) - 1]) + '</div></div>' +
        '<div><div style="font-weight:600">' + esc(svcName(svc)) + '</div>' +
        '<div class="muted small">' + fmtDate(next.date) + ' · ' + next.time + '</div></div></div>';
    } else {
      nextHtml = '<div class="card"><div class="muted small">' + t('home.no_next') + '</div>' +
        '<button class="btn btn-primary btn-sm mt" id="goBook2">' + t('home.book_now') + '</button></div>';
    }

    var svcPreview = state.services.slice(0, 3).map(svcRowHtml).join('');
    var cfg = state.config || {};

    $app.innerHTML = appbar() +
      (cfg.paymentsDemo ? '<div class="demo-banner">' + t('home.demo_banner') + '</div>' : '') +
      '<p class="muted">' + t('home.hello') + '</p>' +
      '<h2 class="view-title" style="margin-bottom:14px">' + esc(u.name) + '</h2>' +
      '<div class="balance-card"><small>' + t('home.balance') + '</small>' +
      '<div class="balance-amount">' + money(u.balance) + '</div>' +
      '<button class="btn btn-sm" id="goTopup">+ ' + t('home.topup') + '</button></div>' +
      '<div class="section-head"><h3>' + t('home.next') + '</h3></div>' + nextHtml +
      '<div class="section-head"><h3>' + t('home.services') + '</h3><button id="goBook">' + t('home.book_now') + ' →</button></div>' +
      svcPreview +
      '<div class="section-head"><h3>' + t('home.info') + '</h3></div>' +
      '<div class="card">' +
      '<div class="list-row"><span class="lbl">' + t('prof.address') + '</span><span>' + esc(state.lang === 'mn' ? cfg.addressMn : cfg.addressEn) + '</span></div>' +
      '<div class="list-row"><span class="lbl">' + t('prof.phone') + '</span><a href="tel:' + esc(cfg.phoneTel || '') + '">' + esc(cfg.phoneDisplay || '') + '</a></div>' +
      '<div class="list-row"><span class="lbl">' + t('prof.hours') + '</span><span>' + esc((cfg.hoursOpen || '') + ' – ' + (cfg.hoursClose || '')) + '</span></div>' +
      (cfg.facebook ? '<div class="list-row"><span class="lbl">Facebook</span><a href="' + esc(cfg.facebook) + '" target="_blank" rel="noopener">B\'s Guasha ↗</a></div>' : '') +
      '</div>';

    bindAppbar();
    document.getElementById('goTopup').onclick = function () { setView('wallet'); };
    var gb = document.getElementById('goBook'); if (gb) gb.onclick = function () { setView('book'); };
    var gb2 = document.getElementById('goBook2'); if (gb2) gb2.onclick = function () { setView('book'); };
    $app.querySelectorAll('.svc-row').forEach(function (row) {
      row.onclick = function () {
        setView('book');
        var svc = state.services.find(function (s) { return s.id === row.getAttribute('data-id'); });
        if (svc) { state.book.service = svc; state.book.step = 2; render(); loadSlots(state.book.date || dateOffset(0)); }
      };
    });

    if (state.bookings === null) {
      api('/api/bookings').then(function (list) { state.bookings = list; if (state.view === 'home') render(); }).catch(function () {});
    }
  }

  function svcRowHtml(s) {
    return '<div class="svc-row" data-id="' + esc(s.id) + '"><div class="emoji">' + (s.emoji || '🌿') + '</div>' +
      '<div><div class="name">' + esc(svcName(s)) + '</div><div class="meta">' + s.minutes + ' ' + t('book.min') + '</div></div>' +
      '<div class="price">' + money(s.price) + '</div></div>';
  }

  /* ================= booking view ================= */
  function loadSlots(date) {
    state.book.date = date;
    state.book.time = null;
    state.book.slots = null;
    state.book.loadingSlots = true;
    render();
    api('/api/slots?date=' + date).then(function (d) {
      if (state.book.date !== date) return;
      state.book.loadingSlots = false;
      state.book.slots = d;
      render();
    }).catch(function (e) {
      state.book.loadingSlots = false;
      state.book.slots = { closed: false, slots: [] };
      toast(errMsg(e), 'err');
      render();
    });
  }

  function vBook() {
    var bk = state.book;
    var html = appbar() + '<h2 class="view-title">' + t('book.title') + '</h2>';

    if (bk.step === 1) {
      html += '<p class="view-sub">' + t('book.step_service') + '</p>' + state.services.map(svcRowHtml).join('');
      $app.innerHTML = html;
      bindAppbar();
      $app.querySelectorAll('.svc-row').forEach(function (row) {
        row.onclick = function () {
          bk.service = state.services.find(function (s) { return s.id === row.getAttribute('data-id'); });
          bk.step = 2;
          render();
          loadSlots(dateOffset(0));
        };
      });
      return;
    }

    /* step 2: date & time, step 3: confirm */
    var s = bk.service;
    html += '<button class="back-btn" id="bkBack">← ' + t('common.back') + '</button>';
    html += '<div class="card svc-row" style="cursor:default;margin-top:10px"><div class="emoji">' + (s.emoji || '🌿') + '</div>' +
      '<div><div class="name">' + esc(svcName(s)) + '</div><div class="meta">' + s.minutes + ' ' + t('book.min') + ' · ' + esc(svcDesc(s)) + '</div></div>' +
      '<div class="price">' + money(s.price) + '</div></div>';

    if (bk.step === 2) {
      html += '<p class="view-sub" style="margin-top:8px">' + t('book.step_datetime') + '</p><div class="date-strip">';
      var maxDays = (state.config && state.config.bookingDaysAhead) || 21;
      for (var i = 0; i < maxDays; i++) {
        var ds = dateOffset(i);
        var p = ds.split('-').map(Number);
        var wd = new Date(p[0], p[1] - 1, p[2]).getDay();
        var wdName = state.lang === 'mn' ? WD_MN[wd] : WD_EN[wd];
        if (i === 0) wdName = t('book.today');
        if (i === 1) wdName = t('book.tomorrow');
        html += '<button class="date-chip' + (bk.date === ds ? ' active' : '') + '" data-date="' + ds + '"><span class="wd">' + wdName + '</span><span class="dn">' + p[2] + '</span></button>';
      }
      html += '</div>';

      if (bk.loadingSlots) {
        html += '<div class="skeleton"></div><div class="skeleton"></div>';
      } else if (bk.slots) {
        if (bk.slots.closed) {
          html += '<div class="empty"><span class="big">🌙</span>' + t('book.closed') + '</div>';
        } else if (!bk.slots.slots.length || bk.slots.slots.every(function (x) { return !x.available; })) {
          html += '<div class="empty"><span class="big">😔</span>' + t('book.no_slots') + '</div>';
        } else {
          html += '<div class="slot-grid">' + bk.slots.slots.map(function (x) {
            return '<button class="slot' + (!x.available ? ' taken' : '') + (bk.time === x.time ? ' active' : '') + '" data-time="' + x.time + '"' + (!x.available ? ' disabled' : '') + '>' + x.time + '</button>';
          }).join('') + '</div>';
        }
      }
      html += '<button class="btn btn-primary btn-block mt" id="bkNext"' + (bk.time ? '' : ' disabled') + '>' + t('common.confirm') + ' →</button>';
      $app.innerHTML = html;
      bindAppbar();
      document.getElementById('bkBack').onclick = function () { bk.step = 1; bk.service = null; render(); };
      $app.querySelectorAll('.date-chip').forEach(function (c) {
        c.onclick = function () { loadSlots(c.getAttribute('data-date')); };
      });
      $app.querySelectorAll('.slot:not(.taken)').forEach(function (sl) {
        sl.onclick = function () { bk.time = sl.getAttribute('data-time'); render(); };
      });
      var nx = document.getElementById('bkNext');
      nx.onclick = function () { if (bk.time) { bk.payWith = state.user.balance >= s.price ? 'balance' : 'salon'; bk.step = 3; render(); } };
      return;
    }

    /* step 3 — confirm & pay */
    var canBalance = state.user.balance >= s.price;
    html += '<p class="view-sub" style="margin-top:8px">' + t('book.step_confirm') + '</p>' +
      '<div class="card">' +
      '<div class="summary-row"><span class="muted">📅</span><span>' + fmtDate(bk.date) + ' · ' + bk.time + '</span></div>' +
      '<div class="summary-row total"><span>' + t('book.total') + '</span><span>' + money(s.price) + '</span></div></div>' +
      '<h3 style="margin:14px 0 10px;font-size:1.05rem">' + t('book.pay_how') + '</h3>' +
      '<div class="pay-opt' + (bk.payWith === 'balance' ? ' active' : '') + (canBalance ? '' : ' disabled') + '" data-pay="balance">' +
      '<span class="radio"></span><div><div class="ttl">' + t('book.pay_balance') + '</div>' +
      '<div class="sub">' + t('wallet.balance') + ': ' + money(state.user.balance) + (canBalance ? '' : ' — ' + t('book.balance_short')) + '</div></div></div>' +
      '<div class="pay-opt' + (bk.payWith === 'salon' ? ' active' : '') + '" data-pay="salon">' +
      '<span class="radio"></span><div><div class="ttl">' + t('book.pay_salon') + '</div></div></div>' +
      '<button class="btn btn-primary btn-block mt" id="bkConfirm">' + t('book.confirm_btn') + '</button>';
    $app.innerHTML = html;
    bindAppbar();
    document.getElementById('bkBack').onclick = function () { bk.step = 2; render(); };
    $app.querySelectorAll('.pay-opt').forEach(function (po) {
      po.onclick = function () {
        var v = po.getAttribute('data-pay');
        if (v === 'balance' && !canBalance) return;
        bk.payWith = v;
        render();
      };
    });
    document.getElementById('bkConfirm').onclick = function () {
      var btn = this;
      btn.disabled = true;
      api('/api/bookings', { method: 'POST', body: { serviceId: s.id, date: bk.date, time: bk.time, payWith: bk.payWith } })
        .then(function (d) {
          if (d.balance !== undefined) state.user.balance = d.balance;
          state.bookings = null;
          toast(t('book.booked_ok'), 'ok');
          setView('home');
        })
        .catch(function (e) {
          toast(errMsg(e), 'err');
          btn.disabled = false;
          if (e.error === 'slot_taken') { bk.step = 2; loadSlots(bk.date); }
        });
    };
  }

  /* ================= wallet view ================= */
  var txCache = null;
  function vWallet() {
    var amounts = [20000, 50000, 100000, 200000];
    var bonusOk = state.config && state.walletAmount >= state.config.topupBonusThreshold;
    var bonus = bonusOk ? Math.floor(state.walletAmount * state.config.topupBonusPercent / 100) : 0;

    $app.innerHTML = appbar() +
      '<h2 class="view-title">' + t('wallet.title') + '</h2>' +
      '<div class="balance-card"><small>' + t('wallet.balance') + '</small>' +
      '<div class="balance-amount">' + money(state.user.balance) + '</div></div>' +
      '<div class="card"><h3 style="font-size:1.02rem;margin-bottom:10px">' + t('wallet.topup_title') + '</h3>' +
      '<div class="amount-grid">' + amounts.map(function (a) {
        return '<button class="amount-btn' + (state.walletAmount === a ? ' active' : '') + '" data-a="' + a + '">' + money(a) + '</button>';
      }).join('') + '</div>' +
      '<div class="field"><input id="customAmount" inputmode="numeric" placeholder="' + esc(t('wallet.custom_ph')) + '"></div>' +
      '<p class="small muted">🎁 ' + t('wallet.bonus_note') + (bonus ? ' · <b style="color:var(--jade)">' + t('wallet.bonus') + ': +' + money(bonus) + '</b>' : '') + '</p>' +
      '<h3 style="font-size:1.02rem;margin:14px 0 10px">' + t('wallet.method') + '</h3>' +
      '<div class="pay-opt active"><span class="radio"></span><div><div class="ttl">QPay</div><div class="sub">' + t('wallet.m_qpay_d') + '</div></div><span style="margin-left:auto">🔵</span></div>' +
      '<div class="pay-opt disabled"><span class="radio"></span><div><div class="ttl">SocialPay / Card</div><div class="sub">' + t('wallet.m_soon') + '</div></div></div>' +
      '<button class="btn btn-primary btn-block mt" id="topupBtn">' + t('wallet.create') + ' · ' + money(state.walletAmount) + '</button></div>' +
      '<div class="section-head"><h3>' + t('wallet.tx_title') + '</h3></div>' +
      '<div class="card" id="txList"><div class="skeleton"></div></div>';

    bindAppbar();
    $app.querySelectorAll('.amount-btn').forEach(function (b) {
      b.onclick = function () {
        state.walletAmount = Number(b.getAttribute('data-a'));
        document.getElementById('customAmount').value = '';
        render();
      };
    });
    var ca = document.getElementById('customAmount');
    ca.oninput = function () {
      var v = parseInt(ca.value.replace(/\D/g, ''), 10);
      if (v) {
        state.walletAmount = v;
        $app.querySelectorAll('.amount-btn').forEach(function (b) { b.classList.remove('active'); });
        document.getElementById('topupBtn').textContent = t('wallet.create') + ' · ' + money(v);
      }
    };
    document.getElementById('topupBtn').onclick = startTopup;

    renderTx();
    api('/api/transactions').then(function (list) { txCache = list; renderTx(); }).catch(function () { txCache = []; renderTx(); });
  }

  function renderTx() {
    var host = document.getElementById('txList');
    if (!host || txCache === null) return;
    if (!txCache.length) { host.innerHTML = '<div class="empty">' + t('wallet.tx_empty') + '</div>'; return; }
    var icons = { topup: '⬇️', payment: '💆', refund: '↩️', bonus: '🎁' };
    host.innerHTML = txCache.slice(0, 25).map(function (tx) {
      var pos = tx.amount >= 0;
      return '<div class="tx-row"><div class="tx-icon">' + (icons[tx.type] || '•') + '</div>' +
        '<div><div class="tx-name">' + t('wallet.tx_' + tx.type) + '</div><div class="tx-date">' + fmtShort(tx.createdAt) + '</div></div>' +
        '<div class="tx-amount ' + (pos ? 'pos' : 'neg') + '">' + (pos ? '+' : '') + money(tx.amount) + '</div></div>';
    }).join('');
  }

  var pollTimer = null;
  function startTopup() {
    var amount = state.walletAmount;
    api('/api/topup', { method: 'POST', body: { amount: amount, method: 'qpay' } })
      .then(function (d) {
        var qrHtml = '';
        if (window.qrcode && !window.__qrFailed) {
          try {
            var qr = window.qrcode(0, 'M');
            qr.addData(d.qrText);
            qr.make();
            qrHtml = '<div class="qr-box">' + qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true }) + '</div>';
          } catch (e) { qrHtml = '<div class="qr-text">' + esc(d.qrText) + '</div>'; }
        } else {
          qrHtml = '<div class="qr-text">' + esc(d.qrText) + '</div>';
        }
        var m = openModal(
          '<h3>QPay · ' + money(d.amount) + (d.bonus ? ' <span class="small" style="color:var(--jade)">+' + money(d.bonus) + ' ' + t('wallet.bonus').toLowerCase() + '</span>' : '') + '</h3>' +
          '<p class="small muted">' + t('wallet.scan') + '</p>' + qrHtml +
          '<p class="center small pulse" id="payState">' + t('wallet.waiting') + '</p>' +
          (d.demo ? '<button class="btn btn-primary btn-block mt" id="simBtn">' + t('wallet.simulate') + '</button><p class="center small muted mt">' + t('wallet.demo_note') + '</p>' : '') +
          '<div class="modal-actions"><button class="btn btn-ghost" id="payClose">' + t('common.close') + '</button></div>'
        );
        function done(balance) {
          if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
          state.user.balance = balance;
          var ps = m.querySelector('#payState');
          ps.classList.remove('pulse');
          ps.style.color = 'var(--ok)';
          ps.textContent = t('wallet.paid');
          txCache = null;
          setTimeout(function () { closeModal(); if (state.view === 'wallet') vWallet(); }, 1200);
        }
        m.querySelector('#payClose').onclick = function () {
          if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
          closeModal();
        };
        var sim = m.querySelector('#simBtn');
        if (sim) sim.onclick = function () {
          sim.disabled = true;
          api('/api/topup/' + d.invoiceId + '/confirm-demo', { method: 'POST' })
            .then(function (r) { done(r.balance); })
            .catch(function (e) { toast(errMsg(e), 'err'); sim.disabled = false; });
        };
        if (!d.demo) {
          pollTimer = setInterval(function () {
            api('/api/topup/' + d.invoiceId).then(function (r) {
              if (r.status === 'paid') done(r.balance);
            }).catch(function () {});
          }, 3000);
        }
      })
      .catch(function (e) { toast(errMsg(e), 'err'); });
  }

  /* ================= progress view ================= */
  function photoUrl(p) { return p.url + '?token=' + encodeURIComponent(state.token); }

  function vProgress() {
    $app.innerHTML = appbar() +
      '<h2 class="view-title">' + t('prog.title') + '</h2>' +
      '<p class="view-sub">🔒 ' + t('prog.intro') + '</p>' +
      '<div class="photo-actions">' +
      '<button class="btn btn-primary" id="takeBtn">' + t('prog.take') + '</button>' +
      '<button class="btn btn-ghost" id="chooseBtn">' + t('prog.choose') + '</button></div>' +
      '<input type="file" accept="image/*" capture="user" id="fileCam" hidden>' +
      '<input type="file" accept="image/*" id="fileGal" hidden>' +
      '<div id="galleryHost"><div class="skeleton"></div></div>';
    bindAppbar();
    document.getElementById('takeBtn').onclick = function () { document.getElementById('fileCam').click(); };
    document.getElementById('chooseBtn').onclick = function () { document.getElementById('fileGal').click(); };
    ['fileCam', 'fileGal'].forEach(function (id) {
      document.getElementById(id).addEventListener('change', function (e) {
        if (e.target.files && e.target.files[0]) openEditor(e.target.files[0]);
        e.target.value = '';
      });
    });
    renderGallery();
    api('/api/photos').then(function (list) { state.photos = list; renderGallery(); }).catch(function () { state.photos = []; renderGallery(); });
  }

  function renderGallery() {
    var host = document.getElementById('galleryHost');
    if (!host || state.photos === null) return;
    var ps = state.photos;
    if (!ps.length) {
      host.innerHTML = '<div class="empty"><span class="big">📸</span>' + t('prog.empty') + '</div>';
      return;
    }
    var compareBtn = ps.length >= 2 ? '<button class="btn btn-ghost btn-block" style="margin-bottom:12px" id="cmpBtn">🔍 ' + t('prog.compare') + ' (' + t('prog.first') + ' ↔ ' + t('prog.latest') + ')</button>' : '';
    host.innerHTML = compareBtn + '<div class="gallery">' + ps.slice().reverse().map(function (p) {
      return '<div class="ph" data-id="' + esc(p.id) + '"><img src="' + esc(photoUrl(p)) + '" alt="" loading="lazy"><div class="dt">' + fmtShort(p.createdAt) + '</div></div>';
    }).join('') + '</div>';
    var cb = document.getElementById('cmpBtn');
    if (cb) cb.onclick = openCompare;
    host.querySelectorAll('.ph').forEach(function (el) {
      el.onclick = function () { openPhotoViewer(el.getAttribute('data-id')); };
    });
  }

  function openPhotoViewer(id) {
    var p = (state.photos || []).find(function (x) { return x.id === id; });
    if (!p) return;
    var m = openModal(
      '<img src="' + esc(photoUrl(p)) + '" style="width:100%;border-radius:14px" alt="">' +
      '<p class="small muted mt">' + fmtShort(p.createdAt) + (p.note ? ' · ' + esc(p.note) : '') + '</p>' +
      '<div class="modal-actions">' +
      '<button class="btn btn-danger" id="delPh">' + t('common.delete') + '</button>' +
      '<button class="btn btn-ghost" id="closePh">' + t('common.close') + '</button></div>'
    );
    m.querySelector('#closePh').onclick = closeModal;
    m.querySelector('#delPh').onclick = function () {
      confirmDlg(t('prog.delete_q')).then(function (yes) {
        if (!yes) return;
        api('/api/photos/' + p.id, { method: 'DELETE' }).then(function () {
          state.photos = state.photos.filter(function (x) { return x.id !== p.id; });
          closeModal();
          renderGallery();
        }).catch(function (e) { toast(errMsg(e), 'err'); });
      });
    };
  }

  function openCompare() {
    var ps = state.photos;
    if (!ps || ps.length < 2) return;
    var a = ps[0], b = ps[ps.length - 1];
    var m = openModal(
      '<h3>' + t('prog.compare') + '</h3>' +
      '<div class="compare-grid">' +
      '<figure><img src="' + esc(photoUrl(a)) + '" alt=""><figcaption>' + t('prog.first') + ' · ' + fmtShort(a.createdAt) + '</figcaption></figure>' +
      '<figure><img src="' + esc(photoUrl(b)) + '" alt=""><figcaption>' + t('prog.latest') + ' · ' + fmtShort(b.createdAt) + '</figcaption></figure></div>' +
      '<div class="modal-actions"><button class="btn btn-ghost" id="closeCmp">' + t('common.close') + '</button></div>'
    );
    m.querySelector('#closeCmp').onclick = closeModal;
  }

  /* ---------- censor editor ---------- */
  function loadToCanvas(file) {
    return new Promise(function (resolve, reject) {
      var make = function (bmpOrImg, w, h) {
        var MAX = 1280;
        var scale = Math.min(1, MAX / Math.max(w, h));
        var c = document.createElement('canvas');
        c.width = Math.round(w * scale);
        c.height = Math.round(h * scale);
        c.getContext('2d').drawImage(bmpOrImg, 0, 0, c.width, c.height);
        resolve(c);
      };
      if (window.createImageBitmap) {
        createImageBitmap(file, { imageOrientation: 'from-image' })
          .then(function (bmp) { make(bmp, bmp.width, bmp.height); })
          .catch(function () { fallback(); });
      } else { fallback(); }
      function fallback() {
        var url = URL.createObjectURL(file);
        var img = new Image();
        img.onload = function () { make(img, img.naturalWidth, img.naturalHeight); URL.revokeObjectURL(url); };
        img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('bad_image')); };
        img.src = url;
      }
    });
  }

  function defaultBar(W, H) {
    return { cx: W / 2, cy: H * 0.38, w: W * 0.55, h: Math.max(H * 0.07, 30), angle: 0 };
  }

  function openEditor(file) {
    loadToCanvas(file).then(function (base) {
      var ed = { base: base, bars: [], sel: 0, saving: false };
      state.editor = ed;
      var m = openModal(
        '<h3>' + t('prog.editor') + '</h3>' +
        '<p class="small muted" id="edStatus">' + t('prog.detecting') + '</p>' +
        '<div class="editor-canvas-wrap"><canvas id="edCanvas"></canvas></div>' +
        '<div class="editor-controls">' +
        '<div class="ctl"><label>' + t('prog.bar_w') + '</label><input type="range" id="ctlW" min="10" max="120" value="55"></div>' +
        '<div class="ctl"><label>' + t('prog.bar_h') + '</label><input type="range" id="ctlH" min="3" max="30" value="8"></div>' +
        '<div class="ctl"><label>' + t('prog.bar_r') + '</label><input type="range" id="ctlR" min="-45" max="45" value="0"></div>' +
        '<div class="row"><button class="btn btn-ghost btn-sm" id="redetect">' + t('prog.redetect') + '</button>' +
        '<button class="btn btn-ghost btn-sm" id="addBar">' + t('prog.add_bar') + '</button></div></div>' +
        '<div class="field mt"><input id="phNote" placeholder="' + esc(t('prog.note_ph')) + '" maxlength="100"></div>' +
        '<div class="modal-actions">' +
        '<button class="btn btn-ghost" id="edCancel">' + t('common.cancel') + '</button>' +
        '<button class="btn btn-primary" id="edSave">' + t('prog.save') + '</button></div>'
      );

      var canvas = m.querySelector('#edCanvas');
      canvas.width = base.width;
      canvas.height = base.height;
      var ctx = canvas.getContext('2d');
      var status = m.querySelector('#edStatus');

      function draw(showGuides) {
        ctx.drawImage(base, 0, 0);
        ed.bars.forEach(function (b, i) {
          ctx.save();
          ctx.translate(b.cx, b.cy);
          ctx.rotate(b.angle);
          ctx.fillStyle = '#000';
          ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
          if (showGuides !== false && i === ed.sel) {
            ctx.strokeStyle = '#c9a55a';
            ctx.lineWidth = Math.max(2, base.width / 300);
            ctx.setLineDash([8, 6]);
            ctx.strokeRect(-b.w / 2, -b.h / 2, b.w, b.h);
          }
          ctx.restore();
        });
      }

      function syncSliders() {
        var b = ed.bars[ed.sel];
        if (!b) return;
        m.querySelector('#ctlW').value = Math.round((b.w / base.width) * 100);
        m.querySelector('#ctlH').value = Math.round((b.h / base.height) * 100);
        m.querySelector('#ctlR').value = Math.round((b.angle * 180) / Math.PI);
      }

      function detect() {
        status.textContent = t('prog.detecting');
        window.EyeCensor.detect(base).then(function (faces) {
          if (faces && faces.length) {
            ed.bars = faces.map(function (f) { return window.EyeCensor.eyesToBar(f, base.width); });
            ed.sel = 0;
            status.textContent = '✓ ' + t('prog.detected');
          } else {
            if (!ed.bars.length) ed.bars = [defaultBar(base.width, base.height)];
            status.textContent = '⚠ ' + t('prog.no_face');
          }
          syncSliders();
          draw();
        });
      }
      detect();
      draw();

      /* pointer interaction: drag to move the selected bar / tap a bar to select it */
      var drag = null;
      function canvasPoint(e) {
        var r = canvas.getBoundingClientRect();
        return { x: ((e.clientX - r.left) / r.width) * canvas.width, y: ((e.clientY - r.top) / r.height) * canvas.height };
      }
      function hitBar(pt) {
        for (var i = ed.bars.length - 1; i >= 0; i--) {
          var b = ed.bars[i];
          var dx = pt.x - b.cx, dy = pt.y - b.cy;
          var cos = Math.cos(-b.angle), sin = Math.sin(-b.angle);
          var lx = dx * cos - dy * sin, ly = dx * sin + dy * cos;
          var pad = 22;
          if (Math.abs(lx) <= b.w / 2 + pad && Math.abs(ly) <= b.h / 2 + pad) return i;
        }
        return -1;
      }
      canvas.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        var pt = canvasPoint(e);
        var hit = hitBar(pt);
        if (hit >= 0) { ed.sel = hit; syncSliders(); }
        var b = ed.bars[ed.sel];
        if (b) drag = { ox: pt.x - b.cx, oy: pt.y - b.cy };
        canvas.setPointerCapture(e.pointerId);
        draw();
      });
      canvas.addEventListener('pointermove', function (e) {
        if (!drag) return;
        var pt = canvasPoint(e);
        var b = ed.bars[ed.sel];
        if (!b) return;
        b.cx = Math.max(0, Math.min(canvas.width, pt.x - drag.ox));
        b.cy = Math.max(0, Math.min(canvas.height, pt.y - drag.oy));
        draw();
      });
      canvas.addEventListener('pointerup', function () { drag = null; });
      canvas.addEventListener('pointercancel', function () { drag = null; });

      m.querySelector('#ctlW').addEventListener('input', function (e) {
        var b = ed.bars[ed.sel]; if (b) { b.w = (Number(e.target.value) / 100) * base.width; draw(); }
      });
      m.querySelector('#ctlH').addEventListener('input', function (e) {
        var b = ed.bars[ed.sel]; if (b) { b.h = Math.max(14, (Number(e.target.value) / 100) * base.height); draw(); }
      });
      m.querySelector('#ctlR').addEventListener('input', function (e) {
        var b = ed.bars[ed.sel]; if (b) { b.angle = (Number(e.target.value) * Math.PI) / 180; draw(); }
      });
      m.querySelector('#redetect').onclick = detect;
      m.querySelector('#addBar').onclick = function () {
        ed.bars.push(defaultBar(base.width, base.height));
        ed.sel = ed.bars.length - 1;
        syncSliders();
        draw();
      };
      m.querySelector('#edCancel').onclick = function () { state.editor = null; closeModal(); };
      m.querySelector('#edSave').onclick = function () {
        if (ed.saving) return;
        ed.saving = true;
        var btn = m.querySelector('#edSave');
        btn.disabled = true;
        btn.textContent = t('prog.saving');
        draw(false); // final render without selection guides
        var dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        api('/api/photos', { method: 'POST', body: { image: dataUrl, note: m.querySelector('#phNote').value.trim() } })
          .then(function (p) {
            state.editor = null;
            if (state.photos) state.photos.push(p);
            closeModal();
            toast(t('prog.saved'), 'ok');
            if (state.view === 'progress') renderGallery();
          })
          .catch(function (e) {
            toast(errMsg(e), 'err');
            ed.saving = false;
            btn.disabled = false;
            btn.textContent = t('prog.save');
            draw();
          });
      };
    }).catch(function () { toast(t('err.bad_image'), 'err'); });
  }

  /* ================= profile view ================= */
  function vProfile() {
    var u = state.user;
    var cfg = state.config || {};
    $app.innerHTML = appbar() +
      '<h2 class="view-title">' + t('prof.title') + '</h2>' +
      '<div class="card"><div style="font-weight:700;font-size:1.1rem">' + esc(u.name) + '</div>' +
      '<div class="muted small">📱 ' + esc(u.phone) + '</div>' +
      '<div class="muted small">💰 ' + t('wallet.balance') + ': ' + money(u.balance) + '</div></div>' +

      '<div class="section-head"><h3>' + t('prof.bookings') + '</h3></div>' +
      '<div class="card" id="bkList"><div class="skeleton"></div></div>' +

      '<div class="section-head"><h3>' + t('prof.settings') + '</h3></div>' +
      '<div class="card">' +
      '<div class="list-row"><span class="lbl">' + t('prof.language') + '</span>' +
      '<div class="seg grow"><button id="langMn" class="' + (state.lang === 'mn' ? 'active' : '') + '">Монгол</button>' +
      '<button id="langEn" class="' + (state.lang === 'en' ? 'active' : '') + '">English</button></div></div>' +
      '<div class="list-row"><span class="lbl">' + t('prof.theme') + '</span>' +
      '<div class="seg grow"><button id="thLight" class="' + (state.theme === 'light' ? 'active' : '') + '">☀️ ' + t('prof.light') + '</button>' +
      '<button id="thDark" class="' + (state.theme === 'dark' ? 'active' : '') + '">🌙 ' + t('prof.dark') + '</button></div></div></div>' +

      '<div class="section-head"><h3>' + t('prof.about') + '</h3></div>' +
      '<div class="card">' +
      '<div class="list-row"><span class="lbl">' + t('prof.address') + '</span><span>' + esc(state.lang === 'mn' ? cfg.addressMn : cfg.addressEn) + '</span></div>' +
      '<div class="list-row"><span class="lbl">' + t('prof.phone') + '</span><a href="tel:' + esc(cfg.phoneTel || '') + '">' + esc(cfg.phoneDisplay || '') + '</a></div>' +
      '<div class="list-row"><span class="lbl">' + t('prof.hours') + '</span><span>' + esc((cfg.hoursOpen || '') + ' – ' + (cfg.hoursClose || '')) + '</span></div>' +
      (cfg.facebook ? '<div class="list-row"><span class="lbl">Facebook</span><a href="' + esc(cfg.facebook) + '" target="_blank" rel="noopener">B\'s Guasha ↗</a></div>' : '') +
      '</div>' +
      '<button class="btn btn-danger btn-block mt" id="logoutBtn">' + t('prof.logout') + '</button>' +
      '<p class="center small muted mt">B\'s Guasha v2.0</p>';

    bindAppbar();
    document.getElementById('langMn').onclick = function () { setLang('mn'); };
    document.getElementById('langEn').onclick = function () { setLang('en'); };
    document.getElementById('thLight').onclick = function () { setTheme('light'); };
    document.getElementById('thDark').onclick = function () { setTheme('dark'); };
    document.getElementById('logoutBtn').onclick = function () {
      confirmDlg(t('prof.logout_q')).then(function (yes) { if (yes) doLogout(); });
    };

    function renderBookings() {
      var host = document.getElementById('bkList');
      if (!host || state.bookings === null) return;
      if (!state.bookings.length) { host.innerHTML = '<div class="empty">' + t('prof.none') + '</div>'; return; }
      host.innerHTML = state.bookings.map(function (b) {
        var svc = b.service || {};
        var canCancel = b.status === 'confirmed' && (new Date(b.date + 'T' + b.time + ':00').getTime() - Date.now()) / 3600000 >= ((state.config && state.config.cancelHours) || 24);
        return '<div class="booking-item">' +
          '<div class="row"><div class="grow"><div style="font-weight:600">' + esc(svcName(svc)) + '</div>' +
          '<div class="muted small">' + fmtDate(b.date) + ' · ' + b.time + ' · ' + money(b.amount) + '</div>' +
          '<div class="muted small">' + t('prof.paid_' + (b.paid === 'refunded' ? 'refunded' : (b.paid === 'balance' ? 'balance' : 'salon'))) + '</div></div>' +
          '<div style="text-align:right"><span class="chip ' + b.status + '">' + t('prof.st_' + b.status) + '</span>' +
          (canCancel ? '<div><button class="btn btn-sm btn-danger mt" data-cancel="' + esc(b.id) + '">' + t('prof.cancel') + '</button></div>' : '') +
          '</div></div></div>';
      }).join('');
      host.querySelectorAll('[data-cancel]').forEach(function (btn) {
        btn.onclick = function () {
          confirmDlg(t('prof.cancel_q')).then(function (yes) {
            if (!yes) return;
            api('/api/bookings/' + btn.getAttribute('data-cancel') + '/cancel', { method: 'POST' })
              .then(function (d) {
                state.user.balance = d.balance;
                state.bookings = null;
                toast(t('prof.cancelled'), 'ok');
                vProfile();
              })
              .catch(function (e) { toast(errMsg(e), 'err'); });
          });
        };
      });
    }
    renderBookings();
    if (state.bookings === null) {
      api('/api/bookings').then(function (list) {
        state.bookings = list;
        if (state.view === 'profile') renderBookings();
      }).catch(function () {});
    }
  }

  /* ================= init ================= */
  function init() {
    applyTheme();
    document.documentElement.lang = state.lang;
    applyTabbarLang();

    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
      navigator.serviceWorker.register('/app/sw.js').catch(function () {});
    }

    var boot = [
      api('/api/config').then(function (c) { state.config = c; }).catch(function () {}),
      api('/api/services').then(function (s) { state.services = s; }).catch(function () {})
    ];

    Promise.all(boot).then(function () {
      if (state.token) {
        api('/api/me').then(function (d) {
          state.user = d.user;
          render();
        }).catch(function () {
          state.token = null;
          localStorage.removeItem('bg_token');
          render();
        });
      } else {
        render();
      }
    });

    $app.innerHTML = '<div class="auth-wrap center"><div class="auth-logo"><img src="/assets/favicon.svg" alt=""><h1>B\'s Guasha</h1><p class="muted small">' + t('common.loading') + '</p></div></div>';
  }

  init();
})();
