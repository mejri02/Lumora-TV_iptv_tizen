/* Lumora — Browse screen rendering, navigation and item selection. */
'use strict';

var COLS = 4;
var GRID_ROWS = 2;
function isPosterCtx(ctx) { return !!ctx && (ctx.kind === 'vod' || ctx.kind === 'series'); }
function rowsNow() { return isPosterCtx(state.ctx) ? COLS * GRID_ROWS : 8; }

function stableWindow(ws, idx, len) {
    if (isPosterCtx(state.ctx)) {
        var totalRows = Math.ceil(len / COLS);
        if (totalRows <= GRID_ROWS) return 0;
        var wr = Math.floor(ws / COLS);
        var row = Math.floor(idx / COLS);
        if (row < wr) wr = row;
        else if (row > wr + GRID_ROWS - 1) wr = row - GRID_ROWS + 1;
        return clamp(wr, 0, totalRows - GRID_ROWS) * COLS;
    }
    var R = ROWS;
    if (len <= R) return 0;
    if (idx < ws + 1) ws = idx - 1;
    else if (idx > ws + R - 2) ws = idx - R + 2;
    return clamp(ws, 0, len - R);
}

function setHtml(el, h) {
    if (el._h !== h) { el._h = h; el.innerHTML = h; }
}

function showDetail(it) {
    var d = $('detail');
    if (!it) { d.classList.add('hidden'); return; }
    d.classList.remove('hidden');
    setText($('detail-title'), it.name);
    var chips = [];
    var rv = parseFloat(it.rating);
    if (rv > 0) chips.push('<span class="chip gold">★ ' + rv.toFixed(1) + '</span>');
    if (it.year) chips.push('<span class="chip">' + esc(it.year) + '</span>');
    var kl = FAV_KIND[it.kind];
    if (kl) chips.push('<span class="chip">' + esc(t(kl)) + '</span>');
    var rp = state.pos[it.key];
    if (isVod(it) && rp && it.dur && S.get('resume')) chips.push('<span class="chip rs">▶ ' + Math.min(99, Math.round(rp / it.dur * 100)) + '%</span>');
    if (it.genre) {
        String(it.genre).split(/\s*[,\/|]\s*/).filter(Boolean).slice(0, 3).forEach(function (g) {
            chips.push('<span class="chip">' + esc(g) + '</span>');
        });
    }
    setHtml($('detail-meta'), chips.join(''));
    var img = $('detail-img');
    if (!img._init) {
        img._init = true;
        img.onload = function () { this.style.visibility = 'visible'; };
        img.onerror = function () { if (this._s) badLogos[this._s] = 1; this.style.visibility = 'hidden'; };
    }
    var src = safeLogo(it.logo) || '';
    if (src && badLogos[src]) src = '';
    if (img._s !== src) {
        img._s = src;
        img.style.visibility = 'hidden';
        if (!src) img.removeAttribute('src');
        else Net.loadImage(src).then(function (du) {
            if (img._s !== src) return;
            if (du) img.src = du; else img.removeAttribute('src');
        }, function () {
            if (img._s === src) img.src = src;
        });
    }
    var canFetch = !it.detailed && (it.kind === 'vod' || it.kind === 'series');
    setText($('detail-plot'), it.plot || (canFetch ? t('Loading…') : t('No description available.')));
    setText($('detail-cast'), it.cast ? t('Cast') + ': ' + String(it.cast).slice(0, 140) : '');
    clearTimeout(state.detTimer);
    if (!it.plot && canFetch) {
        state.detTimer = setTimeout(function () {
            fetchDetail(it, function () {
                var c = state.ctx;
                if (state.screen === 'browse' && c && visibleList(c)[c.ci] === it) showDetail(it);
            });
        }, 350);
    }
}

function peekEpg(it) {
    if (!it || it.kind !== 'live' || it.direct || !state.source) return;
    var c = state.epgCache[it.key];
    if (c && Date.now() - c.at < EPG_TTL) return;
    if (state.peekKey === it.key && state.peekTimer) return;
    clearTimeout(state.peekTimer);
    state.peekKey = it.key;
    var src = state.source;
    state.peekTimer = setTimeout(function () {
        state.peekTimer = null;
        if (state.screen !== 'browse' || state.source !== src) return;
        try {
            prov().epg(src, it, state.catCache[src.id + ':live']).then(function (data) {
                state.epgCache[it.key] = { at: Date.now(), data: data };
                if (state.screen === 'browse' && state.source === src) scheduleRender();
            }).catch(function () {
                state.epgCache[it.key] = { at: Date.now() - EPG_TTL + 60000, data: null };
            });
        } catch (e) { }
    }, 450);
}

