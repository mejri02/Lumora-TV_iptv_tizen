/* Lumora — Library contexts: loading, categories, hidden/moved groups and search. */
'use strict';

var pool = { items: [], groups: [], itemsOn: false, groupsOn: false };

function makeCtx(kind, title, serie) {
    return {
        kind: kind, title: title, serie: serie || null,
        items: [], groups: [], base: null, gi: 0, ci: 0, ws: 0, gws: 0,
        focus: 'groups', query: '', vis: null, index: null, res: null,
        error: '', loading: true, playKey: ''
    };
}

function leaveCtx(ctx) {
    if (ctx && ctx.loading) Net.cancel('cat');
}

function openKind(kind) {
    leaveCtx(state.ctx);
    state.stack = [];
    state.ctx = makeCtx(kind, KIND_META[kind].title, null);
    showScreen('browse');
    renderBrowse();
    loadCtx(state.ctx, false);
}

function goHub() {
    stopBg();
    try { Player.release(); } catch (e) { }
    leaveCtx(state.ctx);
    state.ctx = null;
    state.stack = [];
    showScreen('hub');
    renderHub();
}

function sortItems(items) {
    var dec = new Array(items.length);
    for (var i = 0; i < items.length; i++) dec[i] = { n: String(items[i].name).toLowerCase(), it: items[i] };
    dec.sort(function (a, b) { return a.n < b.n ? -1 : (a.n > b.n ? 1 : 0); });
    return dec.map(function (d) { return d.it; });
}

function sortBy(items, val) {
    var dec = new Array(items.length);
    for (var i = 0; i < items.length; i++) dec[i] = { v: val(items[i]), i: i, it: items[i] };
    dec.sort(function (a, b) { return b.v - a.v || a.i - b.i; });
    return dec.map(function (d) { return d.it; });
}

// 'new' and 'rate' only make sense for movies and series; live channels keep the provider order.
function applySort(items, mode, kind) {
    if (mode === 'az') return sortItems(items);
    if (mode === 'za') return sortItems(items).reverse();
    if (kind === 'live') return items;
    if (mode === 'new') return sortBy(items, function (it) { return it.added || 0; });
    if (mode === 'rate') return sortBy(items, function (it) { return parseFloat(it.rating) || 0; });
    return items;
}

function isLocalKind(kind) { return kind === 'ep' || kind === 'favs' || kind === 'cont'; }

function loadCtx(ctx, force) {
    var src = state.source;
    if (force) Net.cancel('cat');
    ctx.loading = true;
    ctx.error = '';
    startLoadTicker(ctx);
    renderBrowse();
    var p = ctx.kind === 'favs' ? Promise.resolve(favItems(src))
        : ctx.kind === 'cont' ? Promise.resolve(histItems(src))
        : ctx.kind === 'ep' ? PROVIDERS[src.type].seriesInfo(src, ctx.serie)
        : getCatalog(src, ctx.kind, force);
    p.then(function (items) {
        if (state.ctx !== ctx) return;
        for (var i = 0; i < items.length; i++) {
            if (!items[i].key) items[i].key = keyOf(src, items[i]);
        }
        var local = isLocalKind(ctx.kind);
        if (!local) upgradeLegacy(items, ctx);
        if (!local) items = applySort(items, S.get('sort'), ctx.kind);
        ctx.items = items;
        ctx.index = null;
        ctx.res = null;
        ctx.base = null;
        ctx.loading = false;
        stopLoadTicker();
        ctx.error = items.length ? '' : 'Nothing to show here yet.';
        ctx.gi = 0; ctx.ci = 0; ctx.ws = 0; ctx.gws = 0; ctx.vis = null; ctx.focus = 'groups';
        buildGroups(ctx);
        restoreSpot(ctx);
        if (ctx.playKey) {
            var at = -1;
            for (var j = 0; j < items.length; j++) { if (items[j].key === ctx.playKey) { at = j; break; } }
            ctx.playKey = '';
            if (at >= 0) {
                ctx.focus = 'items';
                ctx.ci = at;
                renderBrowse();
                openPlayer(ctx, items, at);
                buildIndex(ctx);
                return;
            }
        }
        renderBrowse();
        buildIndex(ctx);
        if (force && ctx.kind !== 'favs' && ctx.kind !== 'cont') toast(t('Updated: {n} {x}', { n: items.length, x: t(ctx.kind === 'ep' ? 'episodes' : KIND_META[ctx.kind].noun) }));
    }).catch(function (err) {
        if (state.ctx !== ctx) return;
        if (err && err.aborted) return;
        ctx.loading = false;
        stopLoadTicker();
        ctx.error = errText(err);
        renderBrowse();
    });
}

