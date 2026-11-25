/* التطبيق الرئيسي: تصفّح، مباريات، مفضلة، مشغّل — تحكم بجهاز التحكم عن بعد */
(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const FAV_KEY = 'ostora_favs';

  /* ---------- المفضلة ---------- */
  function getFavs() {
    try { return JSON.parse(localStorage.getItem(FAV_KEY)) || []; } catch (e) { return []; }
  }
  function isFav(id) { return getFavs().some((f) => f.id === id); }
  function toggleFav(item) {
    const favs = getFavs();
    const idx = favs.findIndex((f) => f.id === item.id);
    if (idx >= 0) favs.splice(idx, 1); else favs.push(item);
    localStorage.setItem(FAV_KEY, JSON.stringify(favs));
  }

  /* ---------- البداية ---------- */
  async function init() {
    try {
      $('#splash-status').textContent = 'جارٍ جلب الإعدادات…';
      await OstoraApi.bootstrap();
      $('#splash').classList.add('hidden');
      $('#app').classList.remove('hidden');
      loadHome();
    } catch (e) {
      $('#splash-status').textContent = 'تعذّر تحميل الإعدادات';
      $('#splash-error').textContent = String(e && e.message || e) + ' — أعد المحاولة لاحقاً.';
    }
  }

  /* ---------- الرئيسية ---------- */
  let homeLoaded = false;
  async function loadHome() {
    const view = $('#view-home');
    if (homeLoaded) return;
    view.innerHTML = '<div class="empty">جارٍ التحميل…</div>';
    try {
      const list = await OstoraApi.servers();
      view.innerHTML = '<div class="section-title">السيرفرات</div><div class="grid"></div>';
      const grid = view.querySelector('.grid');
      for (const s of list) {
        const card = document.createElement('div');
        card.className = 'card'; card.tabIndex = 0;
        card.innerHTML = '<img alt="" src="' + esc(s.image) + '"/><div class="name">' + esc(s.name) + '</div>';
        card.addEventListener('click', () => openCategory(s.id));
        grid.appendChild(card);
      }
      homeLoaded = true;
    } catch (e) {
      view.innerHTML = '<div class="empty">خطأ في تحميل السيرفرات</div>';
    }
  }

  async function openCategory(id, page) {
    const view = $('#view-home');
    view.innerHTML = '<div class="empty">جارٍ التحميل…</div>';
    try {
      const p = await OstoraApi.catalog(id, page || 1);
      if (!p.items.length && (page || 1) === 1) { view.innerHTML = '<div class="empty">لا يوجد محتوى</div>'; return; }
      view.innerHTML = '<div class="section-title">المحتوى</div><div class="grid"></div>';
      const grid = view.querySelector('.grid');
      for (const item of p.items) {
        const card = document.createElement('div');
        card.className = 'card'; card.tabIndex = 0;
        card.innerHTML = '<img alt="" src="' + esc(item.image) + '"/><div class="name">' + esc(item.name) + '</div>';
        card.addEventListener('click', () => {
          if (item.type === 'category') openCategory(item.id, 1);
          else openPlayer(item);
        });
        grid.appendChild(card);
      }
      if (p.page < p.pages) {
        const more = document.createElement('div');
        more.className = 'card'; more.tabIndex = 0;
        more.innerHTML = '<div class="name" style="padding:26px 12px;text-align:center">المزيد ⟵</div>';
        more.addEventListener('click', () => openCategory(id, p.page + 1));
        grid.appendChild(more);
      }
    } catch (e) {
      view.innerHTML = '<div class="empty">خطأ في التحميل</div>';
    }
  }

  /* ---------- المباريات ---------- */
  let matchesLoaded = false;
  async function loadMatches() {
    const view = $('#view-matches');
    if (matchesLoaded) return;
    view.innerHTML = '<div class="empty">جارٍ التحميل…</div>';
    try {
      const d = new Date();
      const date = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      const list = await OstoraApi.matches(date);
      view.innerHTML = '<div class="section-title">مباريات اليوم</div>';
      if (!list.length) { view.insertAdjacentHTML('beforeend', '<div class="empty">لا مباريات اليوم</div>'); return; }
      for (const m of list) {
        const live = ['1', '2', 'live'].includes(m.status);
        const upcoming = ['3', 'upcoming'].includes(m.status) || (m.timeSeconds * 1000 > Date.now() && !live);
        const el = document.createElement('div');
        el.className = 'match'; el.tabIndex = 0;
        el.innerHTML =
          '<div class="comp"><img alt="" src="' + esc(m.competitionLogo) + '"/>' + esc(m.competition) + '</div>' +
          '<div class="teams"><img alt="" src="' + esc(m.homeLogo) + '"/>' + esc(m.homeTeam) +
          '<span class="score">' + esc(m.homeScore + ' - ' + m.awayScore) + '</span>' +
          esc(m.awayTeam) + '<img alt="" src="' + esc(m.awayLogo) + '"/></div>' +
          '<div class="meta">' +
          (live ? '<span class="badge-live">مباشر</span> ' : upcoming ? '<span class="badge-upcoming">لم تبدأ</span> ' : '') +
          esc(m.channel) + (m.announcer ? ' • ' + esc(m.announcer) : '') + '</div>';
        view.appendChild(el);
      }
      matchesLoaded = true;
    } catch (e) {
      view.innerHTML = '<div class="empty">خطأ في تحميل المباريات</div>';
    }
  }

  /* ---------- المفضلة ---------- */
  function loadFavorites() {
    const view = $('#view-favorites');
    const favs = getFavs();
    view.innerHTML = '<div class="section-title">المفضلة</div><div class="grid"></div>';
    if (!favs.length) { view.insertAdjacentHTML('beforeend', '<div class="empty">لا عناصر محفوظة</div>'); return; }
    const grid = view.querySelector('.grid');
    for (const f of favs) {
      const card = document.createElement('div');
      card.className = 'card'; card.tabIndex = 0;
      card.innerHTML = '<img alt="" src="' + esc(f.image) + '"/><div class="name">' + esc(f.name) + '</div>';
      card.addEventListener('click', () => openPlayer(f));
      grid.appendChild(card);
    }
  }

  /* ---------- المشغّل ---------- */
  let currentHls = null, currentDash = null, playerSources = [], playerIndex = 0, playerItem = null;

  async function openPlayer(item) {
    playerItem = item;
    const target = OstoraStreams.resolve(item, OstoraApi.userAgent());
    $('#player-title').textContent = item.name || '';
    $('#player').classList.remove('hidden');

    if (target.kind === 'hls' || target.kind === 'dash' || target.kind === 'progressive') {
      playUrl(target.url, target.kind);
    } else if (target.kind === 'embed') {
      playEmbed(target.url);
    } else {
      playEmbed(null);
    }
  }

  function playUrl(url, kind) {
    const video = $('#video');
    stopEngines();
    if (kind === 'hls' && window.Hls && Hls.isSupported()) {
      currentHls = new Hls({ xhrSetup: (xhr) => { try { xhr.setRequestHeader('User-Agent', OstoraApi.userAgent()); } catch (e) { /* */ } } });
      currentHls.loadSource(url);
      currentHls.attachMedia(video);
      currentHls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
      currentHls.on(Hls.Events.ERROR, (evt, data) => { if (data.fatal) tryNextSource(); });
    } else if (kind === 'dash' && window.dashjs) {
      currentDash = dashjs.MediaPlayer().create();
      currentDash.initialize(video, url, true);
      currentDash.on('error', tryNextSource);
    } else {
      video.src = url;
      video.play().catch(() => {});
      video.onerror = tryNextSource;
    }
  }

  /* صفحات الويب المضمّنة تُفتح في iframe داخل المشغّل */
  function playEmbed(url) {
    const video = $('#video');
    stopEngines();
    video.removeAttribute('src');
    if (!url) { $('#player-title').textContent += ' — لا يمكن تشغيل هذا المصدر'; return; }
    let frame = document.getElementById('embed-frame');
    if (!frame) {
      frame = document.createElement('iframe');
      frame.id = 'embed-frame';
      frame.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0;';
      $('#player').insertBefore(frame, $('#player-ui'));
    }
    frame.src = url;
  }

  function tryNextSource() {
    /* بديل بسيط: إعادة المحاولة بعد مهلة */
    setTimeout(() => { const v = $('#video'); if (v && v.paused && !v.src && !document.getElementById('embed-frame')) tryNextSource(); }, 4000);
  }

  function stopEngines() {
    if (currentHls) { try { currentHls.destroy(); } catch (e) { /* */ } currentHls = null; }
    if (currentDash) { try { currentDash.reset(); } catch (e) { /* */ } currentDash = null; }
    const frame = document.getElementById('embed-frame');
    if (frame) frame.remove();
    const video = $('#video');
    video.pause(); video.removeAttribute('src'); video.load();
  }

  function closePlayer() {
    stopEngines();
    $('#player').classList.add('hidden');
    $('#player-title').textContent = '';
  }

  /* ---------- التنقل وأزرار التحكم ---------- */
  function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }

  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      const id = tab.dataset.tab;
      document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
      $('#view-' + id).classList.add('active');
      if (id === 'home') loadHome();
      if (id === 'matches') loadMatches();
      if (id === 'favorites') loadFavorites();
    });
  });

  window.addEventListener('keydown', (e) => {
    const playerOpen = !$('#player').classList.contains('hidden');
    if (playerOpen && (e.key === 'Escape' || e.keyCode === 10009)) { closePlayer(); e.preventDefault(); return; }
    if (!playerOpen && e.keyCode === 10009) { /* زر الرجوع في Tizen على القائمة الرئيسية */ }
    if (e.key === 'MediaPlayPause' || e.key === 'MediaPlay') { const v = $('#video'); v && v.play(); }
    if (e.key === 'MediaStop') { closePlayer(); }
  });

  try {
    if (window.tizen && tizen.tvinputdevice) {
      tizen.tvinputdevice.registerKey('MediaPlayPause');
      tizen.tvinputdevice.registerKey('MediaPlay');
      tizen.tvinputdevice.registerKey('MediaStop');
    }
  } catch (e) { /* ليس على التلفاز */ }

  init();
})();
