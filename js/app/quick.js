/* Lumora — Quick menu: one panel that opens from any screen and reaches every common action, including Settings. */
'use strict';

function quickShow(title, entries, start) {
    state.quick = { title: title, entries: entries, i: start || 0 };
    if (state.chOpen) closeChanList();
    if (state.gOpen) closeGuide();
    renderQuick();
    $('quick').classList.remove('hidden');
    armQuick();
}

function armQuick() {
    clearTimeout(state.quickTimer);
    state.quickTimer = setTimeout(closeQuick, 15000);
}

function closeQuick() {
    clearTimeout(state.quickTimer);
    state.quick = null;
    var q = $('quick');
    if (q) q.classList.add('hidden');
}

function renderQuick() {
    var q = state.quick;
    if (!q) return;
    $('quick-title').textContent = t(q.title);
    var html = '';
    q.entries.forEach(function (e, i) {
        html += '<li class="' + (i === q.i ? 'cursor' : '') + '"><span class="qi">' + (e.ic || '•') + '</span><span class="qt">' + esc(typeof e.label === 'function' ? e.label() : t(e.label)) + '</span>' + (e.stay ? '<span class="qa">◀▶</span>' : '') + '</li>';
    });
    $('quick-ul').innerHTML = html;
}

function onQuickKey(k) {
    var q = state.quick;
    if (!q) return;
    armQuick();
    var n = q.entries.length;
    switch (k) {
        case KEY.UP: q.i = (q.i - 1 + n) % n; renderQuick(); break;
        case KEY.DOWN: q.i = (q.i + 1) % n; renderQuick(); break;
        case KEY.LEFT: case KEY.RIGHT:
            if (q.entries[q.i].stay) { q.entries[q.i].fn(k === KEY.LEFT ? -1 : 1); renderQuick(); }
            else if (k === KEY.LEFT) closeQuick();
            break;
        case KEY.ENTER:
            var e = q.entries[q.i];
            if (e.stay) { e.fn(1); renderQuick(); break; }
            var title = q.title;
            closeQuick();
            e.fn(1);
            break;
        case KEY.BACK: case KEY.BACK_ALT: case KEY.STOP: case KEY.INFO: closeQuick(); break;
        case KEY.EXIT: exitApp(); break;
    }
}

function setDef(key) {
    var defs = settingDefs();
    for (var i = 0; i < defs.length; i++) if (defs[i].k === key) return defs[i];
    return null;
}

function setLabel(d) {
    var cv = settingValue(d);
    var label = '';
    d.o.forEach(function (o) { if (o[0] === cv) label = d.raw ? o[1] : t(o[1], { n: o[0] }); });
    return label;
}

// Entry that cycles a setting in place (◀ ▶ or OK) and shows the current value.
function cycleEntry(key, ic, after) {
    return {
        ic: ic, stay: true,
        label: function () { var d = setDef(key); return t(d.n) + ':  ' + (d.t === 'toggle' ? t(settingValue(d) ? 'On' : 'Off') : setLabel(d)); },
        fn: function (delta) {
            var d = setDef(key);
            var cv = settingValue(d);
            if (d.t === 'toggle') { applySetting(d.k, !cv); if (after) after(d); return; }
            var idx = 0;
            d.o.forEach(function (o, i) { if (o[0] === cv) idx = i; });
            idx = (idx + delta + d.o.length) % d.o.length;
            applySetting(d.k, d.o[idx][0]);
            if (after) after(d);
        }
    };
}

function reapplyStream() {
    if (state.screen !== 'player' || !state.list.length) return;
    try { savePos(); } catch (e) { }
    var it = curItem();
    var at = isVod(it) ? Player.position() : 0;
    tune(state.idx, true);
    if (isVod(it) && at > 0) state.resumeAt = at;
}

function openAllSettings() {
    if (state.screen === 'player') closePlayer();
    stopBg();
    openSettings();
}

function openPlayerSettings() {
    var it = curItem();
    var live = !isVod(it);
    var entries = [
        cycleEntry('aspect', '▭', function (d) { Player.setAspect(S.get('aspect')); }),
        cycleEntry('buffer', '⏱', function () { state.quickDirty = true; }),
        cycleEntry('engine', '⚙', function () { state.quickDirty = true; }),
        cycleEntry('infoTimeout', 'ℹ'),
        cycleEntry('retryLimit', '↻'),
        cycleEntry('miniPlayer', '▣')
    ];
    if (live) {
        entries = entries.concat([
            cycleEntry('seekStep', '⇉'),
            cycleEntry('keepAwake', '☀'),
            cycleEntry('diag', '⌗')
        ]);
    }
    entries.push({ ic: '←', label: 'Back', fn: function () { if (state.quickDirty) { state.quickDirty = false; reapplyStream(); } openQuick(); } });
    quickShow('Playback settings', entries, 0);
}

