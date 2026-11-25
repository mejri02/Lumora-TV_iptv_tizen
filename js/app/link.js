/* Lumora — Phone link: pairing, LAN transport and cast. */
'use strict';


/* ---------- phone link ---------- */
var LINK_KEY = 'lumora.tvid';
var LINK_KEYS = {
    up: 38, down: 40, left: 37, right: 39, ok: 13, back: 10009, info: 457, stop: 413, playpause: 10252,
    rw: 412, ff: 417, chup: 427, chdown: 428, red: 403, green: 404, yellow: 405, blue: 406
};
var LAN_PORT = 8765;
var CANDS_KEY = 'lumora.phoneips';
var link = { id: '', host: '', cands: [], epoch: '', ack: 0, fails: 0, backoff: 4000, up: false, phoneAt: 0, phoneName: '', myIp: '', hb: null, rt: null, lastSend: 0, sendT: null, open: false, tok: 0, fresh: false };

function newTvId() {
    var out = '';
    try {
        var a = new Uint8Array(8);
        (window.crypto || window.msCrypto).getRandomValues(a);
        for (var i = 0; i < a.length; i++) out += (a[i] < 16 ? '0' : '') + a[i].toString(16);
    } catch (e) {
        for (var j = 0; j < 16; j++) out += Math.floor(Math.random() * 16).toString(16);
    }
    return out.replace(/(.{4})(?=.)/g, '$1-');
}

function linkRawId() { return link.id.replace(/-/g, ''); }

function linkInit() {
    var id = '';
    try { id = localStorage.getItem(LINK_KEY) || ''; } catch (e) { }
    link.fresh = !/^[0-9a-f]{4}(-[0-9a-f]{4}){3}$/.test(id);
    if (link.fresh) {
        id = newTvId();
        try { localStorage.setItem(LINK_KEY, id); } catch (e2) { }
    }
    link.id = id;
    link.host = '';
    link.ack = 0;
    link.epoch = '';
    try { link.cands = JSON.parse(localStorage.getItem(CANDS_KEY) || '[]') || []; } catch (e3) { link.cands = []; }
    setTimeout(linkListen, 4000);
    clearInterval(link.hb);
    link.hb = setInterval(function () {
        if (state.screen === 'player' || Date.now() - link.lastSend > 11000) linkSend();
        if (link.phoneAt && Date.now() - link.phoneAt > 90000) { link.phoneAt = 0; if (link.open) renderLink(); }
    }, 6000);
    setTimeout(function () { linkSend(); }, 1500);
}

function linkStop() {
    link.tok++;
    link.up = false;
    clearTimeout(link.rt);
}

/* ---------- local network transport (phone hosts a tiny HTTP server, TV finds it on the same Wi-Fi) ---------- */
function lanReq(method, url, body, timeout, cb) {
    var x = new XMLHttpRequest();
    var done = false;
    var tm = null;
    function fin(ok, text) {
        if (done) return;
        done = true;
        clearTimeout(tm);
        cb(ok, text);
    }
    tm = setTimeout(function () { try { x.abort(); } catch (e) { } fin(false, ''); }, timeout);
    x.onload = function () { fin(x.status >= 200 && x.status < 300, x.responseText); };
    x.onerror = function () { fin(false, ''); };
    x.onabort = function () { fin(false, ''); };
    try {
        x.open(method, url, true);
        if (body) x.setRequestHeader('Content-Type', 'text/plain');
        x.send(body || null);
    } catch (e2) { fin(false, ''); }
}

function lanMyIp(cb) {
    var ip = '';
    try {
        if (window.webapis && webapis.network && webapis.network.getIp) ip = String(webapis.network.getIp() || '');
    } catch (e) { ip = ''; }
    if (/^\d+\.\d+\.\d+\.\d+$/.test(ip) && ip !== '0.0.0.0') { cb(ip); return; }
    var Pc = window.RTCPeerConnection || window.webkitRTCPeerConnection;
    if (!Pc) { cb(''); return; }
    var got = false;
    var pc = null;
    function fin(v) { if (got) return; got = true; try { pc.close(); } catch (e1) { } cb(v); }
    try {
        pc = new Pc({ iceServers: [] });
        pc.createDataChannel('x');
        pc.onicecandidate = function (ev) {
            if (!ev || !ev.candidate) return;
            var m = /(\d+\.\d+\.\d+\.\d+)/.exec(ev.candidate.candidate || '');
            if (m && !/^(0\.|127\.|169\.254\.)/.test(m[1])) fin(m[1]);
        };
        var off = pc.createOffer();
        if (off && off.then) off.then(function (o) { return pc.setLocalDescription(o); })['catch'](function () { });
        setTimeout(function () { fin(''); }, 1500);
    } catch (e2) { fin(''); }
}

