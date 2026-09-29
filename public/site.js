/* B's Gua Sha — site script: i18n (MN/EN), theme, services, reviews, products, FAQ,
   plus the phone-only behaviour (burger menu, bottom action bar). */
(function () {
  'use strict';

  /* ---------- translations ----------
     A key ending in "_nw" is the wording used while the wallet is switched off. */
  var DICT = {
    mn: {
      'title': "B's Gua Sha — Гуаша гоо сайхны студи · Улаанбаатар",
      'nav.skip': 'Үндсэн агуулга руу',
      'nav.services': 'Үйлчилгээ', 'nav.reviews': 'Сэтгэгдэл', 'nav.visit': 'Анхны айлчлал', 'nav.products': 'Бүтээгдэхүүн',
      'nav.faq': 'Асуулт', 'nav.contact': 'Холбоо барих', 'nav.book': 'Цаг захиалах', 'nav.open_app': 'Апп нээх',
      'bar.call': '📞 Залгах', 'bar.book': 'Цаг захиалах',

      'hero.eyebrow': 'Гоо сайхан, Эрүүл арьс, Итгэлтэй чи',
      'hero.title': 'Байгалийн аргаар<br><em>гэрэлтсэн, чангарсан</em> арьс',
      'hero.sub': 'Хаш чулуун гуаша эмчилгээ хаваныг бууруулж, нүүрний тоймыг тодруулан, цусны эргэлтийг сэргээнэ. Цагаа аппаар 1 минутад захиалж, QPay-ээр төлөөрэй.',
      'hero.sub_nw': 'Хаш чулуун гуаша эмчилгээ хаваныг бууруулж, нүүрний тоймыг тодруулан, цусны эргэлтийг сэргээнэ. Цагаа аппаар 1 минутад захиалж, төлбөрөө салон дээр төлнө.',
      'hero.book': 'Цаг захиалах', 'hero.services': 'Үйлчилгээ, үнэ',
      'hero.t1': '🌿 100% органик', 'hero.t2': '💎 Жинхэнэ хаш чулуу', 'hero.t3': '📱 24/7 онлайн захиалга',
      'hero.float_t': 'Онлайн захиалга', 'hero.float_d': 'Чөлөөтэй цагаа шууд харна',
      'hero.rating_count': 'сэтгэгдэл',

      'about.kicker': 'Гуаша гэж юу вэ?',
      'about.title': 'Гуаша танд юу өгөх вэ?',
      'about.sub': 'Хаш чулуугаар арьсыг зөөлөн иллэх, мянган жилийн түүхтэй дорно дахины арга — орчин үеийн арьс арчилгаатай хослуулсан.',
      'about.c1t': 'Чангалгаа ба тойм', 'about.c1d': 'Нүүрний булчинг сэргээж, эрүү, хацрын ясны хэлбэрийг тодруулна.',
      'about.c2t': 'Хаван бууруулна', 'about.c2d': 'Лимфийн урсгалыг дэмжиж, нүүрний хаван, нүдний доорх банг багасгана.',
      'about.c3t': 'Төрөлх гэрэлтэлт', 'about.c3d': 'Цусны эргэлтийг сэргээж, арьсыг тэжээн, эрүүл өнгө оруулна.',
      'about.c4t': 'Гүн амралт', 'about.c4d': 'Стресс тайлж, толгой өвдөх, мөр хүзүү чангарахыг намдаана.',

      'svc.kicker': 'Үнийн жагсаалт',
      'svc.title': 'Үйлчилгээ ба үнэ',
      'svc.sub': 'Аппаар захиалж, үлдэгдэл, багцаасаа эсвэл салон дээр төлнө.',
      'svc.sub_nw': 'Аппаар эсвэл утсаар захиалж, төлбөрөө салон дээр төлнө.',
      'svc.all': 'Бүгд', 'svc.g_facial': 'Нүүрний гуаша', 'svc.g_body': 'Биеийн гуаша', 'svc.g_other': 'Бусад',
      'svc.min': 'мин', 'svc.book': 'Захиалах →', 'svc.empty': 'Үйлчилгээ удахгүй нэмэгдэнэ.',
      'svc.bundle_sessions': 'удаа', 'svc.bundle_valid': 'хоног хүчинтэй', 'svc.bundle_hint': 'аппаас авна',

      'rev.kicker': 'Сэтгэгдэл',
      'rev.title': 'Үйлчлүүлэгчид юу гэж хэлэв',
      'rev.sub': 'Аппаар үйлчилгээ авсан хүмүүсийн үнэлгээ. Сэтгэгдэл бүрийг нийтлэхээс өмнө шалгадаг.',
      'rev.out_of': '/ 5', 'rev.based': 'сэтгэгдэл',
      'rev.cta': 'Манайд үйлчлүүлсэн үү? Үйлчилгээгээ аппаас үнэлээрэй.', 'rev.cta_btn': 'Үнэлгээ өгөх',
      'rev.verified': '✓ Апп-аар захиалсан',
      'rev.empty': 'Эхний сэтгэгдлүүд удахгүй энд гарна — аппаар үйлчилгээ аваад үнэлгээ өгөөрэй! ⭐',
      'rev.swipe': 'Гүйлгэж үзнэ үү →', 'rev.more': 'Бүх сэтгэгдлийг харах', 'rev.less': 'Цөөнийг харуулах',
      'rev.today': 'өнөөдөр', 'rev.yesterday': 'өчигдөр', 'rev.days': 'хоногийн өмнө', 'rev.weeks': '7 хоногийн өмнө', 'rev.months': 'сарын өмнө',

      'visit.kicker': 'Хэрхэн явагддаг вэ?',
      'visit.title': 'Анхны айлчлал тань',
      'visit.sub': 'Юу болохыг урьдчилан мэдвэл илүү тайван байна.',
      'visit.s1t': 'Захиалга', 'visit.s1d': 'Апп-аар 24/7 эсвэл утсаар үйлчилгээ, ажилтан, цагаа сонгоно.',
      'visit.s2t': 'Ирэх', 'visit.s2d': 'Цагаасаа 5–10 минутын өмнө ирж, арьс, харшлынхаа талаар хэлнэ.',
      'visit.s3t': 'Эмчилгээ', 'visit.s3d': 'Цэвэрлэгээ, тос, гуаша массаж, маск — тайван орчинд 30–90 минут.',
      'visit.s4t': 'Үр дүн ба арчилгаа', 'visit.s4d': 'Гэрийн арчилгааны зөвлөгөө авч, явцын зургаараа өөрчлөлтөө хянана.',

      'prod.kicker': 'Ил тод байдал',
      'prod.title': 'Бидний хэрэглэдэг зүйлс',
      'prod.sub': 'Арьсанд тань хүрч буй бүхнийг танилцуулъя — чулуу, бүтээгдэхүүн, төхөөрөмж, тэдгээрийн үйлчилгээ.',
      'prod.all': 'Бүгд', 'prod.cat_tool': 'Багаж', 'prod.cat_product': 'Бүтээгдэхүүн', 'prod.cat_machine': 'Төхөөрөмж', 'prod.cat_method': 'Арга барил',

      'app.kicker': 'Апп',
      'app.title': 'Гоо сайхны туслах тань — халаасанд',
      'app.mock_balance': 'Үлдэгдэл', 'app.mock_book': 'Цаг захиалах', 'app.mock_gift': 'Бэлгийн карт ба багц', 'app.mock_chat': 'Салонтой чатлах', 'app.mock_photo': 'Явцын зураг',
      'app.f1t': '24/7 цаг захиалга', 'app.f1d': 'Дуртай ажилтнаа сонгоод чөлөөт цагийг шууд харна.',
      'app.f2t': 'Хэтэвч, багц, бэлгийн карт', 'app.f2d': 'QPay-ээр цэнэглэж, багц аваад хэмнэ. Найздаа бэлгийн карт илгээ.',
      'app.f3t': 'Чат ба сэтгэгдэл', 'app.f3d': 'Салонтой шууд чатлаж, үйлчилгээгээ үнэлээрэй.',
      'app.f4t': 'Явцын зураг — нууцлалтай', 'app.f4d': 'Үр дүнгээ зургаар хөтлөх бөгөөд нүдийг тань автоматаар халхалж хадгална.',
      'app.open': 'Апп нээх',
      'app.hint': 'Утсан дээрээ нээгээд “Нүүр дэлгэцэнд нэмэх” гэснээр жинхэнэ апп шиг суулгаж болно.',

      'faq.kicker': 'Асуулт хариулт',
      'faq.title': 'Түгээмэл асуулт',
      'faq.sub': 'Эмчилгээ, захиалга, арчилгааны талаар хамгийн их асуудаг асуултууд.',
      'faq.all': 'Бүгд', 'faq.g_treatment': 'Эмчилгээ', 'faq.g_booking': 'Захиалга ба төлбөр', 'faq.g_care': 'Бэлтгэл ба арчилгаа',
      'faq.help_t': 'Хариултаа олсонгүй юу?', 'faq.help_d': 'Бидэнтэй шууд холбогдоорой — баяртай туслана.',
      'faq.call': '📞 Залгах', 'faq.chat': '💬 Апп-аар бичих',

      'contact.kicker': 'Холбоо барих',
      'contact.title': 'Биднийг олох',
      'contact.addr_t': 'Хаяг', 'contact.map': 'Газрын зураг дээр харах ↗', 'contact.hours_t': 'Ажиллах цаг', 'contact.hours_daily': 'Өдөр бүр',
      'contact.call_t': 'Утас', 'contact.book_phones': 'Цаг авах', 'contact.email_t': 'Имэйл', 'contact.social_t': 'Сошиал',
      'contact.book_t': 'Цагаа одоо захиалаарай', 'contact.book_d': 'Бүртгүүлээд 1 минутад цагаа баталгаажуулна.', 'contact.book_btn': 'Цаг захиалах',

      'footer.tag': 'Гоо сайхан, Эрүүл арьс, Итгэлтэй чи', 'footer.menu': 'Цэс', 'footer.contact': 'Холбоо барих', 'footer.admin': 'Удирдлагын хэсэг'
    },
    en: {
      'title': "B's Gua Sha — Gua sha beauty studio · Ulaanbaatar",
      'nav.skip': 'Skip to content',
      'nav.services': 'Services', 'nav.reviews': 'Reviews', 'nav.visit': 'First visit', 'nav.products': 'Products',
      'nav.faq': 'FAQ', 'nav.contact': 'Contact', 'nav.book': 'Book now', 'nav.open_app': 'Open the app',
      'bar.call': '📞 Call', 'bar.book': 'Book now',

      'hero.eyebrow': 'Naturally, Healthy and Beautiful',
      'hero.title': 'Naturally lifted,<br><em>glowing</em> skin',
      'hero.sub': 'Jade gua sha reduces puffiness, sculpts your contours and revives circulation. Book in the app in a minute and pay with QPay.',
      'hero.sub_nw': 'Jade gua sha reduces puffiness, sculpts your contours and revives circulation. Book in the app in a minute and pay at the salon.',
      'hero.book': 'Book a visit', 'hero.services': 'Services & prices',
      'hero.t1': '🌿 100% organic', 'hero.t2': '💎 Genuine jade', 'hero.t3': '📱 Book online 24/7',
      'hero.float_t': 'Online booking', 'hero.float_d': 'See free slots instantly',
      'hero.rating_count': 'reviews',

      'about.kicker': 'What is gua sha?',
      'about.title': 'What gua sha does for you',
      'about.sub': 'A thousand-year-old East Asian ritual of gentle jade strokes — paired with modern skincare.',
      'about.c1t': 'Lift & sculpt', 'about.c1d': 'Revives facial muscles and defines the jawline and cheekbones.',
      'about.c2t': 'De-puffing', 'about.c2d': 'Encourages lymphatic flow to reduce facial puffiness and under-eye bags.',
      'about.c3t': 'Natural glow', 'about.c3d': 'Boosts circulation, nourishes the skin and brings back a healthy colour.',
      'about.c4t': 'Deep relaxation', 'about.c4d': 'Melts stress and eases headaches and tight neck and shoulders.',

      'svc.kicker': 'Price list',
      'svc.title': 'Services & prices',
      'svc.sub': 'Book in the app and pay from your balance, a bundle, or at the salon.',
      'svc.sub_nw': 'Book in the app or by phone, and pay at the salon.',
      'svc.all': 'All', 'svc.g_facial': 'Facial gua sha', 'svc.g_body': 'Body gua sha', 'svc.g_other': 'Other',
      'svc.min': 'min', 'svc.book': 'Book →', 'svc.empty': 'Services are coming soon.',
      'svc.bundle_sessions': 'sessions', 'svc.bundle_valid': 'days valid', 'svc.bundle_hint': 'in the app',

      'rev.kicker': 'Reviews',
      'rev.title': 'What clients say',
      'rev.sub': 'Ratings from people who booked through the app. Every review is checked before it is published.',
      'rev.out_of': '/ 5', 'rev.based': 'reviews',
      'rev.cta': 'Visited us? Rate your treatment in the app.', 'rev.cta_btn': 'Leave a review',
      'rev.verified': '✓ Booked in the app',
      'rev.empty': 'First reviews will appear here soon — book a visit and rate it! ⭐',
      'rev.swipe': 'Swipe for more →', 'rev.more': 'Show all reviews', 'rev.less': 'Show fewer',
      'rev.today': 'today', 'rev.yesterday': 'yesterday', 'rev.days': 'days ago', 'rev.weeks': 'weeks ago', 'rev.months': 'months ago',

      'visit.kicker': 'How it works',
      'visit.title': 'Your first visit',
      'visit.sub': 'Knowing what to expect makes it even more relaxing.',
      'visit.s1t': 'Book', 'visit.s1d': 'Pick a service, therapist and time in the app 24/7, or give us a call.',
      'visit.s2t': 'Arrive', 'visit.s2d': 'Come 5–10 minutes early and tell us about your skin and any allergies.',
      'visit.s3t': 'Treatment', 'visit.s3d': 'Cleanse, oil, gua sha and mask — 30 to 90 calm minutes.',
      'visit.s4t': 'Results & care', 'visit.s4d': 'Take home aftercare tips and track your change with progress photos.',

      'prod.kicker': 'Transparency',
      'prod.title': 'What we use',
      'prod.sub': 'Everything that touches your skin, openly explained — stones, products, devices and what each one does.',
      'prod.all': 'All', 'prod.cat_tool': 'Tools', 'prod.cat_product': 'Products', 'prod.cat_machine': 'Devices', 'prod.cat_method': 'Our approach',

      'app.kicker': 'The app',
      'app.title': 'Your beauty companion, in your pocket',
      'app.mock_balance': 'Balance', 'app.mock_book': 'Book a visit', 'app.mock_gift': 'Gift cards & bundles', 'app.mock_chat': 'Chat with the salon', 'app.mock_photo': 'Progress photos',
      'app.f1t': 'Book 24/7', 'app.f1d': 'Pick your favourite therapist and see free slots live.',
      'app.f2t': 'Wallet, bundles & gift cards', 'app.f2d': 'Top up with QPay, save with bundles, send gift cards to friends.',
      'app.f3t': 'Chat & reviews', 'app.f3d': 'Message the salon directly and rate your treatments.',
      'app.f4t': 'Progress photos — private', 'app.f4d': 'Track your results with photos; your eyes are automatically covered before saving.',
      'app.open': 'Open the app',
      'app.hint': 'Open it on your phone and tap “Add to Home Screen” to install it like a real app.',

      'faq.kicker': 'Questions',
      'faq.title': 'Frequently asked questions',
      'faq.sub': 'What people ask most about treatments, booking and aftercare.',
      'faq.all': 'All', 'faq.g_treatment': 'Treatment', 'faq.g_booking': 'Booking & payment', 'faq.g_care': 'Prep & aftercare',
      'faq.help_t': "Didn't find your answer?", 'faq.help_d': 'Reach us directly — we are happy to help.',
      'faq.call': '📞 Call us', 'faq.chat': '💬 Message in the app',

      'contact.kicker': 'Contact',
      'contact.title': 'Find us',
      'contact.addr_t': 'Address', 'contact.map': 'Open in Google Maps ↗', 'contact.hours_t': 'Opening hours', 'contact.hours_daily': 'Every day',
      'contact.call_t': 'Phone', 'contact.book_phones': 'Bookings', 'contact.email_t': 'Email', 'contact.social_t': 'Social',
      'contact.book_t': 'Book your visit', 'contact.book_d': 'Register and confirm your time within a minute.', 'contact.book_btn': 'Book now',

      'footer.tag': 'Naturally, Healthy and Beautiful', 'footer.menu': 'Menu', 'footer.contact': 'Contact', 'footer.admin': 'Staff area'
    }
  };

  var lang = localStorage.getItem('bg_lang') || 'mn';
  var theme = localStorage.getItem('bg_theme') || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  var cfg = null, services = null, bundles = null, edu = null, faq = null, reviewsData = null;
  var featureWallet = false; /* from /api/config — the super admin toggles it */
  var svcTab = 'all', prodTab = 'all', faqTab = 'all', revExpanded = false;
  var REV_DESKTOP_LIMIT = 4;

  function t(key) { return (DICT[lang] && DICT[lang][key]) || DICT.mn[key] || key; }
  function tw(key) { return !featureWallet && DICT[lang][key + '_nw'] !== undefined ? t(key + '_nw') : t(key); }
  function L(obj, field) { return (lang === 'mn' ? obj[field + 'Mn'] : obj[field + 'En']) || obj[field + 'Mn'] || ''; }
  function money(n) { return (n || 0).toLocaleString('en-US') + '₮'; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function stars(n) { var o = ''; for (var i = 1; i <= 5; i++) o += i <= n ? '★' : '☆'; return o; }
  function ago(iso) {
    var days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
    if (!isFinite(days) || days < 1) return t('rev.today');
    if (days < 2) return t('rev.yesterday');
    if (days < 14) return days + ' ' + t('rev.days');
    if (days < 60) return Math.floor(days / 7) + ' ' + t('rev.weeks');
    return Math.floor(days / 30) + ' ' + t('rev.months');
  }
  function chipsHtml(list, active, attr) {
    return list.map(function (c) {
      return '<button type="button" role="tab" class="chip-btn' + (c.id === active ? ' active' : '') + '" aria-selected="' + (c.id === active) + '" ' + attr + '="' + c.id + '">' +
        esc(c.label) + (c.n !== undefined ? '<span class="n">' + c.n + '</span>' : '') + '</button>';
    }).join('');
  }
  function bindChips(host, attr, fn) {
    host.querySelectorAll('[' + attr + ']').forEach(function (b) {
      b.onclick = function () { fn(b.getAttribute(attr)); };
    });
  }
  var isPhone = window.matchMedia('(max-width: 719px)');

  function applyLang() {
    document.documentElement.lang = lang;
    document.title = t('title');
    document.querySelectorAll('[data-i18n]').forEach(function (el) { el.innerHTML = tw(el.getAttribute('data-i18n')); });
    document.querySelectorAll('[data-wallet]').forEach(function (el) { el.hidden = !featureWallet; });
    var lb = document.getElementById('langBtn');
    if (lb) lb.textContent = lang === 'mn' ? 'EN' : 'МН';
    renderContact();
    renderServices();
    renderBundles();
    renderReviews();
    renderEdu();
    renderFaq();
  }

  function applyTheme() {
    document.documentElement.setAttribute('data-theme', theme);
    var tb = document.getElementById('themeBtn');
    if (tb) tb.textContent = theme === 'dark' ? '☀️' : '🌙';
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#171310' : '#9a7b3c');
  }

  /* ---------- contact details (owner edits them in Admin → Тохиргоо) ---------- */
  function renderContact() {
    if (!cfg) return;
    var addr = L(cfg, 'address');
    var el = document.getElementById('contactAddr');
    if (el) el.textContent = addr;
    var map = document.getElementById('contactMap');
    if (map) map.href = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(cfg.addressEn || cfg.addressMn || "B's Gua Sha Ulaanbaatar");
    var hours = document.getElementById('contactHours');
    if (hours) hours.textContent = t('contact.hours_daily') + ' · ' + cfg.hoursOpen + ' – ' + cfg.hoursClose;
    document.querySelectorAll('.js-tel').forEach(function (a) { if (cfg.phoneTel) a.href = 'tel:' + cfg.phoneTel; });
    /* extra "цаг авах" numbers, each its own tap-to-call link */
    var bp = document.getElementById('contactBookPhones');
    if (bp) {
      var nums = String(cfg.bookingPhones || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
      bp.hidden = !nums.length;
      bp.innerHTML = nums.length ? '<span>' + t('contact.book_phones') + ':</span> ' + nums.map(function (n) {
        return '<a href="tel:' + esc(n.replace(/[^\d+]/g, '')) + '">' + esc(n) + '</a>';
      }).join(', ') : '';
    }
    ['contactPhone', 'footPhone'].forEach(function (id) { var p = document.getElementById(id); if (p && cfg.phoneDisplay) p.textContent = cfg.phoneDisplay; });
    ['contactEmail', 'footEmail'].forEach(function (id) {
      var e = document.getElementById(id);
      if (e) { e.hidden = !cfg.email; if (cfg.email) { e.textContent = cfg.email; e.href = 'mailto:' + cfg.email; } }
    });
    var fbRow = document.getElementById('contactFbRow');
    if (fbRow) fbRow.hidden = !cfg.facebook;
    var fb = document.getElementById('contactFb');
    if (fb && cfg.facebook) fb.href = cfg.facebook;
  }

  /* ---------- services ---------- */
  var GROUPS = ['facial', 'body', 'other'];
  function renderServices() {
    var wrap = document.getElementById('servicesWrap');
    var tabs = document.getElementById('svcTabs');
    if (!wrap || !services) return;
    var present = GROUPS.filter(function (g) { return services.some(function (s) { return s.group === g; }); });
    if (present.length > 1) {
      tabs.innerHTML = chipsHtml([{ id: 'all', label: t('svc.all') }].concat(present.map(function (g) { return { id: g, label: t('svc.g_' + g) }; })), svcTab, 'data-svc');
      bindChips(tabs, 'data-svc', function (v) { svcTab = v; renderServices(); });
    } else tabs.innerHTML = '';
    var list = services.filter(function (s) { return svcTab === 'all' || s.group === svcTab; });
    if (!list.length) { wrap.innerHTML = '<p class="rev-empty">' + t('svc.empty') + '</p>'; return; }
    wrap.innerHTML = list.map(function (s) {
      return '<article class="svc-card">' +
        '<div class="svc-top"><span class="svc-emoji">' + esc(s.emoji || '🌿') + '</span>' +
        '<div><div class="svc-name">' + esc(L(s, 'name')) + '</div><div class="svc-group">' + esc(t('svc.g_' + (s.group || 'other'))) + '</div></div></div>' +
        '<p class="svc-desc">' + esc(L(s, 'desc')) + '</p>' +
        '<div class="svc-foot"><span class="svc-price">' + money(s.price) + '</span><span class="svc-min">' + s.minutes + ' ' + t('svc.min') + '</span>' +
        '<a class="svc-book" href="/app#book=' + encodeURIComponent(s.id) + '">' + t('svc.book') + '</a></div></article>';
    }).join('');
  }

  function renderBundles() {
    var wrap = document.getElementById('bundlesWrap');
    if (!wrap) return;
    if (!featureWallet || !bundles || !bundles.length) { wrap.hidden = true; wrap.innerHTML = ''; return; }
    wrap.hidden = false;
    wrap.innerHTML = bundles.map(function (b) {
      return '<div class="bundle-box"><span class="b-ico">' + esc(b.emoji || '🎁') + '</span>' +
        '<div><div class="bn">' + esc(L(b, 'name')) + '</div>' +
        '<div class="bd">' + b.sessions + ' ' + t('svc.bundle_sessions') + ' · ' + b.validDays + ' ' + t('svc.bundle_valid') + '</div></div>' +
        '<div class="bp">' + money(b.price) + '<small>' + t('svc.bundle_hint') + '</small></div></div>';
    }).join('');
  }

  /* ---------- reviews: summary + cards (grid on desktop, swipe row on phone) ---------- */
  function renderReviews() {
    var wrap = document.getElementById('reviewsWrap');
    var sum = document.getElementById('revSummary');
    if (!wrap || reviewsData === null) return;
    var list = reviewsData.reviews || [];
    var moreWrap = document.getElementById('revMoreWrap');
    var swipe = document.getElementById('revSwipe');
    if (!list.length) {
      sum.hidden = true; moreWrap.hidden = true; swipe.hidden = true;
      wrap.innerHTML = '<div class="rev-empty">' + t('rev.empty') + '</div>';
      return;
    }
    var dist = reviewsData.distribution || [0, 0, 0, 0, 0];
    var max = Math.max.apply(null, dist.concat([1]));
    sum.hidden = false;
    sum.innerHTML =
      '<div class="rs-head"><div class="rs-score"><b>' + reviewsData.average.toFixed(1) + '</b><span>' + t('rev.out_of') + '</span></div>' +
      '<div><div class="rs-stars">' + stars(Math.round(reviewsData.average)) + '</div>' +
      '<div class="rs-count">' + reviewsData.count + ' ' + t('rev.based') + '</div></div></div>' +
      '<div class="rs-bars">' + dist.map(function (n, i) {
        return '<div class="rs-bar"><span>' + (5 - i) + '★</span><i style="--w:' + Math.round((n / max) * 100) + '%"></i><span>' + n + '</span></div>';
      }).join('') + '</div>' +
      '<div class="rs-cta"><span>' + t('rev.cta') + '</span><a class="btn btn-ghost btn-sm" href="/app">' + t('rev.cta_btn') + '</a></div>';

    var shown = isPhone.matches || revExpanded ? list : list.slice(0, REV_DESKTOP_LIMIT);
    wrap.innerHTML = shown.map(function (r) {
      var svcName = lang === 'mn' ? r.serviceMn : r.serviceEn;
      var meta = [svcName, r.staffName, ago(r.createdAt)].filter(Boolean).map(esc).join(' · ');
      return '<article class="rev-card">' +
        '<span class="st" aria-label="' + r.rating + '/5">' + stars(r.rating) + '</span>' +
        (r.text ? '<p class="rev-text">' + esc(r.text) + '</p>' : '<p class="rev-text"></p>') +
        '<div class="rev-who"><span class="rev-avatar">' + esc((r.name || '?').trim()[0] || '?') + '</span>' +
        '<div><div class="rev-name">' + esc(r.name) + '</div><div class="rev-meta">' + meta + '</div>' +
        (r.verified ? '<span class="rev-badge">' + t('rev.verified') + '</span>' : '') + '</div></div></article>';
    }).join('');
    swipe.hidden = !(isPhone.matches && list.length > 1);
    moreWrap.hidden = isPhone.matches || list.length <= REV_DESKTOP_LIMIT;
    document.getElementById('revMore').textContent = revExpanded ? t('rev.less') : t('rev.more');

    var hr = document.getElementById('heroRating');
    if (hr && reviewsData.count) {
      hr.hidden = false;
      hr.querySelector('.st').textContent = stars(Math.round(reviewsData.average));
      document.getElementById('heroRatingTxt').textContent = reviewsData.average.toFixed(1) + ' · ' + reviewsData.count + ' ' + t('hero.rating_count');
    }
    /* the hero quote shows the newest 5★ review that has text */
    var q = list.filter(function (r) { return r.rating === 5 && r.text; })[0];
    var hq = document.getElementById('heroQuote');
    if (hq && q) {
      hq.hidden = false;
      document.getElementById('heroQuoteText').textContent = '“' + q.text + '”';
      document.getElementById('heroQuoteWho').textContent = '— ' + q.name;
    }
  }

  /* ---------- products ("what we use") with category filter ---------- */
  var CATS = ['tool', 'product', 'machine', 'method'];
  function renderEdu() {
    var wrap = document.getElementById('eduWrap');
    var tabs = document.getElementById('prodTabs');
    var section = document.getElementById('products');
    if (!wrap || edu === null) return;
    if (!edu.length) { section.hidden = true; return; }
    section.hidden = false;
    var present = CATS.filter(function (c) { return edu.some(function (x) { return x.category === c; }); });
    tabs.innerHTML = present.length > 1 ? chipsHtml([{ id: 'all', label: t('prod.all'), n: edu.length }].concat(present.map(function (c) {
      return { id: c, label: t('prod.cat_' + c), n: edu.filter(function (x) { return x.category === c; }).length };
    })), prodTab, 'data-prod') : '';
    bindChips(tabs, 'data-prod', function (v) { prodTab = v; renderEdu(); });
    var list = edu.filter(function (x) { return prodTab === 'all' || x.category === prodTab; });
    wrap.innerHTML = list.map(function (it) {
      var benefit = L(it, 'benefit');
      return '<article class="prod-card"><div class="prod-top"><span class="prod-ico">' + esc(it.emoji || '🌿') + '</span>' +
        '<div><div class="prod-cat">' + esc(t('prod.cat_' + it.category)) + '</div><div class="prod-name">' + esc(L(it, 'name')) + '</div></div></div>' +
        (benefit ? '<span class="prod-benefit">' + esc(benefit) + '</span>' : '') +
        '<p class="prod-desc">' + esc(L(it, 'desc')) + '</p></article>';
    }).join('');
  }

  /* ---------- FAQ: grouped accordion + group filter ---------- */
  var FAQ_GROUPS = ['treatment', 'booking', 'care'];
  function renderFaq() {
    var wrap = document.getElementById('faqWrap');
    var tabs = document.getElementById('faqTabs');
    var section = document.getElementById('faq');
    if (!wrap || faq === null) return;
    if (!faq.length) { section.hidden = true; return; }
    section.hidden = false;
    var present = FAQ_GROUPS.filter(function (g) { return faq.some(function (f) { return f.group === g; }); });
    tabs.innerHTML = chipsHtml([{ id: 'all', label: t('faq.all'), n: faq.length }].concat(present.map(function (g) {
      return { id: g, label: t('faq.g_' + g), n: faq.filter(function (f) { return f.group === g; }).length };
    })), faqTab, 'data-faq');
    bindChips(tabs, 'data-faq', function (v) { faqTab = v; renderFaq(); });
    var groups = faqTab === 'all' ? present : [faqTab];
    var first = true;
    wrap.innerHTML = groups.map(function (g) {
      var items = faq.filter(function (f) { return f.group === g; });
      return (faqTab === 'all' ? '<h3 class="faq-group-title">' + esc(t('faq.g_' + g)) + '</h3>' : '') +
        items.map(function (f) {
          var open = first; first = false;
          return '<details class="faq-item"' + (open ? ' open' : '') + '><summary>' + esc(L(f, 'q')) + '</summary><p>' + esc(L(f, 'a')) + '</p></details>';
        }).join('');
    }).join('') +
      /* tablet/phone: the help card follows the list instead of sitting in the side panel */
      '<div class="help-card"><b>' + t('faq.help_t') + '</b><p>' + t('faq.help_d') + '</p><div class="help-actions">' +
      '<a class="btn btn-primary btn-sm" href="tel:' + esc((cfg && cfg.phoneTel) || '+97691113958') + '">' + t('faq.call') + '</a>' +
      '<a class="btn btn-ghost btn-sm" href="/app">' + t('faq.chat') + '</a></div></div>';
  }

  /* ---------- data loading ---------- */
  function getJson(url) { return fetch(url).then(function (r) { return r.json(); }); }
  function loadAll() {
    getJson('/api/config').then(function (c) {
      cfg = c;
      featureWallet = c.featureWallet === true;
      applyLang();
    }).catch(function () {});
    getJson('/api/services').then(function (l) { services = Array.isArray(l) ? l : []; renderServices(); })
      .catch(function () { services = []; renderServices(); });
    getJson('/api/bundles').then(function (l) { bundles = Array.isArray(l) ? l : []; renderBundles(); })
      .catch(function () { bundles = []; });
    getJson('/api/public/edu').then(function (l) { edu = Array.isArray(l) ? l : []; renderEdu(); })
      .catch(function () { edu = []; renderEdu(); });
    getJson('/api/public/faq').then(function (l) { faq = Array.isArray(l) ? l : []; renderFaq(); })
      .catch(function () { faq = []; renderFaq(); });
    getJson('/api/public/reviews').then(function (d) {
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
  document.getElementById('revMore').addEventListener('click', function () {
    revExpanded = !revExpanded;
    renderReviews();
    if (!revExpanded) document.getElementById('reviews').scrollIntoView();
  });

  var burger = document.getElementById('burger');
  var nav = document.getElementById('siteNav');
  function setNav(open) {
    nav.classList.toggle('open', open);
    burger.setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('nav-open', open);
  }
  burger.addEventListener('click', function () { setNav(!nav.classList.contains('open')); });
  nav.addEventListener('click', function (e) { if (e.target.closest('a')) setNav(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setNav(false); });

  /* header shadow, phone bottom bar (after the hero), active nav link */
  var header = document.querySelector('.site-header');
  var bar = document.getElementById('mobileBar');
  var hero = document.getElementById('hero');
  var navLinks = Array.prototype.slice.call(nav.querySelectorAll('a[href^="#"]'));
  function onScroll() {
    var y = window.scrollY;
    header.classList.toggle('scrolled', y > 8);
    bar.classList.toggle('show', y > hero.offsetHeight - 80);
    var current = '';
    navLinks.forEach(function (a) {
      var sec = document.querySelector(a.getAttribute('href'));
      if (sec && !sec.hidden && sec.offsetTop - 120 <= y) current = a.getAttribute('href');
    });
    navLinks.forEach(function (a) { a.classList.toggle('active', a.getAttribute('href') === current); });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  /* re-render the reviews when crossing the phone/desktop line (swipe row vs grid) */
  if (isPhone.addEventListener) isPhone.addEventListener('change', renderReviews);

  document.getElementById('year').textContent = new Date().getFullYear();

  /* ---------- init ---------- */
  applyTheme();
  applyLang();
  loadAll();
  onScroll();
})();