// Fills in "what's on now" for all visible live rows, one request at a time so providers are not hammered.
function prefetchEpg(list, ctx) {
    if (!ctx || ctx.kind !== 'live' || !state.source || state.source.type === 'stalker') return;
    var src = state.source;
    var sig = src.id + ':' + ctx.gi + ':' + ctx.ws + ':' + list.length;
    if (state.pfSig === sig) return;
    state.pfSig = sig;
    clearTimeout(state.pfTimer);
    var run = ++state.pfRun || (state.pfRun = 1);
    state.pfTimer = setTimeout(function () {
        if (state.pfRun !== run || state.screen !== 'browse' || state.ctx !== ctx || state.source !== src) return;
        var queue = [];
        for (var r = 0; r < ROWS; r++) {
            var it = list[ctx.ws + r];
            if (!it || it.direct) continue;
            var c = state.epgCache[it.key];
            if (c && Date.now() - c.at < EPG_TTL) continue;
            queue.push(it);
        }
        var n = 0;
        (function next() {
            if (state.pfRun !== run || n >= queue.length || state.screen !== 'browse' || state.ctx !== ctx || state.source !== src) return;
            var cur = queue[n++];
            var settle = function (data, fail) {
                state.epgCache[cur.key] = { at: fail ? Date.now() - EPG_TTL + 60000 : Date.now(), data: data };
                if (state.pfRun === run && state.screen === 'browse' && state.source === src) scheduleRender();
                state.pfTimer = setTimeout(next, 120);
            };
            try {
                prov().epg(src, cur, state.catCache[src.id + ':live']).then(function (data) { settle(data, false); }, function () { settle(null, true); });
            } catch (e) { settle(null, true); }
        })();
    }, 700);
}

function loadingBannerHtml(ctx) {
    var ar = I18n.isRtl();
    var noun = ctx && KIND_META[ctx.kind] ? t(KIND_META[ctx.kind].noun) : '';
    var title = (ar ? 'جارٍ تحميل ' : 'Loading ') + noun + '…';
    var sub = ar ? 'قد يستغرق الأمر دقيقة للمكتبات الكبيرة، وسيُحفظ للمرات القادمة' : 'Large libraries can take a minute. It will be cached for next time.';
    return '<li class="empty load-banner"><span class="spin"></span><div class="lb-col"><div class="lb-title">' + esc(title) + ' <span id="lb-sec" class="lb-sec"></span></div><div class="lb-sub">' + esc(sub) + '</div><div class="lb-bar"><i></i></div></div></li>';
}

function startLoadTicker(ctx) {
    stopLoadTicker();
    var t0 = Date.now();
    state.lbTimer = setInterval(function () {
        var el = $('lb-sec');
        if (!el) return;
        var sec = Math.floor((Date.now() - t0) / 1000);
        el.textContent = sec > 0 ? sec + (I18n.isRtl() ? ' ث' : 's') : '';
    }, 1000);
}

function stopLoadTicker() {
    clearInterval(state.lbTimer);
    state.lbTimer = null;
}

function skeletonHtml() {
    var h = '';
    for (var i = 0; i < COLS * GRID_ROWS; i++) h += '<li class="sk"><span class="sk-p"></span><span class="sk-n"></span></li>';
    return h;
}

function setText(el, v) {
    if (el._t !== v) { el._t = v; el.textContent = v; }
}

function setCls(el, v) {
    if (el._c !== v) { el._c = v; el.className = v; }
}

function makeRow() {
    var li = document.createElement('li');
    li.className = 'hg g20';
    li.innerHTML = '<span class="num"></span><span class="thumb"><span class="ini"></span><img alt=""></span><span class="name"></span><span class="meta"></span><span class="star hidden">★</span><span class="bdg hidden"></span><span class="pg hidden"><i></i></span><span class="arc hidden">⏪</span><span class="wtc hidden">✓</span>';
    var c = li.children;
    li._num = c[0];
    li._thumb = c[1];
    li._ini = c[1].children[0];
    li._img = c[1].children[1];
    li._name = c[2];
    li._meta = c[3];
    li._star = c[4];
    li._bdg = c[5];
    li._pg = c[6];
    li._pgi = c[6].firstChild;
    li._arc = c[7];
    li._wtc = c[8];
    li._img.decoding = 'async';
    li._img.style.visibility = 'hidden';
    li._img.onload = function () { this.style.visibility = 'visible'; };
    li._img.onerror = function () { if (this._src) badLogos[this._src] = 1; this.style.visibility = 'hidden'; };
    li._on = true;
    return li;
}

