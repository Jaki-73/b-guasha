/* B's Gua Sha — site script: i18n (MN/EN), theme, services, bundles, products, live reviews */
(function () {
  'use strict';

  /* ---------- translations ---------- */
  var DICT = {
    mn: {
      'nav.services': 'Үйлчилгээ', 'nav.about': 'Гуаша гэж юу вэ?', 'nav.products': 'Бүтээгдэхүүн', 'nav.reviews': 'Сэтгэгдэл', 'nav.app': 'Апп', 'nav.contact': 'Холбоо барих', 'nav.open_app': 'Апп нээх',
      'hero.eyebrow': 'Гоо сайхан, Эрүүл арьс, Итгэлтэй чи',
      'hero.title': 'Байгалийн аргаар<br>залуу, гэрэлтсэн арьс',
      'hero.sub': 'Уламжлалт гуаша эмчилгээ — нүүрний хаван бууруулж, арьсыг чангалж, цусны эргэлтийг сэргээнэ. Аппаар цагаа захиалж, QPay-ээр төлбөрөө хийгээрэй.',
      'hero.book': 'Цаг захиалах', 'hero.services': 'Үйлчилгээ үзэх',
      'hero.b1': '🌿 100% органик арчилгаа', 'hero.b2': '💎 Жинхэнэ хаш чулуу', 'hero.b3': '📱 Аппаар захиалга',
      'hero.rating_count': 'сэтгэгдэл',
      'about.title': 'Гуаша гэж юу вэ?',
      'about.sub': 'Гуаша бол хаш чулуугаар арьсыг зөөлөн иллэх, мянган жилийн түүхтэй дорно дахины арга юм.',
      'about.c1t': 'Чангалгаа ба тодорхой тойм', 'about.c1d': 'Нүүрний булчинг сэргээж, эрүү, хацрын ясны хэлбэрийг тодруулна.',
      'about.c2t': 'Хаван бууруулна', 'about.c2d': 'Лимфийн урсгалыг идэвхжүүлж, нүүрний хаван, нүдний банг багасгана.',
      'about.c3t': 'Цусны эргэлт', 'about.c3d': 'Арьсны эсийг хүчилтөрөгчөөр тэжээж, төрөлх гэрэлтэлтийг сэргээнэ.',
      'about.c4t': 'Гүн амралт', 'about.c4d': 'Стресс тайлж, толгойн өвдөлт, булчингийн чангаралтыг намдаана.',
      'svc.title': 'Үйлчилгээ ба үнэ',
      'svc.sub': 'Бүх үйлчилгээг аппаар захиалж, үлдэгдлээсээ, багцаасаа эсвэл салон дээр төлж болно.',
      'svc.sub_nw': 'Үйлчилгээгээ аппаар эсвэл утсаар захиалж, төлбөрөө салон дээр төлнө.',
      'svc.book': 'Цаг захиалах', 'svc.min': 'мин',
      'svc.g_facial': 'Нүүрний гуаша', 'svc.g_body': 'Биеийн гуаша', 'svc.g_other': 'Бусад',
      'svc.bundle_sessions': 'удаагийн багц', 'svc.bundle_valid': 'хоног хүчинтэй', 'svc.bundle_hint': 'Багцыг аппаас худалдан авна',
      'prod.title': 'Бид юу хэрэглэдэг вэ?',
      'prod.sub': 'Эмчилгээнд ашигладаг чулуу, бүтээгдэхүүн, төхөөрөмжүүд — болон тэдгээр нь арьсанд тань юу өгдөг тухай.',
      'prod.cat_tool': '💎 Багаж хэрэгсэл', 'prod.cat_product': '🧴 Бүтээгдэхүүн', 'prod.cat_machine': '⚙️ Төхөөрөмж', 'prod.cat_method': '🌿 Арга барил',
      'app.title': 'Таны гоо сайхны апп',
      'app.mock_balance': 'Үлдэгдэл', 'app.mock_book': 'Цаг захиалах', 'app.mock_gift': 'Бэлгийн карт ба багц', 'app.mock_chat': 'Салонтой чатлах',
      'app.f1t': '24/7 цаг захиалга', 'app.f1d': 'Дуртай ажилтнаа сонгоод чөлөөт цагийг шууд харна.',
      'app.f2t': 'Хэтэвч, багц, бэлгийн карт', 'app.f2d': 'QPay-ээр цэнэглэж, багц аваад хэмнэ. Найздаа бэлгийн карт илгээ.',
      'app.f3t': 'Чат ба сэтгэгдэл', 'app.f3d': 'Салонтой шууд чатлаж, үйлчилгээгээ үнэлээрэй.',
      'app.f4t': 'Явцын зураг — нууцлалтай', 'app.f4d': 'Үр дүнгээ зургаар хөтлөх бөгөөд нүдийг тань автоматаар халхалж хадгална.',
      'app.open': 'Апп нээх',
      'app.hint': 'Утсан дээрээ нээгээд “Нүүр дэлгэцэнд нэмэх” гэснээр жинхэнэ апп шиг суулгаж болно.',
      'steps.title': 'Хэрхэн ажилладаг вэ?',
      'steps.s1t': 'Захиалга', 'steps.s1d': 'Аппаар үйлчилгээ, ажилтан, өдөр цагаа сонгоно.',
      'steps.s2t': 'Эмчилгээ', 'steps.s2d': 'Салон дээр ирж, тайван орчинд гуаша эмчилгээгээ авна.',
      'steps.s3t': 'Үр дүн', 'steps.s3d': 'Үнэлгээгээ өгч, явцын зургаараа өөрчлөлтөө хянана.',
      'rev.title': 'Үйлчлүүлэгчдийн сэтгэгдэл',
      'rev.sub': 'Аппаар үйлчилгээ авсан хүмүүсийн бодит үнэлгээ.',
      'rev.empty': 'Эхний сэтгэгдлүүд удахгүй энд гарна — аппаар үйлчилгээ аваад үнэлгээ өгөөрэй! ⭐',
      'faq.title': 'Түгээмэл асуулт',
      'faq.q1': 'Хэр олон удаа хийлгэх вэ?', 'faq.a1': 'Эхний сард 7 хоногт 1–2 удаа, дараа нь сард 1–2 удаа хийлгэхэд үр дүн тогтвортой байдаг. 5 удаагийн багц хамгийн их үр дүнтэй.',
      'faq.q2': 'Өвддөг үү?', 'faq.a2': 'Үгүй. Нүүрний гуаша зөөлөн, тайвшруулах мэдрэмж төрүүлдэг. Биеийн гуаша булчингийн зангиралттай хэсэгт бага зэрэг эмзэг байж болно.',
      'faq.q3': 'Төлбөрөө яаж төлөх вэ?', 'faq.a3': 'Аппын хэтэвчээ QPay QR-ээр цэнэглэж төлөх, багц авах, бэлгийн карт ашиглах, эсвэл салон дээр бэлнээр/картаар төлж болно.',
      'faq.a3_nw': 'Салон дээр бэлнээр эсвэл картаар төлнө. Захиалгаа утсаар баталгаажуулна.',
      'faq.q4': 'Цагаа цуцалж болох уу?', 'faq.a4': 'Болно — цагаасаа 24 цагийн өмнө аппаараа цуцалбал төлбөр хэтэвчинд (багцын эрх багцад) бүрэн буцаан орно.',
      'faq.a4_nw': 'Болно — цагаасаа 24 цагийн өмнө аппаараа эсвэл утсаар цуцална уу.',
      'faq.q5': 'Бэлгийн карт яаж ажилладаг вэ?', 'faq.a5': 'Аппаасаа бэлгийн карт худалдан аваад кодыг нь хайртай хүндээ илгээнэ. Тэр хүн аппын "Код идэвхжүүлэх" хэсэгт оруулахад мөнгө хэтэвчинд нь шууд орно.',
      'contact.title': 'Холбоо барих',
      'contact.addr_t': '📍 Хаяг', 'contact.hours_t': '🕙 Ажиллах цаг', 'contact.call_t': '📞 Утас', 'contact.social_t': '💬 Сошиал',
      'contact.book_t': 'Цагаа шууд захиалаарай', 'contact.book_d': 'Бүртгүүлээд 1 минутын дотор цагаа баталгаажуулна.', 'contact.book_btn': 'Апп нээх',
      'footer.tag': 'Гоо сайхан, Эрүүл арьс, Итгэлтэй чи', 'footer.admin': 'Эзэмшигчийн хэсэг',
      'title': "B's Gua Sha — Гуаша гоо сайхны студи · Улаанбаатар"
    },
    en: {
      'nav.services': 'Services', 'nav.about': 'What is gua sha?', 'nav.products': 'Products', 'nav.reviews': 'Reviews', 'nav.app': 'App', 'nav.contact': 'Contact', 'nav.open_app': 'Open app',
      'hero.eyebrow': 'Naturally, Healthy and Beautiful',
      'hero.title': 'Naturally lifted,<br>glowing skin',
      'hero.sub': 'Traditional gua sha therapy — reduces puffiness, sculpts and firms the skin, and boosts circulation. Book in the app and pay with QPay.',
      'hero.book': 'Book now', 'hero.services': 'View services',
      'hero.b1': '🌿 100% organic care', 'hero.b2': '💎 Genuine jade stones', 'hero.b3': '📱 Book in the app',
      'hero.rating_count': 'reviews',
      'about.title': 'What is gua sha?',
      'about.sub': 'Gua sha is an East Asian technique with a thousand-year history: gentle strokes of a jade stone over the skin.',
      'about.c1t': 'Lift & sculpt', 'about.c1d': 'Revives facial muscles and defines the jawline and cheekbones.',
      'about.c2t': 'De-puffing', 'about.c2d': 'Activates lymphatic drainage to reduce facial puffiness and under-eye bags.',
      'about.c3t': 'Circulation', 'about.c3d': 'Feeds skin cells with oxygen and restores your natural glow.',
      'about.c4t': 'Deep relaxation', 'about.c4d': 'Relieves stress, headaches and muscle tension.',
      'svc.title': 'Services & prices',
      'svc.sub': 'Book any service in the app and pay from your balance, your bundle, or at the salon.',
      'svc.sub_nw': 'Book any service in the app or by phone, and pay at the salon.',
      'svc.book': 'Book now', 'svc.min': 'min',
      'svc.g_facial': 'Facial gua sha', 'svc.g_body': 'Body gua sha', 'svc.g_other': 'Other',
      'svc.bundle_sessions': 'session bundle', 'svc.bundle_valid': 'days valid', 'svc.bundle_hint': 'Buy bundles in the app',
      'prod.title': 'What we use',
      'prod.sub': 'The stones, products and devices used in your treatments — and what each one does for your skin.',
      'prod.cat_tool': '💎 Tools', 'prod.cat_product': '🧴 Products', 'prod.cat_machine': '⚙️ Devices', 'prod.cat_method': '🌿 Our approach',
      'app.title': 'Your beauty companion app',
      'app.mock_balance': 'Balance', 'app.mock_book': 'Book a visit', 'app.mock_gift': 'Gift cards & bundles', 'app.mock_chat': 'Chat with the salon',
      'app.f1t': 'Book 24/7', 'app.f1d': 'Pick your favourite therapist and see free slots live.',
      'app.f2t': 'Wallet, bundles & gift cards', 'app.f2d': 'Top up with QPay, save with bundles, send gift cards to friends.',
      'app.f3t': 'Chat & reviews', 'app.f3d': 'Message the salon directly and rate your treatments.',
      'app.f4t': 'Progress photos — private', 'app.f4d': 'Track your results with photos; your eyes are automatically covered before saving.',
      'app.open': 'Open the app',
      'app.hint': 'Open it on your phone and tap “Add to Home Screen” to install it like a real app.',
      'steps.title': 'How it works',
      'steps.s1t': 'Book', 'steps.s1d': 'Choose a service, therapist, day and time in the app.',
      'steps.s2t': 'Treatment', 'steps.s2d': 'Come to the salon and enjoy your gua sha ritual in a calm space.',
      'steps.s3t': 'Results', 'steps.s3d': 'Leave a review and track your change with progress photos.',
      'rev.title': 'What clients say',
      'rev.sub': 'Real ratings from people who booked through the app.',
      'rev.empty': 'First reviews will appear here soon — book a visit and rate it! ⭐',
      'faq.title': 'FAQ',
      'faq.q1': 'How often should I come?', 'faq.a1': '1–2 times a week for the first month, then 1–2 times a month for maintenance. A 5-session bundle gives the best results.',
      'faq.q2': 'Does it hurt?', 'faq.a2': 'No. Facial gua sha feels gentle and relaxing. Body gua sha can feel slightly tender over tight muscles.',
      'faq.q3': 'How can I pay?', 'faq.a3': 'Top up your in-app wallet with QPay, buy a bundle, redeem a gift card, or pay by cash/card at the salon.',
      'faq.a3_nw': 'Pay by cash or card at the salon. Orders are confirmed over the phone.',
      'faq.q4': 'Can I cancel a booking?', 'faq.a4': 'Yes — cancel in the app at least 24 hours before your time and the payment (or bundle session) is fully returned.',
      'faq.a4_nw': 'Yes — cancel in the app or by phone at least 24 hours before your appointment.',
      'faq.q5': 'How do gift cards work?', 'faq.a5': 'Buy a gift card in the app and send the code to someone special. They enter it under "Redeem a code" and the money lands in their wallet.',
      'contact.title': 'Contact',
      'contact.addr_t': '📍 Address', 'contact.hours_t': '🕙 Opening hours', 'contact.call_t': '📞 Phone', 'contact.social_t': '💬 Social',
      'contact.book_t': 'Book your time now', 'contact.book_d': 'Register and confirm your booking within a minute.', 'contact.book_btn': 'Open the app',
      'footer.tag': 'Naturally, Healthy and Beautiful', 'footer.admin': 'Owner area',
      'title': "B's Gua Sha — Gua sha beauty studio · Ulaanbaatar"
    }
  };

  var lang = localStorage.getItem('bg_lang') || 'mn';
  var theme = localStorage.getItem('bg_theme') || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  var services = null, bundles = null, edu = null, reviewsData = null;
  var featureWallet = false; /* from /api/config — the owner toggles it in the admin panel */

  function t(key) { return (DICT[lang] && DICT[lang][key]) || (DICT.mn[key] || key); }
  function money(n) { return (n || 0).toLocaleString('en-US') + '₮'; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function stars(n) { var o = ''; for (var i = 1; i <= 5; i++) o += i <= n ? '★' : '☆'; return o; }

  function applyLang() {
    document.documentElement.lang = lang;
    document.title = t('title');
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var k = el.getAttribute('data-i18n');
      /* a "_nw" variant is the wording used when the wallet is switched off */
      if (!featureWallet && DICT[lang] && DICT[lang][k + '_nw'] !== undefined) k += '_nw';
      el.innerHTML = t(k);
    });
    document.querySelectorAll('[data-wallet]').forEach(function (el) { el.hidden = !featureWallet; });
    var lb = document.getElementById('langBtn');
    if (lb) lb.textContent = lang === 'mn' ? 'EN' : 'МН';
    renderServices();
    renderBundles();
    renderEdu();
    renderReviews();
    updateAddr();
  }

  function applyTheme() {
    document.documentElement.setAttribute('data-theme', theme);
    var tb = document.getElementById('themeBtn');
    if (tb) tb.textContent = theme === 'dark' ? '☀️' : '🌙';
  }

  /* ---------- services ---------- */
  function renderServices() {
    var wrap = document.getElementById('servicesWrap');
    if (!wrap || !services) return;
    var groups = [
      { id: 'facial', label: t('svc.g_facial') },
      { id: 'body', label: t('svc.g_body') },
      { id: 'other', label: t('svc.g_other') }
    ];
    var html = '';
    groups.forEach(function (g) {
      var items = services.filter(function (s) { return s.group === g.id; });
      if (!items.length) return;
      html += '<h3 class="svc-group-title">' + g.label + '</h3><div class="svc-list">';
      items.forEach(function (s) {
        html += '<div class="svc-item">' +
          '<div class="svc-emoji">' + (s.emoji || '🌿') + '</div>' +
          '<div class="svc-body"><div class="svc-name">' + esc(lang === 'mn' ? s.nameMn : s.nameEn) + '</div>' +
          '<div class="svc-desc">' + esc(lang === 'mn' ? (s.descMn || '') : (s.descEn || '')) + '</div></div>' +
          '<div class="svc-meta"><div class="svc-price">' + money(s.price) + '</div>' +
          '<div class="svc-min">' + s.minutes + ' ' + t('svc.min') + '</div></div></div>';
      });
      html += '</div>';
    });
    wrap.innerHTML = html;
  }

  /* ---------- bundles ---------- */
  function renderBundles() {
    var wrap = document.getElementById('bundlesWrap');
    if (!wrap) return;
    if (!bundles || !bundles.length) { wrap.innerHTML = ''; return; }
    wrap.innerHTML = bundles.map(function (b) {
      return '<div class="bundle-box">' +
        '<div class="bn">' + (b.emoji || '🎁') + ' ' + esc(lang === 'mn' ? b.nameMn : b.nameEn) + '</div>' +
        '<div class="bd">' + esc(lang === 'mn' ? (b.descMn || '') : (b.descEn || '')) + '<br>' +
        b.sessions + ' ' + t('svc.bundle_sessions') + ' · ' + b.validDays + ' ' + t('svc.bundle_valid') + '</div>' +
        '<div class="bp">' + money(b.price) + '</div>' +
        '<p class="hint" style="margin-top:6px">' + t('svc.bundle_hint') + ' →</p></div>';
    }).join('');
  }

  /* ---------- education / products ---------- */
  var FALLBACK_EDU = [
    { category: 'tool', emoji: '💎', nameMn: 'Хаш гуаша чулуу', nameEn: 'Jade gua sha stone', descMn: 'Лимфийн урсгалыг идэвхжүүлж, нүүрний тоймыг тодруулна.', descEn: 'Activates lymphatic drainage and sculpts facial contours.' },
    { category: 'product', emoji: '🧖‍♀️', nameMn: 'Шавар маск', nameEn: 'Clay mask', descMn: 'Нүх сүвийг цэвэрлэж, илүүдэл тосыг шингээнэ.', descEn: 'Deep-cleans pores and absorbs excess oil.' },
    { category: 'product', emoji: '💧', nameMn: 'Тонер', nameEn: 'Toner', descMn: 'Арьсны pH тэнцвэрийг сэргээнэ.', descEn: 'Restores the skin pH balance.' },
    { category: 'machine', emoji: '💡', nameMn: 'LED гэрлэн эмчилгээ', nameEn: 'LED light therapy', descMn: 'Коллаген, сэргээлтийг дэмжинэ.', descEn: 'Supports collagen and recovery.' }
  ];

  function renderEdu() {
    var wrap = document.getElementById('eduWrap');
    if (!wrap) return;
    var list = (edu && edu.length) ? edu : (edu === null ? null : FALLBACK_EDU);
    if (!list) return;
    var cats = ['tool', 'product', 'machine', 'method'];
    var html = '';
    cats.forEach(function (cat) {
      var items = list.filter(function (x) { return x.category === cat; });
      if (!items.length) return;
      html += '<h3 class="edu-cat-title">' + t('prod.cat_' + cat) + '</h3><div class="edu-grid">' +
        items.map(function (it) {
          return '<div class="edu-card"><span class="ico">' + (it.emoji || '🌿') + '</span>' +
            '<div class="nm">' + esc(lang === 'mn' ? it.nameMn : it.nameEn) + '</div>' +
            '<div class="ds">' + esc(lang === 'mn' ? (it.descMn || '') : (it.descEn || '')) + '</div></div>';
        }).join('') + '</div>';
    });
    wrap.innerHTML = html;
  }

  /* ---------- reviews ---------- */
  function renderReviews() {
    var wrap = document.getElementById('reviewsWrap');
    if (!wrap) return;
    if (reviewsData === null) return;
    var list = reviewsData ? reviewsData.reviews : [];
    if (!list.length) {
      wrap.innerHTML = '<div class="card" style="grid-column:1/-1;text-align:center"><p>' + t('rev.empty') + '</p></div>';
      return;
    }
    wrap.innerHTML = list.slice(0, 9).map(function (r) {
      var svcName = lang === 'mn' ? r.serviceMn : r.serviceEn;
      return '<div class="card review">' +
        '<span class="st">' + stars(r.rating) + '</span>' +
        (r.text ? '<p>«' + esc(r.text) + '»</p>' : '') +
        '<span class="who">— ' + esc(r.name) + (svcName ? ' <span class="svc">· ' + esc(svcName) + '</span>' : '') + '</span></div>';
    }).join('');
    var hr = document.getElementById('heroRating');
    if (hr && reviewsData.count) {
      hr.hidden = false;
      hr.querySelector('.st').textContent = stars(Math.round(reviewsData.average));
      document.getElementById('heroRatingTxt').textContent = reviewsData.average + ' · ' + reviewsData.count + ' ' + t('hero.rating_count');
    }
  }

  /* ---------- data loading ---------- */
  function loadConfig() {
    fetch('/api/config').then(function (r) { return r.json(); }).then(function (c) {
      var addr = document.getElementById('contactAddr');
      if (addr) { addr.dataset.en = c.addressEn; addr.dataset.mn = c.addressMn; updateAddr(); }
      var hours = document.getElementById('contactHours');
      if (hours) hours.textContent = c.hoursOpen + ' – ' + c.hoursClose;
      var ph = document.getElementById('contactPhone');
      if (ph) { ph.textContent = c.phoneDisplay; ph.href = 'tel:' + c.phoneTel; }
      var em = document.getElementById('contactEmail');
      if (em && c.email) { em.textContent = c.email; em.href = 'mailto:' + c.email; }
      var fb = document.getElementById('contactFb');
      if (fb && c.facebook) fb.href = c.facebook;
      window.__cfg = c;
      featureWallet = c.featureWallet === true;
      applyLang();
    }).catch(function () {});
  }
  function updateAddr() {
    var addr = document.getElementById('contactAddr');
    if (addr && addr.dataset.mn) addr.textContent = lang === 'mn' ? addr.dataset.mn : addr.dataset.en;
  }

  function loadAll() {
    fetch('/api/services').then(function (r) { return r.json(); }).then(function (list) {
      services = Array.isArray(list) ? list : [];
      renderServices();
    }).catch(function () { services = []; renderServices(); });
    fetch('/api/bundles').then(function (r) { return r.json(); }).then(function (list) {
      bundles = Array.isArray(list) ? list : [];
      renderBundles();
    }).catch(function () { bundles = []; renderBundles(); });
    fetch('/api/public/edu').then(function (r) { return r.json(); }).then(function (list) {
      edu = (Array.isArray(list) && list.length) ? list : FALLBACK_EDU;
      renderEdu();
    }).catch(function () { edu = FALLBACK_EDU; renderEdu(); });
    fetch('/api/public/reviews').then(function (r) { return r.json(); }).then(function (d) {
      reviewsData = d && d.reviews ? d : { average: 0, count: 0, reviews: [] };
      renderReviews();
    }).catch(function () { reviewsData = { average: 0, count: 0, reviews: [] }; renderReviews(); });
  }

  /* ---------- events ---------- */
  document.getElementById('langBtn').addEventListener('click', function () {
    lang = lang === 'mn' ? 'en' : 'mn';
    localStorage.setItem('bg_lang', lang);
    applyLang();
  });
  document.getElementById('themeBtn').addEventListener('click', function () {
    theme = theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('bg_theme', theme);
    applyTheme();
  });
  var burger = document.getElementById('burger');
  var nav = document.getElementById('siteNav');
  burger.addEventListener('click', function () { nav.classList.toggle('open'); });
  nav.addEventListener('click', function () { nav.classList.remove('open'); });

  document.getElementById('year').textContent = new Date().getFullYear();

  /* ---------- init ---------- */
  applyTheme();
  applyLang();
  loadConfig();
  loadAll();
})();
