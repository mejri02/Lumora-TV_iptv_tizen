/* Lumora — Settings screen, theme picker, sleep timer. */
'use strict';

function secOpts() { return [[3, '{n} sec'], [6, '{n} sec'], [10, '{n} sec'], [15, '{n} sec']]; }

function settingDefs() {
    return [
        { h: 'Phone' },
        { a: 'pair', n: 'Pair with code' },
        { h: 'Appearance' },
        { k: 'lang', n: 'Language', t: 'cycle', raw: true, o: [['en', 'English'], ['ar', 'العربية']] },
        { k: 'theme', n: 'Theme', t: 'cycle', o: THEME_LIST },
        { k: 'clock', n: 'Clock', t: 'cycle', o: [['24', '24-hour'], ['12', '12-hour'], ['off', 'Hidden']] },
        { k: 'overlayAlpha', n: 'Panel opacity', t: 'cycle', o: [[45, '{n}%'], [60, '{n}%'], [80, '{n}%'], [100, '{n}%']] },
        { k: 'animations', n: 'Animations', t: 'toggle' },
        { h: 'Playback' },
        { k: 'aspect', n: 'Picture size', t: 'cycle', o: [['fit', 'Fit'], ['fill', 'Stretch'], ['zoom', 'Zoom']] },
        { k: 'engine', n: 'Player engine', t: 'cycle', o: [['auto', 'Automatic'], ['avplay', 'Samsung AVPlay'], ['html5', 'HTML5 / Hls.js']] },
        { k: 'buffer', n: 'Buffer size', t: 'cycle', o: [['fast', 'Fast start'], ['balanced', 'Balanced'], ['stable', 'Stable'], ['weak', 'Weak network']] },
        { k: 'resume', n: 'Resume movies where you left off', t: 'toggle' },
        { k: 'resumeAsk', n: 'Ask before resuming', t: 'toggle' },
        { k: 'autoNext', n: 'Auto-play next episode', t: 'toggle' },
        { k: 'seekStep', n: 'Skip step', t: 'cycle', o: [[10, '{n} sec'], [20, '{n} sec'], [30, '{n} sec']] },
        { k: 'infoTimeout', n: 'Info bar duration', t: 'cycle', o: secOpts() },
        { k: 'retryLimit', n: 'Reconnect attempts', t: 'cycle', o: [[1, '{n}'], [3, '{n}'], [5, '{n}'], [10, '{n}']] },
        { k: 'keepAwake', n: 'Keep screen awake while playing', t: 'toggle' },
        { k: 'diag', n: 'Show playback diagnostics', t: 'toggle' },
        { k: 'miniPlayer', n: 'Live preview in channel list', t: 'toggle' },
        { k: '_sleep', n: 'Sleep timer', t: 'cycle', o: [[0, 'Off'], [15, '{n} min'], [30, '{n} min'], [60, '{n} min'], [90, '{n} min'], [120, '{n} min']] },
        { h: 'Library' },
        { k: 'sort', n: 'Sort items', t: 'cycle', o: [['default', 'Provider order'], ['az', 'A – Z'], ['za', 'Z – A'], ['new', 'Newest first'], ['rate', 'Top rated first']] },
        { k: 'autoOpenLast', n: 'Open last source on launch', t: 'toggle' },
        { k: 'bgRefresh', n: 'Refresh library in background', t: 'toggle' },
        { k: 'cacheHours', n: 'Library cache lifetime', t: 'cycle', o: [[1, '{n} h'], [6, '{n} h'], [12, '{n} h'], [24, '{n} h'], [72, '{n} h']] },
        { a: 'tmdb', n: 'TMDB API key (descriptions)' },
        { h: 'Security' },
        { k: 'parental', n: 'Parental lock', t: 'toggle' },
        { k: 'lockCats', n: 'Locked categories', t: 'toggle' },
        { a: 'setpin', n: 'Set PIN' },
        { h: 'Backup' },
        { a: 'export', n: 'Export backup' },
        { a: 'import', n: 'Import backup' },
        { h: 'Data' },
        { i: true, n: 'App storage used', v: storText() },
        { a: 'imgcache', n: 'Clear image cache' },
        { a: 'cache', n: 'Clear cached libraries' },
        { a: 'favs', n: 'Clear favorites' },
        { a: 'recent', n: 'Clear recently watched' },
        { a: 'pos', n: 'Clear watch progress' },
        { a: 'reset', n: 'Reset settings' },
        { a: 'wipe', n: 'Erase all data', danger: true },
        { h: 'About' },
        { i: true, n: 'Version', v: 'Lumora ' + CFG.VERSION },
        { i: true, n: 'Saved sources', v: String(state.sources.length) },
        { i: true, n: 'Remote colors', v: t('Shown at the bottom of every screen') }
    ];
}

