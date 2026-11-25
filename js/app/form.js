/* Lumora — Add/edit source form, verification and phone-QR pairing. */
'use strict';
function openForm(src) {
    var values = src
        ? { name: src.name, url: src.url, user: src.user, pass: src.pass, format: src.format, mac: src.mac, proxy: src.proxy || '' }
        : { name: '', url: '', user: '', pass: '', format: 'm3u8', mac: Stalker.makeMac(), proxy: '' };
    state.showPass = true;
    state.form = { id: src ? src.id : null, isNew: !src, type: src ? src.type : 'm3u', values: values, step: src ? 'fields' : 'choose', adv: false, err: null };
    state.fi = 0;
    state.fa = 0;
    showScreen('form');
    renderForm();
}
function formActions() {
    return state.form && !state.form.isNew
        ? [['save', 'Replace'], ['new', 'Add as new'], ['phone', 'Phone'], ['cancel', 'Cancel']]
        : [['save', 'Save & verify'], ['phone', 'Phone'], ['cancel', 'Cancel']];
}
function formRows() {
    var f = state.form;
    var rows = [{ kind: 'type' }];
    var adv = [];
    FIELDS[f.type].forEach(function (fd) {
        var r = { kind: fd.kind, key: fd.key, label: fd.label, options: fd.options, placeholder: fd.placeholder, hint: fd.hint };
        (fd.adv ? adv : rows).push(r);
    });
    if (adv.length) {
        rows.push({ kind: 'adv' });
        if (f.adv) adv.forEach(function (r) { rows.push(r); });
    }
    rows.push({ kind: 'actions' });
    return rows;
}

function setFormMsg(text) {
    var el = $('form-msg');
    el.textContent = text || '';
    el.classList.toggle('hidden', !text);
}

// Marks a field (or the whole form when key is empty) as wrong, jumps to it and tells the user why.
function formFail(key, msg) {
    var f = state.form;
    f.err = { key: key || '', msg: msg };
    if (key && FIELDS[f.type].some(function (fd) { return fd.key === key && fd.adv; })) f.adv = true;
    if (key) {
        var rows = formRows();
        for (var i = 0; i < rows.length; i++) if (rows[i].key === key) { state.fi = i; break; }
    }
    renderForm();
    toast(msg, true);
    return null;
}
function renderForm() {
    var f = state.form;
    if (f.step === 'choose') { renderChoose(); return; }
    var rows = formRows();
    state.fi = clamp(state.fi, 0, rows.length - 1);
    var html = '';
    rows.forEach(function (r, i) {
        var focus = i === state.fi;
        var cls = 'row' + (focus ? ' cursor' : '');
        var body;
        if (r.kind === 'type') {
            body = '<label>' + esc(t('Source type')) + '</label><div class="value">' + esc(t(TYPE_NAME[f.type])) + ' <span class="hint">◀ ▶</span></div>';
        } else if (r.kind === 'text') {
            var bad = f.err && f.err.key === r.key;
            if (bad) cls += ' err';
            body = '<label>' + esc(t(r.label)) + '</label>' +
                '<input type="' + (r.key === 'pass' && !state.showPass ? 'password' : 'text') + '" autocomplete="off" spellcheck="false" data-key="' + r.key + '"' +
                ' placeholder="' + esc(r.placeholder ? t(r.placeholder) : '') + '" value="' + esc(f.values[r.key] || '') + '">' +
                (bad ? '<div class="err-msg">' + esc(f.err.msg) + '</div>' : r.hint ? '<div class="fhint">' + esc(t(r.hint)) + '</div>' : '');
        } else if (r.kind === 'cycle') {
            body = '<label>' + esc(t(r.label)) + '</label><div class="value">' + esc(f.values[r.key]) + ' <span class="hint">OK</span></div>';
        } else if (r.kind === 'adv') {
            cls += ' adv';
            body = '<div class="value">' + esc(t('Advanced options')) + ' <span class="hint">' + (f.adv ? '▴' : '▾') + '</span></div>';
        } else {
            cls = 'row actions hg g16';
            var names = formActions().map(function (a) { return a[1]; });
            body = '';
            names.forEach(function (n, j) {
                body += '<span class="btn' + (j === 0 ? ' primary' : '') + (focus && state.fa === j ? ' sel' : '') + '">' + esc(t(n)) + '</span>';
            });
        }
        html += '<div class="' + cls + '">' + body + '</div>';
    });
    $('form-rows').innerHTML = html;
    $('form-title').textContent = t(f.isNew ? 'Add source' : 'Edit source');
    setFormMsg(f.err && !f.err.key ? f.err.msg : '');
    var inputs = $('form-rows').querySelectorAll('input');
    for (var j = 0; j < inputs.length; j++) {
        (function (inp) {
            inp.addEventListener('input', function () {
                f.values[inp.getAttribute('data-key')] = inp.value;
                if (f.err) {
                    f.err = null;
                    var rowEl = inp.parentNode;
                    rowEl.classList.remove('err');
                    var em = rowEl.querySelector('.err-msg');
                    if (em) em.parentNode.removeChild(em);
                    setFormMsg('');
                }
            });
        })(inputs[j]);
    }
    reveal($('form-box'), $('form-rows').children[state.fi], state.fi === 0);
}

