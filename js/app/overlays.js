/* Lumora — Channel list and program guide overlays inside the player. */
'use strict';

function chItems() { return state.chArr || state.list; }

function chGroups() {
    var cx = state.playCtx;
    return (cx && cx.kind === 'live' && !cx.query && cx.groups && cx.groups.length > 1) ? cx.groups : null;
}

function renderChanList() {
    var arr = chItems();
    var n = arr.length;
    var rows = 9;
    var start = Math.max(0, Math.min(state.chIdx - 4, n - rows));
    var end = Math.min(n, start + rows);
    var html = '';
    var curIt = state.list[state.idx];
    for (var i = start; i < end; i++) {
        html += '<li class="' + (i === state.chIdx ? 'cursor' : '') + (arr[i] === curIt ? ' now' : '') + (state.favorites[arr[i].key] ? ' fav' : '') + '"><span class="n">' + (i + 1) + '</span><span class="t">' + esc(arr[i].name) + '</span>' + (state.favorites[arr[i].key] ? '<span class="st">\u2605</span>' : '') + '</li>';
    }
    $('chlist-ul').innerHTML = html;
    var gs = chGroups();
    var title;
    if (gs && state.chGi !== undefined && gs[state.chGi]) title = '\u25C0  ' + t(gs[state.chGi].name) + '  \u25B6';
    else title = t((curIt && curIt.group) || '');
    $('chlist-title').textContent = title;
    var h = $('chlist-hint');
    if (h) h.textContent = (gs ? t('\u25C0\u25B6 Category') + '  \u00B7  ' : '') + t('OK Play') + '  \u00B7  ' + t('Yellow Favorite') + '  \u00B7  ' + t('Back Close');
}

function armChanList() {
    clearTimeout(state.chTimer);
    state.chTimer = setTimeout(closeChanList, 10000);
}

function openChanList() {
    if (!state.list.length) return;
    hideInfo();
    state.chOpen = true;
    state.chArr = null;
    state.chIdx = state.idx;
    var gs = chGroups();
    state.chGi = gs ? state.playCtx.gi : undefined;
    $('chlist').classList.remove('hidden');
    renderChanList();
    armChanList();
}

function closeChanList() {
    state.chOpen = false;
    state.chArr = null;
    clearTimeout(state.chTimer);
    $('chlist').classList.add('hidden');
}

function chStepGroup(d) {
    var gs = chGroups();
    if (!gs) return;
    var n = gs.length;
    var gi = state.chGi;
    for (var tries = 0; tries < n; tries++) {
        gi = (gi + d + n) % n;
        if (!gs[gi].restore && gs[gi].list.length) break;
    }
    var g = gs[gi];
    if (!g || g.restore || !g.list.length) return;
    var go = function () {
        state.chGi = gi;
        state.chArr = (gi === state.playCtx.gi) ? null : g.list;
        var arr = chItems();
        var at = arr.indexOf(state.list[state.idx]);
        state.chIdx = at >= 0 ? at : 0;
        renderChanList();
    };
    gate({ kind: state.playCtx.kind, group: g.name }, go);
}

function armGuide() {
    clearTimeout(state.gTimer);
    state.gTimer = setTimeout(closeGuide, 15000);
}

function closeGuide() {
    state.gOpen = false;
    state.gList = null;
    clearTimeout(state.gTimer);
    try { Net.cancel('guide'); } catch (e) { }
    var g = $('guide');
    if (g) g.classList.add('hidden');
}

function guideMsg(msg) {
    $('guide-ul').innerHTML = '<li><span class="t">' + esc(t(msg)) + '</span></li>';
}

function renderGuide() {
    var list = state.gList || [];
    var n = list.length;
    var rows = 9;
    var start = Math.max(0, Math.min(state.gIdx - 4, n - rows));
    var end = Math.min(n, start + rows);
    var now = Date.now() / 1000;
    var html = '';
    for (var i = start; i < end; i++) {
        var p = list[i];
        var cls = (i === state.gIdx ? 'cursor' : '') + (p.s <= now && p.e > now ? ' now' : '') + (p.e <= now ? ' past' : '');
        var mark = p.e <= now && p.arch ? '<span class="a">⏪</span>' : '';
        html += '<li class="' + cls + '"><span class="n">' + esc(p.time) + '</span><span class="t">' + esc(p.title) + '</span>' + mark + '</li>';
    }
    $('guide-ul').innerHTML = html;
}

