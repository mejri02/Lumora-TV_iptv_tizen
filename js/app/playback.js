/* Lumora — Player control: tune, info bar, EPG, seek, zap, background preview, error recovery. */
'use strict';

function openPlayer(ctx, list, index) {
    var first = list[index];
    if (!first) return;
    gate(first, function () { openPlayerNow(ctx, list, index); });
}

function openPlayerNow(ctx, list, index) {
    var it = list[index];
    var saved = it && isVod(it) && S.get('resume') ? state.pos[it.key] : 0;
    if (saved > 5000 && S.get('resumeAsk')) {
        showModal({
            title: 'Resume playback?',
            name: it.name,
            opts: [['Resume from {x}', fmt(saved)], ['Start over', '']],
            onPick: function (i) {
                if (i === 1) dropHistory(it);
                launchPlayer(ctx, list, index);
            }
        });
        return;
    }
    launchPlayer(ctx, list, index);
}

function launchPlayer(ctx, list, index) {
    var same = !!(state.bg && list[index] && list[index].key === state.bg.key && state.source && state.source.id === state.bg.srcId);
    state.bg = null;
    clearTimeout(state.bgTimer);
    state.libSig = libSig();
    state.playCtx = ctx;
    state.list = list;
    state.tickCount = 0;
    state.suspended = false;
    state.idx = index;
    state.prevIdx = -1;
    showScreen('player');
    if (S.get('keepAwake')) screenSaver(false);
    if (same) {
        try { Player.setPreview(false); } catch (e) { }
        state.retries = 0; state.quiet = false; state.quietN = 0; state.healthy = true;
        setInfoState(t('Live'));
        showInfo();
    } else {
        tune(index, true);
    }
    startTick();
}

function curItem() { return state.list[state.idx]; }
function tune(i, immediate) {
    var len = state.list.length;
    if (!len) return;
    var ni = ((i % len) + len) % len;
    if (ni !== state.idx) { state.prevIdx = state.idx; state.catchupUrl = null; }
    state.idx = ni;
    state.retries = 0;
    state.quietN = 0;
    state.resumeAt = 0;
    state.healthy = false;
    state.quiet = false;
    syncBusy();
    clearTimeout(state.retryTimer);
    clearTimeout(state.zapTimer);
    state.streamToken++;
    try { Player.avoidEngine(''); } catch (e) { }
    Net.cancel('resolve');
    rcHide();
    state.wdPos = -1;
    state.wdMoved = false;
    state.wdAt = Date.now();
    var target = curItem();
    if (target && isGated(target)) {
        Player.stop();
        setInfoState(t('Enter PIN'));
        showInfo();
        var again = state.idx;
        gate(target, function () { if (state.screen === 'player' && state.idx === again) tune(again, true); });
        return;
    }
    setInfoState(t('Connecting…'));
    showInfo();
    if (immediate) {
        startStream();
    } else {
        Player.stop();
        state.zapTimer = setTimeout(startStream, CFG.ZAP_DELAY_MS);
    }
}

function startStream() {
    if (state.screen !== 'player') return;
    var token = ++state.streamToken;
    var it = curItem();
    state.wdPos = -1;
    state.wdMoved = false;
    state.wdAt = Date.now();
    rcConnecting(it);
    var cu = !isVod(it) && state.catchupUrl;
    var tResolve = Date.now();
    (cu ? Promise.resolve(cu) : (it.direct ? Promise.resolve(it.url) : prov().resolve(state.source, it))).then(function (url) {
        if (token !== state.streamToken || state.screen !== 'player') return;
        var start = 0;
        if (isVod(it) && state.retries < 2) start = state.resumeAt || (S.get('resume') ? Math.max(0, (state.pos[it.key] || 0) - 3000) : 0);
        if (it.direct) start = state.resumeAt || it.start || 0;
        state.paused = false;
        setPauseUI(false, true);
        state.playSpeed = 1; state.subDelay = 0;
        try { Player.setSpeed(1); Player.setSubDelay(0); Player.setSubSize(readJSON(SUBSIZE_KEY, 0) || 0); } catch (e) { }
        try { Player.noteResolve(Date.now() - tResolve); } catch (e) { }
        Player.play(url, { start: start, live: !isVod(it) && !cu, ua: it.ua, referer: it.referer });
    }).catch(function (err) {
        if (token !== state.streamToken) return;
        console.log('resolve error', err);
        handleError(err);
    });
}

function setInfoState(text) { $('info-state').textContent = text; }

