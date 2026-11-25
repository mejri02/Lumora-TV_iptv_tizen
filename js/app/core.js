/* Lumora — Constants, shared state and low-level helpers (storage, text, formatting). */
'use strict';

var CFG = window.CONFIG;
var S = Settings;
var t = I18n.t;
var ROWS = 9;
var SOURCES_KEY = 'lumora.sources';
var LAST_KEY = 'lumora.last';
var FAV_KEY = 'lumora.favs';
var HID_KEY = 'lumora.hidden';
var POS_KEY = 'lumora.pos';
var HIST_KEY = 'lumora.hist';
var RECENT_KEY = 'lumora.recent';
var WATCH_KEY = 'lumora.watched';
var SUBSIZE_KEY = 'lumora.subsize';
var PIN_KEY = 'lumora.pin';
var LOCK_KEY = 'lumora.locked';
var COUNT_KEY = 'lumora.counts.';
var CACHE_KEY = 'lumora.c.';
var EPG_TTL = 300000;
var MIRROR = {};
MIRROR[SOURCES_KEY] = 1; MIRROR[FAV_KEY] = 1; MIRROR[POS_KEY] = 1; MIRROR[HIST_KEY] = 1; MIRROR[RECENT_KEY] = 1; MIRROR[WATCH_KEY] = 1; MIRROR[PIN_KEY] = 1; MIRROR[LOCK_KEY] = 1;

var KEY = {
    LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40,
    ENTER: 13, BACK: 10009, BACK_ALT: 8, EXIT: 10182,
    STOP: 413, PLAY: 415, PAUSE: 19, PLAYPAUSE: 10252,
    FF: 417, RW: 412, CH_UP: 427, CH_DOWN: 428, PREV: 10232, NEXT: 10233,
    RED: 403, GREEN: 404, YELLOW: 405, BLUE: 406, INFO: 457,
    MENU: 10133, TOOLS: 10135, GUIDE: 458, CHLIST: 10073,
    IME_DONE: 65376, IME_CANCEL: 65385
};

var TYPE_ORDER = ['m3u', 'xtream', 'stalker'];
var TYPE_LABEL = { m3u: 'M3U', xtream: 'XTREAM', stalker: 'STALKER' };
var TYPE_NAME = { m3u: 'M3U Playlist', xtream: 'Xtream Codes', stalker: 'Stalker Portal' };
var KINDS = ['live', 'vod', 'series'];
var HUB = ['live', 'vod', 'series', 'favs', 'cont'];
var KIND_META = {
    live: { title: 'Live TV', icon: 'i-tv', noun: 'channels', art: 'images/tile-live.png' },
    vod: { title: 'Movies', icon: 'i-film', noun: 'movies', art: 'images/tile-vod.png' },
    series: { title: 'Series', icon: 'i-series', noun: 'series', art: 'images/tile-series.png' },
    favs: { title: 'Favorites', icon: 'i-star', noun: 'favorites', art: 'images/tile-favs.png' },
    cont: { title: 'Continue', icon: 'i-film', noun: 'items', art: 'images/tile-vod.png' }
};
var FAV_KIND = { live: 'Live TV', vod: 'Movies', series: 'Series', ep: 'Series' };
var PH_LOGO = 'images/ph-logo.png';
var ASPECTS = ['fit', 'wide', 'fill', 'zoom'];
var ASPECT_LABEL = { fit: 'Fit', wide: 'Wide', fill: 'Stretch', zoom: 'Zoom' };
var SLEEP_STEPS = [0, 15, 30, 60, 90, 120];

