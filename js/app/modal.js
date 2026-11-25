/* Lumora — Modals, PIN / parental lock, audio+subtitle tracks, backup & restore. */
'use strict';

function showModal(m) {
    state.modal = m;
    m.i = 0;
    m.val = '';
    renderModal();
    $('modal').classList.remove('hidden');
}

function hideModal() {
    state.modal = null;
    $('modal').classList.add('hidden');
}

function renderModal() {
    var m = state.modal;
    if (!m) return;
    $('modal-title').textContent = t(m.title);
    var nm = $('modal-name');
    nm.classList.toggle('pin', !!m.pin);
    if (m.pin) {
        var dots = '';
        for (var d = 0; d < CFG.PIN_LEN; d++) dots += (d < m.val.length ? '●' : '○') + ' ';
        nm.textContent = dots;
    } else {
        nm.textContent = m.name || '';
    }
    var html = '';
    m.opts.forEach(function (o, i) {
        html += '<span class="btn' + (i === 0 ? ' primary' : '') + (i === m.i ? ' sel' : '') + '">' + esc(t(o[0], { x: o[1] })) + '</span>';
    });
    $('modal-btns').innerHTML = html;
}


var INSTANT = { setpin: 1, export: 1, import: 1, tmdb: 1, pair: 1 };

function hashPin(p) {
    var h = 5381;
    var s = 'lumora:' + p;
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return String(h);
}

function askPin(title, cb) {
    showModal({ title: title, name: '', pin: true, opts: [['Cancel', '']], onPick: function () { }, onDone: cb });
}

function verifyPin(cb, title) {
    askPin(title || 'Enter PIN', function (p) {
        if (hashPin(p) === state.pin) cb();
        else toast(t('Wrong PIN'), true);
    });
}

function guardPin(cb) {
    if (S.get('parental') && state.pin) verifyPin(cb);
    else cb();
}

function setPinFlow(done) {
    function fresh() {
        askPin('Enter new PIN', function (a) {
            askPin('Confirm new PIN', function (b) {
                if (a !== b) { toast(t('PINs do not match'), true); return; }
                state.pin = hashPin(a);
                writeJSON(PIN_KEY, { h: state.pin });
                toast(t('PIN saved'));
                if (done) done();
            });
        });
    }
    if (state.pin) verifyPin(fresh, 'Enter current PIN');
    else fresh();
}

function lockOn() { return !!(S.get('parental') && S.get('lockCats') && state.pin); }

function lockId(it) {
    return (state.source ? state.source.id : '') + '|' + (it.kind || '') + '|' + (it.group || '');
}

function isGated(it) {
    if (!lockOn() || !it || it.kind === 'ep' || it.direct) return false;
    var id = lockId(it);
    return !!state.locked[id] && !state.unlocked[id];
}

function gate(it, go) {
    if (!isGated(it)) { go(); return; }
    var id = lockId(it);
    verifyPin(function () {
        state.unlocked[id] = true;
        go();
    });
}

function toggleLock() {
    var ctx = state.ctx;
    var g = ctx && ctx.groups[ctx.gi];
    if (!g || KINDS.indexOf(ctx.kind) < 0) { toast(t('Nothing to lock here')); return; }
    if (!S.get('parental') || !state.pin) { toast(t('Turn on Parental lock in Settings first'), true); return; }
    var id = lockId({ kind: ctx.kind, group: g.name });
    verifyPin(function () {
        if (state.locked[id]) delete state.locked[id];
        else state.locked[id] = 1;
        delete state.unlocked[id];
        writeJSON(LOCK_KEY, state.locked);
        toast(t(state.locked[id] ? 'Category locked' : 'Category unlocked'));
        if (state.screen === 'browse') renderBrowse();
    });
}

function lastChannel() {
    if (state.prevIdx < 0 || state.prevIdx >= state.list.length || state.prevIdx === state.idx) {
        toast(t('No previous channel'));
        return;
    }
    tune(state.prevIdx, true);
}

function trackName(tr, n) { return tr.lang || t('Track {n}', { n: n + 1 }); }