function openGuide() {
    var it = curItem();
    if (!it || isVod(it) || !state.source || state.source.type !== 'xtream') { showInfo(); return; }
    hideInfo();
    state.gOpen = true;
    state.gList = null;
    state.gIdx = 0;
    $('guide-title').textContent = t('Program guide') + ' · ' + it.name;
    $('guide').classList.remove('hidden');
    guideMsg('Loading…');
    armGuide();
    Xtream.guide(state.source, it).then(function (list) {
        if (!state.gOpen || curItem() !== it) return;
        if (!list.length) { state.gList = []; guideMsg('No guide data'); return; }
        var now = Date.now() / 1000;
        var cur = 0;
        list.forEach(function (p, j) { if (p.s <= now && p.e > now) cur = j; });
        state.gList = list;
        state.gIdx = cur;
        renderGuide();
    }).catch(function () {
        if (state.gOpen) { state.gList = []; guideMsg('Could not load this content.'); }
    });
}

function playGuide(p) {
    var it = curItem();
    var now = Date.now() / 1000;
    if (p.s > now) { toast(t('Not started yet')); return; }
    if (p.e > now) {
        closeGuide();
        if (state.catchupUrl) { state.catchupUrl = null; tune(state.idx, true); } else showInfo();
        return;
    }
    if (!p.arch) { toast(t('Catch-up not available')); return; }
    var url = Xtream.catchupUrl(state.source, it, p);
    if (!url) { toast(t('Catch-up not available')); return; }
    closeGuide();
    state.catchupUrl = url;
    tune(state.idx, true);
    toast(t('Catch-up: {x}', { x: p.title }));
}

function onGuideKey(k) {
    var list = state.gList;
    armGuide();
    if (k === KEY.BACK || k === KEY.BACK_ALT || k === KEY.STOP || k === KEY.LEFT) { closeGuide(); return; }
    if (k === KEY.EXIT) { exitApp(); return; }
    if (!list || !list.length) return;
    var n = list.length;
    switch (k) {
        case KEY.UP: state.gIdx = Math.max(0, state.gIdx - 1); renderGuide(); break;
        case KEY.DOWN: state.gIdx = Math.min(n - 1, state.gIdx + 1); renderGuide(); break;
        case KEY.CH_UP: state.gIdx = Math.max(0, state.gIdx - 8); renderGuide(); break;
        case KEY.CH_DOWN: state.gIdx = Math.min(n - 1, state.gIdx + 8); renderGuide(); break;
        case KEY.ENTER: playGuide(list[state.gIdx]); break;
    }
}

function onChanListKey(k) {
    var arr = chItems();
    var n = arr.length;
    if (!n) { closeChanList(); return; }
    armChanList();
    var dir = 1;
    switch (k) {
        case KEY.UP: state.chIdx = (state.chIdx - 1 + n) % n; renderChanList(); break;
        case KEY.DOWN: state.chIdx = (state.chIdx + 1) % n; renderChanList(); break;
        case KEY.CH_UP: case KEY.RW: state.chIdx = Math.max(0, state.chIdx - 9); renderChanList(); break;
        case KEY.CH_DOWN: case KEY.FF: state.chIdx = Math.min(n - 1, state.chIdx + 9); renderChanList(); break;
        case KEY.LEFT: if (chGroups()) chStepGroup(-dir); else closeChanList(); break;
        case KEY.RIGHT: if (chGroups()) chStepGroup(dir); break;
        case KEY.YELLOW: toggleFav(arr[state.chIdx]); renderChanList(); break;
        case KEY.ENTER:
            var i = state.chIdx;
            var picked = arr[i];
            var other = state.chArr;
            if (other) {
                var cx = state.playCtx;
                state.list = other;
                state.idx = -1;
                state.prevIdx = -1;
                cx.gi = state.chGi;
                cx.vis = null;
                cx.ws = 0;
            }
            closeChanList();
            if (other || i !== state.idx) tune(i, true); else showInfo();
            break;
        case KEY.BACK: case KEY.BACK_ALT: case KEY.STOP: closeChanList(); break;
        case KEY.EXIT: exitApp(); break;
    }
}