var badLogos = {};

function makeGroupRow() {
    var li = document.createElement('li');
    li.innerHTML = '<span class="name"></span><span class="count"></span>';
    li._name = li.children[0];
    li._count = li.children[1];
    li._on = true;
    return li;
}

function applyImg(li) {
    var img = li._img;
    var w = li._want || '';
    if (w && badLogos[w]) w = '';
    if (img._src === w) return;
    img._src = w;
    img.style.visibility = 'hidden';
    if (!w) { img.removeAttribute('src'); return; }
    Net.loadImage(w).then(function (du) {
        if (img._src === w && du) { img.src = du; return; }
        if (img._src === w) img.removeAttribute('src');
    }, function () {
        if (img._src === w) img.src = w;
    });
}

function settleImages() {
    for (var i = 0; i < pool.items.length; i++) applyImg(pool.items[i]);
}

function metaOf(it) {
    var meta = '';
    if (it.kind === 'ep') meta = 'S' + pad(it.season || 0) + ' · E' + pad(it.num || 0);
    else if (it.rating && it.rating !== '0') meta = t('Rating') + ' ' + it.rating;
    if (it.kind !== 'live' && it.kind !== 'ep' && it.year) meta = (meta ? meta + '  ·  ' : '') + it.year;
    if (it.kind === 'live') {
        var ec = state.epgCache[it.key];
        if (ec && ec.data && ec.data.now && ec.data.now.title) meta = (ec.data.now.start ? ec.data.now.start + '  ' : '') + ec.data.now.title;
    }
    var p = state.pos[it.key];
    if (isVod(it) && S.get('resume') && p) {
        var pct = it.dur ? ' (' + Math.min(99, Math.round(p / it.dur * 100)) + '%)' : '';
        meta = '▶ ' + fmt(p) + pct + (meta ? '  ·  ' + meta : '');
    }
    var cx = state.ctx;
    if (cx && (cx.kind === 'favs' || cx.kind === 'cont')) {
        var kl = it.kind === 'ep' && it.serieName ? it.serieName : t(FAV_KIND[it.kind] || '');
        meta = kl + (meta ? '  ·  ' + meta : '');
    }
    return meta;
}

function fillRow(li, it, i, cursor, fast) {
    setCls(li, 'hg g20' + (cursor ? ' cursor' : '') + (state.bg && state.bg.key === it.key ? ' now' : ''));
    setText(li._num, String(i + 1));
    setCls(li._thumb, 'thumb' + (it.kind !== 'live' ? ' poster' : ''));
    setText(li._ini, initial(it.name));
    setText(li._name, it.name);
    setText(li._meta, metaOf(it));
    var fav = !!state.favorites[it.key];
    if (li._fav !== fav) { li._fav = fav; li._star.classList.toggle('hidden', !fav); }
    var poster = it.kind !== 'live';
    var rv = poster ? parseFloat(it.rating) : 0;
    var rt = rv > 0 ? rv.toFixed(1) : '';
    if (li._rt !== rt) { li._rt = rt; li._bdg.textContent = rt ? '★ ' + rt : ''; li._bdg.classList.toggle('hidden', !rt); }
    var arc = !poster && !!it.arch;
    if (li._ac !== arc) { li._ac = arc; li._arc.classList.toggle('hidden', !arc); }
    var wt = poster && !!state.watched[it.key];
    if (li._wt !== wt) { li._wt = wt; li._wtc.classList.toggle('hidden', !wt); }
    var pp = 0;
    var ps = state.pos[it.key];
    if (poster && ps && it.dur && S.get('resume')) pp = Math.min(99, Math.max(1, Math.round(ps / it.dur * 100)));
    if (li._pp !== pp) { li._pp = pp; li._pg.classList.toggle('hidden', !pp); li._pgi.style.width = pp + '%'; }
    li._want = safeLogo(it.logo);
    if (!fast) applyImg(li);
}