function pickTrack(type) {
    if (type === 'QUALITY') { pickQuality(); return; }
    var list = Player.tracks(type);
    if (!list.length) { toast(t(type === 'AUDIO' ? 'No audio tracks available' : 'No subtitles available')); return; }
    var opts = [];
    var map = [];
    var label = [];
    var sel = 0;
    if (type === 'TEXT') { opts.push(['Off', '']); map.push(-1); label.push(t('Off')); }
    list.forEach(function (tr, n) {
        if (tr.selected) sel = opts.length;
        opts.push(['{x}', (tr.selected ? '● ' : '') + trackName(tr, n)]);
        map.push(tr.index);
        label.push(trackName(tr, n));
    });
    showModal({
        title: type === 'AUDIO' ? 'Audio track' : 'Subtitles',
        name: '',
        opts: opts,
        onPick: function (i) {
            if (Player.selectTrack(type, map[i])) toast(t(type === 'AUDIO' ? 'Audio: {x}' : 'Subtitles: {x}', { x: label[i] }));
        }
    });
    state.modal.i = sel;
    renderModal();
}

function openTracks() {
    var a = Player.tracks('AUDIO').length;
    var s = Player.tracks('TEXT').length;
    var q = Player.qualities().length;
    if (!a && !s && !q) { toast(t('No audio tracks available')); return; }
    var cats = [];
    if (q) cats.push(['Quality', '']);
    if (a && s) cats.push(['Audio track', ''], ['Subtitles', '']);
    else if (a || s) cats.push([a ? 'Audio track' : 'Subtitles', '']);
    if (cats.length === 1) { pickTrack(a ? 'AUDIO' : (s ? 'TEXT' : 'QUALITY')); return; }
    showModal({
        title: 'Audio / Subtitles',
        name: '',
        opts: cats,
        onPick: function (i) { pickTrack(i === 0 && q ? 'QUALITY' : (cats[i][0] === 'Subtitles' ? 'TEXT' : 'AUDIO')); }
    });
}

function pickQuality() {
    var list = Player.qualities();
    if (list.length < 2) { toast(t('Only one quality available')); return; }
    var opts = [];
    var map = [];
    var sel = 0;
    list.forEach(function (q, n) {
        var lbl = q.auto ? 'Auto' : ((q.h ? q.h + 'p' : 'Level ' + (n)) + (q.br ? '  ' + Math.round(q.br / 1000) + ' kbps' : ''));
        if (q.sel) sel = opts.length;
        opts.push(['{x}', (q.sel ? '● ' : '') + lbl]);
        map.push(q.index);
    });
    showModal({
        title: 'Quality',
        name: '',
        opts: opts,
        onPick: function (i) {
            if (Player.selectQuality(map[i])) toast(t('Quality: {x}', { x: opts[i][1].replace('● ', '') }));
        }
    });
    state.modal.i = sel;
    renderModal();
}

function techText() {
    var si = Player.streamInfo();
    var parts = [];
    if (si.engine) parts.push(si.engine);
    if (si.w && si.h) parts.push(si.w + '\u00D7' + si.h);
    if (si.kbps) parts.push(si.kbps >= 1000 ? (si.kbps / 1000).toFixed(1) + ' Mbps' : si.kbps + ' kbps');
    if (si.ac) parts.push('\u266A ' + si.ac + (si.ach ? ' ' + si.ach + 'ch' : ''));
    var txt = parts.join('  \u00B7  ');
    if (S.get('diag')) txt += '\n' + Player.diag() + (state.lastErr ? '\n' + state.lastErr : '');
    return txt;
}

function plain(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }

