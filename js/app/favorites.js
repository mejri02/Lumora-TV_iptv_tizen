/* Lumora — Favorites, watch history and resume records. */
'use strict';

function minSerie(s) {
    var o = { id: s.id, name: s.name, group: s.group || '', logo: s.logo || '', kind: 'series' };
    ['cmd', 'rating', 'year'].forEach(function (k) { if (s[k]) o[k] = s[k]; });
    if (s.plot) o.plot = String(s.plot).slice(0, 200);
    return o;
}

function snap(it, ctx) {
    var o = { id: it.id, name: it.name, group: it.group || '', logo: it.logo || '', kind: it.kind, at: Date.now() };
    ['ext', 'cmd', 'url', 'rating', 'year', 'season', 'num', 'tvgId', 'ua', 'referer', 'arch'].forEach(function (k) {
        if (it[k] !== undefined && it[k] !== '' && it[k] !== null) o[k] = it[k];
    });
    if (it.plot) o.plot = String(it.plot).slice(0, 200);
    if (it.kind === 'ep') {
        var serie = (ctx && ctx.serie) || (state.playCtx && state.playCtx.serie);
        if (serie) { o.serieName = serie.name; o.serie = minSerie(serie); }
        else {
            if (it.serieName) o.serieName = it.serieName;
            if (it.serie) o.serie = it.serie;
        }
    }
    if (it.eps) {
        o.eps = it.eps.map(function (e) {
            return { id: e.id, name: e.name, group: e.group, season: e.season, num: e.num, url: e.url, kind: 'ep' };
        });
    }
    return o;
}

function recordsFor(src, store, order) {
    var prefix = src.id + ':';
    var out = [];
    Object.keys(store).forEach(function (key) {
        if (key.indexOf(prefix) !== 0) return;
        var v = store[key];
        if (!v || typeof v !== 'object') return;
        var it = {};
        Object.keys(v).forEach(function (k) { it[k] = v[k]; });
        it.key = key;
        out.push(it);
    });
    out.sort(function (a, b) { return (b[order] || 0) - (a[order] || 0); });
    return out;
}

function favItems(src) { return recordsFor(src, state.favorites, 'at'); }

function histItems(src) {
    return recordsFor(src, state.hist, 'at').filter(function (it) { return state.pos[it.key]; });
}

function recordHist(it, pos, dur) {
    var rec = snap(it, state.playCtx);
    delete rec.eps;
    rec.pos = Math.floor(pos);
    rec.dur = Math.floor(dur);
    rec.at = Date.now();
    state.hist[it.key] = rec;
    var keys = Object.keys(state.hist);
    if (keys.length > CFG.HIST_MAX) {
        keys.sort(function (a, b) { return (state.hist[a].at || 0) - (state.hist[b].at || 0); });
        for (var i = 0; i < keys.length - CFG.HIST_MAX; i++) {
            delete state.hist[keys[i]];
            delete state.pos[keys[i]];
        }
    }
}

// Live channels the user actually watched (not VOD: those live in history with a resume position).
function recordRecent(it) {
    if (!it || it.kind !== 'live' || it.direct || !it.key || !state.source) return;
    var old = state.recent[it.key];
    if (old && Date.now() - (old.at || 0) < 30000) return;
    state.recent[it.key] = { id: it.id, name: it.name, kind: 'live', group: it.group || '', at: Date.now() };
    var keys = Object.keys(state.recent);
    if (keys.length > CFG.RECENT_MAX) {
        keys.sort(function (a, b) { return (state.recent[a].at || 0) - (state.recent[b].at || 0); });
        for (var i = 0; i < keys.length - CFG.RECENT_MAX; i++) delete state.recent[keys[i]];
    }
    state.recentStamp++;
    writeJSON(RECENT_KEY, state.recent);
}

// Channels of the loaded live library that were watched recently, newest first.
function recentList(items) {
    var rows = [];
    for (var i = 0; i < items.length; i++) {
        var r = state.recent[items[i].key];
        if (r) rows.push({ it: items[i], at: r.at || 0 });
    }
    rows.sort(function (a, b) { return b.at - a.at; });
    return rows.slice(0, CFG.RECENT_SHOW).map(function (x) { return x.it; });
}

function dropHistory(it) {
    delete state.pos[it.key];
    delete state.hist[it.key];
    writeJSON(POS_KEY, state.pos);
    writeJSON(HIST_KEY, state.hist);
}

function upgradeLegacy(items, ctx) {
    var changed = false;
    for (var i = 0; i < items.length; i++) {
        if (state.favorites[items[i].key] === true) {
            state.favorites[items[i].key] = snap(items[i], ctx);
            changed = true;
        }
    }
    if (changed) writeJSON(FAV_KEY, state.favorites);
}

function migrateFavs(src) {
    var prefix = src.id + ':';
    var legacy = Object.keys(state.favorites).some(function (k) {
        return k.indexOf(prefix) === 0 && state.favorites[k] === true;
    });
    if (!legacy) return;
    KINDS.forEach(function (kind) {
        var items = state.catCache[src.id + ':' + kind];
        if (!items || !items.length) return;
        var changed = false;
        items.forEach(function (it) {
            var key = keyOf(src, it);
            if (state.favorites[key] === true) { state.favorites[key] = snap(it, null); changed = true; }
        });
        if (changed) writeJSON(FAV_KEY, state.favorites);
    });
}

function toggleFav(it) {
    if (!it || !it.key || it.hiddenCat) return;
    var ctx = state.screen === 'player' ? state.playCtx : state.ctx;
    if (state.favorites[it.key]) delete state.favorites[it.key];
    else state.favorites[it.key] = snap(it, ctx);
    writeJSON(FAV_KEY, state.favorites);
    if (state.screen === 'browse') {
        rebuildGroups(state.ctx);
        renderBrowse();
    } else {
        showInfo();
    }
    toast(t(state.favorites[it.key] ? 'Added to favorites' : 'Removed from favorites'));
}

function removeHistory() {
    var ctx = state.ctx;
    if (!ctx || ctx.kind !== 'cont') return;
    var it = visibleList(ctx)[ctx.ci];
    if (!it) return;
    dropHistory(it);
    rebuildGroups(ctx);
    renderBrowse();
    toast(t('Removed from history'));
}