function ensureItemsPool() {
    if (pool.itemsOn) return;
    var list = $('channel-list');
    list.innerHTML = '';
    if (!pool.items.length) {
        for (var i = 0; i < ROWS; i++) pool.items.push(makeRow());
    }
    for (var j = 0; j < pool.items.length; j++) list.appendChild(pool.items[j]);
    pool.itemsOn = true;
}

function ensureGroupsPool() {
    if (pool.groupsOn) return;
    var list = $('group-list');
    list.innerHTML = '';
    if (!pool.groups.length) {
        for (var i = 0; i < ROWS; i++) pool.groups.push(makeGroupRow());
    }
    for (var j = 0; j < pool.groups.length; j++) list.appendChild(pool.groups[j]);
    pool.groupsOn = true;
}

function renderBrowse(fast) {
    if (state.screen !== 'browse' || !state.ctx) return;
    var ctx = state.ctx;
    var s = state.source;
    var isEp = ctx.kind === 'ep';
    setText($('src-title'), isEp ? ctx.serie.name : t(ctx.title));
    setText($('src-type'), TYPE_LABEL[s.type]);
    setText($('src-count'), ctx.loading ? '' : (isEp ? t('{n} episodes', { n: ctx.items.length }) : countLabel(ctx.kind, ctx.items.length)));
    var sub = isEp ? (ctx.serie.plot || '') : '';
    setText($('ctx-sub'), sub);
    $('ctx-sub').classList.toggle('hidden', !sub);
    if ($('search').value !== ctx.query) $('search').value = ctx.query;
    $('groups').classList.toggle('searching', !!ctx.query);
    var hf = $('browse-hints');
    var want = ctx.kind === 'cont' ? 'cont' : 'browse';
    if (hf.getAttribute('data-h') !== want) { hf.setAttribute('data-h', want); renderHints(); }
    renderGroups(ctx);
    renderItems(ctx, fast);
    clearTimeout(state.imgTimer);
    if (fast) state.imgTimer = setTimeout(settleImages, 150);
}

function renderGroups(ctx) {
    var n = ctx.groups.length;
    if (ctx.loading || !n) {
        pool.groupsOn = false;
        $('group-list').innerHTML = ctx.loading ? '<li class="empty"><span class="spin"></span>' + esc(t('Loading…')) + '</li>' : '';
        return;
    }
    ensureGroupsPool();
    ctx.gws = stableWindow(ctx.gws || 0, ctx.gi, n);
    for (var r = 0; r < ROWS; r++) {
        var li = pool.groups[r];
        var i = ctx.gws + r;
        if (i >= n) {
            if (li._on) { li.style.display = 'none'; li._on = false; }
            continue;
        }
        if (!li._on) { li.style.display = ''; li._on = true; }
        var g = ctx.groups[i];
        setCls(li, (i === ctx.gi ? 'active' : '') + (ctx.focus === 'groups' && i === ctx.gi ? ' cursor' : '') + (lockOn() && KINDS.indexOf(ctx.kind) >= 0 && state.locked[lockId({ kind: ctx.kind, group: g.name })] ? ' locked' : ''));
        setText(li._name, t(g.name));
        setText(li._count, String(g.list.length));
    }
}