function showInfo() {
    var it = curItem();
    if (!it) return;
    var live = !isVod(it);
    $('info-name').textContent = it.name;
    var meta;
    var num = $('info-num');
    if (num) { num.textContent = live ? t('CH') + ' ' + (state.idx + 1) : ''; num.classList.toggle('hidden', !live); }
    if (live) {
        meta = t(it.group || '') + '   ·   ' + (state.idx + 1) + ' / ' + state.list.length;
    } else if (it.kind === 'ep') {
        var sname = (state.playCtx && state.playCtx.serie) ? state.playCtx.serie.name : (it.serieName || '');
        meta = sname + '   ·   S' + pad(it.season || 0) + ' E' + pad(it.num || 0);
    } else {
        meta = t(it.group || '') + (it.year ? '   ·   ' + it.year : '') +
            (it.rating && it.rating !== '0' ? '   ·   ' + t('Rating') + ' ' + it.rating : '');
    }
    $('info-meta').textContent = meta;
    $('info-plot').textContent = live ? '' : (it.plot || '');
    $('info-fav').textContent = state.favorites[it.key] ? t('★ Favorite') : '';
    $('info-sleep').textContent = state.sleepAt ? '☾ ' + t('{n} min', { n: sleepLeft() }) : '';
    $('info-tech').textContent = techText();
    renderQuality();
    var logo = safeLogo(it.logo);
    $('info-logo').style.visibility = 'visible';
    if (!logo || logo === PH_LOGO) { $('info-logo').src = PH_LOGO; }
    else Net.loadImage(logo).then(function (du) {
        $('info-logo').src = du || logo;
    }, function () { $('info-logo').src = logo; });
    $('prog').classList.toggle('hidden', live);
    var ih = $('info-hints');
    if (ih && ih.getAttribute('data-h') !== (live ? 'player' : 'vodplayer')) {
        ih.setAttribute('data-h', live ? 'player' : 'vodplayer');
        renderHints();
    }
    $('info-epg').textContent = '';
    if (live) loadEpg(it);
    else loadDetail(it);
    updateProgress();
    $('info').classList.remove('hidden');
    var pcw = $('pclock-wrap');
    if (pcw) pcw.classList.remove('hidden');
    clearTimeout(state.infoTimer);
    if (!state.paused) state.infoTimer = setTimeout(hideInfo, S.get('infoTimeout') * 1000);
}

function hideInfo() {
    clearTimeout(state.infoTimer);
    $('info').classList.add('hidden');
    var pcw = $('pclock-wrap');
    if (pcw) pcw.classList.add('hidden');
}

function toggleInfo() {
    if ($('info').classList.contains('hidden')) showInfo();
    else hideInfo();
}

function mergeDetail(it, d) {
    if (!d) return;
    it.plot = d.plot || it.plot || '';
    it.year = d.year || it.year || '';
    it.rating = d.rating || it.rating || '';
    it.genre = d.genre || it.genre || '';
    it.cast = d.cast || it.cast || '';
}

function fetchDetail(it, cb) {
    if (it.detailed) { if (cb) cb(); return; }
    var p = prov();
    var srv = (p.detail && (it.kind === 'vod' || it.kind === 'series')) ? p.detail(state.source, it) : Promise.resolve(null);
    srv.then(function (d) { return d; }, function (e) {
        if (e && e.aborted) throw e;
        return null;
    }).then(function (d) {
        mergeDetail(it, d);
        if (!it.plot && (it.kind === 'vod' || it.kind === 'series')) {
            return Tmdb.lookup(it).then(function (d2) { mergeDetail(it, d2); }, function (e) {
                if (e && e.aborted) throw e;
                if (e && e.code === 401 && !state.tmdbWarned) { state.tmdbWarned = true; toast(t('TMDB key rejected'), true); }
            });
        }
    }).then(function () {
        it.detailed = true;
        if (cb) cb();
    }, function (e) {
        if (e && e.aborted) return;
        it.detailed = true;
        if (cb) cb();
    });
}

function loadDetail(it) {
    if (it.detailed) return;
    fetchDetail(it, function () {
        if (state.screen === 'player' && curItem() === it) showInfo();
    });
}

function loadEpg(ch) {
    renderEpg(null);
    if (ch.direct) return;
    var cached = state.epgCache[ch.key];
    if (cached && Date.now() - cached.at < EPG_TTL) {
        renderEpg(cached.data);
        return;
    }
    Net.cancel('epg');
    prov().epg(state.source, ch, state.catCache[state.source.id + ':live']).then(function (data) {
        state.epgCache[ch.key] = { at: Date.now(), data: data };
        if (state.screen === 'player' && curItem() === ch) renderEpg(data);
    }).catch(function () { });
}

