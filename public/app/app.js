/* B's Gua Sha — mobile app (PWA, v3). Vanilla JS single-page app. */
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
    staff: [],
    bundles: [],
    myBundles: null,
    myGiftcards: null,
    unreadChat: 0,
    chatMsgs: null,
    edu: null,
    view: 'home',
    book: { step: 1, service: null, staffId: 'any', date: null, time: null, payWith: null, slots: null, loadingSlots: false },
    walletAmount: 50000,
    photos: null,
    bookings: null,
    editor: null
  };
  var chatTimer = null, badgeTimer = null;

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

  function fmtDate(dateStr) {
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
  function initial(name) { return (String(name || '?').trim()[0] || '?').toUpperCase(); }
  function stars(n) {
    var out = '';
    for (var i = 1; i <= 5; i++) out += i <= n ? '★' : '☆';
    return out;
  }

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
  function copyText(txt) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(function () { toast(t('common.copied'), 'ok'); }, function () { fallbackCopy(txt); });
    } else fallbackCopy(txt);
  }
  function fallbackCopy(txt) {
    var ta = document.createElement('textarea');
    ta.value = txt;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); toast(t('common.copied'), 'ok'); } catch (e) {}
    ta.remove();
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
    if (meta) meta.setAttribute('content', state.theme === 'dark' ? '#211b13' : '#9a7b3c');
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
    if (chatTimer) { clearInterval(chatTimer); chatTimer = null; }
    state.view = v;
    if (v === 'book') state.book = { step: 1, service: null, staffId: 'any', date: null, time: null, payWith: null, slots: null, loadingSlots: false };
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
    ({ home: vHome, book: vBook, wallet: vWallet, progress: vProgress, profile: vProfile, chat: vChat, edu: vEdu }[state.view] || vHome)();
  }

  function appbar(titleHtml) {
    return '<div class="appbar"><div class="logo"><img src="/assets/logo.svg" alt="">' + (titleHtml || esc(t('app.name'))) + '</div><div class="spacer"></div>' +
      '<button class="icon-btn" id="abChat" title="Chat">💬' + (state.unreadChat ? '<span class="badge">' + state.unreadChat + '</span>' : '') + '</button>' +
      '<button class="icon-btn" id="abLang">' + (state.lang === 'mn' ? 'EN' : 'МН') + '</button>' +
      '<button class="icon-btn" id="abTheme">' + (state.theme === 'dark' ? '☀️' : '🌙') + '</button></div>';
  }
  function bindAppbar() {
    var l = document.getElementById('abLang'), th = document.getElementById('abTheme'), ch = document.getElementById('abChat');
    if (l) l.onclick = function () { setLang(state.lang === 'mn' ? 'en' : 'mn'); };
    if (th) th.onclick = function () { setTheme(state.theme === 'dark' ? 'light' : 'dark'); };
    if (ch) ch.onclick = function () { setView('chat'); };
  }

  /* ================= auth view ================= */
  var authMode = 'login';
  function vAuth() {
    $app.innerHTML =
      '<div class="auth-wrap">' +
      '<div class="auth-logo"><img src="/assets/logo.svg" alt=""><h1>' + esc(t('app.name')) + '</h1><p>' + esc(t('app.tagline')) + '</p></div>' +
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
        state.bookings = null; state.photos = null; state.myBundles = null; state.myGiftcards = null; state.chatMsgs = null;
        loadMyBundles();
        setView('home');
      }).catch(function (e2) { toast(errMsg(e2), 'err'); btn.disabled = false; });
    };
  }

  function doLogout(silent) {
    if (state.token) api('/api/logout', { method: 'POST' }).catch(function () {});
    state.token = null; state.user = null; state.bookings = null; state.photos = null;
    state.myBundles = null; state.myGiftcards = null; state.chatMsgs = null; state.unreadChat = 0;
    localStorage.removeItem('bg_token');
    closeModal();
    if (!silent) toast(t('prof.logout') + ' ✓');
    render();
  }

  function loadMyBundles() {
    return api('/api/my/bundles').then(function (list) { state.myBundles = list; return list; }).catch(function () { state.myBundles = []; });
  }
  function usableBundleClient(serviceId) {
    if (!state.myBundles) return null;
    for (var i = 0; i < state.myBundles.length; i++) {
      var b = state.myBundles[i];
      if (!b.expired && b.remaining > 0 && (!b.serviceIds.length || b.serviceIds.indexOf(serviceId) >= 0)) return b;
    }
    return null;
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
        '<div class="muted small">' + fmtDate(next.date) + ' · ' + next.time + '</div>' +
        (next.staffName ? '<div class="muted small">' + esc(t('home.with')) + ' ' + esc(next.staffName) + '</div>' : '') +
        '</div></div>';
    } else {
      nextHtml = '<div class="card"><div class="muted small">' + t('home.no_next') + '</div>' +
        '<button class="btn btn-primary btn-sm mt" id="goBook2">' + t('home.book_now') + '</button></div>';
    }

    var rateBk = (state.bookings || []).filter(function (b) { return b.status === 'done' && !b.reviewId; })
      .sort(function (a, b) { return (b.date + b.time).localeCompare(a.date + a.time); })[0];

    var svcPreview = state.services.slice(0, 3).map(svcRowHtml).join('');
    var cfg = state.config || {};

    $app.innerHTML = appbar() +
      (cfg.paymentsDemo ? '<div class="demo-banner">' + t('home.demo_banner') + '</div>' : '') +
      '<p class="muted">' + t('home.hello') + '</p>' +
      '<h2 class="view-title" style="margin-bottom:14px">' + esc(u.name) + '</h2>' +
      (rateBk ? '<div class="rate-banner"><p>' + t('home.rate_banner') + '</p><button class="btn btn-sm btn-primary" id="rateNow">' + t('home.rate_btn') + '</button></div>' : '') +
      '<div class="balance-card"><small>' + t('home.balance') + '</small>' +
      '<div class="balance-amount">' + money(u.balance) + '</div>' +
      '<button class="btn btn-sm" id="goTopup">+ ' + t('home.topup') + '</button></div>' +
      '<div class="qa-grid">' +
      '<button class="qa" data-qa="book"><span class="ico">📅</span><span>' + t('home.q_book') + '</span></button>' +
      '<button class="qa" data-qa="chat"><span class="ico">💬</span>' + (state.unreadChat ? '<span class="badge">' + state.unreadChat + '</span>' : '') + '<span>' + t('home.q_chat') + '</span></button>' +
      '<button class="qa" data-qa="gift"><span class="ico">🎁</span><span>' + t('home.q_gift') + '</span></button>' +
      '<button class="qa" data-qa="edu"><span class="ico">💎</span><span>' + t('home.q_edu') + '</span></button>' +
      '</div>' +
      '<div class="section-head"><h3>' + t('home.next') + '</h3></div>' + nextHtml +
      '<div class="section-head"><h3>' + t('home.services') + '</h3><button id="goBook">' + t('home.book_now') + ' →</button></div>' +
      svcPreview +
      '<div class="section-head"><h3>' + t('home.info') + '</h3></div>' +
      '<div class="card">' +
      '<div class="list-row"><span class="lbl">' + t('prof.address') + '</span><span class="small">' + esc(state.lang === 'mn' ? cfg.addressMn : cfg.addressEn) + '</span></div>' +
      '<div class="list-row"><span class="lbl">' + t('prof.phone') + '</span><a href="tel:' + esc(cfg.phoneTel || '') + '">' + esc(cfg.phoneDisplay || '') + '</a></div>' +
      '<div class="list-row"><span class="lbl">' + t('prof.hours') + '</span><span>' + esc((cfg.hoursOpen || '') + ' – ' + (cfg.hoursClose || '')) + '</span></div>' +
      (cfg.facebook ? '<div class="list-row"><span class="lbl">Facebook</span><a href="' + esc(cfg.facebook) + '" target="_blank" rel="noopener">B\'s Gua Sha ↗</a></div>' : '') +
      '</div>';

    bindAppbar();
    document.getElementById('goTopup').onclick = function () { setView('wallet'); };
    var gb = document.getElementById('goBook'); if (gb) gb.onclick = function () { setView('book'); };
    var gb2 = document.getElementById('goBook2'); if (gb2) gb2.onclick = function () { setView('book'); };
    var rn = document.getElementById('rateNow'); if (rn) rn.onclick = function () { openReview(rateBk); };
    $app.querySelectorAll('.qa').forEach(function (b) {
      b.onclick = function () {
        var k = b.getAttribute('data-qa');
        if (k === 'book') setView('book');
        if (k === 'chat') setView('chat');
        if (k === 'gift') { setView('wallet'); setTimeout(function () { var el = document.getElementById('giftSection'); if (el) el.scrollIntoView({ behavior: 'smooth' }); }, 60); }
        if (k === 'edu') setView('edu');
      };
    });
    $app.querySelectorAll('.svc-row').forEach(function (row) {
      row.onclick = function () {
        var svc = state.services.find(function (s) { return s.id === row.getAttribute('data-id'); });
        setView('book');
        if (svc) { state.book.service = svc; state.book.step = 2; render(); }
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

  /* ================= booking view (4 steps) ================= */
  function loadSlots(date) {
    var bk = state.book;
    bk.date = date;
    bk.time = null;
    bk.slots = null;
    bk.loadingSlots = true;
    render();
    var url = '/api/slots?date=' + date + '&serviceId=' + encodeURIComponent(bk.service.id) + '&staffId=' + encodeURIComponent(bk.staffId || 'any');
    api(url).then(function (d) {
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

  function staffCardHtml(st, selected, isPreferred) {
    return '<div class="staff-card' + (selected ? ' active' : '') + '" data-staff="' + esc(st.id) + '">' +
      '<div class="staff-avatar" style="background:' + esc(st.color || '#9a7b3c') + '">' + esc(initial(st.name)) + '</div>' +
      '<div><div class="nm">' + esc(st.name) + (isPreferred ? '<span class="pill">♥ ' + t('book.preferred') + '</span>' : '') + '</div>' +
      '<div class="sp">' + esc(state.lang === 'mn' ? (st.specialtyMn || '') : (st.specialtyEn || '')) + '</div></div>' +
      '<div class="rt">' + (st.rating ? '★ ' + st.rating + '<span class="cnt">' + st.reviewCount + ' ' + t('book.reviews') + '</span>' : '') + '</div>' +
      '</div>';
  }

  function vBook() {
    var bk = state.book;
    var html = appbar() + '<h2 class="view-title">' + t('book.title') + '</h2>';

    /* step 1 — service */
    if (bk.step === 1) {
      html += '<p class="view-sub">' + t('book.step_service') + '</p>' + state.services.map(svcRowHtml).join('');
      $app.innerHTML = html;
      bindAppbar();
      $app.querySelectorAll('.svc-row').forEach(function (row) {
        row.onclick = function () {
          bk.service = state.services.find(function (s) { return s.id === row.getAttribute('data-id'); });
          bk.step = 2;
          render();
        };
      });
      return;
    }

    var s = bk.service;
    html += '<button class="back-btn" id="bkBack">← ' + t('common.back') + '</button>';
    html += '<div class="card svc-row" style="cursor:default;margin-top:10px"><div class="emoji">' + (s.emoji || '🌿') + '</div>' +
      '<div><div class="name">' + esc(svcName(s)) + '</div><div class="meta">' + s.minutes + ' ' + t('book.min') + '</div></div>' +
      '<div class="price">' + money(s.price) + '</div></div>';

    /* step 2 — staff */
    if (bk.step === 2) {
      var prefId = state.user.preferredStaffId || '';
      html += '<p class="view-sub" style="margin-top:8px">' + t('book.step_staff') + '</p>';
      html += '<div class="staff-card' + (bk.staffId === 'any' ? ' active' : '') + '" data-staff="any">' +
        '<div class="staff-avatar" style="background:var(--gold)">✦</div>' +
        '<div><div class="nm">' + t('book.any_staff') + '</div><div class="sp">' + t('book.any_staff_d') + '</div></div></div>';
      html += state.staff.map(function (st) { return staffCardHtml(st, bk.staffId === st.id, prefId === st.id); }).join('');
      html += '<button class="btn btn-primary btn-block mt" id="bkNext">' + t('common.confirm') + ' →</button>';
      $app.innerHTML = html;
      bindAppbar();
      document.getElementById('bkBack').onclick = function () { bk.step = 1; bk.service = null; render(); };
      $app.querySelectorAll('.staff-card').forEach(function (c) {
        c.onclick = function () { bk.staffId = c.getAttribute('data-staff'); render(); };
      });
      document.getElementById('bkNext').onclick = function () {
        bk.step = 3;
        render();
        loadSlots(bk.date || dateOffset(0));
      };
      return;
    }

    /* step 3 — date & time */
    if (bk.step === 3) {
      var chosenStaff = bk.staffId !== 'any' ? state.staff.find(function (x) { return x.id === bk.staffId; }) : null;
      html += '<p class="view-sub" style="margin-top:8px">' + t('book.step_datetime') +
        (chosenStaff ? ' · <b>' + esc(chosenStaff.name) + '</b>' : '') + '</p><div class="date-strip">';
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
      document.getElementById('bkBack').onclick = function () { bk.step = 2; render(); };
      $app.querySelectorAll('.date-chip').forEach(function (c) {
        c.onclick = function () { loadSlots(c.getAttribute('data-date')); };
      });
      $app.querySelectorAll('.slot:not(.taken)').forEach(function (sl) {
        sl.onclick = function () { bk.time = sl.getAttribute('data-time'); render(); };
      });
      document.getElementById('bkNext').onclick = function () {
        if (!bk.time) return;
        var pkg = usableBundleClient(s.id);
        bk.payWith = pkg ? 'package' : (state.user.balance >= s.price ? 'balance' : 'salon');
        bk.step = 4;
        render();
      };
      return;
    }

    /* step 4 — confirm & pay */
    var pkg = usableBundleClient(s.id);
    var canBalance = state.user.balance >= s.price;
    var staffLabel = bk.staffId === 'any' ? t('book.any_staff') : (state.staff.find(function (x) { return x.id === bk.staffId; }) || {}).name || '';
    html += '<p class="view-sub" style="margin-top:8px">' + t('book.step_confirm') + '</p>' +
      '<div class="card">' +
      '<div class="summary-row"><span class="muted">📅</span><span>' + fmtDate(bk.date) + ' · ' + bk.time + '</span></div>' +
      '<div class="summary-row"><span class="muted">' + t('book.staff') + '</span><span>' + esc(staffLabel) + '</span></div>' +
      '<div class="summary-row total"><span>' + t('book.total') + '</span><span>' + money(s.price) + '</span></div></div>' +
      '<h3 style="margin:14px 0 10px;font-size:1.05rem">' + t('book.pay_how') + '</h3>' +
      (pkg ? '<div class="pay-opt' + (bk.payWith === 'package' ? ' active' : '') + '" data-pay="package">' +
        '<span class="radio"></span><div><div class="ttl">🎁 ' + t('book.pay_package') + '</div>' +
        '<div class="sub">' + esc(state.lang === 'mn' ? pkg.nameMn : pkg.nameEn) + ' · ' + pkg.remaining + ' ' + t('book.pkg_left') + '</div></div></div>' : '') +
      '<div class="pay-opt' + (bk.payWith === 'balance' ? ' active' : '') + (canBalance ? '' : ' disabled') + '" data-pay="balance">' +
      '<span class="radio"></span><div><div class="ttl">' + t('book.pay_balance') + '</div>' +
      '<div class="sub">' + t('wallet.balance') + ': ' + money(state.user.balance) + (canBalance ? '' : ' — ' + t('book.balance_short')) + '</div></div></div>' +
      '<div class="pay-opt' + (bk.payWith === 'salon' ? ' active' : '') + '" data-pay="salon">' +
      '<span class="radio"></span><div><div class="ttl">' + t('book.pay_salon') + '</div></div></div>' +
      '<button class="btn btn-primary btn-block mt" id="bkConfirm">' + t('book.confirm_btn') + '</button>';
    $app.innerHTML = html;
    bindAppbar();
    document.getElementById('bkBack').onclick = function () { bk.step = 3; render(); };
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
      api('/api/bookings', { method: 'POST', body: { serviceId: s.id, staffId: bk.staffId, date: bk.date, time: bk.time, payWith: bk.payWith } })
        .then(function (d) {
          if (d.balance !== undefined) state.user.balance = d.balance;
          state.bookings = null;
          if (bk.payWith === 'package') loadMyBundles();
          toast(t('book.booked_ok'), 'ok');
          setView('home');
        })
        .catch(function (e) {
          toast(errMsg(e), 'err');
          btn.disabled = false;
          if (e.error === 'slot_taken') { bk.step = 3; render(); loadSlots(bk.date); }
        });
    };
  }

  /* ================= wallet view ================= */
  var txCache = null;
  function vWallet() {
    var amounts = [20000, 50000, 100000, 200000];
    var cfg = state.config || {};
    var bonusOk = cfg.topupBonusThreshold && state.walletAmount >= cfg.topupBonusThreshold;
    var bonus = bonusOk ? Math.floor(state.walletAmount * cfg.topupBonusPercent / 100) : 0;

    var bundlesForSale = state.bundles.map(function (b) {
      return '<div class="bundle-card" data-bundle="' + esc(b.id) + '">' +
        '<div class="row"><span style="font-size:1.4rem">' + (b.emoji || '🎁') + '</span>' +
        '<div class="grow"><div class="bnm">' + esc(state.lang === 'mn' ? b.nameMn : b.nameEn) + '</div>' +
        '<div class="bds">' + esc(state.lang === 'mn' ? (b.descMn || '') : (b.descEn || '')) + '</div></div></div>' +
        '<div class="row"><span class="muted small">' + b.sessions + ' ' + t('bundle.sessions') + ' · ' + b.validDays + ' ' + t('bundle.valid') + '</span>' +
        '<span class="grow"></span><b style="color:var(--brand)">' + money(b.price) + '</b></div>' +
        '<button class="btn btn-primary btn-block btn-sm mt" data-buy="' + esc(b.id) + '">' + t('bundle.buy') + '</button></div>';
    }).join('');

    var myBundles = '';
    if (state.myBundles && state.myBundles.length) {
      myBundles = '<div class="section-head"><h3>' + t('bundle.mine') + '</h3></div><div class="card">' +
        state.myBundles.map(function (b) {
          var pct = b.sessions ? Math.round((b.remaining / b.sessions) * 100) : 0;
          var until = (b.expiresAt || '').slice(0, 10);
          return '<div style="padding:8px 0;border-bottom:1px solid var(--line)">' +
            '<div class="row"><span>' + (b.emoji || '🎁') + '</span><b class="grow small">' + esc(state.lang === 'mn' ? b.nameMn : b.nameEn) + '</b>' +
            (b.expired ? '<span class="chip cancelled">' + t('bundle.expired') + '</span>' : '<b style="color:var(--brand)">' + b.remaining + '/' + b.sessions + '</b>') + '</div>' +
            '<div class="pkg-bar"><i style="width:' + pct + '%"></i></div>' +
            '<div class="muted" style="font-size:0.75rem">' + until + ' ' + t('bundle.until') + '</div></div>';
        }).join('') + '</div>';
    }

    var giftMine = '';
    if (state.myGiftcards && state.myGiftcards.length) {
      var GSTAT = { active: t('wallet.gift_active'), redeemed: t('wallet.gift_redeemed'), disabled: t('wallet.gift_disabled') };
      giftMine = '<p class="small muted" style="margin:12px 0 4px;font-weight:600">' + t('wallet.gift_mine') + '</p>' +
        state.myGiftcards.map(function (g) {
          return '<div class="gc-row"><span class="gc-code">' + esc(g.code) + '</span>' +
            '<button class="icon-btn" data-copy="' + esc(g.code) + '" style="padding:2px 8px;font-size:0.75rem">⧉</button>' +
            '<span class="grow"></span><span>' + money(g.amount) + '</span>' +
            '<span class="chip ' + (g.status === 'active' ? 'confirmed' : (g.status === 'redeemed' ? 'done' : 'cancelled')) + '">' + (GSTAT[g.status] || g.status) + '</span></div>';
        }).join('');
    }

    $app.innerHTML = appbar() +
      '<h2 class="view-title">' + t('wallet.title') + '</h2>' +
      '<div class="balance-card"><small>' + t('wallet.balance') + '</small>' +
      '<div class="balance-amount">' + money(state.user.balance) + '</div></div>' +

      '<div class="card"><h3 style="font-size:1.02rem;margin-bottom:10px">' + t('wallet.topup_title') + '</h3>' +
      '<div class="amount-grid">' + amounts.map(function (a) {
        return '<button class="amount-btn' + (state.walletAmount === a ? ' active' : '') + '" data-a="' + a + '">' + money(a) + '</button>';
      }).join('') + '</div>' +
      '<div class="field"><input id="customAmount" inputmode="numeric" placeholder="' + esc(t('wallet.custom_ph')) + '"></div>' +
      '<p class="small muted">🎁 ' + t('wallet.bonus_note') + ' +' + (cfg.topupBonusPercent || 5) + '%' + (bonus ? ' · <b style="color:var(--brand)">' + t('wallet.bonus') + ': +' + money(bonus) + '</b>' : '') + '</p>' +
      '<h3 style="font-size:1.02rem;margin:14px 0 10px">' + t('wallet.method') + '</h3>' +
      '<div class="pay-opt active"><span class="radio"></span><div><div class="ttl">QPay</div><div class="sub">' + t('wallet.m_qpay_d') + '</div></div><span style="margin-left:auto">🔵</span></div>' +
      '<button class="btn btn-primary btn-block mt" id="topupBtn">' + t('wallet.create') + ' · ' + money(state.walletAmount) + '</button></div>' +

      '<div class="card"><h3 style="font-size:1.02rem;margin-bottom:10px">🎟 ' + t('wallet.redeem_title') + '</h3>' +
      '<div class="row"><div class="field grow" style="margin-bottom:0"><input id="redeemCode" placeholder="' + esc(t('wallet.redeem_ph')) + '" style="text-transform:uppercase"></div>' +
      '<button class="btn btn-primary btn-sm" id="redeemBtn">' + t('wallet.redeem_btn') + '</button></div></div>' +

      '<div class="card" id="giftSection"><h3 style="font-size:1.02rem;margin-bottom:6px">🎁 ' + t('wallet.gift_title') + '</h3>' +
      '<p class="small muted">' + t('wallet.gift_sub') + '</p>' +
      '<button class="btn btn-ghost btn-block mt" id="giftBuyBtn">' + t('wallet.gift_buy') + '</button>' +
      giftMine + '</div>' +

      (state.bundles.length ? '<div class="section-head"><h3>' + t('bundle.title') + '</h3></div>' +
        '<p class="view-sub" style="margin-bottom:10px">' + t('bundle.sub') + '</p>' + bundlesForSale : '') +
      myBundles +

      '<div class="section-head"><h3>' + t('wallet.tx_title') + '</h3></div>' +
      '<div class="card" id="txList"><div class="skeleton"></div></div>';

    bindAppbar();
    $app.querySelectorAll('.amount-btn').forEach(function (b) {
      b.onclick = function () {
        state.walletAmount = Number(b.getAttribute('data-a'));
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
    document.getElementById('redeemBtn').onclick = doRedeem;
    document.getElementById('giftBuyBtn').onclick = openGiftBuy;
    $app.querySelectorAll('[data-copy]').forEach(function (b) {
      b.onclick = function () { copyText(b.getAttribute('data-copy')); };
    });
    $app.querySelectorAll('[data-buy]').forEach(function (b) {
      b.onclick = function () { buyBundle(b.getAttribute('data-buy')); };
    });

    renderTx();
    api('/api/transactions').then(function (list) { txCache = list; renderTx(); }).catch(function () { txCache = []; renderTx(); });
    if (state.myGiftcards === null) {
      api('/api/giftcards/mine').then(function (list) { state.myGiftcards = list; if (state.view === 'wallet') render(); }).catch(function () { state.myGiftcards = []; });
    }
    if (state.myBundles === null) loadMyBundles().then(function () { if (state.view === 'wallet') render(); });
  }

  function renderTx() {
    var host = document.getElementById('txList');
    if (!host || txCache === null) return;
    if (!txCache.length) { host.innerHTML = '<div class="empty">' + t('wallet.tx_empty') + '</div>'; return; }
    var icons = { topup: '⬇️', payment: '💆', refund: '↩️', bonus: '🎁', bundle: '📦', giftcard_buy: '🎁', gift: '💝', promo: '🎟', adjust: '🛠' };
    host.innerHTML = txCache.slice(0, 30).map(function (tx) {
      var pos = tx.amount >= 0;
      var name = t('wallet.tx_' + tx.type);
      if (name === 'wallet.tx_' + tx.type) name = tx.type;
      return '<div class="tx-row"><div class="tx-icon">' + (icons[tx.type] || '•') + '</div>' +
        '<div><div class="tx-name">' + name + '</div><div class="tx-date">' + fmtShort(tx.createdAt) + (tx.note ? ' · ' + esc(tx.note) : '') + '</div></div>' +
        '<div class="tx-amount ' + (pos ? 'pos' : 'neg') + '">' + (pos ? '+' : '') + money(tx.amount) + '</div></div>';
    }).join('');
  }

  function doRedeem() {
    var inp = document.getElementById('redeemCode');
    var code = (inp.value || '').trim();
    if (!code) { toast(t('err.bad_code'), 'err'); return; }
    api('/api/redeem', { method: 'POST', body: { code: code } })
      .then(function (d) {
        state.user.balance = d.balance;
        txCache = null;
        toast('+' + money(d.amount) + ' ' + t('wallet.redeem_ok'), 'ok');
        render();
      })
      .catch(function (e) { toast(errMsg(e), 'err'); });
  }

  function openGiftBuy() {
    var m = openModal(
      '<h3>🎁 ' + t('wallet.gift_buy') + '</h3>' +
      '<p class="small muted">' + t('wallet.gift_note') + ' (' + t('wallet.balance') + ': ' + money(state.user.balance) + ')</p>' +
      '<div class="field mt"><label>' + t('wallet.gift_amount') + '</label><input id="gAmount" inputmode="numeric" value="50000"></div>' +
      '<div class="field"><label>' + t('wallet.gift_to') + '</label><input id="gTo" maxlength="60"></div>' +
      '<div class="field"><label>' + t('wallet.gift_msg') + '</label><input id="gMsg" maxlength="200"></div>' +
      '<div class="modal-actions">' +
      '<button class="btn btn-ghost" id="gCancel">' + t('common.cancel') + '</button>' +
      '<button class="btn btn-primary" id="gBuy">' + t('bundle.buy').replace(t('bundle.title'), '').trim() + ' 🎁</button></div>'
    );
    m.querySelector('#gCancel').onclick = closeModal;
    m.querySelector('#gBuy').onclick = function () {
      var amount = parseInt(m.querySelector('#gAmount').value.replace(/\D/g, ''), 10) || 0;
      var btn = this;
      btn.disabled = true;
      api('/api/giftcards/buy', { method: 'POST', body: { amount: amount, toName: m.querySelector('#gTo').value, message: m.querySelector('#gMsg').value } })
        .then(function (d) {
          state.user.balance = d.balance;
          state.myGiftcards = null;
          txCache = null;
          var m2 = openModal(
            '<h3>🎉 ' + t('wallet.gift_created') + '</h3>' +
            '<div class="code-box"><span>' + esc(d.giftcard.code) + '</span><button class="icon-btn" id="cpCode">⧉ ' + t('common.copy') + '</button></div>' +
            '<p class="small muted">' + t('wallet.gift_share') + '</p>' +
            '<div class="modal-actions"><button class="btn btn-primary" id="gcOk">' + t('common.ok') + '</button></div>'
          );
          m2.querySelector('#cpCode').onclick = function () { copyText(d.giftcard.code); };
          m2.querySelector('#gcOk').onclick = function () { closeModal(); if (state.view === 'wallet') render(); };
        })
        .catch(function (e) { toast(errMsg(e), 'err'); btn.disabled = false; });
    };
  }

  function buyBundle(id) {
    var b = state.bundles.find(function (x) { return x.id === id; });
    if (!b) return;
    confirmDlg(money(b.price) + ' — ' + t('bundle.buy_q')).then(function (yes) {
      if (!yes) return;
      api('/api/bundles/' + id + '/buy', { method: 'POST' })
        .then(function (d) {
          state.user.balance = d.balance;
          txCache = null;
          loadMyBundles().then(function () { if (state.view === 'wallet') render(); });
          toast(t('bundle.bought'), 'ok');
        })
        .catch(function (e) { toast(errMsg(e), 'err'); });
    });
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
          '<h3>QPay · ' + money(d.amount) + (d.bonus ? ' <span class="small" style="color:var(--brand)">+' + money(d.bonus) + ' ' + t('wallet.bonus').toLowerCase() + '</span>' : '') + '</h3>' +
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

  /* ================= chat view ================= */
  function vChat() {
    $app.innerHTML = appbar() +
      '<button class="back-btn" id="chBack">← ' + t('common.back') + '</button>' +
      '<h2 class="view-title" style="margin-bottom:12px">' + t('chat.title') + '</h2>' +
      '<div class="chat-wrap"><div class="chat-list" id="chatList"><div class="skeleton"></div></div>' +
      '<div class="chat-input"><input id="chatText" maxlength="1000" placeholder="' + esc(t('chat.ph')) + '">' +
      '<button id="chatSend">➤</button></div></div>';
    bindAppbar();
    document.getElementById('chBack').onclick = function () { setView('home'); };
    document.getElementById('chatSend').onclick = sendChat;
    document.getElementById('chatText').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); sendChat(); }
    });
    loadChat(true);
    chatTimer = setInterval(function () { if (state.view === 'chat') loadChat(false); }, 5000);
  }

  function renderChat(scroll) {
    var host = document.getElementById('chatList');
    if (!host || state.chatMsgs === null) return;
    if (!state.chatMsgs.length) {
      host.innerHTML = '<div class="empty"><span class="big">💬</span>' + t('chat.empty') + '</div>';
      return;
    }
    host.innerHTML = state.chatMsgs.map(function (msg) {
      var me = msg.from === 'customer';
      return '<div class="bubble ' + (me ? 'me' : 'them') + '">' + esc(msg.text) +
        '<span class="bmeta">' + (me ? t('chat.you') : esc(msg.fromName || '')) + ' · ' + fmtShort(msg.createdAt) + '</span></div>';
    }).join('');
    if (scroll) window.scrollTo(0, document.body.scrollHeight);
  }

  function loadChat(scroll) {
    api('/api/chat').then(function (list) {
      var hadNew = !state.chatMsgs || list.length !== state.chatMsgs.length;
      state.chatMsgs = list;
      state.unreadChat = 0;
      if (state.view === 'chat' && hadNew) renderChat(scroll || hadNew);
    }).catch(function () { if (state.chatMsgs === null) { state.chatMsgs = []; renderChat(); } });
  }

  function sendChat() {
    var inp = document.getElementById('chatText');
    var text = (inp.value || '').trim();
    if (!text) return;
    inp.value = '';
    api('/api/chat', { method: 'POST', body: { text: text } })
      .then(function (msg) {
        state.chatMsgs = (state.chatMsgs || []).concat([msg]);
        renderChat(true);
      })
      .catch(function (e) { toast(errMsg(e), 'err'); inp.value = text; });
  }

  /* ================= edu (gua sha info) view ================= */
  function vEdu() {
    $app.innerHTML = appbar() +
      '<button class="back-btn" id="edBack">← ' + t('common.back') + '</button>' +
      '<h2 class="view-title">' + t('edu.title') + '</h2>' +
      '<p class="view-sub">' + t('edu.sub') + '</p>' +
      '<div id="eduHost"><div class="skeleton"></div><div class="skeleton"></div></div>';
    bindAppbar();
    document.getElementById('edBack').onclick = function () { setView('home'); };
    if (state.edu) renderEdu();
    else api('/api/public/edu').then(function (list) { state.edu = list; if (state.view === 'edu') renderEdu(); }).catch(function () { state.edu = []; renderEdu(); });
  }

  function renderEdu() {
    var host = document.getElementById('eduHost');
    if (!host) return;
    var cats = ['tool', 'product', 'machine', 'method'];
    var html = '';
    cats.forEach(function (cat) {
      var items = (state.edu || []).filter(function (x) { return x.category === cat; });
      if (!items.length) return;
      html += '<h3 class="edu-cat">' + t('edu.cat_' + cat) + '</h3><div class="card">' +
        items.map(function (it) {
          return '<div class="edu-item"><div class="ico">' + (it.emoji || '🌿') + '</div>' +
            '<div><div class="nm">' + esc(state.lang === 'mn' ? it.nameMn : it.nameEn) + '</div>' +
            '<div class="ds">' + esc(state.lang === 'mn' ? it.descMn : it.descEn) + '</div></div></div>';
        }).join('') + '</div>';
    });
    host.innerHTML = html || '<div class="empty">—</div>';
  }

  /* ================= reviews ================= */
  function openReview(booking) {
    var svc = booking.service || {};
    var rating = 0;
    var m = openModal(
      '<h3>' + t('rev.title') + '</h3>' +
      '<p class="small muted">' + esc(svcName(svc)) + ' · ' + fmtDate(booking.date) +
      (booking.staffName ? ' · ' + esc(booking.staffName) : '') + '</p>' +
      '<p class="center mt" style="font-weight:600">' + t('rev.sub') + '</p>' +
      '<div class="stars" id="rvStars">' + [1, 2, 3, 4, 5].map(function (i) {
        return '<button data-star="' + i + '">★</button>';
      }).join('') + '</div>' +
      '<div class="field"><textarea id="rvText" rows="3" maxlength="600" placeholder="' + esc(t('rev.ph')) + '"></textarea></div>' +
      '<p class="small muted">' + t('rev.pending_note') + '</p>' +
      '<div class="modal-actions">' +
      '<button class="btn btn-ghost" id="rvCancel">' + t('common.cancel') + '</button>' +
      '<button class="btn btn-primary" id="rvSubmit">' + t('rev.submit') + '</button></div>'
    );
    function paint() {
      m.querySelectorAll('#rvStars button').forEach(function (b) {
        b.classList.toggle('on', Number(b.getAttribute('data-star')) <= rating);
      });
    }
    m.querySelectorAll('#rvStars button').forEach(function (b) {
      b.onclick = function () { rating = Number(b.getAttribute('data-star')); paint(); };
    });
    m.querySelector('#rvCancel').onclick = closeModal;
    m.querySelector('#rvSubmit').onclick = function () {
      if (!rating) { toast(t('err.bad_rating'), 'err'); return; }
      var btn = this;
      btn.disabled = true;
      api('/api/reviews', { method: 'POST', body: { bookingId: booking.id, rating: rating, text: m.querySelector('#rvText').value.trim() } })
        .then(function () {
          booking.reviewId = 'sent';
          if (state.bookings) {
            var bk = state.bookings.find(function (x) { return x.id === booking.id; });
            if (bk) bk.reviewId = 'sent';
          }
          closeModal();
          toast(t('rev.thanks'), 'ok');
          render();
        })
        .catch(function (e) { toast(errMsg(e), 'err'); btn.disabled = false; });
    };
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
        draw(false);
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
    var prefStaff = u.preferredStaffId ? (state.staff.find(function (s) { return s.id === u.preferredStaffId; }) || {}).name : '';

    $app.innerHTML = appbar() +
      '<h2 class="view-title">' + t('prof.title') + '</h2>' +

      '<div class="card"><div class="row"><div class="grow"><div style="font-weight:700;font-size:1.1rem">' + esc(u.name) + '</div>' +
      '<div class="muted small">📱 ' + esc(u.phone) + '</div></div>' +
      '<button class="btn btn-ghost btn-sm" id="editInfo">✎ ' + t('prof.edit_info') + '</button></div>' +
      '<div class="list-row" style="margin-top:8px"><span class="lbl">' + t('prof.skin') + '</span><span>' + esc(u.skinType || '—') + '</span></div>' +
      '<div class="list-row"><span class="lbl">' + t('prof.allergy') + '</span><span>' + esc(u.allergies || '—') + '</span></div>' +
      '<div class="list-row"><span class="lbl">' + t('prof.pref_staff') + '</span><span>' + esc(prefStaff || t('prof.pref_none')) + '</span></div>' +
      '<div class="list-row"><span class="lbl">' + t('prof.prefnote') + '</span><span class="small">' + esc(u.prefNote || '—') + '</span></div>' +
      '<p class="small muted" style="margin-top:8px">' + t('prof.info_note') + '</p></div>' +

      '<div class="card" style="padding:6px 16px">' +
      '<button class="link-row" id="lnkEdu">💎 ' + t('prof.edu_link') + '<span class="arr">→</span></button>' +
      '<button class="link-row" id="lnkChat">💬 ' + t('prof.chat_link') + (state.unreadChat ? ' <span class="pill">' + state.unreadChat + '</span>' : '') + '<span class="arr">→</span></button>' +
      '<button class="link-row" id="lnkPass">🔑 ' + t('prof.password') + '<span class="arr">→</span></button></div>' +

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
      '<div class="list-row"><span class="lbl">' + t('prof.address') + '</span><span class="small">' + esc(state.lang === 'mn' ? cfg.addressMn : cfg.addressEn) + '</span></div>' +
      '<div class="list-row"><span class="lbl">' + t('prof.phone') + '</span><a href="tel:' + esc(cfg.phoneTel || '') + '">' + esc(cfg.phoneDisplay || '') + '</a></div>' +
      (cfg.email ? '<div class="list-row"><span class="lbl">Email</span><a href="mailto:' + esc(cfg.email) + '">' + esc(cfg.email) + '</a></div>' : '') +
      '<div class="list-row"><span class="lbl">' + t('prof.hours') + '</span><span>' + esc((cfg.hoursOpen || '') + ' – ' + (cfg.hoursClose || '')) + '</span></div>' +
      (cfg.facebook ? '<div class="list-row"><span class="lbl">Facebook</span><a href="' + esc(cfg.facebook) + '" target="_blank" rel="noopener">B\'s Gua Sha ↗</a></div>' : '') +
      '</div>' +
      '<button class="btn btn-danger btn-block mt" id="logoutBtn">' + t('prof.logout') + '</button>' +
      '<p class="center small muted mt">B\'s Gua Sha v3.0</p>';

    bindAppbar();
    document.getElementById('langMn').onclick = function () { setLang('mn'); };
    document.getElementById('langEn').onclick = function () { setLang('en'); };
    document.getElementById('thLight').onclick = function () { setTheme('light'); };
    document.getElementById('thDark').onclick = function () { setTheme('dark'); };
    document.getElementById('editInfo').onclick = openEditInfo;
    document.getElementById('lnkEdu').onclick = function () { setView('edu'); };
    document.getElementById('lnkChat').onclick = function () { setView('chat'); };
    document.getElementById('lnkPass').onclick = openChangePass;
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
        var canRate = b.status === 'done' && !b.reviewId;
        var paidKey = 'prof.paid_' + (b.paid || 'salon');
        var paidLabel = t(paidKey);
        if (paidLabel === paidKey) paidLabel = b.paid;
        return '<div class="booking-item">' +
          '<div class="row"><div class="grow"><div style="font-weight:600">' + esc(svcName(svc)) + '</div>' +
          '<div class="muted small">' + fmtDate(b.date) + ' · ' + b.time + ' · ' + money(b.amount) + '</div>' +
          (b.staffName ? '<div class="muted small">👤 ' + esc(b.staffName) + '</div>' : '') +
          '<div class="muted small">' + paidLabel + '</div></div>' +
          '<div style="text-align:right"><span class="chip ' + b.status + '">' + t('prof.st_' + b.status) + '</span>' +
          (canCancel ? '<div><button class="btn btn-sm btn-danger mt" data-cancel="' + esc(b.id) + '">' + t('prof.cancel') + '</button></div>' : '') +
          (canRate ? '<div><button class="btn btn-sm btn-primary mt" data-rate="' + esc(b.id) + '">⭐ ' + t('home.rate_btn').replace('⭐ ', '') + '</button></div>' : '') +
          (b.status === 'done' && b.reviewId ? '<div class="muted small mt">✓ ' + t('rev.done') + '</div>' : '') +
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
                loadMyBundles();
                toast(t('prof.cancelled'), 'ok');
                vProfile();
              })
              .catch(function (e) { toast(errMsg(e), 'err'); });
          });
        };
      });
      host.querySelectorAll('[data-rate]').forEach(function (btn) {
        btn.onclick = function () {
          var bk = state.bookings.find(function (x) { return x.id === btn.getAttribute('data-rate'); });
          if (bk) openReview(bk);
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

  function openEditInfo() {
    var u = state.user;
    var staffOpts = '<option value="">' + t('prof.pref_none') + '</option>' + state.staff.map(function (s) {
      return '<option value="' + esc(s.id) + '"' + (u.preferredStaffId === s.id ? ' selected' : '') + '>' + esc(s.name) + '</option>';
    }).join('');
    var m = openModal(
      '<h3>✎ ' + t('prof.edit_info') + '</h3>' +
      '<div class="field"><label>' + t('auth.name') + '</label><input id="eiName" maxlength="60" value="' + esc(u.name) + '"></div>' +
      '<div class="field"><label>' + t('prof.birthday') + '</label><input id="eiBday" type="date" value="' + esc(u.birthday || '') + '"></div>' +
      '<div class="field"><label>' + t('prof.skin') + '</label><input id="eiSkin" maxlength="40" value="' + esc(u.skinType || '') + '" placeholder="' + esc(t('prof.skin_ph')) + '"></div>' +
      '<div class="field"><label>' + t('prof.allergy') + '</label><input id="eiAllergy" maxlength="200" value="' + esc(u.allergies || '') + '" placeholder="' + esc(t('prof.allergy_ph')) + '"></div>' +
      '<div class="field"><label>' + t('prof.prefnote') + '</label><textarea id="eiNote" rows="2" maxlength="300" placeholder="' + esc(t('prof.prefnote_ph')) + '">' + esc(u.prefNote || '') + '</textarea></div>' +
      '<div class="field"><label>♥ ' + t('prof.pref_staff') + '</label><select id="eiStaff">' + staffOpts + '</select></div>' +
      '<div class="modal-actions">' +
      '<button class="btn btn-ghost" id="eiCancel">' + t('common.cancel') + '</button>' +
      '<button class="btn btn-primary" id="eiSave">' + t('common.save') + '</button></div>'
    );
    m.querySelector('#eiCancel').onclick = closeModal;
    m.querySelector('#eiSave').onclick = function () {
      var btn = this;
      btn.disabled = true;
      api('/api/me', {
        method: 'PATCH',
        body: {
          name: m.querySelector('#eiName').value.trim(),
          birthday: m.querySelector('#eiBday').value,
          skinType: m.querySelector('#eiSkin').value,
          allergies: m.querySelector('#eiAllergy').value,
          prefNote: m.querySelector('#eiNote').value,
          preferredStaffId: m.querySelector('#eiStaff').value
        }
      }).then(function (d) {
        state.user = d.user;
        closeModal();
        toast(t('prof.saved'), 'ok');
        render();
      }).catch(function (e) { toast(errMsg(e), 'err'); btn.disabled = false; });
    };
  }

  function openChangePass() {
    var m = openModal(
      '<h3>🔑 ' + t('prof.password') + '</h3>' +
      '<div class="field"><label>' + t('prof.pass_old') + '</label><input id="cpOld" type="password"></div>' +
      '<div class="field"><label>' + t('prof.pass_new') + '</label><input id="cpNew" type="password"></div>' +
      '<div class="modal-actions">' +
      '<button class="btn btn-ghost" id="cpCancel">' + t('common.cancel') + '</button>' +
      '<button class="btn btn-primary" id="cpSave">' + t('common.save') + '</button></div>'
    );
    m.querySelector('#cpCancel').onclick = closeModal;
    m.querySelector('#cpSave').onclick = function () {
      var btn = this;
      btn.disabled = true;
      api('/api/me', { method: 'PATCH', body: { password: m.querySelector('#cpOld').value, newPassword: m.querySelector('#cpNew').value } })
        .then(function () { closeModal(); toast(t('prof.pass_ok'), 'ok'); })
        .catch(function (e) { toast(errMsg(e), 'err'); btn.disabled = false; });
    };
  }

  /* ================= unread badge polling ================= */
  function pollUnread() {
    if (!state.token || !state.user) return;
    api('/api/me').then(function (d) {
      var prev = state.unreadChat;
      state.user = d.user;
      state.unreadChat = d.unreadChat || 0;
      if (state.unreadChat !== prev && state.view !== 'chat') {
        var ab = document.getElementById('abChat');
        if (ab) ab.innerHTML = '💬' + (state.unreadChat ? '<span class="badge">' + state.unreadChat + '</span>' : '');
      }
    }).catch(function () {});
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
      api('/api/services').then(function (s) { state.services = s; }).catch(function () {}),
      api('/api/staff').then(function (s) { state.staff = s; }).catch(function () {}),
      api('/api/bundles').then(function (b) { state.bundles = b; }).catch(function () {})
    ];

    Promise.all(boot).then(function () {
      if (state.token) {
        api('/api/me').then(function (d) {
          state.user = d.user;
          state.unreadChat = d.unreadChat || 0;
          loadMyBundles();
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

    badgeTimer = setInterval(pollUnread, 30000);

    $app.innerHTML = '<div class="auth-wrap center"><div class="auth-logo"><img src="/assets/logo.svg" alt=""><h1>B\'s Gua Sha</h1><p class="muted small">' + t('common.loading') + '</p></div></div>';
  }

  init();
})();