function renderItems(ctx, fast) {
    var list = visibleList(ctx);
    $('channel-list').classList.toggle('posters', isPosterCtx(ctx));
    if (!isPosterCtx(ctx)) $('detail').classList.add('hidden');
    var g = ctx.groups[ctx.gi];
    var title = g ? t(g.name) : '';
    if (ctx.query) title = t('Search') + '  ·  ' + t('{n} found', { n: list.length });
    setText($('channels-title'), title);

    if (ctx.loading || !list.length) {
        pool.itemsOn = false;
        $('detail').classList.add('hidden');
        setText($('pos-ind'), '');
        var html;
        if (ctx.loading) {
            html = isPosterCtx(ctx) ? loadingBannerHtml(ctx) + skeletonHtml() : '<li class="empty"><span class="spin"></span>' + esc(t('Loading…')) + '</li>';
        } else {
            var img = '';
            var msg;
            if (ctx.query) { img = 'images/no-results.png'; msg = t('No match for your search.'); }
            else if (ctx.kind === 'favs') { img = 'images/fav-empty.png'; msg = t('No favorites yet. Press YELLOW on a channel, movie or series to add it.'); }
            else if (ctx.kind === 'cont') { img = 'images/fav-empty.png'; msg = t('Nothing to continue yet. Movies and episodes you start will appear here.'); }
            else msg = t(ctx.error || 'Nothing here.');
            var retry = !ctx.query && ctx.error && ctx.kind !== 'favs' && ctx.kind !== 'cont';
            html = '<li class="empty big">' + (img ? '<img src="' + img + '" alt="">' : '') + '<div>' + esc(msg) + '</div>' + (retry ? '<div class="retry-hint">\u21BB  ' + esc(t('Press OK or RED to retry')) + '</div>' : '') + '</li>';
        }
        $('channel-list').innerHTML = html;
        return;
    }
    ensureItemsPool();
    ctx.ci = clamp(ctx.ci, 0, list.length - 1);
    ctx.ws = stableWindow(ctx.ws || 0, ctx.ci, list.length);
    var R = rowsNow();
    for (var r = 0; r < ROWS; r++) {
        var li = pool.items[r];
        var i = ctx.ws + r;
        if (i >= list.length || r >= R) {
            if (li._on) { li.style.display = 'none'; li._on = false; }
            continue;
        }
        if (!li._on) { li.style.display = ''; li._on = true; }
        fillRow(li, list[i], i, i === ctx.ci && ctx.focus === 'items', fast);
    }
    if (isPosterCtx(ctx)) showDetail(list[ctx.ci]);
    setText($('pos-ind'), (ctx.ci + 1) + ' / ' + list.length);
    peekEpg(list[ctx.ci]);
    prefetchEpg(list, ctx);
}

function scheduleRender() {
    if (state.raf) return;
    state.raf = requestAnimationFrame(function () {
        state.raf = 0;
        var fast = state.fast;
        state.fast = false;
        if (state.screen !== 'browse' || !state.ctx) return;
        var cx = state.ctx;
        if (fast && cx.focus === 'groups' && !cx.query && !cx.loading) {
            renderGroups(cx);
            clearTimeout(state.deferTimer);
            state.deferTimer = setTimeout(function () {
                state.deferTimer = null;
                if (state.screen === 'browse' && state.ctx === cx) renderBrowse(false);
            }, 90);
            return;
        }
        clearTimeout(state.deferTimer);
        state.deferTimer = null;
        renderBrowse(fast);
    });
}

function move(delta, horiz) {
    var ctx = state.ctx;
    var now = Date.now();
    state.fast = now - state.lastNav < 160;
    state.lastNav = now;
    if (ctx.focus === 'groups') {
        var gi = clamp(ctx.gi + delta, 0, ctx.groups.length - 1);
        if (gi !== ctx.gi) { ctx.gi = gi; ctx.ci = 0; ctx.ws = 0; ctx.vis = null; ctx.query = ''; ctx.res = null; }
    } else if (delta < 0 && !horiz && ctx.ci < (isPosterCtx(ctx) ? COLS : 1)) {
        $('search').focus();
        return;
    } else {
        ctx.ci = clamp(ctx.ci + delta, 0, Math.max(0, visibleList(ctx).length - 1));
    }
    scheduleRender();
}

function focusItems() {
    var ctx = state.ctx;
    if (!visibleList(ctx).length) return;
    var g = ctx.groups[ctx.gi];
    if (!ctx.query && g && KINDS.indexOf(ctx.kind) >= 0) {
        gate({ kind: ctx.kind, group: g.name }, function () {
            if (state.ctx !== ctx) return;
            ctx.focus = 'items';
            renderBrowse();
        });
        return;
    }
    ctx.focus = 'items';
    renderBrowse();
}

function focusGroups() {
    state.ctx.focus = 'groups';
    renderBrowse();
}

function setQuery(q) {
    var ctx = state.ctx;
    ctx.query = q;
    ctx.vis = null;
    ctx.ci = 0;
    ctx.ws = 0;
    if (!q) ctx.res = null;
    clearTimeout(state.queryTimer);
    if (!q) { renderBrowse(); return; }
    state.queryTimer = setTimeout(function () {
        if (state.ctx === ctx && state.screen === 'browse') renderBrowse(true);
        clearTimeout(state.imgTimer);
        state.imgTimer = setTimeout(settleImages, 200);
    }, CFG.SEARCH_DELAY_MS);
}

function pushCtx(next) {
    state.stack.push(state.ctx);
    state.ctx = next;
    renderBrowse();
    loadCtx(next, false);
}