function settingValue(d) {
    return d.k === '_sleep' ? state.sleepMin : S.get(d.k);
}

function settingFocusable(defs) {
    var list = [];
    defs.forEach(function (d, i) { if (d.k || d.a) list.push(i); });
    return list;
}

function arrows() {
    return I18n.isRtl() ? ['▶', '◀'] : ['◀', '▶'];
}

// Small preview chip for the Theme row: background thumbnail (when the theme has one) + accent colors.
var THEME_LIST = [['spider', 'Spider-Man'], ['sakura', 'Sakura'], ['batman', 'Batman'], ['goku', 'Goku'], ['roja', 'Football'], ['angry', 'Angry Birds'],
    ['onepiece', 'One Piece'], ['neonspider', 'Neon Spider'], ['skyline', 'Spider Skyline'], ['synthwave', 'Synthwave'],
    ['solo', 'Solo Leveling'], ['mega', 'Mega City'], ['ultra', 'Ultra Instinct'], ['fortnite', 'Fortnite'], ['jjk', 'Jujutsu Kaisen']];
var THEME_META = {
    spider: ['#ef4444', '#60a5fa'], sakura: ['#f472b6', '#2dd4bf'], batman: ['#f59e0b', '#ef4444'],
    goku: ['#f59e0b', '#38bdf8'], roja: ['#ef4444', '#facc15'], angry: ['#ef4444', '#22d3ee'],
    onepiece: ['#f97316', '#60a5fa'],
    neonspider: ['#ff3b5c', '#c026d3'],
    skyline: ['#ef4444', '#38bdf8'],
    synthwave: ['#e879f9', '#22d3ee'],
    solo: ['#a855f7', '#22d3ee'],
    mega: ['#22d3ee', '#f472b6'],
    ultra: ['#38bdf8', '#f59e0b'],
    fortnite: ['#a78bfa', '#22d3ee'],
    jjk: ['#ef4444', '#a78bfa']
};
function iconPreview(pack) {
    var pk = Icons.resolve(pack, S.get('theme'));
    if (pk === 'classic') return '<span class="ipv"><img src="images/tiles/' + S.get('theme') + '-live.png" alt=""></span>';
    return '<span class="ipv">' + Icons.svg(pk, 'live') + Icons.svg(pk, 'vod') + Icons.svg(pk, 'favs') + '</span>';
}
function themePreview(key) {
    var m = THEME_META[key];
    if (!m) return '';
    return '<span class="tprev" style="background-image:url(images/themes/t-' + key + '.jpg);"><span class="tdots"><i style="background:' + m[0] + '"></i><i style="background:' + m[1] + '"></i></span></span>';
}


