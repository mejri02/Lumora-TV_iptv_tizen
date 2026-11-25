/* التشفير: نفس منطق Crypto.kt — base64 → AES-CBC → base64 → zlib */
(function () {
  'use strict';

  const KEY_HEX = '4e5c6d1a8b3fe8137a3b9df26a9c4de195267b8e6f6c0b4e1c3ae1d27f2b4e6f';
  const IV_HEX = 'a9c21f8d7e6b4a9db12e4f9d5c1a7b8e';

  function hexToBytes(s) {
    const out = new Uint8Array(s.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(s.substr(i * 2, 2), 16);
    return out;
  }

  function b64(text) {
    const cleaned = text.trim().replace(/-/g, '+').replace(/_/g, '/').replace(/[\n\r ]/g, '');
    if (!cleaned) return new Uint8Array(0);
    const padded = cleaned + '='.repeat((4 - (cleaned.length % 4)) % 4);
    const bin = atob(padded);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function bytesToText(bytes) {
    return new TextDecoder('utf-8').decode(bytes);
  }

  async function aesDecrypt(data) {
    const key = await crypto.subtle.importKey('raw', hexToBytes(KEY_HEX), { name: 'AES-CBC' }, false, ['decrypt']);
    const plain = await crypto.subtle.decrypt({ name: 'AES-CBC', iv: hexToBytes(IV_HEX) }, key, data);
    return new Uint8Array(plain);
  }

  function inflate(data) {
    return pako.inflate(data);
  }

  /* سلسلة الإعدادات الكاملة: base64 → AES → base64 → zlib */
  async function decodeConfigPayload(txt) {
    const stage1 = b64(txt);
    if (!stage1.length) throw new Error('empty payload');
    const decrypted = await aesDecrypt(stage1);
    const stage2 = b64(bytesToText(decrypted));
    if (!stage2.length) throw new Error('empty config');
    return bytesToText(inflate(stage2));
  }

  /* جسم الـ API: نص عادي JSON أو base64 مشفّر */
  async function decodeApiBody(body) {
    const text = body.trim();
    if (text.startsWith('{')) return JSON.parse(text);
    const plain = await aesDecrypt(b64(text));
    return JSON.parse(bytesToText(plain));
  }

  window.OstoraCrypto = { b64, b64String: bytesToText, decodeConfigPayload, decodeApiBody, inflate };
})();