function backBrowse() {
    var ctx = state.ctx;
    if (ctx.focus === 'items') { focusGroups(); return; }
    if (state.stack.length) {
        leaveCtx(ctx);
        state.ctx = state.stack.pop();
        if (state.ctx.kind === 'cont' || state.ctx.kind === 'favs') rebuildGroups(state.ctx);
        renderBrowse();
        return;
    }
    goHub();
}

function enterSelected() {
    var ctx = state.ctx;
    if (!ctx.loading && ctx.error && !ctx.query && (!ctx.items || !ctx.items.length) && ctx.kind !== 'favs' && ctx.kind !== 'cont') { loadCtx(ctx, true); return; }
    if (ctx.focus === 'groups') { focusItems(); return; }
    var list = visibleList(ctx);
    var it = list[ctx.ci];
    if (!it) return;
    if (it.hiddenCat) { restoreCategory(it.hiddenCat); return; }
    saveSpot(ctx, it);
    if (it.kind === 'series') {
        gate(it, function () { pushCtx(makeCtx('ep', it.name, it)); });
        return;
    }
    if (it.kind === 'ep' && ctx.kind === 'cont' && it.serie) {
        openFromHistory(it);
        return;
    }
    if (ctx.kind === 'ep') {
        var all = ctx.items;
        var at = all.indexOf(it);
        openPlayer(ctx, all, at < 0 ? 0 : at);
        return;
    }
    if (it.kind === 'live' && S.get('miniPlayer') && !(state.bg && state.bg.key === it.key)) {
        gate(it, function () { startPreview(it); });
        return;
    }
    openPlayer(ctx, list, ctx.ci);
}

function openFromHistory(it) {
    var src = state.source;
    var serie = it.serie;
    var p = src.type === 'm3u'
        ? getCatalog(src, 'series', false).then(function (list) {
            for (var i = 0; i < list.length; i++) { if (list[i].id === serie.id) return list[i]; }
            return serie;
        })
        : Promise.resolve(serie);
    p.then(function (full) {
        if (state.screen !== 'browse' || !state.ctx) return;
        var next = makeCtx('ep', full.name, full);
        next.playKey = it.key;
        pushCtx(next);
    }).catch(function (err) { toast(errText(err), true); });
}

function onBrowseKey(k) {
    if ((k === 48 || k === 96) && !state.moving) { goHub(); return; }
    if (state.moving) {
        if (k === KEY.UP) moveFav(-1);
        else if (k === KEY.DOWN) moveFav(1);
        else if (k === KEY.ENTER || k === KEY.BACK || k === KEY.BACK_ALT || k === KEY.GREEN) { state.moving = null; toast(trl('تم تثبيت الترتيب', 'Order saved')); }
        return;
    }
    var step = state.step || 1;
    var grid = isPosterCtx(state.ctx) && state.ctx.focus === 'items';
    var ci = state.ctx.ci;
    switch (k) {
        case KEY.UP: move(grid ? -step * COLS : -step); break;
        case KEY.DOWN: move(grid ? step * COLS : step); break;
        case KEY.CH_UP: case KEY.RW: move(grid ? -COLS * GRID_ROWS : -(rowsNow() - 1)); break;
        case KEY.CH_DOWN: case KEY.FF: move(grid ? COLS * GRID_ROWS : rowsNow() - 1); break;
        case KEY.LEFT:
            if (grid && ci % COLS !== 0) move(-1, true);
            else if (state.ctx.focus === 'groups') openQuick();
            else focusGroups();
            break;
        case KEY.RIGHT:
            if (grid) { if (ci % COLS !== COLS - 1 && ci < visibleList(state.ctx).length - 1) move(1, true); }
            else focusItems();
            break;
        case KEY.ENTER: enterSelected(); break;
        case KEY.BLUE: $('search').focus(); break;
        case KEY.GREEN:
            if (state.ctx.query) { setQuery(''); renderBrowse(); }
            else if (state.ctx.focus === 'groups' || (state.ctx.groups[state.ctx.gi] && state.ctx.groups[state.ctx.gi].restore)) toggleHideGroup();
            else startMoveFav();
            break;
        case KEY.YELLOW: toggleFav(visibleList(state.ctx)[state.ctx.ci]); break;
        case KEY.INFO: toggleLock(); break;
        case KEY.RED:
            if (state.ctx.kind === 'cont') removeHistory();
            else if (state.ctx.kind !== 'favs') loadCtx(state.ctx, true);
            break;
        case KEY.BACK: case KEY.BACK_ALT: backBrowse(); break;
        case KEY.EXIT: exitApp(); break;
    }
}