var SET_ICONS = {"phone": "<rect x=\"7\" y=\"2\" width=\"10\" height=\"20\" rx=\"2\"/><path d=\"M11 18h2\"/>", "globe": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18\"/>", "palette": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 3v18\"/><path d=\"M12 3a9 9 0 0 1 0 18z\" fill=\"currentColor\"/>", "clock": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 7v5l3 2\"/>", "spark": "<path d=\"M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2z\"/>", "frame": "<path d=\"M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4\"/>", "chip": "<rect x=\"6\" y=\"6\" width=\"12\" height=\"12\" rx=\"2\"/><path d=\"M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4\"/>", "gauge": "<path d=\"M4 18a8 8 0 1 1 16 0\"/><path d=\"M12 18l4-6\"/>", "play": "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M10 8.5l5 3.5-5 3.5z\"/>", "next": "<path d=\"M5 5l9 7-9 7zM18 5v14\"/>", "skip": "<path d=\"M12 5L3 12l9 7zM21 5l-9 7 9 7z\"/>", "bar": "<rect x=\"3\" y=\"14\" width=\"18\" height=\"6\" rx=\"2\"/><path d=\"M7 17h6\"/>", "retry": "<path d=\"M20 12a8 8 0 1 1-2.5-5.8M20 4v5h-5\"/>", "sun": "<circle cx=\"12\" cy=\"12\" r=\"4\"/><path d=\"M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2\"/>", "pulse": "<path d=\"M3 12h4l3-8 4 16 3-8h4\"/>", "pip": "<rect x=\"3\" y=\"5\" width=\"18\" height=\"14\" rx=\"2\"/><rect x=\"12\" y=\"12\" width=\"7\" height=\"5\" rx=\"1\" fill=\"currentColor\"/>", "moon": "<path d=\"M20 14.5A8 8 0 1 1 9.5 4 6.5 6.5 0 0 0 20 14.5z\"/>", "sort": "<path d=\"M4 7h16M4 12h11M4 17h6\"/>", "db": "<ellipse cx=\"12\" cy=\"6\" rx=\"8\" ry=\"3\"/><path d=\"M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3\"/>", "film": "<rect x=\"3\" y=\"4\" width=\"18\" height=\"16\" rx=\"2\"/><path d=\"M8 4v16M16 4v16M3 9h5M3 15h5M16 9h5M16 15h5\"/>", "lock": "<rect x=\"5\" y=\"11\" width=\"14\" height=\"10\" rx=\"2\"/><path d=\"M8 11V8a4 4 0 0 1 8 0v3\"/>", "key": "<circle cx=\"8\" cy=\"15\" r=\"4\"/><path d=\"M11 12l9-9M16 7l3 3\"/>", "up": "<path d=\"M12 16V4M7 9l5-5 5 5M4 20h16\"/>", "down": "<path d=\"M12 4v12M7 11l5 5 5-5M4 20h16\"/>", "trash": "<path d=\"M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13\"/>", "star": "<path d=\"M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.2 6.5 20.2l1-6.2L3 9.6l6.2-.9z\"/>", "warn": "<path d=\"M12 3l10 18H2z\"/><path d=\"M12 10v5M12 18h.01\"/>"};
var SET_ICON_OF = {"pair": "phone", "lang": "globe", "theme": "palette", "iconPack": "frame", "overlayAlpha": "palette", "clock": "clock", "animations": "spark", "aspect": "frame", "engine": "chip", "buffer": "gauge", "resume": "play", "resumeAsk": "play", "autoNext": "next", "seekStep": "skip", "infoTimeout": "bar", "retryLimit": "retry", "keepAwake": "sun", "diag": "pulse", "miniPlayer": "pip", "_sleep": "moon", "sort": "sort", "autoOpenLast": "play", "bgRefresh": "retry", "cacheHours": "db", "tmdb": "film", "parental": "lock", "lockCats": "lock", "setpin": "key", "export": "up", "import": "down", "cache": "db", "favs": "star", "recent": "trash", "pos": "trash", "reset": "retry", "wipe": "warn"};
var SET_DESC = {"pair": "Send playlists and settings from your phone", "lang": "Interface language", "theme": "Background and accent colors", "iconPack": "Icon style of the main menu", "overlayAlpha": "How see-through menus and the info bar are over the video", "clock": "Clock shown in the top bar", "animations": "Turn off for a faster interface on older TVs", "aspect": "How the video fills the screen", "engine": "Automatic is recommended. Change it if a channel will not play", "buffer": "Fast starts sooner. Stable avoids freezing on weak connections", "resume": "Continue movies and episodes from your last position", "resumeAsk": "Show a prompt instead of resuming automatically", "autoNext": "Start the next episode when one ends", "seekStep": "Seconds skipped when you seek forward or back", "infoTimeout": "How long the channel info bar stays on screen", "retryLimit": "Automatic retries when a stream drops", "keepAwake": "Prevent the TV from sleeping during playback", "diag": "Show engine, bitrate and start-up timings", "miniPlayer": "Play the highlighted channel in a small window while browsing", "_sleep": "Stop playback automatically after a set time", "sort": "Order of channels and titles. Newest and Top rated apply to movies and series", "autoOpenLast": "Skip the sources screen on launch", "bgRefresh": "Update the library quietly while you browse", "cacheHours": "How long a downloaded library stays fresh", "tmdb": "Adds posters and descriptions for movies and series", "parental": "Require a PIN for protected content", "lockCats": "Hide locked categories until the PIN is entered", "setpin": "Choose the PIN used by the parental lock", "export": "Save sources, favorites and settings to a file", "import": "Restore from a backup file", "cache": "Libraries are downloaded again the next time you open them", "favs": "Remove all favorites", "recent": "Forget the channels you watched recently", "pos": "Forget where you stopped watching", "reset": "Restore the default settings", "wipe": "Delete everything and start fresh"};