function parseBackup(raw) {
    if (raw.length > 5000000) return { error: 'Backup contains invalid data' };
    var o;
    try { o = JSON.parse(raw); } catch (e) { return { error: 'Backup is not valid JSON' }; }
    if (!plain(o) || o.app !== 'lumora' || o.v !== 1) return { error: 'Backup was not made by Lumora' };
    if (!Array.isArray(o.sources) || o.sources.length > 200) return { error: 'Backup contains an invalid source' };
    var seen = {};
    var sources = [];
    for (var i = 0; i < o.sources.length; i++) {
        var s = o.sources[i];
        if (!plain(s) || TYPE_ORDER.indexOf(s.type) < 0 || typeof s.id !== 'string' || !/^[\w.-]{1,64}$/.test(s.id) || seen[s.id]) {
            return { error: 'Backup contains an invalid source' };
        }
        seen[s.id] = 1;
        var u = Validate.httpUrl(s.url);
        if (!u.ok) return { error: 'Backup contains an invalid source' };
        var mac = '';
        if (s.type === 'stalker') {
            var m = Validate.mac(s.mac);
            if (!m.ok) return { error: 'Backup contains an invalid source' };
            mac = m.value;
        }
        sources.push({
            id: s.id, type: s.type, name: Validate.name(s.name) || hostOf({ url: u.value }), url: u.value,
            user: s.type === 'xtream' ? String(s.user || '').slice(0, CFG.CRED_MAX_LEN) : '',
            pass: s.type === 'xtream' ? String(s.pass || '').slice(0, CFG.CRED_MAX_LEN) : '',
            format: /^[a-z0-9]{2,5}$/i.test(s.format || '') ? s.format : 'm3u8', mac: mac,
            proxy: s.type === 'stalker' && typeof s.proxy === 'string' && Validate.httpUrl(s.proxy).ok ? Validate.httpUrl(s.proxy).value : ''
        });
    }
    var out = { sources: sources, favorites: {}, pos: {}, hist: {}, recent: {}, hidden: {}, locked: {}, settings: null };
    var names = ['favorites', 'pos', 'hist', 'recent'];
    for (var n = 0; n < names.length; n++) {
        var src = o[names[n]];
        if (src === undefined) continue;
        if (!plain(src)) return { error: 'Backup contains invalid data' };
        var keys = Object.keys(src);
        if (keys.length > 50000) return { error: 'Backup contains invalid data' };
        for (var j = 0; j < keys.length; j++) {
            var key = keys[j];
            if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
            var v = src[key];
            if (names[n] === 'pos') {
                if (typeof v !== 'number' || !isFinite(v) || v < 0) return { error: 'Backup contains invalid data' };
            } else if (!plain(v)) {
                return { error: 'Backup contains invalid data' };
            }
            out[names[n]][key] = v;
        }
    }
    var bad = { error: 'Backup contains invalid data' };
    if (o.hidden !== undefined) {
        if (!plain(o.hidden)) return bad;
        Object.keys(o.hidden).slice(0, 2000).forEach(function (k) {
            if (k === '__proto__' || k === 'constructor' || k === 'prototype' || !plain(o.hidden[k])) return;
            var m = {};
            Object.keys(o.hidden[k]).forEach(function (n) {
                if (n !== '__proto__' && n !== 'constructor' && n !== 'prototype' && o.hidden[k][n]) m[n] = true;
            });
            out.hidden[k] = m;
        });
    }
    if (o.locked !== undefined) {
        if (!plain(o.locked)) return bad;
        Object.keys(o.locked).slice(0, 5000).forEach(function (k) {
            if (k !== '__proto__' && k !== 'constructor' && k !== 'prototype' && o.locked[k]) out.locked[k] = 1;
        });
    }
    if (o.settings !== undefined) {
        if (!plain(o.settings)) return bad;
        out.settings = o.settings;
    }
    return { data: out };
}

function showBackup(mode) {
    var ta = $('backup-text');
    state.backup = { mode: mode };
    if (mode === 'tmdb') {
        $('backup-title').textContent = t('TMDB API key');
        $('backup-note').textContent = t('Free key from themoviedb.org → Settings → API. Used to load movie and series descriptions. This product uses the TMDB API but is not endorsed or certified by TMDB.');
        $('backup-hint').textContent = t('OK: type or paste · GREEN: save · BACK: close');
        ta.readOnly = false;
        ta.value = String(S.get('tmdbKey') || '');
        $('backup').classList.remove('hidden');
        ta.scrollTop = 0;
        return;
    }
    $('backup-title').textContent = t(mode === 'export' ? 'Export backup' : 'Import backup');
    $('backup-note').textContent = t('Backup contains your passwords. Keep it private.');
    $('backup-hint').textContent = t(mode === 'export' ? 'Scroll with ▲▼, press BACK to close' : 'OK: type or paste · GREEN: import · BACK: close');
    ta.readOnly = mode === 'export';
    ta.value = mode === 'export' ? JSON.stringify({ app: 'lumora', v: 1, at: Date.now(), sources: state.sources, favorites: state.favorites, pos: state.pos, hist: state.hist, recent: state.recent, hidden: state.hidden, locked: state.locked, settings: S.exportable() }) : '';
    $('backup').classList.remove('hidden');
    ta.scrollTop = 0;
}

