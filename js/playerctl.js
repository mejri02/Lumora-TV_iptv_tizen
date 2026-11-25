/* Lumora — Player controls: pause, seek, tracks, qualities, stream info.
   Split out of player.js. Player.js calls PlayerCtlBridge(ctx) once with a
   context object exposing the engine state, and merges the returned API into
   its public interface. */
var PlayerCtlBridge = (function () {
    'use strict';

    return function (ctx) {

        function toggle() {
            if (ctx.isAv()) {
                try {
                    var s = ctx.av.getState();
                    if (s === 'PLAYING') { ctx.disarm(); ctx.av.pause(); return false; }
                    if (s === 'PAUSED') { ctx.av.play(); return true; }
                } catch (e) { }
                return false;
            }
            if (ctx.video.paused) {
                var p = ctx.video.play();
                if (p && p.catch) p.catch(function () { });
                return true;
            }
            ctx.disarm();
            ctx.video.pause();
            return false;
        }

        function seek(ms) {
            ctx.setSeekTarget(Math.max(0, Math.floor(ms)));
            clearTimeout(ctx.getSeekTimer());
            var t = setTimeout(function () {
                var target = ctx.getSeekTarget();
                if (target === null) return;
                ctx.setLastSeek({ t: target, at: Date.now() });
                rawSeek(target, 0);
            }, 220);
            ctx.setSeekTimer(t);
        }

        function verifySeek(target, tries) {
            clearTimeout(ctx.getVerifyTimer());
            var tok = ctx.getEngineTok();
            var t = setTimeout(function () {
                if (tok !== ctx.getEngineTok() || !ctx.getCurrent() || ctx.getSeekTarget() !== null) return;
                var pos = position();
                if (Math.abs(pos - target) > 20000 && tries < 2) rawSeek(target, tries + 1);
            }, 3500);
            ctx.setVerifyTimer(t);
        }

        function rawSeek(target, tries) {
            if (ctx.isAv()) {
                try {
                    ctx.av.seekTo(target, function () {
                        if (ctx.getSeekTarget() === target) ctx.setSeekTarget(null);
                        verifySeek(target, tries);
                    }, function () {
                        if (tries < 2) {
                            setTimeout(function () { if (ctx.getSeekTarget() === target || ctx.getSeekTarget() === null) rawSeek(target, tries + 1); }, 700);
                        } else if (ctx.getSeekTarget() === target) {
                            ctx.setSeekTarget(null);
                        }
                    });
                } catch (e) { if (ctx.getSeekTarget() === target) ctx.setSeekTarget(null); }
            } else {
                try { ctx.video.currentTime = target / 1000; } catch (e2) { }
                if (ctx.getSeekTarget() === target) ctx.setSeekTarget(null);
                verifySeek(target, tries);
            }
        }

        function recentSeek() {
            var ls = ctx.getLastSeek();
            return (ls && Date.now() - ls.at < 20000) ? ls.t : null;
        }

        function position() {
            if (ctx.getSeekTarget() !== null) return ctx.getSeekTarget();
            if (ctx.isAv()) {
                try { return ctx.av.getCurrentTime() || 0; } catch (e) { return 0; }
            }
            return (ctx.video.currentTime || 0) * 1000;
        }

        function duration() {
            if (ctx.isAv()) {
                try { return ctx.av.getDuration() || 0; } catch (e) { return 0; }
            }
            return isFinite(ctx.video.duration) ? ctx.video.duration * 1000 : 0;
        }

        var LANGS = {
            en: 'English', eng: 'English', ar: 'Arabic', ara: 'Arabic', fr: 'French', fre: 'French', fra: 'French',
            de: 'German', ger: 'German', deu: 'German', es: 'Spanish', spa: 'Spanish', tr: 'Turkish', tur: 'Turkish',
            it: 'Italian', ita: 'Italian', ru: 'Russian', rus: 'Russian', fa: 'Persian', per: 'Persian', fas: 'Persian',
            hi: 'Hindi', hin: 'Hindi', ku: 'Kurdish', kur: 'Kurdish', pt: 'Portuguese', por: 'Portuguese'
        };

        function langOf(code) {
            var c = String(code || '').toLowerCase();
            if (!c || c === 'und' || c === 'unk') return '';
            return LANGS[c] || c.toUpperCase();
        }

        function avInfo(x) {
            var o = {};
            try { o = JSON.parse(x.extra_info || '{}') || {}; } catch (e) { }
            var low = {};
            Object.keys(o).forEach(function (k) { low[k.toLowerCase()] = o[k]; });
            return low;
        }

        function tracks(type) {
            var out = [];
            var i;
            try {
                if (ctx.engineName() === 'avplay' && ctx.av) {
                    var all = ctx.av.getTotalTrackInfo() || [];
                    var cur = ctx.av.getCurrentStreamInfo() || [];
                    for (i = 0; i < all.length; i++) {
                        if (all[i].type !== type) continue;
                        var info = avInfo(all[i]);
                        var sel = false;
                        for (var c = 0; c < cur.length; c++) {
                            if (cur[c].type === type && cur[c].index === all[i].index) sel = true;
                        }
                        out.push({ index: all[i].index, lang: langOf(info.language || info.track_lang), selected: sel });
                    }
                } else if (ctx.engineName() === 'hls' && ctx.hlsInst()) {
                    var inst = ctx.hlsInst();
                    var hl = type === 'AUDIO' ? inst.audioTracks : inst.subtitleTracks;
                    var hs = type === 'AUDIO' ? inst.audioTrack : inst.subtitleTrack;
                    for (i = 0; i < (hl || []).length; i++) {
                        out.push({ index: i, lang: langOf(hl[i].lang) || hl[i].name || '', selected: i === hs });
                    }
                } else if (type === 'AUDIO' && ctx.video.audioTracks) {
                    for (i = 0; i < ctx.video.audioTracks.length; i++) {
                        var at = ctx.video.audioTracks[i];
                        out.push({ index: i, lang: langOf(at.language) || at.label || '', selected: !!at.enabled });
                    }
                } else if (type === 'TEXT' && ctx.video.textTracks) {
                    for (i = 0; i < ctx.video.textTracks.length; i++) {
                        var tt = ctx.video.textTracks[i];
                        if (tt.kind !== 'subtitles' && tt.kind !== 'captions') continue;
                        out.push({ index: i, lang: langOf(tt.language) || tt.label || '', selected: tt.mode === 'showing' });
                    }
                }
            } catch (e) { }
            return out;
        }

        function selectTrack(type, index) {
            var i;
            try {
                if (ctx.engineName() === 'avplay' && ctx.av) {
                    if (type === 'TEXT') {
                        if (index < 0) { ctx.av.setSilentSubtitle(true); return true; }
                        ctx.av.setSilentSubtitle(false);
                    }
                    ctx.av.setSelectTrack(type, index);
                    return true;
                }
                if (ctx.engineName() === 'hls' && ctx.hlsInst()) {
                    if (type === 'AUDIO') ctx.hlsInst().audioTrack = index;
                    else { ctx.hlsInst().subtitleDisplay = index >= 0; ctx.hlsInst().subtitleTrack = index; }
                    return true;
                }
                if (type === 'AUDIO' && ctx.video.audioTracks) {
                    for (i = 0; i < ctx.video.audioTracks.length; i++) ctx.video.audioTracks[i].enabled = (i === index);
                    return true;
                }
                if (type === 'TEXT' && ctx.video.textTracks) {
                    for (i = 0; i < ctx.video.textTracks.length; i++) {
                        var tt = ctx.video.textTracks[i];
                        if (tt.kind !== 'subtitles' && tt.kind !== 'captions') continue;
                        tt.mode = (i === index) ? 'showing' : 'disabled';
                    }
                    return true;
                }
            } catch (e) { }
            return false;
        }

        function qualities() {
            var out = [];
            try {
                if (ctx.engineName() === 'hls' && ctx.hlsInst() && ctx.hlsInst().levels) {
                    var inst = ctx.hlsInst();
                    for (var i = 0; i < inst.levels.length; i++) {
                        var lv = inst.levels[i];
                        out.push({ index: i, h: lv.height || 0, br: lv.bitrate || 0, sel: inst.currentLevel === i, auto: false });
                    }
                    if (out.length > 1) out.unshift({ index: -1, h: 0, br: 0, sel: inst.autoLevelEnabled, auto: true });
                } else if (ctx.engineName() === 'avplay' && ctx.av) {
                    var all = ctx.av.getTotalTrackInfo() || [];
                    var cur = ctx.av.getCurrentStreamInfo() || [];
                    for (var j = 0; j < all.length; j++) {
                        if (all[j].type !== 'VIDEO') continue;
                        var inf = avInfo(all[j]) || {};
                        var sel2 = false;
                        for (var c = 0; c < cur.length; c++) {
                            if (cur[c].type === 'VIDEO' && cur[c].index === all[j].index) sel2 = true;
                        }
                        out.push({ index: all[j].index, h: parseInt(inf.width || inf.resolution, 10) || 0, br: parseInt(inf.bit_rate || inf.bitrate, 10) || 0, sel: sel2, auto: false });
                    }
                    if (out.length > 1) out.unshift({ index: -1, h: 0, br: 0, sel: false, auto: true });
                }
            } catch (e) { }
            return out;
        }

        function selectQuality(index) {
            try {
                if (ctx.engineName() === 'hls' && ctx.hlsInst()) {
                    if (index < 0) { ctx.hlsInst().currentLevel = -1; return true; }
                    ctx.hlsInst().currentLevel = index;
                    ctx.hlsInst().loadLevel = index;
                    return true;
                }
                if (ctx.engineName() === 'avplay' && ctx.av && index >= 0) {
                    ctx.av.setSelectTrack('VIDEO', index);
                    return true;
                }
            } catch (e) { }
            return false;
        }

        var ENGINE_NAME = { avplay: 'AVPlay', hls: 'Hls.js', mpegts: 'mpegts.js', dash: 'dash.js', native: 'HTML5' };

        function streamInfo() {
            var o = { engine: ENGINE_NAME[ctx.engineName()] || '', w: 0, h: 0, kbps: 0 };
            try {
                if (ctx.engineName() === 'avplay' && ctx.av) {
                    var cur = ctx.av.getCurrentStreamInfo() || [];
                    for (var i = 0; i < cur.length; i++) {
                        if (cur[i].type !== 'VIDEO') continue;
                        var x = avInfo(cur[i]);
                        o.w = parseInt(x.width, 10) || 0;
                        o.h = parseInt(x.height, 10) || 0;
                        var br = parseInt(x.bit_rate || x.bitrate, 10) || 0;
                        o.kbps = br > 100000 ? Math.round(br / 1000) : br;
                    }
                    for (var ai = 0; ai < cur.length; ai++) {
                        if (cur[ai].type !== 'AUDIO') continue;
                        var xa = avInfo(cur[ai]);
                        o.ac = String(xa.fourcc || xa.codec || xa.audio_codec || '').toUpperCase();
                        o.ach = parseInt(xa.channels || xa.channel, 10) || 0;
                    }
                } else {
                    o.w = ctx.video.videoWidth || 0;
                    o.h = ctx.video.videoHeight || 0;
                    if (ctx.engineName() === 'hls' && ctx.hlsInst() && ctx.hlsInst().levels && ctx.hlsInst().currentLevel >= 0) {
                        var lv = ctx.hlsInst().levels[ctx.hlsInst().currentLevel];
                        if (lv) {
                            o.w = lv.width || o.w;
                            o.h = lv.height || o.h;
                            o.kbps = Math.round((lv.bitrate || 0) / 1000);
                        }
                    }
                }
            } catch (e) { }
            return o;
        }

        // Playback speed: HTML5 engines only (AVPlay can't change speed with audio).
        function setSpeed(r) {
            try {
                if (ctx.isAv()) { if (r === 1) { ctx.av.setSpeed(1); return true; } return false; }
                ctx.video.defaultPlaybackRate = r;
                ctx.video.playbackRate = r;
                return true;
            } catch (e) { return false; }
        }

        // Subtitle sync offset in ms (positive = later).
        function setSubDelay(ms) {
            try {
                if (ctx.isAv()) { ctx.av.setSubtitlePosition(ms); return true; }
                var tr = ctx.video.textTracks;
                if (!tr) return false;
                for (var i = 0; i < tr.length; i++) {
                    var cues = tr[i].cues;
                    if (!cues) continue;
                    for (var j = 0; j < cues.length; j++) {
                        var c = cues[j];
                        if (c._s === undefined) { c._s = c.startTime; c._e = c.endTime; }
                        c.startTime = c._s + ms / 1000;
                        c.endTime = c._e + ms / 1000;
                    }
                }
                return true;
            } catch (e) { return false; }
        }

        // Subtitle size in px (0 = default). HTML5 engines only; AVPlay renders subtitles itself.
        function setSubSize(px) {
            try {
                var st = document.getElementById('cue-style');
                if (!st) { st = document.createElement('style'); st.id = 'cue-style'; document.head.appendChild(st); }
                st.textContent = px ? '#html-video::cue { font-size:' + px + 'px; }' : '';
                return !ctx.isAv();
            } catch (e) { return false; }
        }

        return {
            setSpeed: setSpeed, setSubDelay: setSubDelay, setSubSize: setSubSize,
            toggle: toggle, seek: seek, recentSeek: recentSeek, position: position, duration: duration,
            tracks: tracks, selectTrack: selectTrack, qualities: qualities, selectQuality: selectQuality, streamInfo: streamInfo
        };
    };
})();
