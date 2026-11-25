/* Lumora — Remote-control / keyboard input and visibility handling. */
'use strict';

function onPlayerKey(k) {
    if (state.nextTimer) {
        if (k === KEY.ENTER || k === KEY.PLAY || k === KEY.NEXT) { playNextNow(); return; }
        clearInterval(state.nextTimer);
        state.nextTimer = null;
        hideNextCard();
        toast(I18n.isRtl() ? 'تم إلغاء التشغيل التلقائي' : 'Autoplay cancelled');
        return;
    }
    if (state.chOpen) { onChanListKey(k); return; }
    if (state.gOpen) { onGuideKey(k); return; }
    var live = !isVod(curItem());
    if (k >= 48 && k <= 57) {
        if (live && k === 48 && !state.digits) lastChannel();
        else if (live) digit(k - 48);
        return;
    }
    var step = S.get('seekStep') * 1000;
    switch (k) {
        case KEY.CH_UP: if (live) zap(1); else tune(state.idx + 1); break;
        case KEY.CH_DOWN: if (live) zap(-1); else tune(state.idx - 1); break;
        case KEY.UP: if (live) zap(1); else openQuick(); break;
        case KEY.DOWN: if (live) zap(-1); else showInfo(); break;
        case KEY.LEFT: if (live) openQuick(); else seekBy(-step); break;
        case KEY.CHLIST: if (live) openChanList(); break;
        case KEY.GUIDE: if (live) openGuide(); break;
        case KEY.RIGHT: if (live) openGuide(); else seekBy(step); break;
        case KEY.RW: seekBy(-CFG.SEEK_LONG_MS); break;
        case KEY.FF: seekBy(CFG.SEEK_LONG_MS); break;
        case KEY.ENTER: if (rcActionable()) retryNow(); else if (live) openChanList(); else if ($('info').classList.contains('hidden')) showInfo(); else togglePause(); break;
        case KEY.INFO: toggleInfo(); break;
        case KEY.PLAY: case KEY.PAUSE: case KEY.PLAYPAUSE: if (!live) togglePause(); break;
        case KEY.YELLOW: toggleFav(curItem()); break;
        case KEY.GREEN: cycleAspect(); break;
        case KEY.BLUE: openTracks(); break;
        case KEY.RED: cycleSleep(); break;
        case KEY.PREV: if (state.list.length > 1) { if (live) zap(-1); else tune(state.idx - 1); } break;
        case KEY.NEXT: if (state.list.length > 1) { if (live) zap(1); else tune(state.idx + 1); } break;
        case KEY.STOP: case KEY.BACK: case KEY.BACK_ALT: closePlayer(); break;
        case KEY.EXIT: exitApp(); break;
    }
}

function onInputKey(k, el) {
    var done = k === KEY.IME_DONE;
    var cancel = k === KEY.IME_CANCEL;
    if (state.screen === 'form') {
        if (k === KEY.ENTER || k === KEY.DOWN) { el.blur(); formMove(1, true); }
        else if (k === KEY.UP) { el.blur(); formMove(-1, true); }
        else if (k === KEY.YELLOW) {
            el.blur();
            state.showPass = !state.showPass;
            toast(t(state.showPass ? 'Show password' : 'Hide password'));
            renderForm();
        }
        else if (k === KEY.BACK || cancel || done) { el.blur(); }
    } else if (state.screen === 'browse' && state.ctx) {
        if (k === KEY.ENTER || k === KEY.DOWN || k === KEY.UP || done) {
            el.blur();
            if (visibleList(state.ctx).length) focusItems(); else focusGroups();
        } else if (k === KEY.BACK || cancel) {
            el.blur();
            if (state.ctx.query && k === KEY.BACK) setQuery('');
            focusGroups();
        }
    } else {
        el.blur();
    }
}

function accel(k) {
    var now = Date.now();
    if (k === state.lastKey && now - state.lastKeyAt < 220) state.rep++;
    else state.rep = 0;
    state.lastKey = k;
    state.lastKeyAt = now;
    return state.rep > 30 ? 8 : state.rep > 14 ? 3 : 1;
}

function digitFallback(el, k) {
    var ch = String(k >= 96 ? k - 96 : k - 48);
    var before = el.value;
    setTimeout(function () {
        if (document.activeElement !== el || el.value !== before) return;
        var max = el.maxLength > 0 ? el.maxLength : 100000;
        if (before.length >= max) return;
        var s = before.length;
        var e2 = before.length;
        try {
            if (typeof el.selectionStart === 'number') { s = el.selectionStart; e2 = el.selectionEnd; }
        } catch (x) { }
        el.value = before.slice(0, s) + ch + before.slice(e2);
        try { el.setSelectionRange(s + 1, s + 1); } catch (y) { }
        var ev = document.createEvent('Event');
        ev.initEvent('input', true, true);
        el.dispatchEvent(ev);
    }, 40);
}

