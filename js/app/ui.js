/* Lumora — Shared UI: toast, loading, screens, key hints, clock, appearance. */
'use strict';

function toast(msg, isErr) {
    var el = $('toast');
    el.textContent = msg;
    el.classList.toggle('err', !!isErr);
    el.classList.remove('hidden');
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(function () { el.classList.add('hidden'); }, isErr ? 6500 : 2800);
}

function showLoading(on, text) {
    var sub = $('loading-sub');
    if (text) $('loading-text').textContent = t(text);
    clearInterval(state.loadTick);
    state.loadTick = null;
    if (on) {
        if (!state.loadingOn) state.loadSince = Date.now();
        state.loadingOn = true;
        sub.textContent = '';
        sub.classList.add('hidden');
        state.loadTick = setInterval(function () {
            var ms = Date.now() - state.loadSince;
            if (ms >= CFG.LOADING_SLOW_MS) {
                sub.textContent = t('Still working… press BACK to cancel') + '  (' + Math.floor(ms / 1000) + ')';
                sub.classList.remove('hidden');
            }
        }, 1000);
    } else {
        state.loadingOn = false;
        sub.classList.add('hidden');
    }
    $('loading').classList.toggle('hidden', !on);
}

function exitApp() {
    try { tizen.application.getCurrentApplication().exit(); } catch (e) { window.close(); }
}

function screenSaver(on) {
    try {
        var ac = window.webapis && window.webapis.appcommon;
        if (!ac || !ac.setScreenSaver) return;
        ac.setScreenSaver(on ? ac.AppCommonScreenSaverState.SCREEN_SAVER_ON : ac.AppCommonScreenSaverState.SCREEN_SAVER_OFF, function () { }, function () { });
    } catch (e) { }
}

function reveal(box, el, top) {
    if (!box || !el) return;
    if (top) { box.scrollTop = 0; return; }
    var a = el.offsetTop;
    var b = a + el.offsetHeight;
    var pad2 = 28;
    if (a - pad2 < box.scrollTop) box.scrollTop = Math.max(0, a - pad2);
    else if (b + pad2 > box.scrollTop + box.clientHeight) box.scrollTop = b + pad2 - box.clientHeight;
}

function setCursor(listEl, idx) {
    var kids = listEl.children;
    for (var i = 0; i < kids.length; i++) kids[i].classList.toggle('cursor', i === idx);
}
function renderHints() {
    var footers = document.querySelectorAll('.hints');
    for (var i = 0; i < footers.length; i++) {
        var list = HINTS[footers[i].getAttribute('data-h')] || [];
        var html = '';
        list.forEach(function (h) {
            var chip = h[0];
            var c = (chip === 'r' || chip === 'g' || chip === 'y' || chip === 'b')
                ? '<span class="k c ' + chip + '"></span>'
                : '<span class="k">' + chip + '</span>';
            html += '<span class="h">' + c + '<span>' + esc(t(h[1], { n: S.get('seekStep') })) + '</span></span>';
        });
        footers[i].innerHTML = html;
    }
}

// Hold low-priority downloads only while the player is starting/buffering, not for the whole playback.
function syncBusy(screen) {
    try {
        var sc = screen || state.screen;
        if (window.Net && Net.setBusy) Net.setBusy(sc === 'player' && !state.healthy);
    } catch (e) { }
}

function showScreen(name) {
    try { if (document.activeElement && document.activeElement.tagName === 'INPUT') document.activeElement.blur(); } catch (e) { }
    hideModal();
    try { closeAcct(); } catch (ea) { }
    try { closeQuick(); } catch (eq) { }
    if (name === 'home') state.unlocked = {};
    if (name === 'settings' && state.screen !== 'settings') state.prev = state.screen;
    state.screen = name;
    syncBusy(name);
    ['home', 'form', 'hub', 'browse', 'settings'].forEach(function (id) {
        var el = $(id);
        var on = id === name;
        el.classList.toggle('hidden', !on);
        if (on) {
            el.classList.remove('enter');
            void el.offsetWidth;
            el.classList.add('enter');
        }
    });
    $('player-ui').classList.toggle('hidden', name !== 'player');
    renderBg();
    document.documentElement.classList.toggle('playing', name === 'player');
    syncBgVideo();
    if (name !== 'player') { hideInfo(); closeChanList(); rcHide(); }
    if (name !== 'form') Net.cancel('test');
    showLoading(false);
}

var CK_DAYS = {
    ar: ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'],
    en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
};
var CK_MONTHS = {
    ar: ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'],
    en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
};

function clockData() {
    var mode = S.get('clock');
    if (mode === 'off') return null;
    var d = new Date();
    var rtl = I18n.isRtl();
    var L = rtl ? 'ar' : 'en';
    var h = d.getHours();
    var ap = '';
    if (mode === '12') {
        ap = h >= 12 ? (rtl ? 'م' : 'PM') : (rtl ? 'ص' : 'AM');
        h = h % 12 || 12;
    }
    return {
        h: mode === '12' ? String(h) : pad(h),
        m: pad(d.getMinutes()),
        ap: ap,
        date: CK_DAYS[L][d.getDay()] + (rtl ? ' ' : ', ') + d.getDate() + ' ' + CK_MONTHS[L][d.getMonth()]
    };
}

