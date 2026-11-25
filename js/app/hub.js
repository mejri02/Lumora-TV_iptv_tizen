/* Lumora — Source hub (Live / Movies / Series / Favorites) and source switcher. */
'use strict';

function openSource(src) {
    if (state.bg && state.bg.srcId !== src.id) stopBg();
    state.source = src;
    state.favorites = readJSON(FAV_KEY, {});
    state.pos = readJSON(POS_KEY, {});
    state.hist = readJSON(HIST_KEY, {});
    state.recent = readJSON(RECENT_KEY, {}) || {};
    state.hidden = readJSON(HID_KEY, {}) || {};
    migrateFavs(src);
    state.ctx = null;
    state.stack = [];
    state.hi = 0;
    try { localStorage.setItem(LAST_KEY, src.id); } catch (e) { }
    if (src.type === 'stalker') Stalker.login(src).catch(function () { });
    showScreen('hub');
    renderHub();
    warm(src);
}

function renderHub() {
    var s = state.source;
    $('hub-title').textContent = s.name;
    $('hub-type').textContent = TYPE_LABEL[s.type];
    hubAccount(s);
    var counts = readJSON(COUNT_KEY + s.id, {});
    var html = '';
    var pk = Icons.resolve(S.get('iconPack'), S.get('theme'));
    HUB.forEach(function (k) {
        var m = KIND_META[k];
        var n = k === 'favs' ? favItems(s).length : k === 'cont' ? histItems(s).length : counts[k];
        var art = pk === 'classic'
            ? '<img class="art" src="images/tiles/' + S.get('theme') + '-' + (k === 'cont' ? 'vod' : k) + '.png" onerror="this.onerror=null;this.src=\'' + m.art + '\'" alt="">'
            : '<div class="art svgart">' + Icons.svg(pk, k) + '</div>';
        html += '<li class="tile t-' + k + '">' + art + '<div>' +
            '<div class="tname">' + esc(t(m.title)) + '</div>' +
            '<div class="tcount">' + esc(n === undefined ? t('Press OK to load') : countLabel(k, n)) + '</div></div></li>';
    });
    $('hub-list').innerHTML = html;
    setCursor($('hub-list'), state.hi);
    hubSwitchCursor();
}

function hubAccount(s) {
    var el = $('hub-exp');
    if (!el) return;
    el.textContent = '';
    if (s.type !== 'xtream') return;
    Xtream.login(s).then(function (info) {
        if (state.screen !== 'hub' || !state.source || state.source.id !== s.id) return;
        var ui = (info && info.user_info) || {};
        var parts = [];
        if (/^\d+$/.test(String(ui.exp_date || ''))) parts.push(t('Expires') + ' ' + pad2date(ui.exp_date));
        var max = parseInt(ui.max_connections, 10);
        if (max > 0) parts.push(t('Connections') + ' ' + (parseInt(ui.active_cons, 10) || 0) + '/' + max);
        el.textContent = parts.join('  ·  ');
    }, function () { });
}

function hubSwitchCursor() {
    var b = $('hub-switch');
    if (!b) return;
    b.textContent = '☰ ' + t('Sources menu');
    b.classList.toggle('sel', state.hi === -1);
    b.classList.toggle('primary', state.hi === -1);
}

function daysLeft(sec) {
    return Math.ceil((parseInt(sec, 10) * 1000 - Date.now()) / 86400000);
}

function acctRows(src, info) {
    var rows = [];
    var counts = readJSON(COUNT_KEY + src.id, {});
    rows.push([t('Type'), TYPE_NAME[src.type], '']);
    rows.push([t('Server'), hostOf(src), '']);
    if (info) {
        var ui = info.user_info || {};
        var si = info.server_info || {};
        var st = String(ui.status || '');
        var okSt = st === 'Active';
        rows.push([t('Status'), st ? t(st) : '-', okSt ? 'ok' : 'bad']);
        if (/^\d+$/.test(String(ui.exp_date || '')) && parseInt(ui.exp_date, 10) > 0) {
            var d = daysLeft(ui.exp_date);
            var left = d < 0 ? t('Expired') : d === 0 ? t('Expires today') : t('{n} days left', { n: d });
            rows.push([t('Expires'), pad2date(ui.exp_date) + '   ·   ' + left, d < 0 ? 'bad' : d <= 14 ? 'warn' : 'ok']);
        } else {
            rows.push([t('Expires'), t('Unlimited'), 'ok']);
        }
        if (/^\d+$/.test(String(ui.created_at || ''))) rows.push([t('Created'), pad2date(ui.created_at), '']);
        rows.push([t('Trial'), String(ui.is_trial) === '1' ? t('Yes') : t('No'), '']);
        var max = parseInt(ui.max_connections, 10);
        var act = parseInt(ui.active_cons, 10) || 0;
        if (max > 0) rows.push([t('Connections'), act + ' / ' + max, act >= max ? 'warn' : '']);
        if (ui.username) rows.push([t('Username'), String(ui.username), '']);
        if (si.timezone) rows.push([t('Time zone'), String(si.timezone), '']);
    }
    var lib = [];
    KINDS.forEach(function (k) { if (counts[k] !== undefined) lib.push(countLabel(k, counts[k])); });
    if (lib.length) rows.push([t('Library'), lib.join('   ·   '), '']);
    return rows;
}