var FIELDS = {
    m3u: [
        { key: 'url', label: 'Playlist URL', kind: 'text', placeholder: 'http://host/playlist.m3u', hint: 'Direct link to your .m3u / .m3u8 playlist' },
        { key: 'name', label: 'Name (optional)', kind: 'text', placeholder: 'My playlist' }
    ],
    xtream: [
        { key: 'url', label: 'Server URL', kind: 'text', placeholder: 'http://server.example:8080', hint: 'Tip: paste the full get.php link and the username and password fill in automatically' },
        { key: 'user', label: 'Username', kind: 'text' },
        { key: 'pass', label: 'Password', kind: 'text' },
        { key: 'name', label: 'Name (optional)', kind: 'text', placeholder: 'My IPTV' },
        { key: 'format', label: 'Live stream format', kind: 'cycle', options: ['m3u8', 'ts'], adv: true }
    ],
    stalker: [
        { key: 'url', label: 'Portal URL', kind: 'text', placeholder: 'http://portal.example/c/', hint: 'Portal address, usually ending in /c/' },
        { key: 'mac', label: 'MAC address', kind: 'text', hint: 'Generated automatically. Your provider must activate this MAC.' },
        { key: 'name', label: 'Name (optional)', kind: 'text', placeholder: 'My portal' },
        { key: 'proxy', label: 'Cookie proxy URL (optional)', kind: 'text', placeholder: 'https://my-proxy.workers.dev/', adv: true }
    ]
};

var HINTS = {
    home: [['▲▼◀▶', 'Navigate'], ['OK', 'Open'], ['g', 'Edit'], ['y', 'Settings'], ['b', 'Remove'], ['↩', 'Exit']],
    form: [['▲▼', 'Move'], ['◀▶', 'Change'], ['OK', 'Edit / Confirm'], ['y', 'Show password'], ['r', 'Phone'], ['↩', 'Cancel']],
    hub: [['◀▶', 'Choose'], ['OK', 'Open'], ['▼', 'Sources menu'], ['b', 'Account'], ['y', 'Settings'], ['r', 'Clear library'], ['↩', 'Sources']],
    browse: [['▲▼', 'Browse'], ['◀▶', 'Column'], ['OK', 'Play / Open'], ['y', 'Favorite'], ['b', 'Search'], ['g', 'Hide / Move'], ['r', 'Refresh'], ['INFO', 'Lock category'], ['◀', 'Quick menu'], ['↩', 'Back']],
    player: [['◀', 'Quick menu'], ['OK', 'Channel list'], ['▶', 'Guide'], ['y', 'Favorite'], ['g', 'Picture'], ['b', 'Audio'], ['r', 'Sleep']],
    vodplayer: [['◀▶', 'Seek ±{n}s'], ['OK', 'Play / Pause'], ['▲', 'Quick menu'], ['y', 'Favorite'], ['g', 'Picture'], ['b', 'Audio'], ['r', 'Sleep']],
    settings: [['▲▼', 'Select'], ['◀▶', 'Change'], ['OK', 'Toggle / Run'], ['↩', 'Back']],
    cont: [['▲▼', 'Browse'], ['◀▶', 'Column'], ['OK', 'Play / Open'], ['y', 'Favorite'], ['b', 'Search'], ['g', 'Hide / Move'], ['r', 'Remove from history'], ['◀', 'Quick menu'], ['↩', 'Back']]
};

var PROVIDERS = { m3u: M3U, xtream: Xtream, stalker: Stalker };

var state = {
    screen: 'home', prev: 'home',
    sources: [], si: 0, confirmDelete: null,
    source: null, hi: 0,
    catCache: {}, epgCache: {}, favorites: {}, pos: {}, hist: {}, watched: {}, playSpeed: 1, subDelay: 0, recent: {}, recentStamp: 0, acct: false, hidden: {}, moving: null,
    saveGen: {}, bg: null, refresh: {}, pend: {}, modal: null, raf: 0, fast: false, lastNav: 0, imgTimer: null,
    lastKey: 0, lastKeyAt: 0, rep: 0, step: 1, suspended: false,
    ctx: null, stack: [],
    form: null, fi: 0, fa: 0,
    set: { i: 0, confirm: null },
    playCtx: null, list: [], idx: 0, retries: 0,
    retryTimer: null, zapTimer: null, queryTimer: null, streamToken: 0,
    resumeAt: 0, healthy: false, quiet: false,
    infoTimer: null, toastTimer: null,
    digits: '', digitTimer: null, prevIdx: -1,
    pin: '', locked: {}, unlocked: {}, showPass: false, backup: null,
    tickTimer: null, tickCount: 0,
    sleepMin: 0, sleepAt: 0, clockText: '', spots: {}
};