function playerQuickEntries() {
    var it = curItem();
    var live = !isVod(it);
    var e = [];
    if (live) e.push({ ic: '☰', label: 'Channel list', fn: function () { openChanList(); } });
    e.push({ ic: 'ℹ', label: 'Info', fn: function () { showInfo(); } });
    e.push({ ic: '★', label: function () { return t(state.favorites[curItem().key] ? 'Remove from favorites' : 'Add to favorites'); }, fn: function () { toggleFav(curItem()); } });
    if (live) e.push({ ic: '⇄', label: 'Last channel', fn: function () { lastChannel(); } });
    if (live && state.source && state.source.type === 'xtream') e.push({ ic: '▤', label: 'Program guide', fn: function () { openGuide(); } });
    e.push({ ic: '♫', label: 'Audio / Subtitles', fn: function () { openTracks(); } });
    e.push({
        ic: '♪',
        label: function () { return trl('لا يوجد صوت؟ جرّب مشغّلاً آخر', 'No sound? Try another player'); },
        fn: function () {
            var to = Player.switchEngine();
            if (to) toast(trl('تم التحويل إلى المشغّل: ', 'Switched player: ') + to);
            else toast(trl('لا يوجد مشغّل بديل لهذا الرابط', 'No alternative player for this stream'), true);
        }
    });
    e.push(cycleEntry('aspect', '▭', function () { Player.setAspect(S.get('aspect')); }));
    if (!live) {
        var SPEEDS = [0.75, 1, 1.25, 1.5, 2];
        e.push({
            ic: '⏩', stay: true,
            label: function () { return trl('سرعة التشغيل', 'Playback speed') + ':  ' + state.playSpeed + 'x'; },
            fn: function (d) {
                var i = SPEEDS.indexOf(state.playSpeed);
                if (i < 0) i = 1;
                var nv = SPEEDS[(i + (d < 0 ? -1 : 1) + SPEEDS.length) % SPEEDS.length];
                if (Player.setSpeed(nv)) state.playSpeed = nv;
                else toast(trl('السرعة غير متاحة في مشغّل Samsung AVPlay — غيّر المشغّل إلى HTML5 من الإعدادات', 'Speed is not available on Samsung AVPlay. Switch Player engine to HTML5 in Settings'), true);
            }
        });
        if (Player.tracks('TEXT').length) {
            e.push({
                ic: '⇆', stay: true,
                label: function () { var s = Math.round(state.subDelay / 10) / 100; return trl('تأخير الترجمة', 'Subtitle delay') + ':  ' + (s > 0 ? '+' : '') + s + 's'; },
                fn: function (d) {
                    var nv = Math.max(-15000, Math.min(15000, state.subDelay + (d < 0 ? -250 : 250)));
                    if (Player.setSubDelay(nv)) state.subDelay = nv;
                    else toast(trl('تعذّر ضبط تزامن الترجمة', 'Could not adjust subtitle sync'), true);
                }
            });
            var SIZES = [0, 30, 42, 56];
            var SNAMES = [['افتراضي', 'Default'], ['صغير', 'Small'], ['متوسط', 'Medium'], ['كبير', 'Large']];
            e.push({
                ic: 'A', stay: true,
                label: function () { var i = SIZES.indexOf(readJSON(SUBSIZE_KEY, 0) || 0); if (i < 0) i = 0; return trl('حجم الترجمة', 'Subtitle size') + ':  ' + trl(SNAMES[i][0], SNAMES[i][1]); },
                fn: function (d) {
                    var i = SIZES.indexOf(readJSON(SUBSIZE_KEY, 0) || 0);
                    if (i < 0) i = 0;
                    i = (i + (d < 0 ? -1 : 1) + SIZES.length) % SIZES.length;
                    writeJSON(SUBSIZE_KEY, SIZES[i]);
                    if (!Player.setSubSize(SIZES[i])) toast(trl('حجم الترجمة يعمل مع مشغّل HTML5 فقط', 'Subtitle size works with the HTML5 engine only'), true);
                }
            });
        }
    }
    e.push({
        ic: '☾', stay: true,
        label: function () { return t('Sleep timer') + ':  ' + (state.sleepMin ? t('{n} min', { n: state.sleepMin }) : t('Off')); },
        fn: function (d) {
            var i = SLEEP_STEPS.indexOf(state.sleepMin);
            setSleep(SLEEP_STEPS[(i + (d < 0 ? -1 : 1) + SLEEP_STEPS.length) % SLEEP_STEPS.length]);
        }
    });
    e.push({ ic: '⚙', label: 'Playback settings', fn: function () { openPlayerSettings(); } });
    e.push({ ic: '⚒', label: 'All settings', fn: function () { openAllSettings(); } });
    return e;
}

function browseQuickEntries() {
    var ctx = state.ctx;
    var e = [];
    e.push({ ic: '⚒', label: 'Settings', fn: function () { openAllSettings(); } });
    e.push({ ic: '☰', label: 'Sources menu', fn: function () { openManage(state.source); } });
    e.push({ ic: '⌕', label: 'Search', fn: function () { if (ctx) $('search').focus(); } });
    var cur = ctx && visibleList(ctx)[ctx.ci];
    if (cur && ctx.focus === 'items') {
        e.push({ ic: '★', label: function () { return t(state.favorites[cur.key] ? 'Remove from favorites' : 'Add to favorites'); }, fn: function () { toggleFav(cur); } });
    }
    if (ctx && ctx.kind !== 'favs' && ctx.kind !== 'cont') e.push({ ic: '↻', label: 'Refresh', fn: function () { loadCtx(ctx, true); } });
    e.push({ ic: '⌂', label: 'Main menu', fn: function () { goHub(); } });
    return e;
}

function openQuick() {
    if (state.quick) { closeQuick(); return; }
    var sc = state.screen;
    if (sc === 'player') { if (state.list.length) quickShow('Quick menu', playerQuickEntries(), 0); return; }
    if (sc === 'browse' && state.ctx) { quickShow('Quick menu', browseQuickEntries(), 0); return; }
    if (sc === 'hub' || sc === 'home') openSettings();
}