function setIcon(d) {
    var p = SET_ICONS[SET_ICON_OF[d.k || d.a]];
    return p ? '<span class="s-ico"><svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + p + '</svg></span>' : '';
}

function setDesc(d) {
    var s = SET_DESC[d.k || d.a];
    return s ? '<span class="s-desc">' + esc(t(s)) + '</span>' : '';
}

function settingRowHtml(d, i, cur, ar) {
    var cls = 'srow' + (i === cur ? ' cursor' : '') + (d.danger ? ' danger' : '') + (d.i ? ' info' : '');
    var val = '';
    if (d.i) {
        val = '<span class="s-val">' + esc(d.v) + '</span>';
    } else if (d.a === 'pair') {
        val = '<span class="s-val">' + (link.phoneAt ? '<span style="color:#4ade80">● </span>' : '') + esc(link.id) + '</span>';
    } else if (d.a === 'tmdb') {
        val = '<span class="s-val">' + esc(t(Tmdb.enabled() ? 'Set' : 'Not set')) + '</span>';
    } else if (d.a) {
        val = state.set.confirm === d.a
            ? '<span class="confirm">' + esc(t('Press OK again to confirm')) + '</span>'
            : '<span class="s-val">OK</span>';
    } else if (d.t === 'toggle') {
        val = '<span class="sw' + (settingValue(d) ? ' on' : '') + '"><span class="knob"></span></span>';
    } else {
        var cv = settingValue(d);
        var label = '';
        d.o.forEach(function (o) {
            if (o[0] === cv) label = d.raw ? o[1] : t(o[1], { n: o[0] });
        });
        var tp = d.k === 'theme' ? themePreview(cv) : d.k === 'iconPack' ? iconPreview(cv) : '';
        val = '<span class="s-val">' + tp + '<span class="arr">' + ar[0] + '</span>' + esc(label) + '<span class="arr">' + ar[1] + '</span></span>';
    }
    if (d.i) return '<div class="' + cls + '" data-d="' + i + '"><span class="s-name">' + esc(t(d.n)) + '</span>' + val + '</div>';
    return '<div class="' + cls + '" data-d="' + i + '">' + setIcon(d) + '<span class="s-txt"><span class="s-name">' + esc(t(d.n)) + '</span>' + setDesc(d) + '</span>' + val + '</div>';
}

function renderSettings() {
    var defs = settingDefs();
    var foc = settingFocusable(defs);
    state.set.defs = defs;
    state.set.foc = foc;
    state.set.i = clamp(state.set.i, 0, foc.length - 1);
    var cur = foc[state.set.i];
    var ar = arrows();
    var html = '';
    var firstHeader = true;
    defs.forEach(function (d, i) {
        if (d.h) {
            html += '<div class="shead' + (firstHeader ? ' first' : '') + '">' + esc(t(d.h)) + '</div>';
            firstHeader = false;
            return;
        }
        html += settingRowHtml(d, i, cur, ar);
    });
    $('settings-list').innerHTML = html;
    var curEl = $('settings-list').querySelector('.srow.cursor');
    reveal($('settings-box'), curEl, state.set.i === 0);
}

function moveSettingsCursor() {
    var foc = state.set.foc;
    var list = $('settings-list');
    var old = list.querySelector('.srow.cursor');
    if (old) old.classList.remove('cursor');
    var el = list.querySelector('.srow[data-d="' + foc[state.set.i] + '"]');
    if (el) el.classList.add('cursor');
    reveal($('settings-box'), el, state.set.i === 0);
}

function updateSettingRow(d) {
    var defs = state.set.defs;
    var idx = defs.indexOf(d);
    var el = $('settings-list').querySelector('.srow[data-d="' + idx + '"]');
    if (!el) { renderSettings(); return; }
    var tmp = document.createElement('div');
    tmp.innerHTML = settingRowHtml(d, idx, state.set.foc[state.set.i], arrows());
    el.parentNode.replaceChild(tmp.firstChild, el);
}

function storText() {
    var u = state.storUsage;
    if (typeof u !== 'number') return '…';
    return u >= 1048576 ? (u / 1048576).toFixed(u >= 104857600 ? 0 : 1) + ' MB' : Math.max(1, Math.round(u / 1024)) + ' KB';
}