function renderEpg(d) {
    var el = $('info-epg');
    if (!d || !d.now) { el.innerHTML = ''; return; }
    var n = d.now;
    var a = hm(n.start), z = hm(n.end);
    var pct = 0, left = '';
    if (a >= 0 && z >= 0) {
        var c = new Date();
        var cur = c.getHours() * 60 + c.getMinutes();
        if (z <= a) z += 1440;
        if (cur < a) cur += 1440;
        pct = Math.max(0, Math.min(100, Math.round((cur - a) / (z - a) * 100)));
        left = t('{n} min', { n: Math.max(0, z - cur) }) + ' ' + t('left');
    }
    var h = '<div class="ie-row"><span class="ie-lb">' + esc(t('NOW')) + '</span><span class="ie-t">' + esc(n.title) + '</span><span class="ie-tm">' +
        esc((n.start || '') + (n.end ? ' - ' + n.end : '')) + (left ? '  ·  ' + esc(left) : '') + '</span></div>';
    if (a >= 0 && z >= 0) h += '<div class="ie-pb"><i style="width:' + pct + '%"></i></div>';
    if (d.next) h += '<div class="ie-nx"><span class="ie-lb">' + esc(t('NEXT')) + '</span>' + esc((d.next.start ? d.next.start + '  ' : '') + d.next.title) + '</div>';
    el.innerHTML = h;
}

function renderQuality() {
    var q = $('info-q');
    if (!q) return;
    var it = curItem();
    var lbl = '';
    try {
        var si = Player.streamInfo();
        var h = si.h || 0;
        if (h >= 2000) lbl = '4K';
        else if (h >= 1000) lbl = 'FHD';
        else if (h >= 700) lbl = 'HD';
        else if (h > 0) lbl = 'SD';
    } catch (e) { }
    q.textContent = lbl;
    q.classList.toggle('hidden', !lbl || !state.healthy);
}

function updateProgress() {
    var it = curItem();
    if (!it || !isVod(it)) return;
    var pos = Player.position();
    var dur = Player.duration();
    var pct = dur ? Math.min(100, pos / dur * 100) : 0;
    $('prog-fill').style.width = pct + '%';
    $('prog-dot').style.left = pct + '%';
    if (state.paused) updatePauseTime();
    $('prog-time').textContent = fmt(pos) + ' / ' + (dur ? fmt(dur) : '--:--') +
        (dur && pos > 0 ? '   ·   ' + t('{n} min', { n: Math.max(0, Math.round((dur - pos) / 60000)) }) + ' ' + t('left') : '');
}

function startTick() {
    clearInterval(state.tickTimer);
    state.tickTimer = setInterval(function () {
        if (state.screen !== 'player') return;
        updateProgress();
        watchdog();
        if (!$('info').classList.contains('hidden')) { $('info-tech').textContent = techText(); renderQuality(); }
        state.tickCount++;
        if (state.tickCount >= Math.max(1, Math.round(CFG.SAVE_POS_MS / 1000))) {
            state.tickCount = 0;
            savePos();
        }
    }, 1000);
}

function stopTick() {
    clearInterval(state.tickTimer);
    state.tickTimer = null;
}

function savePos() {
    var it = curItem();
    if (!it || it.direct || !isVod(it)) return;
    var pos = Player.position();
    var dur = Player.duration();
    if (!pos || !dur) return;
    if (pos / dur > 0.9) markWatched(it);
    if (!S.get('resume')) return;
    if (pos / dur > 0.95) {
        delete state.pos[it.key];
        delete state.hist[it.key];
    } else if (pos > 5000) {
        state.pos[it.key] = Math.floor(pos);
        recordHist(it, pos, dur);
    } else {
        return;
    }
    writeJSON(POS_KEY, state.pos);
    writeJSON(HIST_KEY, state.hist);
}

function clearPos(it) {
    if (!it) return;
    dropHistory(it);
}

function showNextCard(n, nx) {
    var el = $('next-card');
    if (!el) return;
    var ar = I18n.isRtl();
    $('nc-n').textContent = String(n);
    $('nc-label').textContent = ar ? 'الحلقة التالية' : 'Up next';
    var nm = nx ? (nx.name || '') : '';
    if (nx && nx.kind === 'ep') nm = 'S' + pad(nx.season || 0) + ' E' + pad(nx.num || 0) + (nm ? '  ·  ' + nm : '');
    $('nc-name').textContent = nm;
    $('nc-hint').textContent = ar ? 'OK للتشغيل الآن  ·  أي زر آخر للإلغاء' : 'OK to play now  ·  any other key to cancel';
    el.classList.remove('hidden');
}

function hideNextCard() {
    var el = $('next-card');
    if (el) el.classList.add('hidden');
}

function playNextNow() {
    clearInterval(state.nextTimer);
    state.nextTimer = null;
    hideNextCard();
    tune(state.idx + 1, true);
}

