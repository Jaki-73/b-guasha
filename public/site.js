/* B's Guasha — site script: i18n (MN/EN), theme, services rendering */
(function () {
  'use strict';

  /* ---------- translations ---------- */
  var DICT = {
    mn: {
      'nav.services': 'Үйлчилгээ', 'nav.about': 'Гуаша гэж юу вэ?', 'nav.app': 'Апп', 'nav.contact': 'Холбоо барих', 'nav.open_app': 'Апп нээх',
      'hero.eyebrow': 'Нүүр ба биеийн гуаша · Улаанбаатар',
      'hero.title': 'Байгалийн аргаар<br>залуу, гэрэлтсэн арьс',
      'hero.sub': 'Уламжлалт гуаша эмчилгээ — нүүрний хаван бууруулж, арьсыг чангалж, цусны эргэлтийг сэргээнэ. Аппаар цагаа захиалж, QPay-ээр төлбөрөө хийгээрэй.',
      'hero.book': 'Цаг захиалах', 'hero.services': 'Үйлчилгээ үзэх',
      'hero.b1': '🌿 100% гар аргаар', 'hero.b2': '💎 Жинхэнэ хаш чулуу', 'hero.b3': '📱 Аппаар захиалга',
      'about.title': 'Гуаша гэж юу вэ?',
      'about.sub': 'Гуаша бол хаш чулуугаар арьсыг зөөлөн иллэх, мянган жилийн түүхтэй дорно дахины арга юм.',
      'about.c1t': 'Чангалгаа ба тодорхой тойм', 'about.c1d': 'Нүүрний булчинг сэргээж, эрүү, хацрын ясны хэлбэрийг тодруулна.',
      'about.c2t': 'Хаван бууруулна', 'about.c2d': 'Лимфийн урсгалыг идэвхжүүлж, нүүрний хаван, нүдний банг багасгана.',
      'about.c3t': 'Цусны эргэлт', 'about.c3d': 'Арьсны эсийг хүчилтөрөгчөөр тэжээж, төрөлх гэрэлтэлтийг сэргээнэ.',
      'about.c4t': 'Гүн амралт', 'about.c4d': 'Стресс тайлж, толгойн өвдөлт, булчингийн чангаралтыг намдаана.',
      'svc.title': 'Үйлчилгээ ба үнэ',
      'svc.sub': 'Бүх үйлчилгээг аппаар захиалж, үлдэгдлээсээ эсвэл салон дээр төлж болно.',
      'svc.book': 'Цаг захиалах', 'svc.min': 'мин',
      'svc.g_facial': 'Нүүрний гуаша', 'svc.g_body': 'Биеийн гуаша', 'svc.g_package': 'Курс ба багц',
      'app.title': 'Таны гоо сайхны апп',
      'app.mock_balance': 'Үлдэгдэл', 'app.mock_book': 'Цаг захиалах', 'app.mock_topup': 'QPay цэнэглэлт', 'app.mock_photo': 'Явцын зураг',
      'app.f1t': '24/7 цаг захиалга', 'app.f1d': 'Чөлөөт цагуудыг шууд харж, өөрт тохирохыг сонгоно.',
      'app.f2t': 'Хэтэвч ба QPay', 'app.f2d': 'QR кодоор цэнэглээд урамшуулал аваарай — 100,000₮-с дээш цэнэглэлтэд +5% бонус.',
      'app.f3t': 'Явцын зураг — нууцлалтай', 'app.f3d': 'Эмчилгээний үр дүнгээ зургаар хөтлөх бөгөөд нүдийг тань автоматаар халхалж хадгална.',
      'app.f4t': 'Монгол / English · Хар, цайвар горим', 'app.f4d': 'Өөрийн хэл, харагдах байдлаа сонгоорой.',
      'app.open': 'Апп нээх',
      'app.hint': 'Утсан дээрээ нээгээд “Нүүр дэлгэцэнд нэмэх” гэснээр жинхэнэ апп шиг суулгаж болно.',
      'steps.title': 'Хэрхэн ажилладаг вэ?',
      'steps.s1t': 'Захиалга', 'steps.s1d': 'Аппаар үйлчилгээ, өдөр, цагаа сонгоно.',
      'steps.s2t': 'Эмчилгээ', 'steps.s2d': 'Салон дээр ирж, тайван орчинд гуаша эмчилгээгээ авна.',
      'steps.s3t': 'Үр дүн', 'steps.s3d': 'Явцын зургаараа өөрчлөлтөө хянаж, дараагийн цагаа товлоно.',
      'rev.title': 'Сэтгэгдэл',
      'rev.r1': '«3 удаагийн дараа нүүрний хаван илт багасч, эрүүний тойм тодорсон. Ажлын дараа очиход хамгийн сайхан амралт.»',
      'rev.r2': '«Мөр хүзүүний чангаралт арилаад унтлага сайжирсан. Аппаар захиалга хийхэд маш амар.»',
      'rev.r3': '«Арьс минь гэрэлтэж, будалтгүйгээр гарах болсон. Явцын зургаа харьцуулахад өөрчлөлт нь харагддаг нь мотивац өгдөг.»',
      'rev.note': '* Жишээ сэтгэгдэл — өөрийн үйлчлүүлэгчдийн бодит сэтгэгдлээр солиорой.',
      'faq.title': 'Түгээмэл асуулт',
      'faq.q1': 'Хэр олон удаа хийлгэх вэ?', 'faq.a1': 'Эхний сард 7 хоногт 1–2 удаа, дараа нь сард 1–2 удаа хийлгэхэд үр дүн тогтвортой байдаг. 5 удаагийн курс хамгийн их үр дүнтэй.',
      'faq.q2': 'Өвддөг үү?', 'faq.a2': 'Үгүй. Нүүрний гуаша зөөлөн, тайвшруулах мэдрэмж төрүүлдэг. Биеийн гуаша булчингийн зангиралттай хэсэгт бага зэрэг эмзэг байж болно.',
      'faq.q3': 'Төлбөрөө яаж төлөх вэ?', 'faq.a3': 'Аппын хэтэвчээ QPay QR-ээр цэнэглэж захиалгадаа ашиглах, эсвэл салон дээр бэлнээр/картаар төлж болно.',
      'faq.q4': 'Цагаа цуцалж болох уу?', 'faq.a4': 'Болно — цагаасаа 24 цагийн өмнө аппаараа цуцалбал төлбөр хэтэвчинд бүрэн буцаан орно.',
      'contact.title': 'Холбоо барих',
      'contact.addr_t': '📍 Хаяг', 'contact.hours_t': '🕙 Ажиллах цаг', 'contact.call_t': '📞 Утас', 'contact.social_t': '💬 Сошиал',
      'contact.book_t': 'Цагаа шууд захиалаарай', 'contact.book_d': 'Бүртгүүлээд 1 минутын дотор цагаа баталгаажуулна.', 'contact.book_btn': 'Апп нээх',
      'footer.tag': 'Гоо сайхан · Тэнцвэр · Гэрэлтэлт', 'footer.admin': 'Эзэмшигчийн хэсэг',
      'title': "B's Guasha — Гуаша гоо сайхны студи · Улаанбаатар"
    },
    en: {
      'nav.services': 'Services', 'nav.about': 'What is gua sha?', 'nav.app': 'App', 'nav.contact': 'Contact', 'nav.open_app': 'Open app',
      'hero.eyebrow': 'Facial & body gua sha · Ulaanbaatar',
      'hero.title': 'Naturally lifted,<br>glowing skin',
      'hero.sub': 'Traditional gua sha therapy — reduces puffiness, sculpts and firms the skin, and boosts circulation. Book in the app and pay with QPay.',
      'hero.book': 'Book now', 'hero.services': 'View services',
      'hero.b1': '🌿 100% by hand', 'hero.b2': '💎 Genuine jade stones', 'hero.b3': '📱 Book in the app',
      'about.title': 'What is gua sha?',
      'about.sub': 'Gua sha is an East Asian technique with a thousand-year history: gentle strokes of a jade stone over the skin.',
      'about.c1t': 'Lift & sculpt', 'about.c1d': 'Revives facial muscles and defines the jawline and cheekbones.',
      'about.c2t': 'De-puffing', 'about.c2d': 'Activates lymphatic drainage to reduce facial puffiness and under-eye bags.',
      'about.c3t': 'Circulation', 'about.c3d': 'Feeds skin cells with oxygen and restores your natural glow.',
      'about.c4t': 'Deep relaxation', 'about.c4d': 'Relieves stress, headaches and muscle tension.',
      'svc.title': 'Services & prices',
      'svc.sub': 'Book any service in the app and pay from your balance or at the salon.',
      'svc.book': 'Book now', 'svc.min': 'min',
      'svc.g_facial': 'Facial gua sha', 'svc.g_body': 'Body gua sha', 'svc.g_package': 'Courses & packages',
      'app.title': 'Your beauty companion app',
      'app.mock_balance': 'Balance', 'app.mock_book': 'Book a visit', 'app.mock_topup': 'QPay top-up', 'app.mock_photo': 'Progress photos',
      'app.f1t': 'Book 24/7', 'app.f1d': 'See free time slots live and pick what suits you.',
      'app.f2t': 'Wallet & QPay', 'app.f2d': 'Top up by QR code and get rewarded — +5% bonus on top-ups over 100,000₮.',
      'app.f3t': 'Progress photos — private', 'app.f3d': 'Track your results with photos; your eyes are automatically covered before saving.',
      'app.f4t': 'Mongolian / English · Dark & light mode', 'app.f4d': 'Choose your own language and look.',
      'app.open': 'Open the app',
      'app.hint': 'Open it on your phone and tap “Add to Home Screen” to install it like a real app.',
      'steps.title': 'How it works',
      'steps.s1t': 'Book', 'steps.s1d': 'Choose a service, day and time in the app.',
      'steps.s2t': 'Treatment', 'steps.s2d': 'Come to the salon and enjoy your gua sha ritual in a calm space.',
      'steps.s3t': 'Results', 'steps.s3d': 'Track your change with progress photos and book your next visit.',
      'rev.title': 'Reviews',
      'rev.r1': '“After 3 sessions my facial puffiness clearly went down and my jawline looks defined. The best way to unwind after work.”',
      'rev.r2': '“My neck and shoulder tension is gone and I sleep better. Booking through the app is so easy.”',
      'rev.r3': '“My skin glows and I go out without makeup now. Comparing my progress photos keeps me motivated.”',
      'rev.note': '* Sample reviews — replace with real words from your clients.',
      'faq.title': 'FAQ',
      'faq.q1': 'How often should I come?', 'faq.a1': '1–2 times a week for the first month, then 1–2 times a month for maintenance. A 5-session course gives the best results.',
      'faq.q2': 'Does it hurt?', 'faq.a2': 'No. Facial gua sha feels gentle and relaxing. Body gua sha can feel slightly tender over tight muscles.',
      'faq.q3': 'How can I pay?', 'faq.a3': 'Top up your in-app wallet with a QPay QR code and pay from your balance, or pay by cash/card at the salon.',
      'faq.q4': 'Can I cancel a booking?', 'faq.a4': 'Yes — cancel in the app at least 24 hours before your time and the payment is fully refunded to your wallet.',
      'contact.title': 'Contact',
      'contact.addr_t': '📍 Address', 'contact.hours_t': '🕙 Opening hours', 'contact.call_t': '📞 Phone', 'contact.social_t': '💬 Social',
      'contact.book_t': 'Book your time now', 'contact.book_d': 'Register and confirm your booking within a minute.', 'contact.book_btn': 'Open the app',
      'footer.tag': 'Beauty · Balance · Glow', 'footer.admin': 'Owner area',
      'title': "B's Guasha — Gua sha beauty studio · Ulaanbaatar"
    }
  };

  /* ---------- fallback services (used if the API is unreachable, e.g. static hosting) ---------- */
  var FALLBACK_SERVICES = [
    { group: 'facial', nameEn: 'Signature Facial Gua Sha', nameMn: 'Нүүрний гуаша — сигнатур', minutes: 60, price: 90000, emoji: '🌿', descEn: 'Deep lifting facial: cleanse, oil, full gua sha sculpting, lymph drainage.', descMn: 'Гүн чангалгаатай иж бүрэн эмчилгээ: цэвэрлэгээ, тос, гуаша массаж, лимфийн урсгал сайжруулна.' },
    { group: 'facial', nameEn: 'Express Glow', nameMn: 'Экспресс гэрэлтэлт', minutes: 30, price: 50000, emoji: '✨', descEn: 'Quick refresh for eyes, jawline and cheekbones.', descMn: 'Нүд, эрүү, хацрын ясыг түргэн сэргээнэ.' },
    { group: 'facial', nameEn: 'Deluxe Lift & Sculpt', nameMn: 'Делюкс чангалгаа', minutes: 75, price: 130000, emoji: '👑', descEn: 'Signature facial + neck & décolleté + finishing mask.', descMn: 'Сигнатур эмчилгээ + хүзүү, эгэмний хэсэг + маск.' },
    { group: 'body', nameEn: 'Back, Neck & Shoulder Release', nameMn: 'Нуруу, хүзүү, мөрний гуаша', minutes: 45, price: 70000, emoji: '💆', descEn: 'Releases tension in the upper back, neck and shoulders.', descMn: 'Нуруу, хүзүү, мөрний чангаралтыг тавиулна.' },
    { group: 'body', nameEn: 'Therapeutic Body Gua Sha', nameMn: 'Биеийн гуаша эмчилгээ', minutes: 60, price: 95000, emoji: '🌀', descEn: 'Targeted body work to boost circulation and ease muscle pain.', descMn: 'Цусны эргэлтийг сайжруулж, булчингийн өвдөлтийг намдаана.' },
    { group: 'body', nameEn: 'Full Body Renewal', nameMn: 'Бүтэн биеийн гуаша', minutes: 90, price: 140000, emoji: '🌙', descEn: 'Head-to-toe gua sha ritual for deep relaxation.', descMn: 'Бүх биеийн иж бүрэн гуаша — гүн амралт, сэргэлт.' },
    { group: 'package', nameEn: 'Facial Course — 5 sessions', nameMn: 'Нүүрний курс — 5 удаа', minutes: 60, price: 400000, emoji: '🎁', descEn: '5 signature facials (save 50,000₮).', descMn: 'Сигнатур эмчилгээ 5 удаа (50,000₮ хэмнэнэ).' }
  ];

  var lang = localStorage.getItem('bg_lang') || 'mn';
  var theme = localStorage.getItem('bg_theme') || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  var services = null;

  function t(key) { return (DICT[lang] && DICT[lang][key]) || (DICT.mn[key] || key); }
  function money(n) { return n.toLocaleString('en-US') + '₮'; }

  function applyLang() {
    document.documentElement.lang = lang;
    document.title = t('title');
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      el.innerHTML = t(el.getAttribute('data-i18n'));
    });
    var lb = document.getElementById('langBtn');
    if (lb) lb.textContent = lang === 'mn' ? 'EN' : 'МН';
    renderServices();
  }

  function applyTheme() {
    document.documentElement.setAttribute('data-theme', theme);
    var tb = document.getElementById('themeBtn');
    if (tb) tb.textContent = theme === 'dark' ? '☀️' : '🌙';
  }

  function renderServices() {
    var wrap = document.getElementById('servicesWrap');
    if (!wrap || !services) return;
    var groups = [
      { id: 'facial', label: t('svc.g_facial') },
      { id: 'body', label: t('svc.g_body') },
      { id: 'package', label: t('svc.g_package') }
    ];
    var html = '';
    groups.forEach(function (g) {
      var items = services.filter(function (s) { return s.group === g.id; });
      if (!items.length) return;
      html += '<h3 class="svc-group-title">' + g.label + '</h3><div class="svc-list">';
      items.forEach(function (s) {
        html += '<div class="svc-item">' +
          '<div class="svc-emoji">' + (s.emoji || '🌿') + '</div>' +
          '<div class="svc-body"><div class="svc-name">' + (lang === 'mn' ? s.nameMn : s.nameEn) + '</div>' +
          '<div class="svc-desc">' + (lang === 'mn' ? (s.descMn || '') : (s.descEn || '')) + '</div></div>' +
          '<div class="svc-meta"><div class="svc-price">' + money(s.price) + '</div>' +
          '<div class="svc-min">' + s.minutes + ' ' + t('svc.min') + '</div></div></div>';
      });
      html += '</div>';
    });
    wrap.innerHTML = html;
  }

  function loadConfig() {
    fetch('/api/config').then(function (r) { return r.json(); }).then(function (c) {
      var addr = document.getElementById('contactAddr');
      if (addr) addr.dataset.en = c.addressEn, addr.dataset.mn = c.addressMn, updateAddr();
      var hours = document.getElementById('contactHours');
      if (hours) hours.textContent = c.hoursOpen + ' – ' + c.hoursClose;
      var ph = document.getElementById('contactPhone');
      if (ph) { ph.textContent = c.phoneDisplay; ph.href = 'tel:' + c.phoneTel; }
      var fb = document.getElementById('contactFb');
      if (fb && c.facebook) fb.href = c.facebook;
      window.__cfg = c;
    }).catch(function () {});
  }
  function updateAddr() {
    var addr = document.getElementById('contactAddr');
    if (addr && addr.dataset.mn) addr.textContent = lang === 'mn' ? addr.dataset.mn : addr.dataset.en;
  }

  function loadServices() {
    fetch('/api/services').then(function (r) { return r.json(); }).then(function (list) {
      services = (Array.isArray(list) && list.length) ? list : FALLBACK_SERVICES;
      renderServices();
    }).catch(function () {
      services = FALLBACK_SERVICES;
      renderServices();
    });
  }

  /* ---------- events ---------- */
  document.getElementById('langBtn').addEventListener('click', function () {
    lang = lang === 'mn' ? 'en' : 'mn';
    localStorage.setItem('bg_lang', lang);
    applyLang();
    updateAddr();
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
  loadServices();
})();