function refreshStorage() {
    try {
        if (!navigator.storage || !navigator.storage.estimate) { state.storUsage = null; return; }
        navigator.storage.estimate().then(function (e) {
            state.storUsage = e && typeof e.usage === 'number' ? e.usage : null;
            if (state.screen === 'settings') { try { renderSettings(); } catch (x) { } }
        }, function () { });
    } catch (e) { }
}

function openSettings() {
    state.set.i = 0;
    state.set.confirm = null;
    refreshStorage();
    showScreen('settings');
    renderSettings();
}

function closeSettings() {
    state.set.confirm = null;
    var back = state.prev;
    if (back === 'browse' && state.ctx && state.source) {
        showScreen('browse');
        try { renderBrowse(); } catch (e) { }
    } else if ((back === 'hub' || back === 'browse') && state.source) { showScreen('hub'); renderHub(); }
    else { showScreen('home'); renderHome(); }
}

function applySetting(k, v) {
    if (k === '_sleep') { setSleep(v); return; }
    S.set(k, v);
    if (k === 'lang' || k === 'theme' || k === 'animations') applyAppearance();
    if (k === 'overlayAlpha') applyOverlay();
    if (k === 'clock') renderClock();
    if (k === 'aspect') Player.setAspect(v);
    if (k === 'buffer') Player.setProfile(v);
    if (k === 'engine') Player.setEngine(v);
}

function changeSetting(d, delta) {
    if ((d.k === 'parental' || d.k === 'lockCats') && S.get('parental') && state.pin) {
        verifyPin(function () { applyChange(d, delta); });
        return;
    }
    if (d.k === 'parental' && !S.get('parental') && !state.pin) {
        setPinFlow(function () { applySetting('parental', true); renderSettings(); });
        return;
    }
    applyChange(d, delta);
}

function applyChange(d, delta) {
    var cv = settingValue(d);
    if (d.t === 'toggle') {
        applySetting(d.k, !cv);
    } else {
        var idx = 0;
        d.o.forEach(function (o, i) { if (o[0] === cv) idx = i; });
        idx = (idx + delta + d.o.length) % d.o.length;
        applySetting(d.k, d.o[idx][0]);
    }
    if (d.k === '_sleep') toast(state.sleepMin ? t('Sleep timer: {n} min', { n: state.sleepMin }) : t('Sleep timer off'));
    if (d.k === 'lang' || !state.set.defs || state.set.defs.indexOf(d) < 0) renderSettings();
    else updateSettingRow(d);
}

function eraseAll() {
    var keys = [];
    try {
        for (var i = 0; i < localStorage.length; i++) {
            var k = localStorage.key(i);
            if (k && k.indexOf('lumora.') === 0) keys.push(k);
        }
        keys.forEach(function (k) { localStorage.removeItem(k); });
    } catch (e) { }
    S.reset();
    Store.clear();
    state.hist = {};
    Object.keys(state.catCache).forEach(function (k) { delete state.catCache[k]; });
    state.sources.forEach(function (s) { forgetAll(s.id); });
    state.sources = [];
    state.favorites = {};
    state.pos = {};
    state.recent = {};
    state.watched = {};
    state.pin = '';
    state.locked = {};
    state.unlocked = {};
    state.hidden = {};
    state.si = 0;
    setSleep(0);
    Player.setAspect('fit');
    Player.setProfile(S.get('buffer'));
    Player.setEngine(S.get('engine'));
    applyAppearance();
}

function runAction(a) {
    switch (a) {
        case 'setpin':
            setPinFlow(function () { renderSettings(); });
            break;
        case 'export':
            guardPin(function () { showBackup('export'); });
            break;
        case 'import':
            guardPin(function () { showBackup('import'); });
            break;
        case 'tmdb':
            showBackup('tmdb');
            break;
        case 'pair':
            openLink();
            break;
        case 'cache':
            state.sources.forEach(function (s) { clearCache(s.id); forgetAll(s.id); });
            Net.clear();
            toast(t('Cache cleared'));
            break;
        case 'imgcache':
            Net.clearImages();
            toast(t('Image cache cleared'));
            setTimeout(refreshStorage, 800);
            break;
        case 'favs':
            state.favorites = {};
            writeJSON(FAV_KEY, {});
            toast(t('Favorites cleared'));
            break;
        case 'recent':
            state.recent = {};
            state.recentStamp++;
            writeJSON(RECENT_KEY, {});
            toast(t('Recently watched cleared'));
            break;
        case 'pos':
            state.pos = {};
            state.hist = {};
            state.watched = {};
            writeJSON(POS_KEY, {});
            writeJSON(HIST_KEY, {});
            writeJSON(WATCH_KEY, {});
            toast(t('Watch progress cleared'));
            break;
        case 'reset':
            S.reset();
            Player.setAspect(S.get('aspect'));
            Player.setProfile(S.get('buffer'));
            Player.setEngine(S.get('engine'));
            applyAppearance();
            toast(t('Settings reset'));
            break;
        case 'wipe':
            eraseAll();
            toast(t('All data erased'));
            break;
    }
}