function markWatched(it) {
    if (!it || !it.key || state.watched[it.key]) return;
    state.watched[it.key] = Date.now();
    var keys = Object.keys(state.watched);
    if (keys.length > 3000) {
        keys.sort(function (a, b) { return state.watched[a] - state.watched[b]; });
        for (var i = 0; i < keys.length - 3000; i++) delete state.watched[keys[i]];
    }
    writeJSON(WATCH_KEY, state.watched);
}

function onEnded() {
    if (state.screen !== 'player') return;
    var it = curItem();
    if (!isVod(it) && state.catchupUrl) { state.catchupUrl = null; tune(state.idx, true); return; }
    if (!isVod(it)) { handleError('stream completed'); return; }
    markWatched(it);
    clearPos(it);
    if (it.kind === 'ep' && S.get('autoNext') && state.idx + 1 < state.list.length) {
        var n = 5;
        clearInterval(state.nextTimer);
        var nx = state.list[state.idx + 1];
        showNextCard(n, nx);
        state.nextTimer = setInterval(function () {
            if (state.screen !== 'player') { clearInterval(state.nextTimer); state.nextTimer = null; hideNextCard(); return; }
            n--;
            if (n <= 0) { clearInterval(state.nextTimer); state.nextTimer = null; hideNextCard(); tune(state.idx + 1, true); }
            else showNextCard(n, nx);
        }, 1000);
    } else closePlayer();
}

var pauseFlashTimer = null, seekFlashTimer = null;

function pauseHintText() {
    return I18n.isRtl() ? 'اضغط OK للمتابعة' : 'Press OK to resume';
}

function updatePauseTime() {
    var el = $('pi-time');
    if (!el || !state.paused) return;
    var it = curItem();
    if (!it || !isVod(it)) { el.textContent = ''; return; }
    var dur = Player.duration();
    el.textContent = fmt(Player.position()) + ' / ' + (dur ? fmt(dur) : '--:--');
}

/* Clear on-screen pause state: a big dimmed badge stays until playback resumes,
   so a paused picture can never be mistaken for a frozen stream. */
function setPauseUI(paused, silent) {
    var el = $('pause-ind');
    if (!el) return;
    clearTimeout(pauseFlashTimer);
    el.classList.remove('flash');
    if (paused) {
        el.classList.add('is-paused');
        el.classList.remove('hidden');
        $('pi-title').textContent = t('Paused');
        $('pi-hint').textContent = pauseHintText();
        updatePauseTime();
        return;
    }
    var was = el.classList.contains('is-paused');
    el.classList.remove('is-paused');
    if (silent || !was) { el.classList.add('hidden'); return; }
    // brief "play" flash on resume
    $('pi-title').textContent = '';
    $('pi-time').textContent = '';
    $('pi-hint').textContent = '';
    el.classList.add('flash');
    el.classList.remove('hidden');
    pauseFlashTimer = setTimeout(function () { el.classList.add('hidden'); el.classList.remove('flash'); }, 650);
}

function togglePause() {
    var playing = Player.toggle();
    state.paused = !playing;
    linkSoon();
    if (!playing) savePos();
    setInfoState(t(playing ? 'Playing' : 'Paused'));
    setPauseUI(!playing);
    showInfo();
}

function flashSeek(delta, target) {
    var el = $('seek-flash');
    if (!el) return;
    var s = Math.abs(Math.round(delta / 1000));
    el.textContent = (delta < 0 ? '\u25C0\u25C0  -' : '+') + s + (I18n.isRtl() ? ' ث' : 's') + (delta < 0 ? '' : '  \u25B6\u25B6') + '    ' + fmt(target);
    el.classList.remove('hidden');
    clearTimeout(seekFlashTimer);
    seekFlashTimer = setTimeout(function () { el.classList.add('hidden'); }, 1100);
}

function seekBy(delta) {
    var it = curItem();
    if (!isVod(it)) return;
    var pos = Player.position();
    var dur = Player.duration();
    var target = pos + delta;
    if (dur) target = Math.min(target, dur - 1000);
    target = Math.max(0, target);
    Player.seek(target);
    flashSeek(delta, target);
    showInfo();
    updatePauseTime();
}

function zap(d) { tune(state.idx + d); }

