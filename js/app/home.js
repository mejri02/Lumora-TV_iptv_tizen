/* Lumora — Home screen (sources list) and source deletion. */
'use strict';

function homeTotal() { return state.sources.length + 4; }

function renderHome() {
    var list = state.sources;
    var html = '';
    list.forEach(function (s) {
        var warn = state.confirmDelete === s.id ? '<span class="warn">' + esc(t('Press BLUE again to remove')) + '</span>' : '';
        html += '<li class="src"><span class="badge">' + TYPE_LABEL[s.type] + '</span><span class="av">' + esc(initial(s.name)) + '</span>' +
            '<div class="src-main"><div class="src-name">' + esc(s.name) + '</div>' +
            '<div class="src-host">' + esc(hostOf(s)) + '</div>' + warn + '</div></li>';
    });
    $('source-list').innerHTML = html;
    $('tool-list').innerHTML =
        '<li class="tool"><svg><use href="#i-plus"/></svg><span>' + esc(t('Add source')) + '</span></li>' +
        '<li class="tool"><span class="ti">☰</span><span>' + esc(t('Sources menu')) + '</span></li>' +
        '<li class="tool"><svg><use href="#i-gear"/></svg><span>' + esc(t('Settings')) + '</span></li>' +
        '<li class="tool"><svg><use href="#i-tv"/></svg><span>' + esc(t('Link phone')) + '</span></li>';
    $('hero-sub').textContent = t('Saved sources') + ': ' + list.length;
    $('home-empty').classList.toggle('hidden', list.length > 0);
    state.si = clamp(state.si, 0, homeTotal() - 1);
    homeCursor();
    revealHome();
}

function homeCursor() {
    var n = state.sources.length;
    setCursor($('source-list'), state.si < n ? state.si : -1);
    setCursor($('tool-list'), state.si >= n ? state.si - n : -1);
}

function revealHome() {
    var n = state.sources.length;
    var el = state.si < n ? $('source-list').children[state.si] : $('tool-list').children[state.si - n];
    reveal($('home-box'), el, state.si < 3);
}

function goHome() {
    stopBg();
    try { Player.release(); } catch (e) { }
    leaveCtx(state.ctx);
    state.ctx = null;
    state.stack = [];
    state.source = null;
    showScreen('home');
    renderHome();
}

function moveHome(dx, dy) {
    var n = state.sources.length;
    var total = n + 4;
    var C = 3;
    var i = state.si;
    var ni = i;
    if (dx) {
        ni = i < n ? clamp(i + dx, 0, n - 1) : clamp(i + dx, n, total - 1);
    } else if (dy < 0) {
        if (i >= n) {
            if (n > 0) ni = Math.min(n - 1, Math.floor((n - 1) / C) * C + Math.min(i - n, C - 1));
        } else if (i - C >= 0) ni = i - C;
    } else if (dy > 0) {
        if (i < n) ni = i + C < n ? i + C : n + Math.min(3, i % C);
    }
    if (state.confirmDelete) { state.confirmDelete = null; state.si = ni; renderHome(); return; }
    state.si = ni;
    homeCursor();
    revealHome();
}

function onHomeKey(k) {
    var n = state.sources.length;
    switch (k) {
        case KEY.LEFT: moveHome(-1, 0); break;
        case KEY.RIGHT: moveHome(1, 0); break;
        case KEY.UP: moveHome(0, -1); break;
        case KEY.DOWN: moveHome(0, 1); break;
        case KEY.ENTER:
            if (state.si < n) openSource(state.sources[state.si]);
            else if (state.si === n) openForm(null);
            else if (state.si === n + 1) openManage(state.sources[0] || null);
            else if (state.si === n + 2) openSettings();
            else openLink();
            break;
        case KEY.GREEN: if (state.si < n) openForm(state.sources[state.si]); break;
        case KEY.YELLOW: openSettings(); break;
        case KEY.BLUE:
            if (state.si >= n) break;
            var s = state.sources[state.si];
            if (state.confirmDelete === s.id) deleteSource(s);
            else { state.confirmDelete = s.id; renderHome(); }
            break;
        case KEY.BACK: case KEY.BACK_ALT:
            showModal({
                title: 'Exit Lumora?',
                name: '',
                opts: [['Exit', ''], ['Cancel', '']],
                onPick: function (i) { if (i === 0) exitApp(); }
            });
            break;
        case KEY.EXIT: exitApp(); break;
    }
}

// Removes every record that belongs to one source (favorites, progress, history, hidden/locked categories).
function purgeSourceData(id) {
    var pre = id + ':';
    [state.favorites, state.pos, state.hist, state.recent].forEach(function (o) {
        Object.keys(o || {}).forEach(function (k) { if (k.indexOf(pre) === 0) delete o[k]; });
    });
    Object.keys(state.hidden || {}).forEach(function (k) { if (k.indexOf(pre) === 0) delete state.hidden[k]; });
    Object.keys(state.locked || {}).forEach(function (k) { if (k.indexOf(id + '|') === 0) delete state.locked[k]; });
    Object.keys(state.unlocked || {}).forEach(function (k) { if (k.indexOf(id + '|') === 0) delete state.unlocked[k]; });
    Object.keys(state.epgCache || {}).forEach(function (k) { if (k.indexOf(pre) === 0) delete state.epgCache[k]; });
    writeJSON(FAV_KEY, state.favorites);
    writeJSON(POS_KEY, state.pos);
    writeJSON(HIST_KEY, state.hist);
    writeJSON(RECENT_KEY, state.recent);
    writeJSON(HID_KEY, state.hidden);
    writeJSON(LOCK_KEY, state.locked);
}

function deleteSource(s) {
    state.sources = state.sources.filter(function (x) { return x.id !== s.id; });
    writeJSON(SOURCES_KEY, state.sources);
    clearCache(s.id);
    forgetAll(s.id);
    purgeSourceData(s.id);
    try { if (localStorage.getItem(LAST_KEY) === s.id) localStorage.removeItem(LAST_KEY); } catch (e) { }
    state.confirmDelete = null;
    renderHome();
    toast(t('Source removed'));
}