// First step when adding a source: type on the phone (fast) or with the remote.
function renderChoose() {
    var opts = [['Add from phone', 'Scan a QR code and type on your phone — the fastest way'], ['Enter manually', 'Type the details with the remote']];
    state.fi = clamp(state.fi, 0, opts.length - 1);
    var html = '';
    opts.forEach(function (o, i) {
        html += '<div class="row choice' + (i === state.fi ? ' cursor' : '') + '"><div class="ttl">' + esc(t(o[0])) + '</div><div class="desc">' + esc(t(o[1])) + '</div></div>';
    });
    $('form-rows').innerHTML = html;
    $('form-title').textContent = t('Add source');
    setFormMsg('');
}

function formMove(delta, focusText) {
    state.fi = clamp(state.fi + delta, 0, formRows().length - 1);
    renderForm();
    if (focusText) focusInput();
}

function focusInput() {
    var el = document.querySelector('#form-rows .row:nth-child(' + (state.fi + 1) + ') input');
    if (el) el.focus();
}

function cycleType(delta) {
    var f = state.form;
    var idx = TYPE_ORDER.indexOf(f.type);
    f.type = TYPE_ORDER[(idx + delta + TYPE_ORDER.length) % TYPE_ORDER.length];
    if (f.type === 'stalker' && !f.values.mac) f.values.mac = Stalker.makeMac();
    f.err = null;
    renderForm();
}

function cycleOption(row, delta) {
    var f = state.form;
    var field = FIELDS[f.type].filter(function (fd) { return fd.key === row.key; })[0];
    if (!field || !field.options) return;
    var idx = field.options.indexOf(f.values[row.key]);
    f.values[row.key] = field.options[(idx + delta + field.options.length) % field.options.length];
    renderForm();
}
function readForm() {
    var f = state.form;
    var v = f.values;
    var V = Validate;

    v.name = V.name(v.name);
    v.url = V.clean(v.url);
    v.user = V.clean(v.user);

    if (f.type === 'xtream') {
        var px = V.parseXtream(v.url);
        if (px) {
            v.url = px.url;
            if (!v.user) v.user = px.user;
            if (!v.pass) v.pass = px.pass;
        }
    }

    var u = f.type === 'xtream' ? V.server(v.url) : V.httpUrl(v.url);
    if (!u.ok) return formFail('url', t(u.error));
    v.url = u.value;

    if (f.type === 'xtream') {
        var ru = V.user(v.user);
        if (!ru.ok) return formFail('user', t(ru.error));
        var rp = V.pass(v.pass);
        if (!rp.ok) return formFail('pass', t(rp.error));
        v.user = ru.value;
        v.pass = rp.value;
    }

    if (f.type === 'stalker') {
        var rm = V.mac(v.mac);
        if (!rm.ok) return formFail('mac', t(rm.error));
        v.mac = rm.value;
        v.proxy = V.clean(v.proxy);
        if (v.proxy) {
            var rx = V.httpUrl(v.proxy);
            if (!rx.ok) return formFail('proxy', t(rx.error));
            v.proxy = rx.value;
        }
    }

    f.err = null;
    return {
        id: f.id || ('s' + Date.now().toString(36)),
        type: f.type,
        name: v.name || hostOf({ url: v.url }),
        url: v.url,
        user: f.type === 'xtream' ? v.user : '',
        pass: f.type === 'xtream' ? (v.pass || '') : '',
        format: v.format || 'm3u8',
        mac: f.type === 'stalker' ? v.mac : '',
        proxy: f.type === 'stalker' ? (v.proxy || '') : ''
    };
}