function onSettingsKey(k) {
    var defs = state.set.defs || settingDefs();
    var foc = state.set.foc || settingFocusable(defs);
    var d = defs[foc[state.set.i]];
    switch (k) {
        case KEY.UP: case KEY.DOWN:
            var hadConfirm = !!state.set.confirm;
            state.set.confirm = null;
            state.set.i = clamp(state.set.i + (k === KEY.UP ? -1 : 1), 0, foc.length - 1);
            if (hadConfirm) renderSettings(); else moveSettingsCursor();
            break;
        case KEY.LEFT: if (d.k) changeSetting(d, -1); break;
        case KEY.RIGHT: if (d.k) changeSetting(d, 1); break;
        case KEY.ENTER:
            if (d.k === 'theme') openThemes();
            else if (d.k) changeSetting(d, 1);
            else if (INSTANT[d.a]) runAction(d.a);
            else if (state.set.confirm === d.a) { state.set.confirm = null; runAction(d.a); renderSettings(); }
            else { state.set.confirm = d.a; renderSettings(); }
            break;
        case KEY.BACK: case KEY.BACK_ALT: closeSettings(); break;
        case KEY.EXIT: exitApp(); break;
    }
}
function openThemes() {
    var cur = S.get('theme');
    var html = '';
    var idx = 0;
    THEME_LIST.forEach(function (o, i) {
        if (o[0] === cur) idx = i;
        html += '<div class="th' + (o[0] === cur ? ' sel' : '') + '"><img src="images/themes/t-' + o[0] + '.jpg" alt=""><span>' + esc(t(o[1])) + '</span></div>';
    });
    $('theme-grid').innerHTML = html;
    state.themePick = { i: idx, orig: cur };
    $('themes').classList.remove('hidden');
    markTheme();
}

function markTheme() {
    var kids = $('theme-grid').children;
    for (var i = 0; i < kids.length; i++) kids[i].classList.toggle('cursor', i === state.themePick.i);
}

function closeThemes(keep) {
    if (!state.themePick) return;
    var orig = state.themePick.orig;
    state.themePick = null;
    $('themes').classList.add('hidden');
    if (!keep && S.get('theme') !== orig) applySetting('theme', orig);
    if (state.screen === 'settings') renderSettings();
}

function onThemeKey(k) {
    var p = state.themePick;
    var n = THEME_LIST.length;
    var ni = p.i;
    if (I18n.isRtl()) { if (k === KEY.LEFT) k = KEY.RIGHT; else if (k === KEY.RIGHT) k = KEY.LEFT; }
    if (k === KEY.LEFT) ni = Math.max(0, p.i - 1);
    else if (k === KEY.RIGHT) ni = Math.min(n - 1, p.i + 1);
    else if (k === KEY.UP) ni = p.i - 6 >= 0 ? p.i - 6 : p.i;
    else if (k === KEY.DOWN) ni = p.i + 6 < n ? p.i + 6 : p.i;
    else if (k === KEY.ENTER) { closeThemes(true); return; }
    else if (k === KEY.BACK || k === KEY.BACK_ALT) { closeThemes(false); return; }
    else if (k === KEY.EXIT) { exitApp(); return; }
    if (ni !== p.i) {
        p.i = ni;
        markTheme();
        applySetting('theme', THEME_LIST[ni][0]);
    }
}

function setSleep(min) {
    state.sleepMin = min;
    state.sleepAt = min ? Date.now() + min * 60000 : 0;
}

function sleepLeft() {
    return state.sleepAt ? Math.max(1, Math.ceil((state.sleepAt - Date.now()) / 60000)) : 0;
}

function secondTick() {
    if (clockString() !== state.clockText) renderClock();
    if (state.sleepAt && Date.now() >= state.sleepAt) {
        setSleep(0);
        if (state.screen === 'player') closePlayer();
        exitApp();
    }
}