function lanProbe(ips, tok, cb) {
    var idx = 0, active = 0, found = [], finished = false;
    var q = encodeURIComponent(linkRawId());
    function finish() { if (finished) return; finished = true; cb(found); }
    function pump() {
        if (finished) return;
        if (tok !== link.tok) { finished = true; return; }
        while (active < (link.open ? 24 : 8) && idx < ips.length) {
            (function (ip) {
                active++;
                lanReq('GET', 'http://' + ip + ':' + LAN_PORT + '/lumora/ping?tv=' + q, null, 1500, function (ok, text) {
                    active--;
                    if (ok) {
                        var o = null;
                        try { o = JSON.parse(text); } catch (e) { }
                        if (o && o.lumora && o.phone) {
                            found.push({ ip: ip, known: !!o.known });
                            if (o.known) { finish(); return; }
                        }
                    }
                    pump();
                });
            })(ips[idx++]);
        }
        if (active === 0 && idx >= ips.length) finish();
    }
    if (!ips.length) { finish(); return; }
    pump();
}

function saveCands(list) {
    link.cands = list.slice(0, 6);
    try { localStorage.setItem(CANDS_KEY, JSON.stringify(link.cands)); } catch (e) { }
}

function linkFound(tok, found) {
    if (tok !== link.tok) return;
    var known = null;
    for (var i = 0; i < found.length; i++) if (found[i].known) { known = found[i]; break; }
    if (known) {
        link.host = known.ip;
        link.fails = 0;
        link.backoff = 4000;
        saveCands([known.ip]);
        linkSync(tok);
        return;
    }
    if (found.length) {
        saveCands(found.map(function (f) { return f.ip; }));
        link.rt = setTimeout(function () { linkFind(tok, true); }, 1500);
        return;
    }
    link.backoff = Math.min(link.open ? 15000 : 60000, Math.round(link.backoff * 1.5));
    link.rt = setTimeout(function () { linkFind(tok, false); }, link.backoff);
}

function linkFind(tok, quickOnly) {
    if (tok !== link.tok || link.host) return;
    if (state.screen === 'player' && !link.open) {
        link.rt = setTimeout(function () { linkFind(tok, quickOnly); }, 20000);
        return;
    }
    if (link.cands.length) {
        lanProbe(link.cands.slice(), tok, function (found) {
            if (found.length || quickOnly) { linkFound(tok, found); return; }
            linkScan(tok);
        });
        return;
    }
    linkScan(tok);
}

function linkScan(tok) {
    lanMyIp(function (ip) {
        if (tok !== link.tok) return;
        link.myIp = ip;
        var prefixes = [];
        var m = /^(\d+\.\d+\.\d+)\.\d+$/.exec(ip);
        if (m) prefixes.push(m[1] + '.');
        else prefixes = ['192.168.1.', '192.168.0.', '192.168.43.', '192.168.100.', '10.0.0.', '192.168.8.', '172.20.10.'];
        var ips = [];
        prefixes.forEach(function (p) {
            for (var i = 1; i < 255; i++) { var h = p + i; if (h !== ip) ips.push(h); }
        });
        lanProbe(ips, tok, function (found) { linkFound(tok, found); });
    });
}

function linkListen() {
    linkStop();
    var tok = link.tok;
    linkFind(tok, false);
}

function linkLost(tok) {
    link.host = '';
    link.up = false;
    link.fails = 0;
    link.rt = setTimeout(function () { linkFind(tok, false); }, 500);
}