// Friendly, specific reason for a failed account check.
function verifyErrText(err) {
    var m = (err && err.message) || '';
    if (m === 'Network error' || m === 'No connection') return t('Cannot reach the server. Check the address and port, or the server may be offline.');
    if (m === 'Request timed out') return t('The server did not respond in time. It may be offline.');
    return errText(err);
}

// Checks the account/server for real. Resolves with a success message or rejects with an Error.
function verifySource(src) {
    var probe = {};
    Object.keys(src).forEach(function (k) { probe[k] = src[k]; });
    probe.id = '__test';
    var p;
    if (probe.type === 'xtream') {
        p = Xtream.login(probe).then(function () { return true; });
    } else if (probe.type === 'stalker') {
        p = Stalker.login(probe).then(function () { Stalker.forget('__test'); return true; });
    } else {
        p = M3U.test(probe).then(function () { return true; });
    }
    var timer;
    var guard = new Promise(function (resolve, reject) {
        timer = setTimeout(function () { reject(new Error('Request timed out')); }, CFG.TEST_TIMEOUT_MS);
    });
    function done(v) { clearTimeout(timer); return v; }
    return Promise.race([p, guard]).then(done, function (e) { clearTimeout(timer); throw e; });
}

function saveForm(asNew) {
    var src = readForm();
    if (!src) return;
    var tok = state.testTok = (state.testTok || 0) + 1;
    showLoading(true, 'Verifying account…');
    verifySource(src).then(function () {
        if (state.screen !== 'form' || tok !== state.testTok) return;
        showLoading(false);
        commitForm(src, asNew);
    }).catch(function (err) {
        if (state.screen !== 'form' || tok !== state.testTok) return;
        if (err && err.aborted) return;
        showLoading(false);
        var unreachable = /^(Network error|No connection|Request timed out)$/.test((err && err.message) || '');
        formFail(unreachable ? 'url' : '', t('Not saved') + ': ' + verifyErrText(err));
    });
}

function commitForm(src, asNew) {
    if (asNew) {
        src.id = 's' + Date.now().toString(36);
        var taken = state.sources.map(function (x) { return x.name; });
        var base = src.name, n = 2;
        while (taken.indexOf(src.name) >= 0) src.name = base + ' (' + (n++) + ')';
    }
    forgetAll(src.id);
    clearCache(src.id);
    var idx = state.sources.findIndex(function (s) { return s.id === src.id; });
    if (idx >= 0) state.sources[idx] = src;
    else state.sources.push(src);
    writeJSON(SOURCES_KEY, state.sources);
    state.si = idx >= 0 ? idx : state.sources.length - 1;
    goHome();
    toast(t('Source saved'));
}

function pad2date(sec) {
    var d = new Date(parseInt(sec, 10) * 1000);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}
function onFormKey(k) {
    if (state.loadingOn) {
        if (k === KEY.BACK || k === KEY.BACK_ALT) {
            state.testTok = (state.testTok || 0) + 1;
            Net.cancel('test');
            showLoading(false);
            toast(t('Cancelled'));
        }
        return;
    }
    var f = state.form;
    if (f.step === 'choose') {
        switch (k) {
            case KEY.UP: state.fi = 0; renderForm(); break;
            case KEY.DOWN: state.fi = 1; renderForm(); break;
            case KEY.ENTER:
                if (state.fi === 0) openQr();
                else { f.step = 'fields'; state.fi = 0; renderForm(); }
                break;
            case KEY.RED: openQr(); break;
            case KEY.BACK: case KEY.BACK_ALT: goHome(); break;
        }
        return;
    }
    var row = formRows()[state.fi];
    switch (k) {
        case KEY.UP: formMove(-1, false); break;
        case KEY.DOWN: formMove(1, false); break;
        case KEY.LEFT:
            if (row.kind === 'type') cycleType(-1);
            else if (row.kind === 'cycle') cycleOption(row, -1);
            else if (row.kind === 'adv') { f.adv = !f.adv; renderForm(); }
            else if (row.kind === 'actions') { state.fa = clamp(state.fa - 1, 0, formActions().length - 1); renderForm(); }
            break;
        case KEY.RIGHT:
            if (row.kind === 'type') cycleType(1);
            else if (row.kind === 'cycle') cycleOption(row, 1);
            else if (row.kind === 'adv') { f.adv = !f.adv; renderForm(); }
            else if (row.kind === 'actions') { state.fa = clamp(state.fa + 1, 0, formActions().length - 1); renderForm(); }
            break;
        case KEY.ENTER:
            if (row.kind === 'type') cycleType(1);
            else if (row.kind === 'cycle') cycleOption(row, 1);
            else if (row.kind === 'adv') { f.adv = !f.adv; renderForm(); }
            else if (row.kind === 'actions') {
                var act = (formActions()[state.fa] || ['cancel'])[0];
                if (act === 'save') saveForm(false);
                else if (act === 'new') saveForm(true);
                else if (act === 'phone') openQr();
                else goHome();
            } else focusInput();
            break;
        case KEY.YELLOW:
            state.showPass = !state.showPass;
            toast(t(state.showPass ? 'Show password' : 'Hide password'));
            renderForm();
            break;
        case KEY.RED: openQr(); break;
        case KEY.BACK: case KEY.BACK_ALT: goHome(); break;
    }
}

