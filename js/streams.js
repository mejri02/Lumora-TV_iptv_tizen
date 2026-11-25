/* تحويل نصوص المصادر المختلفة إلى هدف تشغيل — نفس منطق StreamResolver.kt */
(function () {
  'use strict';

  const MULTI_SEPARATOR = '<<R>>';
  const PREFIXES = ['413<F>', '413<W>', '413<', 'urlvplayer://', 'brightcove|'];

  function kindOf(url) {
    const path = url.split('?')[0].split('#')[0].toLowerCase();
    if (path.endsWith('.m3u8') || path.endsWith('.m3u')) return 'hls';
    if (path.endsWith('.mpd')) return 'dash';
    if (path.endsWith('.mp4') || path.endsWith('.mkv') || path.endsWith('.webm')) return 'progressive';
    /* الـ API يقدّم قوائم HLS بامتداد .json */
    if (path.endsWith('.json')) return 'hls';
    return null;
  }

  function clean(input) {
    let s = String(input).trim().replace(/\r/g, '').replace(/\n/g, '').trim();
    for (const prefix of PREFIXES) {
      if (s.toLowerCase().startsWith(prefix.toLowerCase())) { s = s.slice(prefix.length); break; }
    }
    s = s.split(MULTI_SEPARATOR)[0].trim();
    if (s.includes('###')) s = s.split('###')[0].trim();
    const pipe = s.indexOf('|');
    if (pipe > 0 && kindOf(s.slice(0, pipe))) s = s.slice(0, pipe);
    return s.trim();
  }

  /**
   * يُرجع: {kind: 'hls'|'dash'|'progressive'|'embed'|'none', url, reason}
   */
  function resolve(item, fallbackAgent) {
    const raw = String(item.source || '').trim();
    if (!raw) return { kind: 'none', reason: 'empty' };

    if (raw.includes(MULTI_SEPARATOR)) {
      const candidates = raw.split(MULTI_SEPARATOR)
        .flatMap((part) => part.split('!'))
        .map(clean)
        .filter((u) => u.toLowerCase().startsWith('http'));
      if (!candidates.length) return { kind: 'none', reason: 'multi-empty' };
      const direct = candidates.find((u) => kindOf(u));
      if (direct) return { kind: kindOf(direct), url: direct };
      return { kind: 'embed', url: candidates[0] };
    }

    const url = clean(raw);
    if (!url) return { kind: 'none', reason: 'empty' };
    if (url.includes('youtube.com') || url.includes('youtu.be')) return { kind: 'embed', url };
    const kind = kindOf(url);
    if (kind) return { kind, url };
    if (url.toLowerCase().startsWith('http')) return { kind: 'embed', url };
    return { kind: 'none', reason: 'unsupported' };
  }

  window.OstoraStreams = { resolve, cleanSource: clean };
})();
