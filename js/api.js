/* الواجهة مع الـ API: نفس مصادر تطبيق أندرويد Ostora Neo */
(function () {
  'use strict';

  const CONFIG_TXT_HOST = 'start.ver6.top';
  const NOTIFICATIONS_TXT_HOST = 'n6.not6.top';
  const DEFAULT_UA = 'Mozilla/5.0 (Web0S; TV) AppleWebKit/537.36 Chrome/108.0 Safari/537.36';
  const DOH_UA = 'OstoraNeo/1.0 (Tizen)';
  const FALLBACK_HOSTS = ['v56.ostora-tv.com'];
  const DOH_ENDPOINTS = ['https://1.1.1.1/dns-query', 'https://1.0.0.1/dns-query', 'https://8.8.8.8/resolve', 'https://8.8.4.4/resolve'];

  let config = null;

  async function httpGet(url, headers) {
    const res = await fetch(url, { headers: headers || {}, mode: 'cors', credentials: 'omit' });
    if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
    return res.text();
  }

  function jsonp(url) {
    return new Promise((resolve, reject) => {
      const cb = 'dohcb_' + Math.random().toString(36).slice(2);
      const script = document.createElement('script');
      const timer = setTimeout(() => { cleanup(); reject(new Error('jsonp timeout')); }, 8000);
      function cleanup() { clearTimeout(timer); delete window[cb]; script.remove(); }
      window[cb] = (data) => { cleanup(); resolve(data); };
      script.onerror = () => { cleanup(); reject(new Error('jsonp error')); };
      script.src = url + (url.includes('?') ? '&' : '?') + 'callback=' + cb;
      document.head.appendChild(script);
    });
  }

  async function queryDohTxt(name) {
    /* jsonp عبر Google (يعمل من أي صفحة)، ثم fetch مع بروكسي CORS كاحتياط */
    const attempts = [];
    attempts.push(async () => {
      const root = await jsonp('https://8.8.8.8/resolve?name=' + encodeURIComponent(name) + '&type=TXT');
      return extractTxt(root);
    });
    for (const ep of DOH_ENDPOINTS) {
      attempts.push(async () => {
        const body = await httpGet('https://corsproxy.io/?url=' + encodeURIComponent(ep + '?name=' + encodeURIComponent(name) + '&type=TXT'), { accept: 'application/dns-json' });
        return extractTxt(JSON.parse(body));
      });
    }
    const results = await Promise.allSettled(attempts.map((a) => a()));
    const ok = results.find((r) => r.status === 'fulfilled');
    if (!ok) throw new Error('DNS resolution failed for ' + name);
    return ok.value;
  }

  function extractTxt(root) {
    const answers = root.Answer || [];
    let out = '';
    for (const a of answers) {
      if (a.type !== 16) continue;
      out += String(a.data).replace(/"/g, '').replace(/ /g, '');
    }
    if (!out) throw new Error('empty TXT');
    return out;
  }

  function parseConfig(json) {
    const o = JSON.parse(json);
    const hosts = [];
    for (let i = 0; i <= 9; i++) {
      try {
        const decoded = OstoraCrypto.b64String(o['x' + i] || '');
        const host = decoded.includes('://') ? decoded.split('://')[1] : decoded;
        if (host) hosts.push(host.trim().replace(/\/+$/, ''));
      } catch (e) { /* تجاهل */ }
    }
    let ua = '', pl = '';
    try { ua = OstoraCrypto.b64String(o.ua || ''); } catch (e) { ua = ''; }
    try { pl = OstoraCrypto.b64String(o.pl || ''); } catch (e) { pl = ''; }
    return {
      website: o.website || 'https://ostora.tv',
      updateUrl: o.update || '',
      userAgent: ua || DEFAULT_UA,
      hosts: Array.from(new Set(hosts.concat(FALLBACK_HOSTS))),
      rawJson: json
    };
  }

  /* تحميل الإعدادات مع تفضيل التخزين المحلي عند فشل الشبكة */
  async function bootstrap(force) {
    if (config && !force) return config;
    let lastError = null;
    try {
      const txt = await queryDohTxt(CONFIG_TXT_HOST);
      const json = await OstoraCrypto.decodeConfigPayload(txt);
      config = parseConfig(json);
      try { localStorage.setItem('ostora_config', json); } catch (e) { /* */ }
      return config;
    } catch (e) {
      lastError = e;
    }
    try {
      const cached = localStorage.getItem('ostora_config');
      if (cached) { config = parseConfig(cached); return config; }
    } catch (e) { /* */ }
    throw lastError || new Error('config unavailable');
  }

  async function apiGet(path) {
    const cfg = config || (await bootstrap());
    let lastError = null;
    for (const host of cfg.hosts) {
      try {
        const body = await httpGet('https://' + host + path, {
          id: deviceId(),
          'User-Agent': cfg.userAgent,
          'Accept-Encoding': 'identity'
        });
        return await OstoraCrypto.decodeApiBody(body);
      } catch (e) { lastError = e; }
    }
    throw lastError || new Error('api unavailable');
  }

  let _deviceId = null;
  function deviceId() {
    if (_deviceId) return _deviceId;
    try {
      _deviceId = localStorage.getItem('ostora_device_id');
    } catch (e) { _deviceId = null; }
    if (!_deviceId) {
      _deviceId = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
      try { localStorage.setItem('ostora_device_id', _deviceId); } catch (e) { /* */ }
    }
    return _deviceId;
  }

  async function servers() {
    const root = await apiGet('/api/v6.2/main?page=1');
    const data = root.data || [];
    return data.filter((o) => o.id).map((o) => ({ id: String(o.id), name: o.name || '', image: o.image || '' }));
  }

  async function catalog(categoryId, page) {
    const root = await apiGet('/api/v6.2/category/' + categoryId + '?page=' + page);
    const data = root.data && typeof root.data === 'object' && !Array.isArray(root.data) ? root.data : root;
    const type = data.type || 'category';
    const itemsArray = data.items || [];
    const items = itemsArray.filter((o) => o.id).map((o) => ({
      id: String(o.id),
      name: o.name || '',
      image: o.image || '',
      type: o.type || (type === 'category' ? 'category' : 'stream'),
      source: o.source || '',
      player: o.player || '1',
      agent: o.agent || '',
      download: o.download || ''
    }));
    const p = data.pagination || {};
    return { type, items, page: Number(p.page) || page, pages: Number(p.pages) || 1, total: Number(p.total) || items.length };
  }

  async function matches(date) {
    const root = await apiGet('/api/v6.2/matches/' + date);
    const data = root.data || [];
    return data.map((o) => {
      const home = o.home || {}, away = o.away || {}, info = o.info || {};
      return {
        id: String(o.id),
        homeTeam: home.team || '', homeLogo: home.logo || '', homeScore: home.score || '',
        awayTeam: away.team || '', awayLogo: away.logo || '', awayScore: away.score || '',
        timeSeconds: Number(info.time) || 0,
        competition: info.competition || '', competitionLogo: info.competition_logo || '',
        channel: info.channel || '', stadium: info.stadium || '', announcer: info.announcer || '',
        status: info.status || ''
      };
    });
  }

  async function notifications() {
    try {
      const txt = await queryDohTxt(NOTIFICATIONS_TXT_HOST);
      const json = new TextDecoder().decode(OstoraCrypto.inflate(OstoraCrypto.b64(txt)));
      const root = JSON.parse(json);
      return (root.notifications || []).map((o) => ({
        id: o.id || '', title: o.title || '', message: o.message || '', url: o.url || '', image: o.image || ''
      }));
    } catch (e) { return []; }
  }

  window.OstoraApi = { bootstrap, servers, catalog, matches, notifications, userAgent: () => (config && config.userAgent) || DEFAULT_UA, website: () => (config && config.website) || 'https://ostora.tv' };
})();