function digit(d) {
    state.digits = (state.digits + d).slice(-4);
    var el = $('digits');
    var pick = state.list[parseInt(state.digits, 10) - 1];
    el.innerHTML = '<b>' + esc(state.digits) + '</b>' + (pick ? '<small>' + esc(pick.name) + '</small>' : '<small class="none">' + esc(t('No channel {n}', { n: parseInt(state.digits, 10) })) + '</small>');
    el.classList.remove('hidden');
    clearTimeout(state.digitTimer);
    state.digitTimer = setTimeout(function () {
        var typed = parseInt(state.digits, 10) - 1;
        state.digits = '';
        el.classList.add('hidden');
        if (typed >= 0 && typed < state.list.length) tune(typed, true);
        else toast(t('No channel {n}', { n: typed + 1 }));
    }, CFG.DIGIT_TIMEOUT_MS);
}

function cycleAspect() {
    var next = ASPECTS[(ASPECTS.indexOf(S.get('aspect')) + 1) % ASPECTS.length];
    S.set('aspect', next);
    Player.setAspect(next);
    toast(t('Picture: {x}', { x: t(ASPECT_LABEL[next]) }));
}

function cycleSleep() {
    var next = SLEEP_STEPS[(SLEEP_STEPS.indexOf(state.sleepMin) + 1) % SLEEP_STEPS.length];
    setSleep(next);
    toast(next ? t('Sleep timer: {n} min', { n: next }) : t('Sleep timer off'));
    showInfo();
}

function closePlayer() {
    var cur0 = curItem();
    if (cur0 && cur0.direct) { closeCast(); return; }
    state.closedAt = Date.now();
    clearTimeout(state.zapTimer);
    clearTimeout(state.retryTimer);
    var it0 = curItem();
    try {
        var cx0 = state.ctx;
        if (cx0 && it0 && state.playCtx === cx0) {
            var vl0 = visibleList(cx0), at0 = vl0.indexOf(it0);
            if (at0 >= 0) { cx0.ci = at0; cx0.focus = 'items'; saveSpot(cx0, it0); }
        }
    } catch (e0) { }
    var wasCatch = !!state.catchupUrl;
    state.catchupUrl = null;
    closeGuide();
    var keepBg = !!(it0 && !wasCatch && !isVod(it0) && state.healthy && state.source && !state.sleepAt);
    state.bg = keepBg ? { item: it0, key: it0.key, name: it0.name, srcId: state.source.id, tries: 0 } : null;
    state.streamToken++;
    setPauseUI(false, true);
    clearInterval(state.nextTimer); state.nextTimer = null; hideNextCard();
    try { savePos(); } catch (e1) { }
    try { stopTick(); } catch (e2) { }
    state.list = [];
    state.playCtx = null;
    showScreen('browse');
    try {
        if (state.ctx) {
            var cx = state.ctx;
            if (cx.kind === 'favs' || cx.kind === 'cont' || libSig() !== state.libSig) rebuildGroups(cx);
            renderBrowse();
        }
    } catch (e3) { }
    setTimeout(function () {
        if (state.screen === 'player') return;
        if (state.bg) { renderBg(); return; }
        try { Player.stop(); } catch (e4) { }
        screenSaver(true);
    }, 60);
}

function libSig() {
    return Object.keys(state.favorites || {}).length + ':' + Object.keys(state.hist || {}).length + ':' + state.recentStamp;
}

function miniRect() {
    return { x: I18n.isRtl() ? 64 : 1056, y: 140, w: 800, h: 450 };
}

function renderBg() {
    var el = $('bg-play');
    var on = !!state.bg && state.screen === 'browse';
    var root = document.documentElement;
    if (on) {
        var r = miniRect();
        root.style.setProperty('--mx', r.x + 'px');
        root.style.setProperty('--my', r.y + 'px');
        root.style.setProperty('--mw', r.w + 'px');
        root.style.setProperty('--mh', r.h + 'px');
    }
    root.classList.toggle('mini', on);
    syncBgVideo();
    if (on !== !!state.miniOn) {
        state.miniOn = on;
        try { Player.setRect(on ? miniRect() : null); } catch (e) { }
    }
    root.classList.toggle('minibuf', on && !!state.bg.buf);
    if (!el) return;
    el.classList.toggle('hidden', !on);
    if (on) {
        var bb = state.bg;
        var it0 = bb.item || {};
        var logo = it0.logo ? '<img class="bl" alt="" src="' + esc(it0.logo) + '">' : '';
        var sub0 = [it0.group ? t(it0.group) : '', it0.num ? '#' + it0.num : ''].filter(Boolean).join('  \u00B7  ');
        var badge = bb.buf ? '<div class="bd buf">' + esc(t('Buffering\u2026')) + '</div>' : '<div class="bd">\u25CF ' + esc(t('Live')) + '</div>';
        var dg = '';
        try { dg = diagTxt(); } catch (e) { }
        var html = '<div class="bh">' + logo + '<div class="bt"><b>' + esc(bb.name) + '</b><small>' + esc(sub0) + '</small></div>' + badge + '</div>' +
            epgBox(bb.epg) +
            '<div class="bf"><span class="kc">OK</span><span>' + esc(t('Press OK again for full screen')) + '</span>' + (dg ? '<span class="dg">' + esc(dg) + '</span>' : '') + '</div>';
        if (el._h !== html) { el._h = html; el.innerHTML = html; }
    } else el._h = '';
}