function clockString() {
    var c = clockData();
    return c ? c.h + ':' + c.m + c.ap + c.date : '';
}

function renderClock() {
    var c = clockData();
    state.clockText = clockString();
    var html = c
        ? '<span class="ck-t"><b>' + c.h + '</b><i>:</i><b>' + c.m + '</b></span><span class="ck-s">' + (c.ap ? '<em>' + c.ap + '</em>' : '') + '<span class="ck-d">' + esc(c.date) + '</span></span>'
        : '';
    var els = document.querySelectorAll('.clock');
    for (var i = 0; i < els.length; i++) {
        if (els[i]._h !== html) { els[i]._h = html; els[i].innerHTML = html; }
        els[i].classList.toggle('hidden', !c);
    }
}

// Themes added later (Solo Leveling, Mega City, Ultra Instinct, Fortnite, JJK) have no hand-written logo symbol; build it from the icon pack.
function ensureMark(th) {
    var id = 'mark-' + th;
    if (document.getElementById(id)) return true;
    try {
        var inner = window.Icons && Icons.mark(th);
        if (!inner) return false;
        var NS = 'http://www.w3.org/2000/svg';
        var host = document.querySelector('svg defs') ? document.querySelector('svg defs').parentNode : null;
        if (!host) return false;
        var tmp = document.createElementNS(NS, 'svg');
        tmp.innerHTML = '<symbol id="' + id + '" viewBox="0 0 64 64">' + inner + '</symbol>';
        var sym = tmp.firstChild;
        if (!sym) return false;
        host.appendChild(sym);
        return !!document.getElementById(id);
    } catch (e) { return false; }
}

function applyOverlay() {
    var a = Number(S.get('overlayAlpha'));
    if (!(a >= 30 && a <= 100)) a = 80;
    document.documentElement.style.setProperty('--ov', String(a / 100));
}

function applyMark(th) {
    var ref = ensureMark(th) ? '#mark-' + th : '#mark';
    var uses = document.querySelectorAll('.mark use');
    for (var i = 0; i < uses.length; i++) {
        uses[i].setAttribute('href', ref);
        try { uses[i].setAttributeNS('http://www.w3.org/1999/xlink', 'href', ref); } catch (e) { }
    }
}

var VIDEO_THEMES = { synthwave: 'images/themes/synthwave.mp4', jjk: 'images/themes/jjk.mp4' };

function syncBgVideo() {
    var bg = $('bg');
    if (!bg) return;
    var root = document.documentElement;
    var th = S.get('theme');
    var src = VIDEO_THEMES[th];
    var want = !!src && !root.classList.contains('playing') && !root.classList.contains('mini');
    var v = bg.querySelector('video');
    if (!want) {
        if (v) {
            try { v.pause(); v.removeAttribute('src'); v.load(); } catch (e) { }
            while (bg.firstChild) bg.removeChild(bg.firstChild);
        }
        return;
    }
    if (v && v.getAttribute('data-src') === src) {
        try { v.play(); } catch (e2) { }
        return;
    }
    while (bg.firstChild) bg.removeChild(bg.firstChild);
    v = document.createElement('video');
    v.setAttribute('data-src', src);
    v.muted = true;
    v.loop = true;
    v.autoplay = true;
    v.setAttribute('playsinline', '');
    v.setAttribute('muted', '');
    v.onerror = function () { if (v.parentNode) v.parentNode.removeChild(v); };
    v.src = src;
    bg.appendChild(v);
    var sh = document.createElement('div');
    sh.className = 'vshade';
    bg.appendChild(sh);
    try { var pr = v.play(); if (pr && pr.catch) pr.catch(function () { }); } catch (e3) { }
}

function applyAppearance() {
    var root = document.documentElement;
    var th = S.get('theme');
    if (!THEME_META[th]) { th = 'spider'; S.set('theme', th); }
    root.setAttribute('data-theme', th);
    applyMark(th);
    applyOverlay();
    root.classList.remove('bgfail');
    var pre = new Image();
    pre.onerror = function () { if (S.get('theme') === th) root.classList.add('bgfail'); };
    pre.src = 'images/themes/' + th + '.jpg';
    root.classList.toggle('noanim', !S.get('animations'));
    syncBgVideo();
    var lg = S.get('lang');
    if (state.lastLang !== lg) {
        state.lastLang = lg;
        I18n.setLang(lg);
        I18n.apply();
        renderHints();
        renderClock();
    }
}

function registerKeys() {
    var tv = window.tizen && window.tizen.tvinputdevice;
    if (!tv) return;
    ['MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop', 'MediaRewind', 'MediaFastForward',
     'ChannelUp', 'ChannelDown', 'ColorF0Red', 'ColorF1Green',
     'ColorF2Yellow', 'ColorF3Blue', 'Info', 'MediaTrackPrevious', 'MediaTrackNext',
     'Menu', 'Tools', 'Guide', 'ChannelList',
     '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].forEach(function (k) {
        try { tv.registerKey(k); } catch (e) { }
    });
}