function linkSync(tok) {
    if (tok !== link.tok || !link.host) return;
    var url = 'http://' + link.host + ':' + LAN_PORT + '/lumora/sync?tv=' + encodeURIComponent(linkRawId()) + '&ack=' + link.ack + '&ep=' + encodeURIComponent(link.epoch);
    link.lastSend = Date.now();
    lanReq('POST', url, JSON.stringify(linkStatus()), 15000, function (ok, text) {
        if (tok !== link.tok) return;
        var o = null;
        if (ok) { try { o = JSON.parse(text); } catch (e) { o = null; } }
        if (!o) {
            if (++link.fails >= 3) { linkLost(tok); return; }
            link.rt = setTimeout(function () { linkSync(tok); }, 800);
            return;
        }
        link.fails = 0;
        link.up = true;
        if (o.known === false) {
            link.phoneAt = 0;
            if (link.open) renderLink();
            linkLost(tok);
            return;
        }
        if (String(o.epoch || '') !== link.epoch) { link.epoch = String(o.epoch || ''); link.ack = 0; }
        var fresh = !link.phoneAt || Date.now() - link.phoneAt > 60000;
        link.phoneAt = Date.now();
        link.phoneName = String(o.name || link.phoneName || 'Phone').slice(0, 40);
        if (fresh) {
            if (link.open) renderLink();
            else toast(t('Phone connected'));
            if (!link.open && state.screen === 'settings') renderSettings();
        }
        var msgs = o.msgs || [];
        for (var i = 0; i < msgs.length; i++) {
            var it = msgs[i];
            if (!it || typeof it.seq !== 'number' || it.seq <= link.ack) continue;
            link.ack = it.seq;
            try { linkHandle(it.m); } catch (e2) { }
        }
        link.rt = setTimeout(function () { linkSync(tok); }, 50);
    });
}

function linkHandle(m) {
    if (!m || typeof m !== 'object') return;
    if (!m.lumora) {
        if (m.type && m.url) linkSource(m);
        return;
    }
    switch (m.op) {
        case 'hello':
            var fresh = !link.phoneAt || Date.now() - link.phoneAt > 60000;
            link.phoneAt = Date.now();
            link.phoneName = String(m.name || 'Phone').slice(0, 40);
            linkSend('hello_ack');
            if (link.open) renderLink();
            else if (fresh) toast(t('Phone connected'));
            if (!link.open && state.screen === 'settings') renderSettings();
            break;
        case 'bye':
            link.phoneAt = 0;
            if (link.open) renderLink();
            toast(t('Phone disconnected'));
            if (!link.open && state.screen === 'settings') renderSettings();
            break;
        case 'cast': link.phoneAt = Date.now(); castPlay(m); break;
        case 'key': link.phoneAt = Date.now(); linkKey(m.key); break;
        case 'pause': if (state.screen === 'player' && !state.paused) togglePause(); break;
        case 'resume': if (state.screen === 'player' && state.paused) togglePause(); break;
        case 'toggle': if (state.screen === 'player') togglePause(); break;
        case 'seek':
            if (state.screen === 'player' && isVod(curItem()) && typeof m.to === 'number') { Player.seek(Math.max(0, m.to)); showInfo(); }
            break;
        case 'stop': if (state.screen === 'player') closePlayer(); break;
        case 'source': if (m.source) linkSource(m.source); break;
    }
}

function linkKey(k) {
    var code = LINK_KEYS[k] || (/^[0-9]$/.test(String(k)) ? 48 + parseInt(k, 10) : 0);
    if (!code) return;
    onKey({ keyCode: code, repeat: false, preventDefault: function () { } });
    linkSoon();
}