function hm(s) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(s || '');
    return m ? (+m[1]) * 60 + (+m[2]) : -1;
}

function epgBox(d) {
    if (!d || !d.now) return '';
    var n = d.now;
    var a = hm(n.start), z = hm(n.end);
    var pct = 0;
    if (a >= 0 && z >= 0) {
        var c = new Date();
        var cur = c.getHours() * 60 + c.getMinutes();
        if (z <= a) z += 1440;
        if (cur < a) cur += 1440;
        pct = Math.max(0, Math.min(100, Math.round((cur - a) / (z - a) * 100)));
    }
    var s = '<div class="be"><div class="er"><span>' + esc(n.title) + '</span><span class="tm">' + esc((n.start || '') + (n.end ? ' - ' + n.end : '')) + '</span></div>';
    if (a >= 0 && z >= 0) s += '<div class="pb"><i style="width:' + pct + '%"></i></div>';
    if (d.next) s += '<div class="nx">' + esc(t('NEXT') + '  ' + (d.next.start ? d.next.start + '  ' : '') + d.next.title) + '</div>';
    return s + '</div>';
}

function epgHtml(d) {
    if (!d || !d.now) return '';
    var s = '<i>' + esc(t('NOW') + '  ' + (d.now.start ? d.now.start + '  ' : '') + d.now.title) + '</i>';
    if (d.next) s += '<i class="nx">' + esc(t('NEXT') + '  ' + (d.next.start ? d.next.start + '  ' : '') + d.next.title) + '</i>';
    return s;
}

function loadBgEpg(b) {
    var ch = b.item;
    var cached = state.epgCache[ch.key];
    if (cached && Date.now() - cached.at < EPG_TTL) { b.epg = cached.data; return; }
    try {
        prov().epg(state.source, ch, state.catCache[state.source.id + ':live']).then(function (data) {
            state.epgCache[ch.key] = { at: Date.now(), data: data };
            if (state.bg === b) { b.epg = data; renderBg(); }
        }).catch(function () { });
    } catch (e) { }
}

function speedTxt() {
    var k = 0;
    try { k = Player.speed(); } catch (e) { }
    if (!k) return '';
    return '⇣ ' + (k >= 1000 ? (k / 1000).toFixed(1) + ' Mbps' : k + ' kbps');
}

function diagTxt() {
    try {
        var i = Player.streamInfo();
        var s = i.engine ? i.engine + (i.w ? ' · ' + i.w + '×' + i.h : '') : '';
        if (state.bg && state.bg.buf) { var sp = speedTxt(); if (sp) s += (s ? ' · ' : '') + sp; }
        return s;
    } catch (e) { return ''; }
}

function speedTick() {
    var chip = $('net-chip');
    if (!chip) return;
    if (state.screen === 'player') {
        var txt = !state.healthy ? speedTxt() : '';
        chip.textContent = txt;
        chip.classList.toggle('hidden', !txt);
    } else {
        chip.classList.add('hidden');
        if (state.screen === 'browse' && state.bg && state.bg.buf) renderBg();
    }
}

function startPreview(it) {
    var b = { item: it, key: it.key, name: it.name, srcId: state.source.id, tries: 0, buf: true };
    state.bg = b;
    clearTimeout(state.bgTimer);
    if (S.get('keepAwake')) screenSaver(false);
    loadBgEpg(b);
    renderBg();
    scheduleRender();
    setTimeout(function () { if (state.bg === b) renderBg(); }, 4500);
    prov().resolve(state.source, it).then(function (url) {
        if (state.bg !== b || state.screen !== 'browse') return;
        Player.play(url, { start: 0, live: true, preview: true, ua: it.ua, referer: it.referer });
    }).catch(function (err) {
        if (state.bg !== b) return;
        toast(errText(err), true);
        stopBg();
    });
}

function stopBg() {
    if (!state.bg) return;
    state.bg = null;
    clearTimeout(state.bgTimer);
    try { Player.stop(); } catch (e) { }
    screenSaver(true);
    renderBg();
    scheduleRender();
}

