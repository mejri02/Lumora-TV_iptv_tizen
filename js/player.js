var Player = (function () {
    'use strict';

    var av = (window.webapis && window.webapis.avplay) ? window.webapis.avplay : null;
    var video = document.getElementById('html-video');
    var root = document.documentElement;
    var h = { buffering: function () {}, error: function () {}, ended: function () {}, stall: function () {}, progress: function () {} };

    var current = null;
    var currentLive = true;
    var aspect = 'fit';
    var profile = 'balanced';
    var pref = 'auto';
    var bump = 0;
    var stallTimer = null;
    var seekTimer = null;
    var softTimer = null;
    var seekTarget = null;
    var lastSeek = null;
    var verifyTimer = null;
    var playing = false;
    var rebuf = [];
    var bufOn = false;
    var lastT = 0;
    var nativeTimer = null;
    var tm = { t0: 0, resolve: 0, prep: 0, first: 0 };
    var pendingResolve = 0;
    function noteResolve(ms) { pendingResolve = Math.max(0, ms | 0); }
    function secs(ms) { return (ms / 1000).toFixed(1) + 's'; }
    function timingTxt() {
        if (!tm.t0) return '';
        var o = [];
        if (tm.resolve) o.push('resolve ' + secs(tm.resolve));
        if (tm.prep) o.push('open ' + secs(tm.prep - tm.t0));
        o.push(tm.first ? 'first frame ' + secs(tm.first - tm.t0) : 'waiting ' + secs(Date.now() - tm.t0));
        return o.join(' · ');
    }

    var session = 0;
    var engineTok = 0;
    var engineName = null;
    var chain = [];
    var chainIdx = 0;
    var soft = 0;
    var mediaFix = 0;
    var pendingStart = 0;
    var startPos = 0;
    var curUa = '';
    var det = null;
    var hlsInst = null;
    var dashInst = null;
    var tsInst = null;
    var libs = {};
    var previewMode = false;
    var meas = { kbps: 0, at: 0, busy: false };
    var measX = null;
    var hlsBound = [];
    var dashBound = [];
    var tsBound = [];
    var vh = {};
    var vBound = false;
    var engMemo = {};
    var engMemoN = 0;
    function memoKey(u) { return String(u || '').split('#')[0].split('?')[0]; }
    function extKey(u) { var m = /\.([a-z0-9]{2,5})$/i.exec(memoKey(u)); return m ? 'ext:' + m[1].toLowerCase() : ''; }
    function memoGet(u) { return engMemo[memoKey(u)] || engMemo[extKey(u)] || null; }
    function memoSet(u, n) {
        var k = memoKey(u);
        if (!k || !n) return;
        var ek = extKey(u);
        if (ek && !currentLive) engMemo[ek] = n;
        if (!engMemo[k]) {
            if (engMemoN >= 300) { engMemo = {}; engMemoN = 0; }
            engMemoN++;
        }
        engMemo[k] = n;
    }

    function measure() {
        if (meas.busy || !current || !/^https?:/i.test(current)) return;
        // A second connection to a live stream can exceed a provider's connection limit and drop playback.
        // Only probe live streams when the diagnostics option is on.
        if (currentLive) {
            var dg = false;
            try { dg = !!(window.Settings && Settings.get('diag')); } catch (e0) { }
            if (!dg) return;
        }
        if (Date.now() - meas.at < 15000) return;
        meas.busy = true;
        var t0 = Date.now();
        var loaded = 0;
        var fin = false;
        var x = new XMLHttpRequest();
        measX = x;
        function done() {
            if (fin) return;
            fin = true;
            meas.busy = false;
            if (measX === x) measX = null;
            meas.at = Date.now();
            var dt = (Date.now() - t0) / 1000;
            if (loaded > 30000 && dt > 0.05) meas.kbps = Math.round(loaded * 8 / 1000 / dt);
            try { x.abort(); } catch (e) { }
        }
        try {
            x.open('GET', current, true);
            x.setRequestHeader('Range', 'bytes=0-262143');
            x.responseType = 'arraybuffer';
            x.timeout = 6000;
            x.onprogress = function (e) { loaded = e.loaded || loaded; if (loaded >= 262144) done(); };
            x.onload = function () { loaded = (x.response && x.response.byteLength) || loaded; done(); };
            x.onerror = done;
            x.ontimeout = done;
            x.send();
        } catch (e2) { meas.busy = false; measX = null; }
    }

    function speed() {
        var kbps = 0;
        try {
            if (engineName === 'hls' && hlsInst && hlsInst.bandwidthEstimate) kbps = Math.round(hlsInst.bandwidthEstimate / 1000);
            else if (engineName === 'mpegts' && tsInst && tsInst.statisticsInfo && tsInst.statisticsInfo.speed) kbps = Math.round(tsInst.statisticsInfo.speed * 8);
        } catch (e) { }
        if (!kbps) {
            measure();
            if (Date.now() - meas.at < 60000) kbps = meas.kbps;
        }
        return kbps;
    }
    var checkTimer = null;

    var HAS_MSE = !!(window.MediaSource || window.WebKitMediaSource);
    var NATIVE_HLS = false;
    try { NATIVE_HLS = !!video.canPlayType('application/vnd.apple.mpegurl'); } catch (e) { }

    var AV_MODES = { fit: 'PLAYER_DISPLAY_MODE_LETTER_BOX', wide: 'PLAYER_DISPLAY_MODE_FULL_SCREEN', fill: 'PLAYER_DISPLAY_MODE_FULL_SCREEN', zoom: 'PLAYER_DISPLAY_MODE_CROPPED_FULL' };
    var CSS_FIT = { fit: 'contain', wide: 'contain', fill: 'fill', zoom: 'cover' };
    var WIDE_AR = 16 / 9;
    var ORDER = ['fast', 'balanced', 'stable'];

    var PROFILES = {
        fast: { live: [2, 8], vod: [3, 6], pre: 3000, start: 'LOWEST', sync: 3, tsMax: 8, tsMin: 1, mb: [1, 3] },
        balanced: { live: [4, 15], vod: [4, 15], pre: 5000, start: 'AVERAGE', sync: 3, tsMax: 15, tsMin: 2, mb: [4, 10] },
        stable: { live: [12, 45], vod: [10, 60], pre: 8000, start: 'AVERAGE', sync: 5, tsMax: 30, tsMin: 4, mb: [16, 48] },
        // Weak network: big resume buffer, lowest starting quality, and much more patience before a stall is treated as an error.
        weak: { live: [15, 60], vod: [15, 90], pre: 8000, start: 'LOWEST', sync: 6, tsMax: 40, tsMin: 6, mb: [8, 40], low: true, slow: true }
    };

    var EXT = {
        m3u8: 'hls', m3u: 'hls',
        ts: 'ts', mts: 'ts', m2ts: 'ts', mpegts: 'ts',
        flv: 'flv',
        mp4: 'mp4', m4v: 'mp4', mov: 'mp4', '3gp': 'mp4',
        webm: 'webm', mkv: 'mkv', avi: 'avi', wmv: 'wmv', mpg: 'mpeg', mpeg: 'mpeg', ogv: 'webm',
        mp3: 'audio', aac: 'audio', m4a: 'audio', ogg: 'audio', oga: 'audio', opus: 'audio', wav: 'audio', flac: 'audio', weba: 'audio',
        mpd: 'dash', ism: 'mss',
        vob: 'mpeg', asf: 'wmv', f4v: 'mp4', divx: 'avi'
    };

    var MSG = {
        network: 'Stream connection failed',
        media: 'Media decoding error',
        unsupported: 'Unsupported stream format',
        timeout: 'Stream timed out'
    };

    function cfg(k, d) { return (window.CONFIG && window.CONFIG[k] !== undefined) ? window.CONFIG[k] : d; }

    function effName() {
        if (profile === 'weak') return 'weak';
        var i = Math.min(ORDER.length - 1, ORDER.indexOf(profile) + bump);
        return ORDER[Math.max(0, i)];
    }

    function effective() { return PROFILES[effName()]; }

    function backoffDelay(n) {
        var base = cfg('RETRY_BASE_MS', 500);
        var max = cfg('RETRY_MAX_MS', 20000);
        var j = cfg('RETRY_JITTER', 0.3);
        var d = Math.min(max, base * Math.pow(2, Math.max(0, n - 1)));
        return Math.round(d * (1 - j + Math.random() * 2 * j));
    }

    function mkErr(kind, raw) {
        var e = new Error(MSG[kind] || MSG.media);
        e.kind = kind;
        e.fatal = kind === 'unsupported';
        e.raw = raw;
        return e;
    }

    function detect(url) {
        var out = { proto: 'http', type: 'unknown' };
        var m = /^([a-z][a-z0-9+.-]*):\/\//i.exec(url || '');
        var scheme = m ? m[1].toLowerCase() : 'http';
        out.proto = (scheme === 'https') ? 'http' : scheme;
        if (out.proto !== 'http') {
            out.type = out.proto;
            return out;
        }
        var clean = String(url).split('#')[0];
        var qi = clean.indexOf('?');
        var path = qi >= 0 ? clean.slice(0, qi) : clean;
        var query = qi >= 0 ? clean.slice(qi + 1) : '';
        var em = /\.([a-z0-9]{2,5})$/i.exec(path.replace(/\/+$/, ''));
        if (em && EXT[em[1].toLowerCase()]) { out.type = EXT[em[1].toLowerCase()]; return out; }
        var qm = /(?:^|&)(?:extension|ext|format|output|container)=([a-z0-9]+)/i.exec(query);
        if (qm && EXT[qm[1].toLowerCase()]) { out.type = EXT[qm[1].toLowerCase()]; return out; }
        if (/\.m3u8(?:[\/?&]|$)/i.test(clean) || /\/hls\//i.test(path)) { out.type = 'hls'; return out; }
        if (/\.ism(?:l)?\/manifest/i.test(path)) { out.type = 'mss'; return out; }
        return out;
    }

    function typeFromMime(m) {
        m = String(m || '').toLowerCase();
        if (!m) return '';
        if (/mpegurl/.test(m)) return 'hls';
        if (/mp2t|mpeg-?ts/.test(m)) return 'ts';
        if (/x-flv/.test(m)) return 'flv';
        if (/dash\+xml/.test(m)) return 'dash';
        if (/vnd\.ms-sstr/.test(m)) return 'mss';
        if (/matroska/.test(m)) return 'mkv';
        if (/webm/.test(m)) return 'webm';
        if (/mp4/.test(m)) return 'mp4';
        if (/^audio\//.test(m)) return 'audio';
        return '';
    }

    function buildChain(d, live) {
        var A = av ? ['avplay'] : [];
        var H = [];
        if (d.proto !== 'http') return A;
        switch (d.type) {
            case 'hls':
                if (HAS_MSE) H.push('hls');
                H.push('native');
                break;
            case 'ts':
            case 'flv':
                if (HAS_MSE) H.push('mpegts');
                H.push('native');
                break;
            case 'dash':
                if (HAS_MSE) H.push('dash');
                H.push('native');
                break;
            case 'mss':
                H.push('native');
                break;
            case 'unknown':
                if (live) {
                    if (HAS_MSE) { H.push('mpegts'); H.push('hls'); }
                    H.push('native');
                } else {
                    H.push('native');
                    if (HAS_MSE) H.push('hls');
                }
                break;
            default:
                H.push('native');
        }
        var all = (pref === 'html5' || (previewMode && H.length && HAS_MSE)) ? H.concat(A) : A.concat(H);
        var m = pref === 'auto' ? memoGet(current) : null;
        if (m && m !== avoid && all.indexOf(m) > 0) all = [m].concat(all.filter(function (x) { return x !== m; }));
        all = all.filter(function (x, i) { return all.indexOf(x) === i; });
        if (avoid && all.length > 1 && all.indexOf(avoid) === 0) all = all.slice(1).concat(avoid);
        return all;
    }

    function loadLib(name) {
        if (libs[name]) return libs[name];
        var g = name === 'hls' ? 'Hls' : (name === 'dash' ? 'dashjs' : 'mpegts');
        if (window[g]) return (libs[name] = Promise.resolve(window[g]));
        var urls = ((window.CONFIG && window.CONFIG.LIBS) || {})[name] || [];
        var p = new Promise(function (resolve, reject) {
            var i = 0;
            (function next() {
                if (i >= urls.length) { reject(new Error('Library unavailable')); return; }
                var s = document.createElement('script');
                var done = false;
                var timer = setTimeout(function () { fin(false); }, cfg('LIB_TIMEOUT_MS', 10000));
                function fin(ok) {
                    if (done) return;
                    done = true;
                    clearTimeout(timer);
                    if (ok && window[g]) { resolve(window[g]); return; }
                    try { if (s.parentNode) s.parentNode.removeChild(s); } catch (e) { }
                    i++;
                    next();
                }
                s.onload = function () { fin(true); };
                s.onerror = function () { fin(false); };
                s.async = true;
                s.src = urls[i];
                document.head.appendChild(s);
            })();
        });
        libs[name] = p;
        p.then(null, function () { if (libs[name] === p) delete libs[name]; });
        return p;
    }

    var rect = null;
    function rectArgs() {
        return rect ? [Math.round(rect.x), Math.round(rect.y), Math.round(rect.w), Math.round(rect.h)] : [0, 0, 1920, 1080];
    }
    function applyRect() {
        if (!av || engineName !== 'avplay') return;
        try {
            if (av.getState() === 'NONE') return;
            var a = rectArgs();
            av.setDisplayMethod(AV_MODES[aspect]);
            av.setDisplayRect(a[0], a[1], a[2], a[3]);
            av.setDisplayMethod(AV_MODES[aspect]);
        } catch (e) { }
    }
    function setRect(r) {
        rect = r || null;
        applyRect();
    }

    var aspectTimer = null;
    function applyAspect() {
        if (av && engineName === 'avplay') {
            applyRect();
            clearTimeout(aspectTimer);
            aspectTimer = setTimeout(applyRect, 300);
        }
        video.style.objectFit = CSS_FIT[aspect];
        var ar = video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 0;
        var sx = aspect === 'wide' ? Math.min(2, Math.max(1, (ar || 1.78 * 1.18) / WIDE_AR)) : 1;
        video.style.transform = sx > 1.005 ? 'scaleX(' + sx.toFixed(3) + ')' : '';
    }

    function setAspect(mode) {
        aspect = AV_MODES[mode] ? mode : 'fit';
        applyAspect();
    }

    function setProfile(name) {
        profile = PROFILES[name] ? name : 'balanced';
        bump = 0;
        rebuf = [];
    }

    function setPreview(v) {
        var was = previewMode;
        previewMode = !!v;
        if (was && !previewMode && hlsInst) {
            try {
                var c = hlsInst.config;
                var p = effective();
                c.capLevelToPlayerSize = false;
                hlsInst.autoLevelCapping = -1;
                c.maxBufferLength = currentLive ? Math.max(10, p.live[1] * 2) : Math.max(30, p.vod[1] * 2);
                c.maxMaxBufferLength = currentLive ? 60 : 240;
                c.backBufferLength = currentLive ? 15 : 20;
            } catch (e) { }
        }
    }

    var avoid = '';
    // Temporarily push one engine to the back of the chain (used after repeated failures on a live channel).
    function avoidEngine(name) {
        avoid = String(name || '');
        if (!avoid) return false;
        return true;
    }

    function setEngine(name) {
        pref = (name === 'avplay' || name === 'html5') ? name : 'auto';
    }

    function disarm() {
        clearTimeout(stallTimer);
        stallTimer = null;
    }

    function arm(ms) {
        disarm();
        var token = current;
        stallTimer = setTimeout(function () {
            if (!current || current !== token) return;
            if (engineName === 'avplay' && !playing && chainIdx + 1 < chain.length) { fail('unsupported', 'avplay timeout', engineTok); return; }
            h.stall(mkErr('timeout'));
        }, ms);
    }

    function stallMs() {
        var base = currentLive ? cfg('STALL_LIVE_MS', 9000) : cfg('STALL_VOD_MS', 20000);
        return effective().slow ? base * 3 : base;
    }

    function connectMs() {
        var base = cfg('CONNECT_TIMEOUT_MS', 15000);
        return effective().slow ? base * 2 : base;
    }

    function noteRebuffer() {
        if (!playing) return;
        var now = Date.now();
        rebuf.push(now);
        while (rebuf.length && now - rebuf[0] > 90000) rebuf.shift();
        if (rebuf.length >= 3 && bump < 2) {
            bump++;
            rebuf = [];
        }
    }

    // --- No-sound protection -------------------------------------------------
    // AVPlay silently drops audio it cannot decode (e.g. AAC-LATM, some E-AC3/DTS).
    // After playback starts we look for a missing/undecoded audio stream and, once per
    // channel, move to another engine (usually HTML5/mpegts.js). The engine that gets
    // sound is remembered by the engine memo.
    var audioTried = {};
    var audioTimer = null;
    var audioChecked = 0;

    function otherEngine() {
        for (var i = 0; i < chain.length; i++) { if (chain[i] !== engineName) return chain[i]; }
        return '';
    }

    function hasNoAudio() {
        try {
            if (engineName === 'avplay' && av) {
                var all = av.getTotalTrackInfo() || [];
                var cur = av.getCurrentStreamInfo() || [];
                var nTotal = 0, nCur = 0, nVideo = 0;
                for (var i = 0; i < all.length; i++) { if (all[i].type === 'AUDIO') nTotal++; if (all[i].type === 'VIDEO') nVideo++; }
                for (var j = 0; j < cur.length; j++) { if (cur[j].type === 'AUDIO') nCur++; }
                return nVideo > 0 && (nTotal === 0 || nCur === 0);
            }
            if (engineName && engineName !== 'avplay' && 'webkitAudioDecodedByteCount' in video) {
                return !video.paused && !video.muted && video.currentTime > 2.5 && video.videoWidth > 0 &&
                    video.webkitAudioDecodedByteCount === 0 && video.webkitVideoDecodedByteCount > 0;
            }
        } catch (e) { }
        return false;
    }

    function switchEngine(auto) {
        var alt = otherEngine();
        if (!current || !alt) return '';
        var pos = 0;
        try { pos = !currentLive ? ctl.position() : 0; } catch (e) { }
        engMemo[memoKey(current)] = alt;
        clearTimeout(checkTimer);
        teardown();
        chainIdx = chain.indexOf(alt);
        if (pos > 0) { startPos = pos; }
        startEngine();
        return alt;
    }

    function scheduleAudioCheck() {
        clearTimeout(audioTimer);
        if (!current) return;
        var tok = engineTok;
        var k = memoKey(current);
        if (audioTried[k]) return;
        audioChecked = 0;
        (function again() {
            audioTimer = setTimeout(function () {
                if (tok !== engineTok || !current || audioTried[k]) return;
                if (video.paused && engineName !== 'avplay') { again(); return; }
                if (hasNoAudio()) {
                    audioChecked++;
                    if (audioChecked < 2) { again(); return; }   // confirm twice before acting
                    audioTried[k] = true;
                    var to = switchEngine(true);
                    if (to && h.notice) h.notice(to);
                    return;
                }
                audioChecked = 0;
                if (++audioPolls < 3) again();
            }, 3500);
        })();
        audioPolls = 0;
    }
    var audioPolls = 0;

    function bufStart() { bufOn = true; noteRebuffer(); arm(stallMs()); h.buffering(true); }
    function scheduleCheck() {
        var nativeVod = engineName === 'native' && !currentLive && detect(current).type !== 'audio';
        if (!previewMode && !nativeVod) return;
        clearTimeout(checkTimer);
        var tok = engineTok;
        checkTimer = setTimeout(function () {
            if (tok !== engineTok || !current) return;
            var i = ctl.streamInfo();
            if (i.w > 0) return;
            if (chainIdx + 1 < chain.length) { teardown(); chainIdx++; startEngine(); }
        }, 3000);
    }

    function bufEnd() { scheduleAudioCheck(); if (!tm.first && tm.t0) tm.first = Date.now(); bufOn = false; clearTimeout(nativeTimer); playing = true; if (current && engineName) memoSet(current, engineName); soft = 0; mediaFix = 0; disarm(); if (engineName === 'avplay') applyRect(); scheduleCheck(); h.buffering(false); }

    function classifyAv(e) {
        var s = String((e && (e.name || e.message)) || e || '');
        if (/NOT_SUPPORTED|INVALID_URI|UNSUPPORTED|FILE_TYPE|CODEC|DRM|NotSupported/i.test(s)) return 'unsupported';
        if (/CONNECTION|NETWORK|TIMEOUT|NO_SUCH_FILE|SERVER|HTTP/i.test(s)) return 'network';
        return 'media';
    }

    function hOn(inst, evt, fn) { inst.on(evt, fn); hlsBound.push([evt, fn]); }
    function tOn(inst, evt, fn) { inst.on(evt, fn); tsBound.push([evt, fn]); }

    function bindVideo() {
        if (vBound) return;
        vBound = true;
        Object.keys(vh).forEach(function (k) { video[k] = vh[k]; });
    }

    function unbindVideo() {
        vBound = false;
        Object.keys(vh).forEach(function (k) { video[k] = null; });
    }

    function abortMeasure() {
        if (measX) { try { measX.onprogress = measX.onload = measX.onerror = measX.ontimeout = null; measX.abort(); } catch (e) { } }
        measX = null;
        meas.busy = false;
    }

    function teardown() {
        clearTimeout(nativeTimer);
        bufOn = false;
        lastT = 0;
        clearTimeout(softTimer);
        softTimer = null;
        unbindVideo();
        if (hlsInst) {
            var hi = hlsInst;
            hlsInst = null;
            hlsBound.forEach(function (b) { try { hi.off(b[0], b[1]); } catch (e0) { } });
            hlsBound = [];
            try { hi.stopLoad(); } catch (e) { }
            try { hi.detachMedia(); } catch (e7) { }
            try { hi.destroy(); } catch (e8) { }
        }
        if (dashInst) {
            var di = dashInst;
            dashInst = null;
            dashBound.forEach(function (b) { try { di.off(b[0], b[1]); } catch (e0) { } });
            dashBound = [];
            try { di.reset(); } catch (e9) { }
        }
        if (tsInst) {
            var ti = tsInst;
            tsInst = null;
            tsBound.forEach(function (b) { try { ti.off(b[0], b[1]); } catch (e0) { } });
            tsBound = [];
            try { ti.pause(); } catch (e1) { }
            try { ti.unload(); } catch (e2) { }
            try { ti.detachMediaElement(); } catch (e3) { }
            try { ti.destroy(); } catch (e4) { }
        }
        if (av) {
            try {
                var s = av.getState();
                if (s === 'PLAYING' || s === 'PAUSED') av.stop();
                if (s !== 'NONE') av.close();
            } catch (e5) { }
        }
        if (video.getAttribute('src') !== null || video.src) {
            try {
                video.pause();
                video.removeAttribute('src');
                video.load();
                video.currentTime = 0;
            } catch (e6) { }
        }
    }

    function fail(kind, raw, tok) {
        if (tok !== undefined && tok !== engineTok) return;
        if (!current) return;
        disarm();
        clearTimeout(softTimer);
        if (kind === 'unsupported' && chainIdx + 1 < chain.length) {
            teardown();
            chainIdx++;
            startEngine();
            return;
        }
        h.error(mkErr(kind, raw));
    }

    function soften(kind, raw, tok, retry) {
        if (tok !== engineTok || !current) return;
        if (soft >= cfg('SOFT_RETRIES', 3)) { fail(kind, raw, tok); return; }
        soft++;
        h.buffering(true);
        arm(stallMs() + backoffDelay(soft));
        clearTimeout(softTimer);
        softTimer = setTimeout(function () {
            if (tok !== engineTok || !current) return;
            try { retry(); } catch (e) { fail(kind, e, tok); }
        }, backoffDelay(soft));
    }

    // Applies a buffering size to AVPlay, halving the value until the TV accepts it.
    function setBuf(opt, unit, val, floor) {
        var x = Math.floor(val);
        while (x >= floor) {
            try { av.setBufferingParam(opt, unit, x); return x; } catch (e) { x = Math.floor(x / 2); }
        }
        return 0;
    }

    var bufInfo = '';

    function tuneBuffer() {
        var p = effective();
        var hls = det && det.type === 'hls';
        var MB = 1024 * 1024;
        var play, resume, unit;
        if (hls) {
            // Adaptive streaming: AVPlay understands seconds.
            var v = currentLive ? p.live : p.vod;
            play = setBuf('PLAYER_BUFFER_FOR_PLAY', 'PLAYER_BUFFER_SIZE_IN_SECOND', v[0], 1);
            resume = setBuf('PLAYER_BUFFER_FOR_RESUME', 'PLAYER_BUFFER_SIZE_IN_SECOND', v[1], 1);
            unit = 's';
        } else {
            // Plain TS / MP4 over HTTP: seconds are ignored, so size the buffer in bytes.
            play = setBuf('PLAYER_BUFFER_FOR_PLAY', 'PLAYER_BUFFER_SIZE_IN_BYTE', p.mb[0] * MB, 256 * 1024);
            resume = setBuf('PLAYER_BUFFER_FOR_RESUME', 'PLAYER_BUFFER_SIZE_IN_BYTE', p.mb[1] * MB, 256 * 1024);
            unit = 'B';
        }
        function fmt(n) { return unit === 's' ? n + 's' : (n / MB).toFixed(1) + 'MB'; }
        bufInfo = 'buf ' + effName() + ' ' + (play ? fmt(play) : 'rejected') + '/' + (resume ? fmt(resume) : 'rejected');
        if (hls) {
            try { av.setStreamingProperty('ADAPTIVE_INFO', 'STARTBITRATE=' + ((previewMode || p.low) ? 'LOWEST' : (!currentLive ? 'HIGHEST' : p.start))); } catch (e) { }
        }
    }

    function startAv(tok) {
        var url = current;
        var start = startPos;
        try {
            av.open(url);
            if (curUa) { try { av.setStreamingProperty('USER_AGENT', curUa); } catch (eu) { } }
            tuneBuffer();
            var ra = rectArgs();
            av.setDisplayRect(ra[0], ra[1], ra[2], ra[3]);
            av.setDisplayMethod(AV_MODES[aspect]);
            av.prepareAsync(function () {
                if (tok !== engineTok) return;
                if (!tm.prep) tm.prep = Date.now();
                disarm();
                applyRect();
                if (start > 0) {
                    av.seekTo(start, function () { av.play(); }, function () { av.play(); });
                } else {
                    av.play();
                }
                playing = true;
                setTimeout(function () { if (tok === engineTok) applyRect(); }, 350);
                setTimeout(function () { if (tok === engineTok) applyRect(); }, 1500);
            }, function (e) {
                fail(chainIdx + 1 < chain.length ? 'unsupported' : classifyAv(e), e, tok);
            });
        } catch (e) {
            fail(chainIdx + 1 < chain.length ? 'unsupported' : classifyAv(e), e, tok);
        }
    }

    function startNative(tok) {
        video.style.objectFit = CSS_FIT[aspect];
        video.style.transform = aspect === 'wide' ? 'scaleX(' + Math.min(2, Math.max(1, (video.videoWidth && video.videoHeight ? (video.videoWidth / video.videoHeight) : 1.78 * 1.18) / WIDE_AR)).toFixed(3) + ')' : '';
        video.src = current;
        clearTimeout(nativeTimer);
        if (!currentLive) {
            nativeTimer = setTimeout(function () {
                if (tok !== engineTok || !current || playing) return;
                if (video.readyState >= 2) return;
                fail('unsupported', 'native load timeout rs=' + video.readyState + ' ns=' + video.networkState, tok);
            }, 20000);
        }
        var p = video.play();
        if (p && p.catch) {
            p.catch(function (e) {
                if (tok !== engineTok || !e) return;
                if (e.name === 'NotSupportedError') fail('unsupported', e, tok);
                else if (e.name !== 'AbortError' && e.name !== 'NotAllowedError') fail('media', e, tok);
            });
        }
    }

    function startHls(tok) {
        loadLib('hls').then(function (Hls) {
            if (tok !== engineTok) return;
            if (!Hls || !Hls.isSupported()) { fail('unsupported', 'hls unsupported', tok); return; }
            var p = effective();
            var live = currentLive;
            var connect = connectMs();
            var inst = new Hls({
                enableWorker: true,
                lowLatencyMode: false,
                progressive: false,
                capLevelToPlayerSize: previewMode,
                startLevel: previewMode ? -1 : (p.low ? 0 : (live ? -1 : 0)),
                abrEwmaDefaultEstimate: p.low ? 500000 : 1500000,
                maxBufferSize: live ? 40 * 1000 * 1000 : 80 * 1000 * 1000,
                startFragPrefetch: !live && !previewMode,
                maxBufferHole: 0.5,
                liveSyncDurationCount: p.sync,
                maxBufferLength: previewMode ? 12 : (live ? Math.max(10, p.live[1] * 2) : Math.max(30, p.vod[1] * 2)),
                maxMaxBufferLength: previewMode ? 30 : (live ? 60 : 240),
                backBufferLength: previewMode ? 8 : (live ? 15 : 20),
                manifestLoadingTimeOut: connect,
                manifestLoadingMaxRetry: 2,
                manifestLoadingRetryDelay: 500,
                manifestLoadingMaxRetryTimeout: 8000,
                levelLoadingTimeOut: connect,
                levelLoadingMaxRetry: 3,
                levelLoadingRetryDelay: 500,
                levelLoadingMaxRetryTimeout: 8000,
                fragLoadingTimeOut: 20000,
                fragLoadingMaxRetry: 4,
                fragLoadingRetryDelay: 500,
                fragLoadingMaxRetryTimeout: 8000
            });
            hlsInst = inst;
            hOn(inst, Hls.Events.MANIFEST_PARSED, function (ev, data) {
                if (tok !== engineTok) return;
                try {
                    if (!live && !previewMode && data && data.levels && data.levels.length > 1) {
                        var top = 0;
                        for (var li = 1; li < data.levels.length; li++) {
                            if ((data.levels[li].bitrate || 0) > (data.levels[top].bitrate || 0)) top = li;
                        }
                        inst.currentLevel = top;
                    }
                } catch (eL) { }
                var pr = video.play();
                if (pr && pr.catch) pr.catch(function () { });
            });
            hOn(inst, Hls.Events.ERROR, function (ev, data) {
                if (tok !== engineTok || !data || !data.fatal) return;
                var details = String(data.details || '');
                if (/manifestParsingError|manifestIncompatibleCodecsError|levelEmptyError/i.test(details)) {
                    fail('unsupported', data, tok);
                    return;
                }
                if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                    var code = data.response && data.response.code;
                    if (code === 404 || code === 403 || code === 401) { fail('network', data, tok); return; }
                    soften('network', data, tok, function () { inst.startLoad(); });
                } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
                    mediaFix++;
                    if (mediaFix === 1) soften('media', data, tok, function () { inst.recoverMediaError(); });
                    else if (mediaFix === 2) soften('media', data, tok, function () { inst.swapAudioCodec(); inst.recoverMediaError(); });
                    else fail('media', data, tok);
                } else {
                    fail('media', data, tok);
                }
            });
            inst.attachMedia(video);
            inst.loadSource(current);
        }).then(null, function (e) {
            fail('unsupported', e, tok);
        });
    }

    function dOn(inst, evt, fn) { inst.on(evt, fn); dashBound.push([evt, fn]); }

    function startDash(tok) {
        loadLib('dash').then(function (dashjs) {
            if (tok !== engineTok) return;
            if (!dashjs || !dashjs.MediaPlayer) { fail('unsupported', 'dash unsupported', tok); return; }
            var ev = dashjs.MediaPlayer.events;
            var inst = dashjs.MediaPlayer().create();
            dashInst = inst;
            inst.updateSettings({
                streaming: {
                    retryAttempts: { MPD: 3, MediaSegment: 4, InitializationSegment: 3, BitstreamSwitchingSegment: 3, IndexSegment: 3 },
                    retryIntervals: { MPD: 800, MediaSegment: 800, InitializationSegment: 800, BitstreamSwitchingSegment: 800, IndexSegment: 800 }
                }
            });
            dOn(inst, ev.STREAM_INITIALIZED, function () {
                if (tok !== engineTok) return;
                var pr = video.play();
                if (pr && pr.catch) pr.catch(function () { });
            });
            var started = false;
            dOn(inst, ev.STREAM_INITIALIZED, function () { started = true; });
            dOn(inst, ev.ERROR, function (e) {
                if (tok !== engineTok) return;
                var raw = e && e.error;
                if (!started) { fail('unsupported', raw, tok); return; }
                var dlCodes = [25, 26, 27, 28];
                if (raw && dlCodes.indexOf(raw.code) >= 0) {
                    soften('network', raw, tok, function () { inst.attachSource(current); });
                } else {
                    fail('media', raw, tok);
                }
            });
            inst.initialize(video, current, false);
        }).then(null, function (e) {
            fail('unsupported', e, tok);
        });
    }

    function startTs(tok) {
        loadLib('mpegts').then(function (lib) {
            if (tok !== engineTok) return;
            var ok = false;
            try { ok = !!(lib && lib.getFeatureList && lib.getFeatureList().mseLivePlayback); } catch (e) { }
            if (!ok) { fail('unsupported', 'mpegts unsupported', tok); return; }
            var p = effective();
            var live = currentLive;
            var inst = lib.createPlayer({
                type: det && det.type === 'flv' ? 'flv' : 'mpegts',
                isLive: live,
                url: current
            }, {
                enableWorker: true,
                enableStashBuffer: true,
                stashInitialSize: live ? 384 * 1024 : 4 * 1024 * 1024,
                autoCleanupSourceBuffer: true,
                liveBufferLatencyChasing: false,
                liveBufferLatencyMaxLatency: p.tsMax,
                liveBufferLatencyMinRemain: p.tsMin,
                lazyLoad: false
            });
            tsInst = inst;
            tOn(inst, lib.Events.ERROR, function (type, detail, info) {
                if (tok !== engineTok) return;
                var d = String(detail || '');
                if (type === lib.ErrorTypes.NETWORK_ERROR) {
                    var code = info && info.code;
                    if (code === 404 || code === 403 || code === 401) { fail('network', info, tok); return; }
                    soften('network', info, tok, function () { inst.unload(); inst.load(); inst.play(); });
                } else if (type === lib.ErrorTypes.MEDIA_ERROR) {
                    if (/Unsupported|Unrecommended/i.test(d)) { fail('unsupported', info, tok); return; }
                    mediaFix++;
                    if (mediaFix <= 2) soften('media', info, tok, function () { inst.unload(); inst.load(); inst.play(); });
                    else fail('media', info, tok);
                } else {
                    fail('media', info, tok);
                }
            });
            inst.attachMediaElement(video);
            inst.load();
            var pr = inst.play();
            if (pr && pr.catch) pr.catch(function () { });
        }).then(null, function (e) {
            fail('unsupported', e, tok);
        });
    }

    function startEngine() {
        var tok = ++engineTok;
        var name = chain[chainIdx];
        engineName = name;
        mediaFix = 0;
        soft = 0;
        playing = false;
        pendingStart = name === 'avplay' ? 0 : startPos;
        root.classList.toggle('vid', name !== 'avplay');
        if (name !== 'avplay') bindVideo();
        arm(currentLive ? connectMs() : Math.max(connectMs(), 45000));
        if (name === 'avplay') startAv(tok);
        else if (name === 'native') startNative(tok);
        else if (name === 'hls') startHls(tok);
        else if (name === 'mpegts') startTs(tok);
        else if (name === 'dash') startDash(tok);
        else fail('unsupported', 'no engine', tok);
    }

    function init(opts) {
        h.buffering = opts.buffering || h.buffering;
        h.error = opts.error || h.error;
        h.ended = opts.ended || h.ended;
        h.stall = opts.stall || h.stall;
        h.progress = opts.progress || h.progress;
        h.notice = opts.notice || h.notice;

        if (av) {
            av.setListener({
                onbufferingstart: function () { if (engineName === 'avplay') bufStart(); },
                onbufferingprogress: function (p) { if (engineName === 'avplay') h.progress(p); },
                onbufferingcomplete: function () { if (engineName === 'avplay') bufEnd(); },
                onerror: function (e) { if (engineName === 'avplay') fail(classifyAv(e), e, engineTok); },
                onstreamcompleted: function () { if (engineName === 'avplay') { disarm(); h.ended(); } }
            });
        }

        video.preload = 'auto';
        vh.onwaiting = function () { if (engineName !== 'avplay' && current) bufStart(); };
        vh.onstalled = function () { if (engineName !== 'avplay' && current && video.readyState < 3) bufStart(); };
        vh.onplaying = function () { if (engineName !== 'avplay' && current) bufEnd(); };
        vh.oncanplay = function () {
            if (engineName === 'avplay') return;
            disarm();
            if (bufOn && !video.paused && current) bufEnd();
        };
        vh.ontimeupdate = function () {
            if (engineName === 'avplay' || !current) return;
            var t = video.currentTime || 0;
            if (bufOn && !video.paused && t - lastT > 0.25 && video.readyState >= 3) bufEnd();
            lastT = t;
        };
        vh.onseeked = function () {
            if (engineName !== 'avplay' && current && bufOn && !video.paused && video.readyState >= 3) bufEnd();
        };
        vh.onloadedmetadata = function () {
            if (engineName !== 'avplay' && pendingStart > 0) {
                try { video.currentTime = pendingStart / 1000; } catch (e) { }
                pendingStart = 0;
            }
        };
        vh.onerror = function () {
            if (engineName !== 'native' || !current) return;
            var c = video.error && video.error.code;
            fail(c === 4 ? 'unsupported' : (c === 2 ? 'network' : 'media'), c, engineTok);
        };
        vh.onended = function () { if (engineName !== 'avplay' && current) { disarm(); h.ended(); } };
        vh.onprogress = function () {
            if (engineName === 'avplay') return;
            try {
                var b = video.buffered;
                if (b.length && video.duration && isFinite(video.duration)) h.progress(Math.min(100, Math.round(b.end(b.length - 1) / video.duration * 100)));
            } catch (e) { }
        };

        if (!av && HAS_MSE) setTimeout(function () { loadLib('hls').then(null, function () { }); }, 2000);
    }

    function stop() {
        current = null;
        session++;
        engineTok++;
        playing = false;
        seekTarget = null;
        pendingStart = 0;
        startPos = 0;
        clearTimeout(seekTimer);
        clearTimeout(checkTimer);
        clearTimeout(verifyTimer);
        lastSeek = null;
        meas.kbps = 0; meas.at = 0;
        abortMeasure();
        clearTimeout(softTimer);
        softTimer = null;
        rebuf = [];
        disarm();
        teardown();
        engineName = null;
        root.classList.remove('vid');
    }

    function play(url, opts) {
        opts = opts || {};
        stop();
        var sess = session;
        var chk = window.Validate ? Validate.streamUrl(url) : { ok: true, value: url };
        currentLive = opts.live !== false;
        previewMode = !!opts.preview;
        startPos = opts.start || 0;
        curUa = String(opts.ua || cfg('DEFAULT_UA', '')).replace(/[\u0000-\u001F\u007F]/g, '').slice(0, 300);
        if (!chk.ok) {
            current = String(url || '');
            setTimeout(function () { if (sess === session) { current = null; h.error(mkErr('unsupported', chk.error)); } }, 0);
            return;
        }
        tm = { t0: Date.now(), resolve: pendingResolve, prep: 0, first: 0 };
        pendingResolve = 0;
        current = chk.value;
        det = detect(current);
        chain = buildChain(det, currentLive);
        chainIdx = 0;
        soft = 0;
        mediaFix = 0;
        arm(currentLive ? connectMs() : Math.max(connectMs(), 45000));

        if (!chain.length) {
            setTimeout(function () { if (sess === session) { current = null; h.error(mkErr('unsupported', det.proto)); } }, 0);
            return;
        }

        if (det.proto === 'http' && det.type === 'unknown' && chain[0] !== 'avplay' && window.Net && Net.probe) {
            Net.probe(current).then(function (info) {
                if (sess !== session) return;
                if (info) {
                    var t = typeFromMime(info.type);
                    if (t) { det.type = t; chain = buildChain(det, currentLive); }
                }
                startEngine();
            });
        } else {
            startEngine();
        }
    }

    function release() {
        stop();
        rect = null;
        bump = 0;
        det = null;
        chain = [];
        chainIdx = 0;
        curUa = '';
        if (av) { try { if (av.getState() !== 'NONE') av.close(); } catch (e) { } }
        try { video.style.objectFit = CSS_FIT[aspect]; } catch (e2) { }
    }

    function engine() { return engineName; }

    function diag() {
        var o = [];
        try {
            if (engineName && engineName !== 'avplay') {
                var b = video.buffered;
                o.push('rs=' + video.readyState + ' ns=' + video.networkState + ' buf=' + (b.length ? b.end(b.length - 1).toFixed(0) + 's' : '0'));
                if (video.error) o.push('err=' + video.error.code);
            }
            o.push('chain=' + chain.join('>') + '#' + chainIdx);
            if (engineName === 'avplay' && bufInfo) o.push(bufInfo);
            o.push('kbps=' + meas.kbps);
            var tt = timingTxt();
            if (tt) o.push(tt);
        } catch (e) { }
        return o.join('  ');
    }

    var ctl = PlayerCtlBridge({
        av: av, video: video,
        isAv: function () { return engineName === 'avplay' && av; }, engineName: function () { return engineName; }, disarm: disarm,
        getSeekTarget: function () { return seekTarget; }, setSeekTarget: function (v) { seekTarget = v; },
        getSeekTimer: function () { return seekTimer; }, setSeekTimer: function (v) { seekTimer = v; },
        getLastSeek: function () { return lastSeek; }, setLastSeek: function (v) { lastSeek = v; },
        getVerifyTimer: function () { return verifyTimer; }, setVerifyTimer: function (v) { verifyTimer = v; },
        getEngineTok: function () { return engineTok; },
        getCurrent: function () { return current; },
        hlsInst: function () { return hlsInst; }
    });

    return {
        diag: diag, noteResolve: noteResolve, setPreview: setPreview, init: init, play: play, stop: stop, release: release,
        position: ctl.position, speed: speed, setAspect: setAspect, setRect: setRect, setProfile: setProfile,
        setEngine: setEngine, avoidEngine: avoidEngine, detect: detect, backoffDelay: backoffDelay, engine: engine,
        switchEngine: function () { return switchEngine(false); }, otherEngine: otherEngine,
        setSpeed: ctl.setSpeed, setSubDelay: ctl.setSubDelay, setSubSize: ctl.setSubSize,
        toggle: ctl.toggle, seek: ctl.seek, recentSeek: ctl.recentSeek, duration: ctl.duration,
        tracks: ctl.tracks, selectTrack: ctl.selectTrack, qualities: ctl.qualities, selectQuality: ctl.selectQuality, streamInfo: ctl.streamInfo
    };
})();

