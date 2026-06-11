/* B's Guasha — owner admin panel (PIN protected). Mongolian-first labels. */
(function () {
  'use strict';

  var token = sessionStorage.getItem('bg_admin') || null;
  var tab = 'bookings';
  var data = { overview: null, users: null, tx: null, services: null };
  var root = document.getElementById('root');
  var theme = localStorage.getItem('bg_theme') || 'light';
  document.documentElement.setAttribute('data-theme', theme);

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

  function api(path, opts) {
    opts = opts || {};
    var headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    return fetch(path, { method: opts.method || 'GET', headers: headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) {
          if (!r.ok) {
            if (r.status === 401 && token) { token = null; sessionStorage.removeItem('bg_admin'); render(); }
            throw d;
          }
          return d;
        });
      });
  }

  var ST_LABEL = { confirmed: 'Баталгаажсан', done: 'Болсон ✓', cancelled: 'Цуцалсан', noshow: 'Ирээгүй' };

  function render() {
    if (!token) return renderPin();
    var tabs = [
      ['bookings', '📅 Захиалга'],
      ['users', '👤 Үйлчлүүлэгч'],
      ['tx', '💳 Гүйлгээ'],
      ['services', '🌿 Үйлчилгээ / Үнэ']
    ];
    root.innerHTML =
      '<div class="row" style="gap:12px"><h2 style="font-family:\'Playfair Display\',serif">B\'s Guasha — Удирдлага</h2>' +
      '<div class="spacer" style="flex:1"></div>' +
      '<a class="icon-btn" href="/api/admin/export?token=' + encodeURIComponent(token) + '" download>⬇ Backup</a>' +
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
    document.getElementById('outBtn').onclick = function () {
      token = null;
      sessionStorage.removeItem('bg_admin');
      render();
    };
    root.querySelectorAll('[data-tab]').forEach(function (b) {
      b.onclick = function () { tab = b.getAttribute('data-tab'); render(); };
    });

    if (tab === 'bookings') loadBookings();
    if (tab === 'users') loadUsers();
    if (tab === 'tx') loadTx();
    if (tab === 'services') loadServices();
  }

  function renderPin() {
    root.innerHTML =
      '<div class="pin-wrap"><img src="/assets/favicon.svg" width="64" height="64" alt="">' +
      '<h2 style="font-family:\'Playfair Display\',serif;margin:12px 0">Эзэмшигчийн хэсэг</h2>' +
      '<p class="muted small" style="margin-bottom:14px">PIN кодоо оруулна уу (анхных: 1234 — config.json дотор солино)</p>' +
      '<form id="pinForm"><div class="field"><input id="pin" type="password" inputmode="numeric" placeholder="PIN" style="text-align:center;font-size:1.3rem;letter-spacing:0.4em"></div>' +
      '<button class="btn btn-primary btn-block" type="submit">Нэвтрэх</button></form></div>';
    document.getElementById('pinForm').onsubmit = function (e) {
      e.preventDefault();
      api('/api/admin/login', { method: 'POST', body: { pin: document.getElementById('pin').value } })
        .then(function (d) {
          token = d.token;
          sessionStorage.setItem('bg_admin', token);
          render();
        })
        .catch(function (err) {
          toast(err && err.error === 'try_later' ? 'Хэт олон оролдлого — 5 мин хүлээнэ үү' : 'PIN буруу байна', 'err');
        });
    };
  }

  /* ---------- bookings ---------- */
  function loadBookings() {
    api('/api/admin/overview').then(function (d) {
      data.overview = d;
      var c = document.getElementById('content');
      var s = d.stats;
      function bkRow(b) {
        return '<tr><td><b>' + esc(b.date) + '</b><br>' + esc(b.time) + '</td>' +
          '<td>' + esc(b.user.name) + '<br><a href="tel:' + esc(b.user.phone) + '" class="muted small">' + esc(b.user.phone) + '</a></td>' +
          '<td>' + esc(b.service ? b.service.nameMn : '?') + '<br><span class="muted small">' + money(b.amount) + ' · ' + (b.paid === 'balance' ? 'Үлдэгдлээс төлсөн ✓' : (b.paid === 'refunded' ? 'Буцаагдсан' : 'Салон дээр төлнө')) + '</span></td>' +
          '<td><span class="chip ' + b.status + '">' + (ST_LABEL[b.status] || b.status) + '</span><div class="bk-actions" style="margin-top:6px">' +
          (b.status === 'confirmed' ? '<button data-st="done" data-id="' + b.id + '">Болсон ✓</button><button data-st="noshow" data-id="' + b.id + '">Ирээгүй</button><button data-st="cancelled" data-id="' + b.id + '">Цуцлах</button>' : '<button data-st="confirmed" data-id="' + b.id + '">Сэргээх</button>') +
          '</div></td></tr>';
      }
      c.innerHTML =
        '<div class="stat-grid">' +
        '<div class="stat"><b>' + d.upcoming.length + '</b><span>Ирэх захиалга</span></div>' +
        '<div class="stat"><b>' + s.users + '</b><span>Бүртгэлтэй үйлчлүүлэгч</span></div>' +
        '<div class="stat"><b>' + money(s.topupTotal) + '</b><span>Нийт цэнэглэлт</span></div>' +
        '<div class="stat"><b>' + money(s.balancesTotal) + '</b><span>Хэтэвчний нийт үлдэгдэл</span></div></div>' +
        '<div class="card"><h3 style="margin-bottom:10px">Ирэх захиалгууд</h3>' +
        (d.upcoming.length ? '<table><tr><th>Огноо</th><th>Үйлчлүүлэгч</th><th>Үйлчилгээ</th><th>Төлөв</th></tr>' + d.upcoming.map(bkRow).join('') + '</table>' : '<p class="muted">Одоогоор захиалга алга.</p>') + '</div>' +
        '<div class="card"><h3 style="margin-bottom:10px">Өмнөх / бусад</h3>' +
        (d.past.length ? '<table><tr><th>Огноо</th><th>Үйлчлүүлэгч</th><th>Үйлчилгээ</th><th>Төлөв</th></tr>' + d.past.map(bkRow).join('') + '</table>' : '<p class="muted">Хоосон.</p>') + '</div>';
      c.querySelectorAll('[data-st]').forEach(function (btn) {
        btn.onclick = function () {
          api('/api/admin/bookings/' + btn.getAttribute('data-id') + '/status', { method: 'POST', body: { status: btn.getAttribute('data-st') } })
            .then(function () { toast('Хадгалагдлаа ✓', 'ok'); loadBookings(); })
            .catch(function () { toast('Алдаа гарлаа', 'err'); });
        };
      });
    }).catch(function () { toast('Алдаа гарлаа', 'err'); });
  }

  /* ---------- users ---------- */
  function loadUsers() {
    api('/api/admin/users').then(function (list) {
      var c = document.getElementById('content');
      c.innerHTML = '<div class="card"><table><tr><th>Нэр</th><th>Утас</th><th>Үлдэгдэл</th><th>Захиалга</th><th>Сүүлд</th></tr>' +
        list.map(function (u) {
          return '<tr><td>' + esc(u.name) + (u.isDemo ? ' <span class="muted small">(demo)</span>' : '') + '</td>' +
            '<td><a href="tel:' + esc(u.phone) + '">' + esc(u.phone) + '</a></td>' +
            '<td>' + money(u.balance) + '</td><td>' + u.bookings + '</td><td>' + esc(u.lastBooking || '—') + '</td></tr>';
        }).join('') + '</table></div>';
    }).catch(function () { toast('Алдаа гарлаа', 'err'); });
  }

  /* ---------- transactions ---------- */
  function loadTx() {
    api('/api/admin/transactions').then(function (list) {
      var TYPE = { topup: 'Цэнэглэлт', payment: 'Төлбөр', refund: 'Буцаалт', bonus: 'Урамшуулал' };
      var c = document.getElementById('content');
      c.innerHTML = '<div class="card">' + (list.length ? '<table><tr><th>Огноо</th><th>Хэрэглэгч</th><th>Төрөл</th><th>Дүн</th></tr>' +
        list.map(function (tx) {
          var d = new Date(tx.createdAt);
          return '<tr><td>' + (d.getMonth() + 1) + '/' + d.getDate() + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + '</td>' +
            '<td>' + esc(tx.userName) + '</td><td>' + (TYPE[tx.type] || tx.type) + ' <span class="muted small">' + esc(tx.note || '') + '</span></td>' +
            '<td style="color:' + (tx.amount >= 0 ? 'var(--ok)' : 'var(--danger)') + ';font-weight:600">' + (tx.amount >= 0 ? '+' : '') + money(tx.amount) + '</td></tr>';
        }).join('') + '</table>' : '<p class="muted">Гүйлгээ алга.</p>') + '</div>';
    }).catch(function () { toast('Алдаа гарлаа', 'err'); });
  }

  /* ---------- services ---------- */
  function loadServices() {
    api('/api/admin/services').then(function (list) {
      var c = document.getElementById('content');
      c.innerHTML = '<div class="card"><p class="muted small" style="margin-bottom:10px">Үнэ солиод Enter эсвэл “Хадгалах” дарна. Идэвхгүй болгосон үйлчилгээ аппд харагдахгүй.</p>' +
        '<table><tr><th>Үйлчилгээ</th><th>Мин</th><th>Үнэ (₮)</th><th></th><th>Идэвхтэй</th></tr>' +
        list.map(function (s) {
          return '<tr><td>' + (s.emoji || '') + ' ' + esc(s.nameMn) + '<br><span class="muted small">' + esc(s.nameEn) + '</span></td>' +
            '<td>' + s.minutes + '</td>' +
            '<td><input class="price-input" data-id="' + s.id + '" type="number" value="' + s.price + '" step="1000" min="0"></td>' +
            '<td><button class="icon-btn" data-save="' + s.id + '">Хадгалах</button></td>' +
            '<td><input type="checkbox" data-active="' + s.id + '"' + (s.active ? ' checked' : '') + ' style="width:18px;height:18px"></td></tr>';
        }).join('') + '</table></div>';
      function save(id, body) {
        api('/api/admin/services/' + id, { method: 'POST', body: body })
          .then(function () { toast('Хадгалагдлаа ✓', 'ok'); })
          .catch(function () { toast('Алдаа гарлаа', 'err'); });
      }
      c.querySelectorAll('[data-save]').forEach(function (btn) {
        btn.onclick = function () {
          var id = btn.getAttribute('data-save');
          var input = c.querySelector('.price-input[data-id="' + id + '"]');
          save(id, { price: Number(input.value) });
        };
      });
      c.querySelectorAll('.price-input').forEach(function (input) {
        input.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') save(input.getAttribute('data-id'), { price: Number(input.value) });
        });
      });
      c.querySelectorAll('[data-active]').forEach(function (cb) {
        cb.onchange = function () { save(cb.getAttribute('data-active'), { active: cb.checked }); };
      });
    }).catch(function () { toast('Алдаа гарлаа', 'err'); });
  }

  render();
})();