function closeQr() {
    clearTimeout(state.qrTimer);
    state.qrTok = (state.qrTok || 0) + 1;
    state.qr = false;
    $('qr').classList.add('hidden');
}

function applyRemote(msg) {
    var f = state.form;
    if (!f) return false;
    var d = null;
    try { d = JSON.parse(msg); } catch (e) { }
    if (!d || typeof d !== 'object') {
        var s = String(msg || '').trim();
        var px = Validate.parseXtream(s);
        if (px) d = { type: 'xtream', url: px.url, user: px.user, pass: px.pass };
        else if (/^https?:\/\//i.test(s)) d = { type: 'm3u', url: s };
        else return false;
    }
    if (TYPE_ORDER.indexOf(d.type) < 0) return false;
    f.type = d.type;
    f.step = 'fields';
    f.err = null;
    ['name', 'url', 'user', 'pass', 'mac', 'format', 'proxy'].forEach(function (k) {
        if (typeof d[k] === 'string' && d[k]) f.values[k] = d[k].slice(0, 2048);
    });
    if (f.type === 'stalker' && !f.values.mac) f.values.mac = Stalker.makeMac();
    if (f.type === 'xtream' && ['m3u8', 'ts'].indexOf(f.values.format) < 0) f.values.format = 'm3u8';
    renderForm();
    return true;
}

function openQr() {
    var rnd = '';
    try {
        var a = new Uint8Array(12);
        (window.crypto || window.msCrypto).getRandomValues(a);
        for (var i = 0; i < a.length; i++) rnd += (a[i] % 36).toString(36);
    } catch (e) { rnd = Math.random().toString(36).slice(2, 14) + Math.random().toString(36).slice(2, 8); }
    var topic = 'lumora-' + rnd;
    var url = CFG.CONNECT_URL + '?t=' + topic;
    try { QR.draw($('qr-canvas'), url); } catch (e2) { toast(t('Could not load this content.'), true); return; }
    $('qr-url').textContent = url;
    $('qr').classList.remove('hidden');
    state.qr = true;
    var tok = state.qrTok = (state.qrTok || 0) + 1;
    var since = Math.floor(Date.now() / 1000) - 5;
    function poll() {
        if (state.qrTok !== tok) return;
        var x = new XMLHttpRequest();
        x.open('GET', CFG.RELAY + topic + '/json?poll=1&since=' + since, true);
        x.timeout = 10000;
        function next() { if (state.qrTok === tok) state.qrTimer = setTimeout(poll, 3000); }
        x.onload = function () {
            if (state.qrTok !== tok) return;
            if (x.status >= 200 && x.status < 300) {
                var lines = String(x.responseText || '').split('\n');
                for (var j = 0; j < lines.length; j++) {
                    if (!lines[j]) continue;
                    var o = null;
                    try { o = JSON.parse(lines[j]); } catch (e3) { }
                    if (o && o.event === 'message' && o.message && applyRemote(o.message)) {
                        closeQr();
                        toast(t('Received from phone'));
                        if (state.form && !state.form.isNew) {
                            showModal({
                                title: 'Received from phone',
                                name: state.form.values.name || state.form.values.url || '',
                                opts: [['Add as new', ''], ['Replace', ''], ['Edit first', '']],
                                onPick: function (i) {
                                    if (i === 0) saveForm(true);
                                    else if (i === 1) saveForm(false);
                                }
                            });
                        }
                        return;
                    }
                }
            }
            next();
        };
        x.onerror = next;
        x.ontimeout = next;
        try { x.send(); } catch (e4) { next(); }
    }
    poll();
}