// Remember where the user was (category + item) for each library, so re-opening it is instant.
function spotKey(ctx) { return state.source && KINDS.indexOf(ctx.kind) >= 0 ? state.source.id + ':' + ctx.kind : ''; }

function saveSpot(ctx, it) {
    var k = spotKey(ctx);
    var g = ctx.groups[ctx.gi];
    if (!k || !g || !it || ctx.query || g.restore) return;
    state.spots[k] = { g: g.name, k: it.key };
}

function restoreSpot(ctx) {
    var k = spotKey(ctx);
    var sp = k && state.spots[k];
    if (!sp || ctx.playKey) return;
    var gi = -1;
    for (var i = 0; i < ctx.groups.length; i++) { if (ctx.groups[i].name === sp.g) { gi = i; break; } }
    if (gi < 0) return;
    ctx.gi = gi;
    ctx.vis = null;
    if (isGated({ kind: ctx.kind, group: sp.g })) return;
    var list = ctx.groups[gi].list;
    for (var j = 0; j < list.length; j++) {
        if (list[j].key === sp.k) { ctx.ci = j; ctx.focus = 'items'; break; }
    }
}

function baseGroups(ctx) {
    var map = Object.create(null);
    var order = [];
    var items = ctx.items;
    for (var i = 0; i < items.length; i++) {
        var g = items[i].group || 'Uncategorized';
        var list = map[g];
        if (!list) { list = map[g] = []; order.push(g); }
        list.push(items[i]);
    }
    return order.map(function (n) { return { name: n, list: map[n] }; });
}

function serieIdsInHistory(src) {
    var prefix = src.id + ':ep:';
    var ids = Object.create(null);
    Object.keys(state.hist).forEach(function (key) {
        if (key.indexOf(prefix) !== 0) return;
        var r = state.hist[key];
        if (r && r.serie && r.serie.id !== undefined && state.pos[key]) ids[r.serie.id] = true;
    });
    return ids;
}

function buildGroups(ctx) {
    var groups = [];
    if (ctx.kind === 'favs' || ctx.kind === 'cont') {
        groups.push({ name: 'All', list: ctx.items });
        ['live', 'vod', 'series'].forEach(function (k) {
            var list = ctx.items.filter(function (it) { return (it.kind === 'ep' ? 'series' : it.kind) === k; });
            if (!list.length) return;
            groups.push({ name: KIND_META[k].title, list: list });
            if (ctx.kind !== 'favs') return;
            var cats = {};
            var order = [];
            list.forEach(function (it) {
                var c = it.kind === 'ep' ? (it.serieName || '') : (it.group || '');
                if (!c) return;
                if (!cats[c]) { cats[c] = []; order.push(c); }
                cats[c].push(it);
            });
            if (order.length < 2) return;
            order.sort(function (a, b) { return cats[b].length - cats[a].length || (a < b ? -1 : 1); });
            order.forEach(function (c) {
                groups.push({ name: KIND_META[k].title + ' · ' + c, list: cats[c] });
            });
        });
        ctx.groups = groups;
        ctx.vis = null;
        return;
    }
    if (!ctx.base) ctx.base = baseGroups(ctx);
    if (ctx.kind !== 'ep') {
        var favs = ctx.items.filter(function (it) { return state.favorites[it.key]; });
        favs.sort(function (x, y) { return (state.favorites[y.key].at || 0) - (state.favorites[x.key].at || 0); });
        if (favs.length) groups.push({ name: '★ Favorites', list: favs });
        if (ctx.kind === 'live') {
            var seen = recentList(ctx.items);
            if (seen.length) groups.push({ name: '⟲ Recently watched', list: seen });
        }
        if (S.get('resume')) {
            var cont = null;
            if (ctx.kind === 'vod') {
                cont = ctx.items.filter(function (it) { return state.pos[it.key]; });
            } else if (ctx.kind === 'series') {
                var ids = serieIdsInHistory(state.source);
                cont = ctx.items.filter(function (it) { return ids[it.id]; });
            }
            if (cont && cont.length) groups.push({ name: '▶ Continue watching', list: cont });
        }
        groups.push({ name: 'All', list: ctx.items });
    }
    var hid = hiddenMap(ctx);
    var hidN = Object.keys(hid).length;
    var base = hidN ? ctx.base.filter(function (g) { return !hid[g.name]; }) : ctx.base;
    ctx.groups = groups.concat(base);
    if (hidN) {
        var hl = Object.keys(hid).map(function (n) {
            return { id: '__h', key: '__h:' + n, name: n, kind: ctx.kind, group: '', logo: '', hiddenCat: n };
        });
        ctx.groups.push({ name: '⊘ Hidden categories', list: hl, restore: true });
    }
    ctx.vis = null;
}

function hiddenKey(ctx) { return (state.source ? state.source.id : '') + ':' + ctx.kind; }