function bgRecover() {
    var b = state.bg;
    if (!b) return;
    if (++b.tries > 3 || !state.source || state.source.id !== b.srcId) { stopBg(); return; }
    clearTimeout(state.bgTimer);
    state.bgTimer = setTimeout(function () {
        if (state.bg !== b || state.screen === 'player') return;
        prov().resolve(state.source, b.item).then(function (url) {
            if (state.bg !== b || state.screen === 'player') return;
            Player.play(url, { start: 0, live: true, preview: true, ua: b.item.ua, referer: b.item.referer });
        }).catch(function () { bgRecover(); });
    }, 1500 * b.tries);
}

function handleBuffering(on) {
    if (state.screen !== 'player') {
        if (state.bg && state.bg.buf !== on) { state.bg.buf = on; renderBg(); }
        return;
    }
    var it = curItem();
    setInfoState(on ? t('Buffering…') : t(isVod(it) ? 'Playing' : 'Live'));
    state.healthy = !on;
    syncBusy();
    if (!on) {
        state.retries = 0; state.quiet = false; state.quietN = 0; rcHide();
        if (it && !isVod(it) && !state.catchupUrl) recordRecent(it);
    }
    else if (RC.mode !== 'reconnect' && RC.mode !== 'fatal') rcLater('buffer', t('Buffering…'), '', 700);
}

function handleProgress(p) {
    if (state.screen !== 'player' || state.healthy) return;
    setInfoState(t('Buffering… {n}%', { n: p }));
    rcProgress(p);
}

function handleStall(err) {
    if (state.screen !== 'player') { if (state.bg) bgRecover(); return; }
    handleError(err || 'stalled');
}

function handleError(err) {
    if (state.screen !== 'player') { if (state.bg) bgRecover(); return; }
    console.log('playback error', err && (err.kind || err.message) || err);
    state.lastErr = String((err && (err.kind || err.message)) || err || '').slice(0, 80);
    var it = curItem();
    var msg = (err && err.message) ? errText(err) : t('Unavailable');
    var msgClean = msg;
    try {
        var rw = err && err.raw;
        var rs = rw && typeof rw === 'object' ? (rw.name || rw.message || rw.details || rw.type || JSON.stringify(rw)) : rw;
        msg += ' [' + (Player.engine() || '-') + (rs ? ':' + String(rs).slice(0, 60) : '') + ']';
    } catch (ex) { }
    state.healthy = false;
    syncBusy();
    if (isVod(it)) {
        var at = Player.recentSeek() || Player.position();
        if (at > 0) state.resumeAt = at;
    }
    var limit = S.get('retryLimit');
    clearTimeout(state.retryTimer);
    if (err && err.fatal) {
        setInfoState(msg);
        rcFatal(msgClean);
        showInfo();
        return;
    }
    if (state.retries >= 2 && !state.tipShown && S.get('buffer') !== 'stable' && S.get('buffer') !== 'weak') {
        state.tipShown = true;
        toast(t('Weak connection? Try Settings → Buffer size → Weak network'), true);
    }
    if (state.retries === 2 && !isVod(it) && S.get('engine') === 'auto') {
        try { if (Player.avoidEngine(Player.engine())) toast(t('Trying another player engine…')); } catch (e2) { }
    }
    if (state.retries < limit) {
        state.retries++;
        setInfoState(t('Reconnecting ({a}/{b})…', { a: state.retries, b: limit }));
        var delay = state.retries === 1 ? CFG.FAST_RETRY_MS : Player.backoffDelay(state.retries);
        rcReconnect(t('Reconnecting ({a}/{b})…', { a: state.retries, b: limit }), delay, false);
        state.retryTimer = setTimeout(startStream, delay);
    } else {
        if (!isVod(it)) {
            state.quiet = true;
            state.quietN = (state.quietN || 0) + 1;
            var wait = Math.max(12000, Math.min(60000, Player.backoffDelay(limit + state.quietN)));
            setInfoState(msg + '  ·  ' + t('Retrying in {n} sec', { n: Math.round(wait / 1000) }));
            rcReconnect(msgClean, wait, true);
            state.retryTimer = setTimeout(function () { state.retries = 0; startStream(); }, wait);
        } else {
            setInfoState(msg);
            rcFatal(msgClean);
        }
    }
    if (!state.quiet) showInfo();
}

function onOnline() {
    if (state.screen !== 'player' || state.healthy) return;
    clearTimeout(state.retryTimer);
    state.retries = 0;
    state.quiet = false;
    setInfoState(t('Connecting…'));
    showInfo();
    state.retryTimer = setTimeout(startStream, 400);
}

function onOffline() {
    if (state.screen !== 'player') return;
    setInfoState(t('No connection'));
    rcOffline();
    showInfo();
}

var RC = { mode: '', delayT: null, tickT: null };

