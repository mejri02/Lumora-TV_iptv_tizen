var Settings = (function () {
    'use strict';

    var KEY = 'lumora.settings';

    function detectLang() {
        try {
            var l = String(navigator.language || navigator.userLanguage || (navigator.languages && navigator.languages[0]) || 'en').toLowerCase();
            if (l.indexOf('ar') === 0) return 'ar';
        } catch (e) { }
        return 'en';
    }

    var DEFAULTS = {
        lang: detectLang(),
        theme: 'spider',
        iconPack: 'auto',
        overlayAlpha: 80,
        clock: '24',
        animations: false,
        aspect: 'fit',
        resume: true,
        autoNext: true,
        seekStep: 10,
        infoTimeout: 6,
        retryLimit: 5,
        buffer: 'balanced',
        engine: 'auto',
        parental: false,
        lockCats: true,
        keepAwake: true,
        diag: false,
        miniPlayer: true,
        sort: 'default',
        autoOpenLast: true,
        resumeAsk: true,
        bgRefresh: true,
        cacheHours: 12,
        tmdbKey: ''
    };
    var data = {};

    function load() {
        var saved = {};
        try { saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { saved = {}; }
        data = {};
        Object.keys(DEFAULTS).forEach(function (k) {
            data[k] = saved[k] !== undefined ? saved[k] : DEFAULTS[k];
        });
    }

    function save() {
        try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { }
    }

    function get(k) { return data[k]; }

    function set(k, v) {
        data[k] = v;
        save();
    }

    function reset() {
        data = {};
        Object.keys(DEFAULTS).forEach(function (k) { data[k] = DEFAULTS[k]; });
        save();
    }

    load();
    // Settings that are safe to put in a backup file (no keys or lock state).
    var PRIVATE = { tmdbKey: 1, parental: 1 };

    function exportable() {
        var o = {};
        Object.keys(DEFAULTS).forEach(function (k) { if (!PRIVATE[k]) o[k] = data[k]; });
        return o;
    }

    function setMany(obj) {
        if (!obj || typeof obj !== 'object') return;
        Object.keys(obj).forEach(function (k) {
            if (PRIVATE[k] || DEFAULTS[k] === undefined || typeof obj[k] !== typeof DEFAULTS[k]) return;
            data[k] = obj[k];
        });
        save();
    }

    return { get: get, set: set, reset: reset, exportable: exportable, setMany: setMany };
})();