function hiddenMap(ctx) {
    if (KINDS.indexOf(ctx.kind) < 0) return {};
    return state.hidden[hiddenKey(ctx)] || {};
}

function trl(ar, en) { return I18n.isRtl() ? ar : en; }

function toggleHideGroup() {
    var ctx = state.ctx;
    if (!ctx || KINDS.indexOf(ctx.kind) < 0) return;
    var g = ctx.groups[ctx.gi];
    if (!g) return;
    var old = ctx.gi;
    if (g.restore) {
        var back = Object.keys(state.hidden[hiddenKey(ctx)] || {});
        delete state.hidden[hiddenKey(ctx)];
        writeJSON(HID_KEY, state.hidden);
        rebuildGroups(ctx);
        var at = 0;
        ctx.groups.forEach(function (x, i) { if (!at && back.indexOf(x.name) >= 0) at = i; });
        ctx.gi = at;
        ctx.ci = 0; ctx.ws = 0; ctx.gws = 0; ctx.vis = null; ctx.focus = 'groups';
        toast(trl('تمت إعادة إظهار كل التصنيفات', 'All categories restored'));
        renderBrowse();
        return;
    } else if (ctx.base && ctx.base.indexOf(g) >= 0) {
        var m = state.hidden[hiddenKey(ctx)] || (state.hidden[hiddenKey(ctx)] = {});
        m[g.name] = true;
        toast(trl('تم إخفاء التصنيف — افتح "تصنيفات مخفية" واضغط OK على تصنيف لإرجاعه أو الأخضر لإرجاع الكل', 'Category hidden — open "Hidden categories": OK restores one, GREEN restores all'));
    } else {
        return;
    }
    writeJSON(HID_KEY, state.hidden);
    rebuildGroups(ctx);
    ctx.gi = clamp(old, 0, ctx.groups.length - 1);
    ctx.ci = 0; ctx.ws = 0; ctx.gws = 0; ctx.vis = null;
    renderBrowse();
}

function restoreCategory(name) {
    var ctx = state.ctx;
    var key = hiddenKey(ctx);
    var m = state.hidden[key];
    if (!m) return;
    delete m[name];
    if (!Object.keys(m).length) delete state.hidden[key];
    writeJSON(HID_KEY, state.hidden);
    var left = !!state.hidden[key];
    rebuildGroups(ctx);
    if (left) {
        ctx.gi = ctx.groups.length - 1;
        ctx.ci = clamp(ctx.ci, 0, Math.max(0, visibleList(ctx).length - 1));
        ctx.focus = 'items';
    } else {
        var at = 0;
        ctx.groups.forEach(function (g, i) { if (g.name === name) at = i; });
        ctx.gi = at;
        ctx.ci = 0;
        ctx.focus = 'groups';
    }
    ctx.ws = 0; ctx.gws = 0; ctx.vis = null;
    toast(trl('تمت إعادة إظهار التصنيف', 'Category restored'));
    renderBrowse();
}

function startMoveFav() {
    var ctx = state.ctx;
    var g = ctx.groups[ctx.gi];
    var it = visibleList(ctx)[ctx.ci];
    if (!it || !state.favorites[it.key] || ctx.query) return false;
    if (!(ctx.kind === 'favs' || (g && g.name === '★ Favorites'))) return false;
    state.moving = it.key;
    toast(trl('وضع النقل: ▲▼ لتحريك المفضلة، OK للتثبيت', 'Move mode: ▲▼ to move, OK to drop'));
    return true;
}

function moveFav(delta) {
    var ctx = state.ctx;
    var list = visibleList(ctx);
    var i = ctx.ci;
    var j = i + delta;
    if (j < 0 || j >= list.length) return;
    var a = state.favorites[list[i].key];
    var b = state.favorites[list[j].key];
    if (!a || !b) return;
    var ta = a.at || 0, tb = b.at || 0;
    if (ta === tb) { a.at = tb + (delta < 0 ? 1 : -1); }
    else { a.at = tb; b.at = ta; }
    writeJSON(FAV_KEY, state.favorites);
    var key = state.moving;
    rebuildGroups(ctx);
    var nl = visibleList(ctx);
    for (var k = 0; k < nl.length; k++) { if (nl[k].key === key) { ctx.ci = k; break; } }
    renderBrowse();
}