function linkSource(d) {
    var type = String(d.type || '');
    var url = String(d.url || '').trim();
    if (TYPE_ORDER.indexOf(type) < 0 || !/^https?:\/\//i.test(url)) return;
    var dup = state.sources.some(function (s) { return s.type === type && s.url === url && (s.user || '') === (d.user || ''); });
    if (dup) { toast(t('Source saved')); return; }
    if (type === 'xtream') {
        var px = Validate.parseXtream(url);
        if (px) { url = px.url; if (!d.user) d.user = px.user; if (!d.pass) d.pass = px.pass; }
        var sv = Validate.server(url);
        if (!sv.ok) { toast(t('Not saved') + ': ' + t(sv.error), true); return; }
        url = sv.value;
    } else if (type === 'stalker' && d.mac) {
        var vm2 = Validate.mac(d.mac);
        if (vm2.ok) d.mac = vm2.value;
    }
    var src = { id: 's' + Date.now().toString(36), type: type, name: String(d.name || hostOf({ url: url })).slice(0, 60), url: url.slice(0, 2048), user: String(d.user || ''), pass: String(d.pass || ''), format: d.format === 'ts' ? 'ts' : 'm3u8', mac: String(d.mac || ''), proxy: '' };
    if (type === 'stalker' && !src.mac) src.mac = Stalker.makeMac();
    verifySource(src).then(function () {
        if (state.sources.some(function (s) { return s.id === src.id; })) return;
        state.sources.push(src);
        writeJSON(SOURCES_KEY, state.sources);
        if (state.screen === 'home') renderHome();
        toast(t('Source saved'));
    }).catch(function (err) {
        if (err && err.aborted) return;
        toast(t('Not saved') + ': ' + verifyErrText(err), true);
    });
}

function castPlay(m) {
    var url = String(m.url || '').trim();
    if (!/^https?:\/\//i.test(url)) return;
    var kind = m.kind === 'ep' ? 'ep' : (m.kind === 'vod' || m.kind === 'series') ? 'vod' : 'live';
    var h = 0;
    for (var i = 0; i < url.length; i++) h = (h * 31 + url.charCodeAt(i)) | 0;
    var name = String(m.title || '').trim() || hostOf({ url: url });
    var it = {
        key: 'cast:' + (h >>> 0).toString(36), id: 'cast', name: name.slice(0, 120), kind: kind, group: t('Playing from phone'),
        logo: typeof m.logo === 'string' && /^https?:\/\//i.test(m.logo) ? m.logo : '', url: url, direct: true,
        start: kind === 'live' ? 0 : Math.max(0, (parseInt(m.start, 10) || 0) * 1000), detailed: true, plot: ''
    };
    if (state.screen !== 'player') state.castBack = state.screen;
    else if (!curItem() || !curItem().direct) state.castBack = 'browse';
    stopBg();
    state.resumeAt = 0;
    launchPlayer({ cast: true }, [it], 0);
    linkSoon();
}

function closeCast() {
    clearTimeout(state.zapTimer);
    clearTimeout(state.retryTimer);
    state.streamToken++;
    try { stopTick(); } catch (e) { }
    try { Player.stop(); } catch (e2) { }
    state.list = [];
    state.playCtx = null;
    state.bg = null;
    state.closedAt = Date.now();
    var back = state.castBack || 'home';
    if (back === 'hub' && state.source) { showScreen('hub'); renderHub(); }
    else if (back === 'browse' && state.ctx) { showScreen('browse'); try { renderBrowse(); } catch (e3) { } }
    else { showScreen('home'); renderHome(); }
    try { screenSaver(true); } catch (e4) { }
    linkSoon();
}

function linkStatus() {
    var it = state.screen === 'player' ? curItem() : null;
    var o = { lumora: 1, op: 'status', id: link.id, name: 'Lumora TV', ver: CFG.VERSION, ts: Date.now(), state: 'idle' };
    if (it) {
        o.title = it.name;
        o.kind = it.kind;
        o.state = state.paused ? 'paused' : (state.healthy ? 'playing' : 'buffering');
        try { o.pos = Math.floor(Player.position()); o.dur = Math.floor(Player.duration()); } catch (e) { }
    }
    return o;
}

function linkSend(op) {
    var o = linkStatus();
    if (op) o.op = op;
    link.lastSend = Date.now();
    if (!link.host) return;
    lanReq('POST', 'http://' + link.host + ':' + LAN_PORT + '/lumora/status?tv=' + encodeURIComponent(linkRawId()), JSON.stringify(o), 5000, function () { });
}

function linkSoon() {
    var wait = Math.max(300, 2500 - (Date.now() - link.lastSend));
    clearTimeout(link.sendT);
    link.sendT = setTimeout(function () { linkSend(); }, wait);
}

function renderLink() {
    $('link-id').textContent = link.id;
    if (link.qrFor !== link.id) {
        try { QR.draw($('link-qr'), 'lumora://pair?t=lumora-' + link.id.replace(/-/g, '')); link.qrFor = link.id; } catch (e) { }
    }
    var ok = !!link.phoneAt;
    var st = $('link-state');
    st.textContent = ok ? t('Phone connected ✓') + (link.phoneName ? '  ·  ' + link.phoneName : '') : t('Waiting for phone…');
    st.className = ok ? 'on' : '';
}

function openLink() {
    hideModal();
    renderLink();
    $('link').classList.remove('hidden');
    link.open = true;
    linkSend();
    if (!link.host) { link.backoff = 4000; clearTimeout(link.rt); linkFind(link.tok, false); }
}

function closeLink() {
    $('link').classList.add('hidden');
    link.open = false;
    if (state.screen === 'settings') renderSettings();
}

function linkReset() {
    try { localStorage.removeItem(LINK_KEY); } catch (e) { }
    link.ack = 0; link.epoch = ''; link.host = ''; link.phoneAt = 0;
    linkInit();
    renderLink();
    toast(t('New code created'));
    if (state.screen === 'settings') renderSettings();
}
