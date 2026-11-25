/* Lumora — Catalog cache and background warm-up. */
'use strict';

function clearCache(id) {
    KINDS.forEach(function (k) { delete state.catCache[id + ':' + k]; });
    Catalog.forget(id);
    try { localStorage.removeItem(COUNT_KEY + id); } catch (e) { }
}

function remember(src, kind, items) {
    state.catCache[src.id + ':' + kind] = items;
    var counts = readJSON(COUNT_KEY + src.id, {});
    counts[kind] = items.length;
    writeJSON(COUNT_KEY + src.id, counts);
}

Catalog.listen(remember);

function staleCheck(src, kind, at) {
    if (!S.get('bgRefresh') || !at) return;
    if (state.screen === 'player') return;
    if (Date.now() - at < S.get('cacheHours') * 3600000) return;
    var key = src.id + ':' + kind;
    if (state.refresh[key]) return;
    state.refresh[key] = setTimeout(function () {
        PROVIDERS[src.type].catalog(src, kind, { force: true }).then(function () {
            delete state.refresh[key];
            if (state.screen === 'hub' && state.source && state.source.id === src.id) renderHub();
        }, function () { delete state.refresh[key]; });
    }, 5000);
}

function getCatalog(src, kind, force) {
    var key = src.id + ':' + kind;
    if (!force && state.catCache[key]) return Promise.resolve(state.catCache[key]);
    if (!force && state.pend[key]) return state.pend[key];
    var p = PROVIDERS[src.type].catalog(src, kind, { force: !!force }).then(function (items) {
        state.catCache[key] = items;
        staleCheck(src, kind, Catalog.age(src, kind));
        return items;
    });
    state.pend[key] = p;
    function done() { if (state.pend[key] === p) delete state.pend[key]; }
    p.then(done, done);
    return p;
}

function warm(src) {
    setTimeout(function () {
        if (state.source !== src || state.screen === 'player') return;
        var key = src.id + ':live';
        if (state.catCache[key] || state.pend[key]) return;
        Catalog.peek(src, 'live').then(function (items) {
            if (!items || state.catCache[key]) return;
            state.catCache[key] = items;
            staleCheck(src, 'live', Catalog.age(src, 'live'));
        });
    }, 600);
}