function rebuildGroups(ctx) {
    var cur = ctx.groups[ctx.gi] ? ctx.groups[ctx.gi].name : null;
    if (ctx.kind === 'favs' || ctx.kind === 'cont') {
        ctx.items = ctx.kind === 'favs' ? favItems(state.source) : histItems(state.source);
        ctx.index = null;
        ctx.res = null;
    }
    buildGroups(ctx);
    var found = -1;
    ctx.groups.forEach(function (g, i) { if (g.name === cur) found = i; });
    ctx.gi = found >= 0 ? found : 0;
    ctx.vis = null;
    ctx.ci = clamp(ctx.ci, 0, Math.max(0, visibleList(ctx).length - 1));
    if ((ctx.kind === 'favs' || ctx.kind === 'cont') && ctx.items.length) buildIndex(ctx);
}
function buildIndex(ctx) {
    var items = ctx.items;
    var n = items.length;
    var offs = new Uint32Array(n + 1);
    var parts = [];
    var pos = 0;
    var i = 0;
    function step() {
        if (ctx.items !== items) return;
        var t0 = Date.now();
        var buf = [];
        while (i < n) {
            var s = norm(items[i].name);
            offs[i] = pos;
            buf.push(s);
            pos += s.length + 1;
            i++;
            if ((i & 255) === 0 && Date.now() - t0 > 10) break;
        }
        if (buf.length) parts.push(buf.join('\n') + '\n');
        if (i < n) { setTimeout(step, 0); return; }
        offs[n] = pos;
        ctx.index = { text: parts.join(''), offs: offs };
        parts = null;
        if (ctx.query) {
            ctx.vis = null;
            if (state.ctx === ctx && state.screen === 'browse') scheduleRender();
        }
    }
    step();
}

function lineIndex(offs, n, p) {
    var lo = 0;
    var hi = n - 1;
    while (lo < hi) {
        var mid = (lo + hi + 1) >> 1;
        if (offs[mid] <= p) lo = mid; else hi = mid - 1;
    }
    return lo;
}

function fastSearch(ctx, toks, prev) {
    var ix = ctx.index;
    var text = ix.text;
    var offs = ix.offs;
    var n = ctx.items.length;
    var nt = toks.length;
    var t0 = toks[0];
    var b0 = [], b1 = [], b2 = [];
    var k, ok, f, line;
    if (prev) {
        for (var a = 0; a < prev.length; a++) {
            var i = prev[a];
            line = text.substring(offs[i], offs[i + 1] - 1);
            f = line.indexOf(t0);
            if (f < 0) continue;
            ok = true;
            for (k = 1; k < nt; k++) { if (line.indexOf(toks[k]) < 0) { ok = false; break; } }
            if (!ok) continue;
            if (f === 0) b0.push(i); else if (line.charCodeAt(f - 1) === 32) b1.push(i); else b2.push(i);
        }
    } else {
        var p = text.indexOf(t0);
        while (p !== -1) {
            var li = lineIndex(offs, n, p);
            var ls = offs[li];
            var le = offs[li + 1] - 1;
            ok = true;
            if (nt > 1) {
                line = text.substring(ls, le);
                for (k = 1; k < nt; k++) { if (line.indexOf(toks[k]) < 0) { ok = false; break; } }
            }
            if (ok) {
                f = p - ls;
                if (f === 0) b0.push(li); else if (text.charCodeAt(p - 1) === 32) b1.push(li); else b2.push(li);
            }
            p = text.indexOf(t0, le + 1);
        }
    }
    return b0.concat(b1, b2);
}

function slowSearch(ctx, toks) {
    var items = ctx.items;
    var b0 = [], b1 = [], b2 = [];
    var nt = toks.length;
    for (var i = 0; i < items.length; i++) {
        var n = norm(items[i].name);
        var first = n.indexOf(toks[0]);
        if (first < 0) continue;
        var ok = true;
        for (var k = 1; k < nt; k++) { if (n.indexOf(toks[k]) < 0) { ok = false; break; } }
        if (!ok) continue;
        if (first === 0) b0.push(i); else if (n.charAt(first - 1) === ' ') b1.push(i); else b2.push(i);
    }
    return b0.concat(b1, b2);
}

function searchItems(ctx, query) {
    var q = norm(query);
    var toks = q.split(' ').filter(Boolean);
    if (!toks.length) return null;
    var idx;
    if (ctx.index) {
        var prev = null;
        if (ctx.res && ctx.res.items === ctx.items && q.indexOf(ctx.res.q) === 0 && ctx.res.q) prev = ctx.res.idx;
        idx = fastSearch(ctx, toks, prev);
    } else {
        idx = slowSearch(ctx, toks);
    }
    ctx.res = { q: q, items: ctx.items, idx: idx };
    var items = ctx.items;
    var out = new Array(idx.length);
    for (var i = 0; i < idx.length; i++) out[i] = items[idx[i]];
    return out;
}

function visibleList(ctx) {
    if (ctx.vis) return ctx.vis;
    var list = null;
    if (ctx.query) list = searchItems(ctx, ctx.query);
    if (!list) {
        var g = ctx.groups[ctx.gi];
        list = g ? g.list : [];
    }
    ctx.vis = list;
    return list;
}