function paintAcct(src, rows, msg) {
    $('acct-title').textContent = t('Account info');
    $('acct-sub').textContent = src.name;
    var html = '';
    if (msg) html = '<li class="msg">' + esc(msg) + '</li>';
    else rows.forEach(function (r) {
        html += '<li><span class="ak">' + esc(r[0]) + '</span><span class="av2 ' + r[2] + '">' + esc(r[1]) + '</span></li>';
    });
    $('acct-list').innerHTML = html;
    $('acct-hint').textContent = t('Press OK or BACK to close');
    $('acct').classList.remove('hidden');
}

function openAccount(src) {
    src = src || state.source;
    if (!src) return;
    state.acct = true;
    var tok = state.acctTok = (state.acctTok || 0) + 1;
    if (src.type !== 'xtream') { paintAcct(src, acctRows(src, null)); return; }
    paintAcct(src, null, t('Loading…'));
    Xtream.account(src).then(function (info) {
        if (state.acct && state.acctTok === tok) paintAcct(src, acctRows(src, info));
    }, function (err) {
        if (state.acct && state.acctTok === tok) paintAcct(src, null, errText(err));
    });
}

function closeAcct() {
    state.acct = false;
    state.acctTok = (state.acctTok || 0) + 1;
    var el = $('acct');
    if (el) el.classList.add('hidden');
}

function openManage(src) {
    if (!src && state.sources.length) src = state.sources[0];
    var has = !!src;
    var acts = [];
    if (state.sources.length > 1) acts.push(['Switch source', function () { openSwitcher(); }]);
    acts.push(['Add source', function () { openForm(null); }]);
    acts.push(['Settings', function () { openSettings(); }]);
    if (has) acts.push(['Account info', function () { openAccount(src); }]);
    if (has) {
        acts.push(['Edit source', function () { openForm(src); }]);
        acts.push(['Replace via phone', function () { openForm(src); openQr(); }]);
    }
    acts.push(['Add via phone', function () { openForm(null); openQr(); }]);
    if (has) acts.push(['Remove source', function () {
        showModal({
            title: 'Remove this source?', name: src.name,
            opts: [['Remove', ''], ['Cancel', '']],
            onPick: function (i) { if (i === 0) { deleteSource(src); if (state.screen !== 'home') goHome(); } }
        });
    }]);
    showModal({
        title: 'Sources menu',
        name: has ? src.name : '',
        opts: acts.map(function (a) { return [a[0], '']; }),
        onPick: function (i) { acts[i][1](); }
    });
}

function openSwitcher() {
    var list = state.sources;
    if (list.length < 2) { toast(t('Add another source first')); return; }
    var cur = state.source ? state.source.id : null;
    var ci = 0;
    showModal({
        title: 'Switch source',
        name: '',
        opts: list.map(function (s, i) { if (s.id === cur) ci = i; return [(s.id === cur ? '✓ ' : '') + s.name, '']; }),
        onPick: function (i) {
            var s = list[i];
            if (s && (!state.source || s.id !== state.source.id)) openSource(s);
        }
    });
    if (cur && list[ci] && list[ci].id === cur) ci = (ci + 1) % list.length;
    state.modal.i = ci;
    renderModal();
}

function onHubKey(k) {
    switch (k) {
        case KEY.GREEN: openManage(state.source); break;
        case KEY.LEFT:
            if (state.hi >= 0) state.hi = clamp(state.hi - 1, 0, HUB.length - 1);
            setCursor($('hub-list'), state.hi); hubSwitchCursor(); break;
        case KEY.RIGHT:
            if (state.hi >= 0) state.hi = clamp(state.hi + 1, 0, HUB.length - 1);
            setCursor($('hub-list'), state.hi); hubSwitchCursor(); break;
        case KEY.DOWN:
            state.hi = state.hi < 0 ? 0 : HUB.length === 0 ? 0 : -1;
            setCursor($('hub-list'), state.hi); hubSwitchCursor(); break;
        case KEY.UP:
            state.hi = state.hi < 0 ? 0 : -1;
            setCursor($('hub-list'), state.hi); hubSwitchCursor(); break;
        case KEY.ENTER:
            if (state.hi < 0) openManage(state.source); else openKind(HUB[state.hi]);
            break;
        case KEY.YELLOW: openSettings(); break;
        case KEY.BLUE: openAccount(state.source); break;
        case KEY.RED:
            clearCache(state.source.id);
            renderHub();
            toast(t('Library cleared'));
            break;
        case KEY.BACK: case KEY.BACK_ALT: goHome(); break;
        case KEY.EXIT: exitApp(); break;
    }
}
