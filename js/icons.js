/* Lumora — Home icon packs. Original vector icons drawn in code; colors follow the active theme (--a1 / --a2). */
var Icons = (function () {
    'use strict';

    var PACKS = [
        ['auto', 'Follow theme'], ['classic', 'Classic'], ['line', 'Line'], ['duo', 'Duotone'], ['neon', 'Neon'], ['badge', 'Badge'],
        ['web', 'Web'], ['blossom', 'Blossom'], ['bat', 'Night wing'], ['energy', 'Energy'], ['football', 'Football'], ['target', 'Target'],
        ['strawhat', 'Straw hat'], ['papercut', 'Paper cut'], ['skyline', 'Skyline'], ['retro', 'Retro sun'],
        ['monarch', 'Shadow monarch'], ['megacity', 'Neon city'], ['halo', 'Halo'], ['storm', 'Storm'], ['curse', 'Curse']
    ];
    var OF_THEME = { spider: 'web', sakura: 'blossom', batman: 'bat', goku: 'energy', roja: 'football', angry: 'target',
        onepiece: 'strawhat', neonspider: 'papercut', skyline: 'skyline', synthwave: 'retro',
        solo: 'monarch', mega: 'megacity', ultra: 'halo', fortnite: 'storm', jjk: 'curse' };
    var uid = 0;

    function resolve(pack, theme) {
        return OF_THEME[theme] || 'duo';
    }

    // ---- glyphs (96 x 96 box). S = shape attrs, A = accent attrs.
    function glyph(kind, S, A) {
        switch (kind) {
            case 'live':
                return '<g ' + S + '><rect x="10" y="30" width="70" height="44" rx="11"/><path d="M30 86h30M45 74v12"/></g>' +
                    '<path ' + A + ' d="M37 42l18 10-18 10z"/>' +
                    '<g fill="none" ' + A.replace(/fill="[^"]*"/, '') + '><path d="M70 26a10 10 0 0 1 10-10M62 26a18 18 0 0 1 18-18"/></g>' +
                    '<circle cx="80" cy="26" r="4" ' + A + '/>';
            case 'vod':
                return '<g ' + S + '><rect x="12" y="38" width="72" height="44" rx="9"/><rect x="12" y="19" width="72" height="15" rx="5" transform="rotate(-6 48 26)"/></g>' +
                    '<g fill="none" ' + A.replace(/fill="[^"]*"/, '') + '><path d="M30 33l7-12M48 31l7-12M66 29l7-12"/></g>' +
                    '<path ' + A + ' d="M42 50l18 10-18 10z"/>';
            case 'series':
                return '<g ' + S + ' fill="none"><path d="M26 14h52a8 8 0 0 1 8 8v36M17 27h52a8 8 0 0 1 8 8v34"/></g>' +
                    '<g ' + S + '><rect x="8" y="40" width="64" height="42" rx="9"/></g>' +
                    '<path ' + A + ' d="M31 51l17 10-17 10z"/>';
            case 'favs':
                return '<g ' + S + '><path d="M48 10l11.4 23.7 26 3.5-19 18 4.8 25.8L48 68.2 24.8 81l4.8-25.8-19-18 26-3.5z"/></g>' +
                    '<circle cx="48" cy="46" r="6" ' + A + '/>';
            default: // cont
                return '<g ' + S + '><circle cx="48" cy="48" r="34"/></g>' +
                    '<g fill="none" ' + A.replace(/fill="[^"]*"/, '').replace(/stroke-width="[^"]*"/, '') + ' stroke-width="7" stroke-linecap="round"><path d="M48 14a34 34 0 0 1 32.3 23.4"/></g>' +
                    '<path ' + A + ' d="M41 35l22 13-22 13z"/>';
        }
    }

    function pts(n, r0, r1, rot) {
        var out = [];
        for (var i = 0; i < n * 2; i++) {
            var a = rot + Math.PI * i / n;
            var r = i % 2 ? r1 : r0;
            out.push((48 + r * Math.cos(a)).toFixed(1) + ',' + (48 + r * Math.sin(a)).toFixed(1));
        }
        return out.join(' ');
    }

    function poly(n, r, rot) {
        var out = [];
        for (var i = 0; i < n; i++) {
            var a = rot + 2 * Math.PI * i / n;
            out.push((48 + r * Math.cos(a)).toFixed(1) + ',' + (48 + r * Math.sin(a)).toFixed(1));
        }
        return out.join(' ');
    }

    // ---- emblems drawn behind the glyph in the themed packs.
    function emblem(pack) {
        var s = '';
        var i, a;
        if (pack === 'web') {
            for (i = 0; i < 8; i++) {
                a = Math.PI * i / 4;
                s += '<line x1="48" y1="48" x2="' + (48 + 45 * Math.cos(a)).toFixed(1) + '" y2="' + (48 + 45 * Math.sin(a)).toFixed(1) + '"/>';
            }
            s += '<polygon points="' + poly(8, 15, 0) + '"/><polygon points="' + poly(8, 29, 0) + '"/><polygon points="' + poly(8, 43, 0) + '"/>';
            return '<g fill="none" stroke="var(--a2)" stroke-opacity=".6" stroke-width="2.2" stroke-linejoin="round">' + s + '</g>';
        }
        if (pack === 'blossom') {
            for (i = 0; i < 5; i++) s += '<ellipse cx="48" cy="26" rx="14" ry="23" transform="rotate(' + (i * 72) + ' 48 48)"/>';
            return '<g fill="var(--a1)" fill-opacity=".34" stroke="var(--a1)" stroke-opacity=".8" stroke-width="2">' + s + '</g><circle cx="48" cy="48" r="7" fill="var(--a2)" fill-opacity=".7"/>';
        }
        if (pack === 'bat') {
            var half = 'M48 28L52 19L55 32C66 29 80 31 92 41C86 42 84 48 84 55C78 51 72 53 68 59C64 53 58 54 54 60L48 72';
            return '<g fill="var(--a1)" fill-opacity=".34" stroke="var(--a1)" stroke-opacity=".85" stroke-width="2" stroke-linejoin="round">' +
                '<path d="' + half + '"/><path d="' + half + '" transform="translate(96 0) scale(-1 1)"/></g>';
        }
        if (pack === 'energy') {
            return '<polygon points="' + pts(10, 46, 29, -Math.PI / 2) + '" fill="var(--a1)" fill-opacity=".34" stroke="var(--a1)" stroke-opacity=".85" stroke-width="2" stroke-linejoin="round"/>' +
                '<circle cx="48" cy="48" r="26" fill="var(--a2)" fill-opacity=".16"/>';
        }
        if (pack === 'football') {
            for (i = 0; i < 5; i++) {
                a = -Math.PI / 2 + 2 * Math.PI * i / 5;
                s += '<line x1="' + (48 + 13 * Math.cos(a)).toFixed(1) + '" y1="' + (48 + 13 * Math.sin(a)).toFixed(1) + '" x2="' + (48 + 42 * Math.cos(a)).toFixed(1) + '" y2="' + (48 + 42 * Math.sin(a)).toFixed(1) + '"/>';
            }
            return '<circle cx="48" cy="48" r="43" fill="rgba(255,255,255,.1)" stroke="var(--a2)" stroke-opacity=".8" stroke-width="2.4"/>' +
                '<g stroke="var(--a2)" stroke-opacity=".7" stroke-width="2">' + s + '</g>' +
                '<polygon points="' + poly(5, 13, -Math.PI / 2) + '" fill="var(--a1)" fill-opacity=".7"/>';
        }
        if (pack === 'target') {
            return '<circle cx="48" cy="48" r="43" fill="var(--a1)" fill-opacity=".3" stroke="var(--a2)" stroke-opacity=".8" stroke-width="2.2"/>' +
                '<circle cx="48" cy="48" r="31" fill="var(--a2)" fill-opacity=".14" stroke="var(--a2)" stroke-opacity=".8" stroke-width="2.2"/>' +
                '<circle cx="48" cy="48" r="19" fill="var(--a1)" fill-opacity=".34" stroke="var(--a2)" stroke-opacity=".8" stroke-width="2.2"/>';
        }
        if (pack === 'strawhat') {
            for (i = 0; i < 12; i++) {
                a = Math.PI * 2 * i / 12;
                s += '<line x1="' + (48 + 33 * Math.cos(a)).toFixed(1) + '" y1="' + (48 + 33 * Math.sin(a)).toFixed(1) + '" x2="' + (48 + 45 * Math.cos(a)).toFixed(1) + '" y2="' + (48 + 45 * Math.sin(a)).toFixed(1) + '"/>';
            }
            return '<g stroke="var(--a2)" stroke-opacity=".7" stroke-width="2.4" stroke-linecap="round">' + s + '</g>' +
                '<ellipse cx="48" cy="60" rx="42" ry="12" fill="var(--a1)" fill-opacity=".3" stroke="var(--a1)" stroke-opacity=".85" stroke-width="2"/>' +
                '<path d="M24 58C22 26 74 26 72 58Z" fill="var(--a1)" fill-opacity=".34" stroke="var(--a1)" stroke-opacity=".85" stroke-width="2" stroke-linejoin="round"/>' +
                '<path d="M24.5 51C36 56 60 56 71.5 51L72 58C60 63 36 63 24 58Z" fill="var(--a2)" fill-opacity=".75"/>';
        }
        if (pack === 'papercut') {
            return '<polygon points="' + poly(4, 45, Math.PI / 4) + '" fill="var(--a1)" fill-opacity=".2" stroke="var(--a1)" stroke-opacity=".85" stroke-width="2" stroke-linejoin="round"/>' +
                '<polygon points="' + poly(4, 33, Math.PI / 4) + '" fill="var(--a2)" fill-opacity=".22" stroke="var(--a2)" stroke-opacity=".85" stroke-width="2" stroke-linejoin="round"/>' +
                '<polygon points="' + poly(4, 21, Math.PI / 4) + '" fill="var(--a1)" fill-opacity=".3" stroke="var(--a1)" stroke-opacity=".85" stroke-width="2" stroke-linejoin="round"/>' +
                '<g stroke="var(--a2)" stroke-opacity=".6" stroke-width="2" stroke-linecap="round"><line x1="48" y1="3" x2="48" y2="93"/><line x1="3" y1="48" x2="93" y2="48"/></g>';
        }
        if (pack === 'skyline') {
            var hs = [30, 46, 24, 54, 38, 28, 44, 26];
            for (i = 0; i < hs.length; i++) {
                s += '<rect x="' + (6 + i * 10.6).toFixed(1) + '" y="3" width="9" height="' + hs[i] + '" rx="1.5"/>';
            }
            return '<g fill="var(--a2)" fill-opacity=".26" stroke="var(--a2)" stroke-opacity=".85" stroke-width="2">' + s + '</g>' +
                '<circle cx="48" cy="82" r="8" fill="var(--a1)" fill-opacity=".5" stroke="var(--a1)" stroke-opacity=".9" stroke-width="2"/>';
        }
        if (pack === 'retro') {
            var cy = 40, r = 31, b = [[cy + 2, cy + 8], [cy + 13, cy + 18], [cy + 23, cy + 26], [cy + 31, cy + 33]];
            var hw = function (y) { return Math.sqrt(Math.max(0, r * r - (y - cy) * (y - cy))); };
            s += '<path d="M' + (48 - r) + ' ' + cy + 'A' + r + ' ' + r + ' 0 0 1 ' + (48 + r) + ' ' + cy + 'Z"/>';
            for (i = 0; i < b.length; i++) {
                s += '<path d="M' + (48 - hw(b[i][0])).toFixed(1) + ' ' + b[i][0] + 'L' + (48 + hw(b[i][0])).toFixed(1) + ' ' + b[i][0] +
                    'L' + (48 + hw(b[i][1])).toFixed(1) + ' ' + b[i][1] + 'L' + (48 - hw(b[i][1])).toFixed(1) + ' ' + b[i][1] + 'Z"/>';
            }
            var g = '';
            for (i = -3; i <= 3; i++) g += '<line x1="' + (48 + i * 6) + '" y1="68" x2="' + (48 + i * 20) + '" y2="93"/>';
            g += '<line x1="6" y1="76" x2="90" y2="76"/><line x1="-2" y1="85" x2="98" y2="85"/><line x1="2" y1="68" x2="94" y2="68"/>';
            return '<g fill="var(--a1)" fill-opacity=".5" stroke="var(--a1)" stroke-opacity=".9" stroke-width="2" stroke-linejoin="round">' + s + '</g>' +
                '<g stroke="var(--a2)" stroke-opacity=".75" stroke-width="2" stroke-linecap="round">' + g + '</g>';
        }
        if (pack === 'monarch') {
            return '<g fill="none" stroke="var(--a2)" stroke-opacity=".7" stroke-width="2.4" stroke-linecap="round">' +
                '<path d="M20 30l6 12 6-12 8 14 8-14 6 12 6-12"/><path d="M14 22l4 8M82 22l-4 8"/></g>' +
                '<circle cx="48" cy="60" r="26" fill="var(--a1)" fill-opacity=".3" stroke="var(--a1)" stroke-opacity=".9" stroke-width="2.4"/>' +
                '<circle cx="38" cy="56" r="4.5" fill="var(--a2)"/><circle cx="58" cy="56" r="4.5" fill="var(--a2)"/>' +
                '<path d="M36 68c8 6 16 6 24 0" fill="none" stroke="var(--a2)" stroke-opacity=".9" stroke-width="2.4" stroke-linecap="round"/>';
        }
        if (pack === 'megacity') {
            var mh = [26, 44, 20, 52, 34, 24];
            for (i = 0; i < mh.length; i++) {
                s += '<rect x="' + (8 + i * 14) + '" y="' + (88 - mh[i]) + '" width="10" height="' + mh[i] + '" rx="1.5"/>';
            }
            return '<g fill="var(--a1)" fill-opacity=".24" stroke="var(--a1)" stroke-opacity=".85" stroke-width="2">' + s + '</g>' +
                '<g stroke="var(--a2)" stroke-opacity=".85" stroke-width="2" stroke-linecap="round">' +
                '<line x1="29" y1="52" x2="29" y2="64"/><line x1="50" y1="26" x2="50" y2="42"/><line x1="71" y1="48" x2="71" y2="60"/></g>' +
                '<circle cx="20" cy="18" r="5" fill="none" stroke="var(--a2)" stroke-opacity=".9" stroke-width="2"/>';
        }
        if (pack === 'halo') {
            return '<circle cx="48" cy="34" r="20" fill="none" stroke="var(--a2)" stroke-opacity=".9" stroke-width="3"/>' +
                '<g stroke="var(--a1)" stroke-opacity=".8" stroke-width="2.4" stroke-linecap="round">' +
                '<path d="M48 54v14M30 60l6 10M66 60l-6 10M20 76c18-8 38-8 56 0"/></g>' +
                '<circle cx="48" cy="80" r="4" fill="var(--a1)" fill-opacity=".9"/>';
        }
        if (pack === 'storm') {
            return '<polygon points="' + poly(3, 30, -Math.PI / 2) + '" fill="var(--a1)" fill-opacity=".26" stroke="var(--a1)" stroke-opacity=".9" stroke-width="2.4" stroke-linejoin="round"/>' +
                '<path d="M52 20L38 50h10l-6 24 20-34H50l8-20Z" fill="var(--a2)" fill-opacity=".85" stroke="var(--a2)" stroke-width="2" stroke-linejoin="round"/>';
        }
        if (pack === 'curse') {
            return '<circle cx="48" cy="48" r="30" fill="none" stroke="var(--a1)" stroke-opacity=".9" stroke-width="2.6"/>' +
                '<path d="M26 42q10 8 22 0t22 0" fill="none" stroke="var(--a2)" stroke-opacity=".85" stroke-width="2.6" stroke-linecap="round"/>' +
                '<path d="M30 60q9 10 18 0t18 0" fill="none" stroke="var(--a2)" stroke-opacity=".6" stroke-width="2.2" stroke-linecap="round"/>' +
                '<circle cx="36" cy="38" r="3.4" fill="var(--a1)"/><circle cx="60" cy="38" r="3.4" fill="var(--a1)"/>';
        }
        return '';
    }

    var THEMED = { web: 1, blossom: 1, bat: 1, energy: 1, football: 1, target: 1, strawhat: 1, papercut: 1, skyline: 1, retro: 1,
        monarch: 1, megacity: 1, halo: 1, storm: 1, curse: 1 };

    function svg(pack, kind) {
        var id = 'ic' + (++uid);
        var S, A, body = '', defs = '', cls = 'ico ' + pack;
        if (THEMED[pack]) {
            S = 'fill="rgba(6,8,18,.66)" stroke="#fff" stroke-width="4.6" stroke-linecap="round" stroke-linejoin="round"';
            A = 'fill="var(--a1)" stroke="var(--a1)" stroke-width="3" stroke-linejoin="round"';
            body = emblem(pack) + '<g transform="translate(15 15) scale(.69)">' + glyph(kind, S, A) + '</g>';
        } else if (pack === 'badge') {
            defs = '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--a1)"/><stop offset="1" stop-color="var(--a2)"/></linearGradient></defs>';
            S = 'fill="rgba(255,255,255,.2)" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"';
            A = 'fill="#fff" stroke="#fff" stroke-width="3" stroke-linejoin="round"';
            body = '<rect x="4" y="4" width="88" height="88" rx="26" fill="url(#' + id + ')"/><rect x="4" y="4" width="88" height="44" rx="26" fill="#fff" fill-opacity=".1"/>' +
                '<g transform="translate(19 19) scale(.6)">' + glyph(kind, S, A) + '</g>';
        } else if (pack === 'line' || pack === 'neon') {
            S = 'fill="none" stroke="var(--a2)" stroke-width="' + (pack === 'neon' ? 4 : 4.5) + '" stroke-linecap="round" stroke-linejoin="round"';
            A = 'fill="var(--a1)" stroke="var(--a1)" stroke-width="3" stroke-linejoin="round"';
            body = glyph(kind, S, A);
        } else { // duo (default)
            S = 'fill="var(--a2)" fill-opacity=".2" stroke="var(--a2)" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"';
            A = 'fill="var(--a1)" stroke="var(--a1)" stroke-width="3" stroke-linejoin="round"';
            body = glyph(kind, S, A);
        }
        return '<svg class="' + cls + '" viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' + defs + body + '</svg>';
    }

    function mark(theme) {
        var pack = OF_THEME[theme];
        if (!pack) return '';
        return '<rect width="64" height="64" rx="18" fill="rgba(6,8,18,.9)"/>' +
            '<rect x="1.5" y="1.5" width="61" height="61" rx="16.5" fill="none" stroke="url(#lg)" stroke-width="3"/>' +
            '<g transform="translate(5 5) scale(.5625)">' + emblem(pack) + '</g>' +
            '<path d="M26 21L45 32L26 43Z" fill="#fff" stroke="rgba(6,8,18,.75)" stroke-width="2.4" stroke-linejoin="round" paint-order="stroke"/>';
    }

    return { PACKS: PACKS, resolve: resolve, svg: svg, mark: mark, THEMES: Object.keys(OF_THEME) };
})();