function $(id) { return document.getElementById(id); }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function pad(n) { return n < 10 ? '0' + n : '' + n; }

function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
}

function readJSON(key, fallback) {
    try {
        var v = localStorage.getItem(key);
        return v ? JSON.parse(v) : fallback;
    } catch (e) { return fallback; }
}

function purgeLegacy() {
    try {
        var rm = [];
        for (var i = 0; i < localStorage.length; i++) {
            var k = localStorage.key(i);
            if (k && k.indexOf(CACHE_KEY) === 0) rm.push(k);
        }
        rm.forEach(function (k) { localStorage.removeItem(k); });
    } catch (e) { }
}

function writeJSON(key, value) {
    var str;
    try { str = JSON.stringify(value); } catch (e) { return false; }
    try { localStorage.setItem(key, str); } catch (e) {
        purgeLegacy();
        try { localStorage.setItem(key, str); } catch (e2) { }
    }
    if (MIRROR[key]) Store.set('j:' + key, value);
    return true;
}

function restoreMirrors() {
    Object.keys(MIRROR).forEach(function (key) {
        var has = null;
        try { has = localStorage.getItem(key); } catch (e) { }
        if (has !== null) return;
        Store.get('j:' + key).then(function (v) {
            if (v === null || typeof v !== 'object') return;
            try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { }
            if (key === SOURCES_KEY && Array.isArray(v) && !state.sources.length) {
                state.sources = v;
                if (state.screen === 'home') renderHome();
            } else if (key === FAV_KEY && !Array.isArray(v)) state.favorites = v;
            else if (key === POS_KEY && !Array.isArray(v)) state.pos = v;
            else if (key === HIST_KEY && !Array.isArray(v)) state.hist = v;
            else if (key === RECENT_KEY && !Array.isArray(v)) state.recent = v;
            else if (key === WATCH_KEY && !Array.isArray(v)) state.watched = v;
            else if (key === PIN_KEY && v && v.h) state.pin = v.h;
            else if (key === LOCK_KEY && !Array.isArray(v)) state.locked = v;
        });
    });
}
var DIACRITICS = /[\u0300-\u036f\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed\u0640]/g;
var AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';

function norm(s) {
    s = String(s == null ? '' : s).toLowerCase();
    if (s.normalize) { try { s = s.normalize('NFD'); } catch (e) { } }
    s = s.replace(DIACRITICS, '')
        .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
        .replace(/[٠-٩]/g, function (c) { return String(AR_DIGITS.indexOf(c)); })
        .replace(/[_\-.|:\/\\\[\]()]+/g, ' ')
        .replace(/\s+/g, ' ');
    return s.trim();
}

function safeLogo(url) { return url && /^https?:/i.test(url) ? url : ''; }
function hostOf(s) { return (s.url || '').replace(/^https?:\/\//i, '').split('/')[0]; }
function initial(name) { return (name || '?').trim().charAt(0).toUpperCase() || '?'; }
function isVod(it) { return !!it && (it.kind === 'vod' || it.kind === 'ep'); }
function keyOf(src, it) { return src.id + ':' + it.kind + ':' + it.id; }
function prov() { return PROVIDERS[state.source.type]; }
function errText(err) { return t((err && err.message) || 'Could not load this content.', err && err.params); }

function fmt(ms) {
    var s = Math.floor((ms || 0) / 1000);
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    var sec = s % 60;
    return h ? h + ':' + pad(m) + ':' + pad(sec) : m + ':' + pad(sec);
}

function forgetAll(id) {
    Object.keys(PROVIDERS).forEach(function (k) { PROVIDERS[k].forget(id); });
}

function countLabel(kind, n) {
    return t('{n} ' + KIND_META[kind].noun, { n: n });
}