function rcHide() {
    clearTimeout(RC.delayT);
    clearInterval(RC.tickT);
    RC.delayT = null;
    RC.tickT = null;
    RC.mode = '';
    var el = $('reconnect');
    if (el) el.classList.add('hidden');
}

function rcPaint(mode, title, sub, pct) {
    var el = $('reconnect');
    if (!el) return;
    RC.mode = mode;
    setCls(el, 'rc-' + mode);
    setText($('rc-title'), title);
    setText($('rc-sub'), sub);
    var bar = $('rc-bar');
    bar.style.display = pct === null ? 'none' : '';
    if (pct !== null) $('rc-fill').style.width = pct + '%';
    el.classList.remove('hidden');
}

function rcLater(mode, title, sub, ms) {
    if (RC.mode === 'reconnect' || RC.mode === 'fatal') return;
    clearTimeout(RC.delayT);
    var el = $('reconnect');
    if (el && !el.classList.contains('hidden')) { rcPaint(mode, title, sub, null); return; }
    RC.delayT = setTimeout(function () {
        RC.delayT = null;
        if (state.screen !== 'player') return;
        if (RC.mode === 'reconnect' || RC.mode === 'fatal') return;
        rcPaint(mode, title, sub, null);
    }, ms);
}

function rcConnecting(it) {
    if (state.screen !== 'player') return;
    if (RC.mode === 'reconnect' || RC.mode === 'fatal') {
        clearInterval(RC.tickT);
        RC.tickT = null;
        rcPaint('reconnect', t('Connection lost'), t('Reconnecting…'), null);
        return;
    }
    rcLater('connect', t('Connecting…'), it ? it.name : '', 650);
}

function rcReconnect(sub, ms, withHint) {
    if (state.screen !== 'player') return;
    clearTimeout(RC.delayT);
    clearInterval(RC.tickT);
    RC.delayT = null;
    RC.tickT = null;
    var title = t('Connection lost');
    if (ms < 1500) { rcPaint('reconnect', title, sub, null); return; }
    var end = Date.now() + ms;
    var paint = function () {
        var left = Math.max(0, end - Date.now());
        var pct = Math.min(100, Math.round((1 - left / ms) * 100));
        var line = withHint ? t('Retry in {n}s', { n: Math.ceil(left / 1000) }) + '  ·  ' + t('Press OK to retry now') : sub + '  ·  ' + t('Retry in {n}s', { n: Math.ceil(left / 1000) });
        rcPaint('reconnect', title, line, pct);
    };
    paint();
    RC.tickT = setInterval(paint, 250);
}

function rcFatal(msg) {
    if (state.screen !== 'player') return;
    clearTimeout(RC.delayT);
    clearInterval(RC.tickT);
    RC.delayT = null;
    RC.tickT = null;
    rcPaint('fatal', msg || t('Unavailable'), t('Press OK to retry · BACK to return'), null);
}

function rcOffline() {
    if (state.screen !== 'player') return;
    clearTimeout(RC.delayT);
    clearInterval(RC.tickT);
    RC.delayT = null;
    RC.tickT = null;
    rcPaint('reconnect', t('No connection'), t('Waiting for network…'), null);
}

function rcProgress(p) {
    if (RC.mode === 'buffer' || RC.mode === 'connect' || RC.mode === 'reconnect') {
        var el = $('reconnect');
        if (el && !el.classList.contains('hidden') && !RC.tickT) setText($('rc-sub'), p + '%');
    }
}

function rcActionable() {
    var el = $('reconnect');
    return !!el && !el.classList.contains('hidden') && (RC.mode === 'reconnect' || RC.mode === 'fatal');
}

function retryNow() {
    clearTimeout(state.retryTimer);
    state.retries = 0;
    state.quiet = false;
    state.quietN = 0;
    state.healthy = false;
    setInfoState(t('Connecting…'));
    startStream();
}

function watchdog() {
    if (state.screen !== 'player' || !state.healthy || state.paused || state.suspended) { state.wdAt = Date.now(); return; }
    var it = curItem();
    if (!it) return;
    var p = Player.position();
    if (p !== state.wdPos) {
        if (state.wdPos >= 0 && p > state.wdPos) state.wdMoved = true;
        state.wdPos = p;
        state.wdAt = Date.now();
        return;
    }
    if (!state.wdMoved) return;
    var weak = S.get('buffer') === 'weak';
    var limit = isVod(it) ? (weak ? 90000 : 30000) : (CFG.STALL_LIVE_MS * (weak ? 3 : 1) + 3000);
    if (Date.now() - state.wdAt > limit) {
        state.wdAt = Date.now();
        state.wdMoved = false;
        handleError({ kind: 'timeout', message: 'Stream timed out', raw: 'frozen' });
    }
}