var NO_REPEAT = {};
[KEY.ENTER, KEY.BACK, KEY.BACK_ALT, KEY.YELLOW, KEY.GREEN, KEY.RED, KEY.BLUE, KEY.INFO, KEY.STOP, KEY.PLAY, KEY.PAUSE, KEY.PLAYPAUSE, KEY.EXIT].forEach(function (c) { NO_REPEAT[c] = true; });

function onKey(e) {
    var k = e.keyCode;
    var el = document.activeElement;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
        if (el.id === 'backup-text') {
            if (k === KEY.IME_DONE || k === KEY.IME_CANCEL || k === KEY.BACK || k === KEY.BACK_ALT) el.blur();
            return;
        }
        if ((k >= 48 && k <= 57) || (k >= 96 && k <= 105)) digitFallback(el, k);
        onInputKey(k, el);
        return;
    }
    e.preventDefault();
    if (e.repeat && NO_REPEAT[k]) return;
    if (link.open) {
        if (k === KEY.BACK || k === KEY.BACK_ALT || k === KEY.ENTER) closeLink();
        else if (k === KEY.RED) { linkReset(); }
        else if (k === KEY.EXIT) exitApp();
        return;
    }
    if (state.qr) { if (k === KEY.BACK || k === KEY.BACK_ALT || k === KEY.ENTER) closeQr(); else if (k === KEY.EXIT) exitApp(); return; }
    if ((k === KEY.BACK || k === KEY.BACK_ALT) && state.screen === 'browse' && Date.now() - (state.closedAt || 0) < 700) return;
    if (state.acct) {
        if (k === KEY.BACK || k === KEY.BACK_ALT || k === KEY.ENTER || k === KEY.INFO) closeAcct();
        else if (k === KEY.EXIT) exitApp();
        return;
    }
    if (state.themePick) { onThemeKey(k); return; }
    if (state.modal) { onModalKey(k); return; }
    if (state.backup) { onBackupKey(k); return; }
    if (state.quick) { onQuickKey(k); return; }
    if ((k === KEY.MENU || k === KEY.TOOLS) && state.screen !== 'form' && state.screen !== 'settings') { openQuick(); return; }
    if (state.screen === 'player' && k === KEY.ENTER && !state.chOpen && !state.gOpen && !state.nextTimer && !rcActionable()) {
        lpStart();
        return;
    }
    state.step = accel(k);
    if (I18n.isRtl() && state.screen !== 'player') {
        if (k === KEY.LEFT) k = KEY.RIGHT;
        else if (k === KEY.RIGHT) k = KEY.LEFT;
    }
    switch (state.screen) {
        case 'home': onHomeKey(k); break;
        case 'form': onFormKey(k); break;
        case 'settings': onSettingsKey(k); break;
        case 'hub': onHubKey(k); break;
        case 'browse': onBrowseKey(k); break;
        case 'player': onPlayerKey(k); break;
    }
}

// Long-press OK on the player = toggle favorite; a short press runs the normal OK action on key-up.
function lpStart() {
    clearTimeout(state.lp && state.lp.t);
    var lp = { fired: false, t: 0 };
    lp.t = setTimeout(function () {
        if (state.lp !== lp) return;
        lp.fired = true;
        if (state.screen === 'player' && curItem()) toggleFav(curItem());
    }, 700);
    state.lp = lp;
}

function onKeyUp(e) {
    if (e.keyCode !== KEY.ENTER || !state.lp) return;
    var lp = state.lp;
    state.lp = null;
    clearTimeout(lp.t);
    if (!lp.fired && state.screen === 'player') onPlayerKey(KEY.ENTER);
}
document.addEventListener('keyup', onKeyUp);

var speedIv = null;
var secondIv = null;
function startBgTimers() {
    if (!speedIv) speedIv = setInterval(speedTick, 1500);
    if (!secondIv) secondIv = setInterval(secondTick, 1000);
}
function stopBgTimers() {
    clearInterval(speedIv); speedIv = null;
    clearInterval(secondIv); secondIv = null;
}

function onVisibility() {
    if (document.hidden) {
        stopBgTimers();
        clearInterval(state.tickTimer);
        state.tickTimer = null;
        clearInterval(state.loadTick);
        state.loadTick = null;
        if (state.bg && state.screen !== 'player') stopBg();
        if (state.screen === 'player' && state.list.length) {
            var it = curItem();
            savePos();
            state.resumeAt = isVod(it) ? Player.position() : 0;
            state.suspended = true;
            clearTimeout(state.retryTimer);
            clearTimeout(state.zapTimer);
            state.streamToken++;
            Player.stop();
        }
    } else {
        startBgTimers();
        secondTick();
        if (state.screen === 'player' && !state.tickTimer) startTick();
        if (state.loadingOn && !state.loadTick) showLoading(true);
    }
    if (!document.hidden && state.suspended) {
        state.suspended = false;
        if (state.screen === 'player' && state.list.length) {
            setInfoState(t('Connecting…'));
            showInfo();
            startStream();
        }
    }
}