function saveTmdbKey() {
    var v = $('backup-text').value.replace(/[^A-Za-z0-9._-]/g, '');
    S.set('tmdbKey', v);
    hideBackup();
    Net.clear();
    toast(t('TMDB key saved'));
    if (state.screen === 'settings') renderSettings();
}

function hideBackup() {
    state.backup = null;
    try { $('backup-text').blur(); } catch (e) { }
    $('backup').classList.add('hidden');
}

function importBackup() {
    var raw = $('backup-text').value.trim();
    if (!raw) { toast(t('Paste the backup text first'), true); return; }
    var r = parseBackup(raw);
    if (r.error) { toast(t(r.error), true); return; }
    showModal({
        title: 'Replace current data with this backup?',
        name: t('{n} sources', { n: r.data.sources.length }),
        opts: [['Replace', ''], ['Cancel', '']],
        onPick: function (i) { if (i === 0) applyBackup(r.data); }
    });
}

function applyBackup(d) {
    state.sources.forEach(function (s) { clearCache(s.id); forgetAll(s.id); });
    Object.keys(state.catCache).forEach(function (k) { delete state.catCache[k]; });
    state.sources = d.sources;
    state.favorites = d.favorites;
    state.pos = d.pos;
    state.hist = d.hist;
    state.recent = d.recent || {};
    writeJSON(SOURCES_KEY, state.sources);
    writeJSON(FAV_KEY, state.favorites);
    writeJSON(POS_KEY, state.pos);
    writeJSON(HIST_KEY, state.hist);
    writeJSON(RECENT_KEY, state.recent);
    state.hidden = d.hidden || {};
    state.locked = d.locked || {};
    state.unlocked = {};
    writeJSON(HID_KEY, state.hidden);
    writeJSON(LOCK_KEY, state.locked);
    if (d.settings) {
        S.setMany(d.settings);
        Player.setAspect(S.get('aspect'));
        Player.setProfile(S.get('buffer'));
        Player.setEngine(S.get('engine'));
        applyAppearance();
    }
    state.si = 0;
    hideBackup();
    toast(t('Backup restored'));
    if (state.screen === 'settings') renderSettings();
}

function onBackupKey(k) {
    var ta = $('backup-text');
    switch (k) {
        case KEY.UP: ta.scrollTop = Math.max(0, ta.scrollTop - 140); break;
        case KEY.DOWN: ta.scrollTop += 140; break;
        case KEY.ENTER: if (state.backup.mode !== 'export') ta.focus(); break;
        case KEY.GREEN:
            if (state.backup.mode === 'import') importBackup();
            else if (state.backup.mode === 'tmdb') saveTmdbKey();
            break;
        case KEY.BACK: case KEY.BACK_ALT: hideBackup(); break;
        case KEY.EXIT: exitApp(); break;
    }
}

function onModalKey(k) {
    var m = state.modal;
    if (!m) return;
    var dg = (k >= 48 && k <= 57) ? k - 48 : ((k >= 96 && k <= 105) ? k - 96 : -1);
    if (m.pin && dg >= 0) {
        m.val += String(dg);
        if (m.val.length >= CFG.PIN_LEN) {
            var entered = m.val;
            var done = m.onDone;
            hideModal();
            done(entered);
            return;
        }
        renderModal();
        return;
    }
    switch (k) {
        case KEY.LEFT: case KEY.UP: m.i = clamp(m.i - 1, 0, m.opts.length - 1); renderModal(); break;
        case KEY.RIGHT: case KEY.DOWN: m.i = clamp(m.i + 1, 0, m.opts.length - 1); renderModal(); break;
        case KEY.ENTER:
            var pick = m.onPick;
            var i = m.i;
            hideModal();
            pick(i);
            break;
        case KEY.BACK: case KEY.BACK_ALT: hideModal(); break;
        case KEY.EXIT: exitApp(); break;
    }
}
