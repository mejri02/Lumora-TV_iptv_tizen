/* Lumora — Startup: load sources, splash and init(). */
'use strict';

function loadSources() {
    var list = readJSON(SOURCES_KEY, []);
    if (!list.length && CFG.DEFAULT_PLAYLIST_URL) {
        list = [{ id: 'default', type: 'm3u', name: 'Default playlist', url: CFG.DEFAULT_PLAYLIST_URL, user: '', pass: '', format: 'm3u8', mac: '' }];
        writeJSON(SOURCES_KEY, list);
    }
    return list;
}

function hideSplash() {
    var sp = $('splash');
    sp.classList.add('out');
    setTimeout(function () { sp.parentNode && sp.parentNode.removeChild(sp); }, 600);
}

function init() {
    purgeLegacy();
    startBgTimers();
    state.sources = loadSources();
    state.hidden = readJSON(HID_KEY, {}) || {};
    state.favorites = readJSON(FAV_KEY, {});
    state.pos = readJSON(POS_KEY, {});
    state.hist = readJSON(HIST_KEY, {});
    state.recent = readJSON(RECENT_KEY, {}) || {};
    state.watched = readJSON(WATCH_KEY, {}) || {};
    state.pin = (readJSON(PIN_KEY, {}) || {}).h || '';
    state.locked = readJSON(LOCK_KEY, {}) || {};
    restoreMirrors();

    applyAppearance();
    Player.init({ notice: function (eng) { toast(trl('لا يوجد صوت — جرّبت مشغّلاً آخر (' + eng + ')', 'No audio detected. Switched player (' + eng + ')')); }, buffering: handleBuffering, error: handleError, ended: onEnded, stall: handleStall, progress: handleProgress });
    Player.setAspect(S.get('aspect'));
    Player.setProfile(S.get('buffer'));
    Player.setEngine(S.get('engine'));
    Store.purgeExpired();
    setTimeout(function () { try { Net.trimImages(); } catch (e) { } }, 20000);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisibility);
    $('info-logo').onerror = function () {
        if (this.getAttribute('src') !== PH_LOGO) this.setAttribute('src', PH_LOGO);
    };
    registerKeys();
    linkInit();

    $('search').addEventListener('input', function () {
        if (state.screen === 'browse' && state.ctx) setQuery(this.value);
    });
    document.addEventListener('keydown', onKey);

    var lastId = null;
    try { lastId = localStorage.getItem(LAST_KEY); } catch (e) { }
    var last = state.sources.filter(function (s) { return s.id === lastId; })[0];

    if (S.get('autoOpenLast') && last) {
        openSource(last);
    } else {
        showScreen('home');
        renderHome();
    }
    setTimeout(hideSplash, 900);
    if (link.fresh) setTimeout(function () { if (state.screen === 'home' && !state.modal) openLink(); }, 1600);
}

init();
