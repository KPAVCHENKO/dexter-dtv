/*
 * Experimental, browser-only resolver for the public Dexter (2006) Novamedia
 * season page. It does not solve challenges, replay protected requests, use
 * cookies, or invent media URLs. It only reads a CORS-accessible document.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.DexterDtvRezkaResolver = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null), function () {
  'use strict';

  var BASE_URL = 'https://rezka-live.net/serial/kriminal/38617-dekster-2006/70-novamedia/1-sezon';
  var MAX_DOCUMENT_BYTES = 2 * 1024 * 1024;

  function ResolverError(code, message) {
    this.name = 'DexterDtvResolverError';
    this.code = code;
    this.message = message;
    if (Error.captureStackTrace) Error.captureStackTrace(this, ResolverError);
  }
  ResolverError.prototype = Object.create(Error.prototype);
  ResolverError.prototype.constructor = ResolverError;

  function fail(code, message) {
    throw new ResolverError(code, message);
  }

  function episodePage(episode) {
    return episode === 1 ? BASE_URL : BASE_URL + '/' + episode + '-serija';
  }

  function validateRequest(options) {
    options = options || {};
    if (String(options.show || '').toLowerCase() !== 'dexter' || Number(options.season) !== 1 ||
        !Number.isInteger(Number(options.episode)) || Number(options.episode) < 1 || Number(options.episode) > 12 ||
        !/^(novamedia|dtv)$/i.test(String(options.voice || ''))) {
      fail('UNSUPPORTED_EPISODE', 'ÐŸÐ¾Ð´Ð´ÐµÑ€Ð¶Ð¸Ð²Ð°ÐµÑ‚ÑÑ Ñ‚Ð¾Ð»ÑŒÐºÐ¾ Dexter, ÑÐµÐ·Ð¾Ð½ 1, ÑÐµÑ€Ð¸Ð¸ 1â€“12, Ð¾Ð·Ð²ÑƒÑ‡ÐºÐ° Novamedia/DTV.');
    }
  }

  function isChallenge(html) {
    return /checking_human|ÐŸÑ€Ð¾Ð²ÐµÑ€ÑÐµÐ¼, Ñ‡ÐµÐ»Ð¾Ð²ÐµÐº Ð»Ð¸ Ð²Ñ‹|security_check|antibot\/|captcha/i.test(html);
  }

  function decodeCandidate(value) {
    return value.replace(/\\u0026/gi, '&').replace(/\\\//g, '/').replace(/&amp;/gi, '&');
  }

  function mediaCandidates(html) {
    // Player configuration often JSON-escapes slash characters. Normalize a
    // document copy before parsing; the original response is never logged.
    var normalized = decodeCandidate(html);
    var matches = normalized.match(/https:\/\/[^\s"'<>]+?manifest\.m3u8[^\s"'<>]*/ig) || [];
    return matches.filter(function (url) {
      return /^https:\/\/[^\s<>"']+manifest\.m3u8(?:[?#][^\s<>"']*)?$/i.test(url);
    });
  }

  function inferQuality(html, url) {
    var position = html.indexOf(url);
    var fragment = position >= 0 ? html.slice(Math.max(0, position - 240), position + url.length + 240) : html;
    var quality = fragment.match(/(?:quality|label|resolution)["'\s:=]+(?:\\")?(\d{3,4})p?/i) || fragment.match(/\b(\d{3,4})p\b/i);
    return quality ? quality[1] + 'p' : null;
  }

  function resultFor(html, url) {
    // Quality is reported only when it is present in the readable player
    // document. One observed 720p stream does not establish future results.
    return {url: url, quality: inferQuality(html, url), expiresAt: null};
  }

  function findIframe(html, pageUrl) {
    var match = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
    if (!match) return null;
    try {
      var url = new URL(match[1], pageUrl);
      return /^https?:$/.test(url.protocol) ? url.href : null;
    } catch (ignored) {
      return null;
    }
  }

  function readDocument(fetchImpl, url) {
    return fetchImpl(url, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      headers: {Accept: 'text/html,application/xhtml+xml'}
    }).then(function (response) {
      if (!response || response.type === 'opaque') fail('CORS', 'Ð˜ÑÑ‚Ð¾Ñ‡Ð½Ð¸Ðº Ð½Ðµ Ñ€Ð°Ð·Ñ€ÐµÑˆÐ¸Ð» Ð±Ñ€Ð°ÑƒÐ·ÐµÑ€Ñƒ Ð¿Ñ€Ð¾Ñ‡Ð¸Ñ‚Ð°Ñ‚ÑŒ Ð¾Ñ‚Ð²ÐµÑ‚ (CORS).');
      if (!response.ok) fail('SOURCE_UNAVAILABLE', 'Ð˜ÑÑ‚Ð¾Ñ‡Ð½Ð¸Ðº Ð²Ñ€ÐµÐ¼ÐµÐ½Ð½Ð¾ Ð½ÐµÐ´Ð¾ÑÑ‚ÑƒÐ¿ÐµÐ½.');
      return response.text().then(function (html) {
        if (typeof html !== 'string' || html.length > MAX_DOCUMENT_BYTES) {
          fail('UNSUPPORTED_FORMAT', 'Ð˜ÑÑ‚Ð¾Ñ‡Ð½Ð¸Ðº Ð²ÐµÑ€Ð½ÑƒÐ» Ð½ÐµÐ¿Ð¾Ð´Ð´ÐµÑ€Ð¶Ð¸Ð²Ð°ÐµÐ¼Ñ‹Ð¹ Ð´Ð¾ÐºÑƒÐ¼ÐµÐ½Ñ‚.');
        }
        if (isChallenge(html)) fail('BROWSER_VERIFICATION', 'Ð˜ÑÑ‚Ð¾Ñ‡Ð½Ð¸Ðº Ñ‚Ñ€ÐµÐ±ÑƒÐµÑ‚ Ð¸Ð½Ñ‚ÐµÑ€Ð°ÐºÑ‚Ð¸Ð²Ð½ÑƒÑŽ Ð¿Ñ€Ð¾Ð²ÐµÑ€ÐºÑƒ Ñ‡ÐµÐ»Ð¾Ð²ÐµÐºÐ°.');
        return {html: html, url: response.url || url};
      });
    }).catch(function (error) {
      if (error && error.name === 'DexterDtvResolverError') throw error;
      fail('CORS_OR_NETWORK', 'Ð‘Ñ€Ð°ÑƒÐ·ÐµÑ€ Ð½Ðµ Ð¼Ð¾Ð¶ÐµÑ‚ Ð¿Ñ€Ð¾Ñ‡Ð¸Ñ‚Ð°Ñ‚ÑŒ Ð¸ÑÑ‚Ð¾Ñ‡Ð½Ð¸Ðº: CORS Ð¸Ð»Ð¸ ÑÐµÑ‚ÐµÐ²Ð°Ñ Ð¾ÑˆÐ¸Ð±ÐºÐ°.');
    });
  }

  /**
   * Resolve only data that is already present in a browser-readable document.
   * No challenge bypass, cookie reuse, protected XHR replay, or URL synthesis.
   */
  function resolveEpisode(options) {
    try {
      validateRequest(options);
    } catch (error) {
      return Promise.reject(error);
    }
    var fetchImpl = options && options.fetch || (typeof fetch === 'function' && fetch);
    if (!fetchImpl) return Promise.reject(new ResolverError('FETCH_UNAVAILABLE', 'Ð’ ÑÑ‚Ð¾Ð¼ Ð¾ÐºÑ€ÑƒÐ¶ÐµÐ½Ð¸Ð¸ Ð½ÐµÐ´Ð¾ÑÑ‚ÑƒÐ¿ÐµÐ½ Ð±Ñ€Ð°ÑƒÐ·ÐµÑ€Ð½Ñ‹Ð¹ fetch.'));

    return readDocument(fetchImpl, episodePage(Number(options.episode))).then(function (page) {
      var candidates = mediaCandidates(page.html);
      if (candidates.length) {
        var preferred = candidates.find(function (url) { return inferQuality(page.html, url) === '720p'; }) || candidates[0];
        return resultFor(page.html, preferred);
      }

      var iframe = findIframe(page.html, page.url);
      if (!iframe) fail('SOURCE_FORMAT_UNSUPPORTED', 'Ð’ HTML Ð½Ðµ Ð½Ð°Ð¹Ð´ÐµÐ½ Ð´Ð¾ÑÑ‚ÑƒÐ¿Ð½Ñ‹Ð¹ Ð°Ð´Ñ€ÐµÑ HLS Ð¸Ð»Ð¸ iframe Ð¿Ð»ÐµÐµÑ€Ð°.');

      return readDocument(fetchImpl, iframe).then(function (frame) {
        var frameCandidates = mediaCandidates(frame.html);
        if (!frameCandidates.length) fail('SOURCE_FORMAT_UNSUPPORTED', 'Ð’ iframe Ð¿Ð»ÐµÐµÑ€Ð° Ð½ÐµÑ‚ Ð´Ð¾ÑÑ‚ÑƒÐ¿Ð½Ð¾Ð³Ð¾ Ð°Ð´Ñ€ÐµÑÐ° HLS.');
        var selected = frameCandidates.find(function (url) { return inferQuality(frame.html, url) === '720p'; }) || frameCandidates[0];
        return resultFor(frame.html, selected);
      });
    });
  }

  return {resolveEpisode: resolveEpisode, ResolverError: ResolverError, episodePage: episodePage};
});

/* --- Dexter DTV bundled resolver --- */
/* Dexter DTV for Lampa / ByLampa â€” v0.5.2
 * Custom launch menu for Dexter (2006), S01. Direct HLS playback with bundled
 * Novamedia sources. Optional user-owned HTTPS resolver endpoint.
 * Source: https://github.com/kpavchenko/dexter-dtv
 */
(function () {
  'use strict';

  var VERSION = '0.5.2';
  var RUNTIME_KEY = '__dexter_dtv_runtime';
  var KEY_PREFIX = 'dexter_dtv_s1_e'; // Preserve v0.1.0 saved episode URLs.
  var RESOLVER_KEY = 'dexter_dtv_v2_resolver';
  var DEVICE_KEY = 'dexter_dtv_v2_device_key';
  var DEFAULT_SOURCES = {
    "1": "https://limbo.voidfralom.org/357a73b57fe957a57a9418ce31a136be:2026092522:6637584a-fb07-47c8-bd2f-2abdfdd38376/1/3/5/4/5/9/1/ehkrk.mp4:hls:manifest.m3u8",
    "2": "https://petra.voidfralom.org/041a565f3193648a65b6b33f55855fff:2026092609:3560fa89-adef-485d-acfc-e6a62e162d02/1/3/5/4/6/2/4/h04ls.mp4:hls:manifest.m3u8",
    "3": "https://bingo.voidfralom.org/f45ea109a3eda10d39655acae8839ebe:2026092609:c009d285-2b28-4721-96b5-5c78c1a7aa02/1/3/5/4/6/0/6/7c9vk.mp4:hls:manifest.m3u8",
    "4": "https://fox.voidfralom.org/d5adbf9c1af6c39c5aa2c372010d709b:2026092609:09fbe2c9-27de-42ae-93e5-20cdb66dbd9b/1/3/5/4/5/9/3/15oo2.mp4:hls:manifest.m3u8",
    "5": "https://silence.voidfralom.org/8f92a07b95cfd22374386a953e57c9ee:2026092609:05cd9bd2-e853-4855-b455-e7db1c5e9a72/1/3/5/4/6/0/7/u5k8p.mp4:hls:manifest.m3u8",
    "6": "https://apollo.voidfralom.org/2ac45cce97ac7e6fef01e757f3216b78:2026092609:b3d054e0-ec9f-4de7-839e-0ee2bbe82eb1/1/3/5/4/5/9/4/2vzew.mp4:hls:manifest.m3u8",
    "7": "https://flora.voidfralom.org/d0f9731e3e95eee1f993b17b37cbc501:2026092609:a9e69a36-7e45-4adb-862a-654ab43156d8/1/3/5/4/5/9/2/l1nqb.mp4:hls:manifest.m3u8",
    "8": "https://octopus.voidfralom.org/e0e9eb9f0cfd8e185b045267b00dddd5:2026092609:c7ef19ad-d583-4da8-b020-9170dd553350/1/3/5/4/6/0/8/cz3g4.mp4:hls:manifest.m3u8",
    "9": "https://sierra.voidfralom.org/bbeee53375a1adec3e968aba328276cf:2026092609:39930d70-5f53-4bc4-b24a-5dc035760dae/1/3/5/4/6/0/0/o7d0z.mp4:hls:manifest.m3u8",
    "10": "https://pioneer.voidfralom.org/7d37f71f9972af52abd39b52ba63665f:2026092609:c5c5424c-b4a6-4fd6-a901-61880dfc85c7/1/3/5/4/5/9/6/pevpm.mp4:hls:manifest.m3u8",
    "11": "https://nika.voidfralom.org/13f2a9bcf52bc220774fee46ded875bb:2026092609:cfa36bf2-47e1-4c1d-a69e-da851ba723bb/1/3/5/4/6/0/9/5glo7.mp4:hls:manifest.m3u8",
    "12": "https://scorpius.voidfralom.org/b439e9e1bb343670df3d90f958587f8d:2026092609:86960975-7df5-4a50-ae5c-33b14093e0e9/1/3/5/4/5/9/7/n74w1.mp4:hls:manifest.m3u8"
  };
  var EPISODES = 12;
  var started = false;
  var retries = 0;
  var disposed = false;

  // A plugin URL can be loaded again without restarting Lampa.  Keep one
  // listener and one handler on our own button across such reloads.
  var previousRuntime = window[RUNTIME_KEY];
  if (previousRuntime && previousRuntime.dispose) previousRuntime.dispose();

  function info(message) {
    if (window.Lampa && Lampa.Noty && Lampa.Noty.show) Lampa.Noty.show(message);
    else console.log('[Dexter DTV] ' + message);
  }

  function logSafe(error) {
    // Never log direct stream URLs or HTTP response bodies / sensitive tokens.
    console.warn('[Dexter DTV] Operation failed:', error && error.name || 'unknown');
  }

  function storageGet(key) {
    try { return String(Lampa.Storage.get(key, '') || '').trim(); }
    catch (e) { return ''; }
  }

  function storageSet(key, value) {
    Lampa.Storage.set(key, value);
  }

  // Preserve device-specific saved overrides; every empty slot uses its own
  // bundled Novamedia URL.
  function urlFor(n) { return storageGet(KEY_PREFIX + n) || DEFAULT_SOURCES[n] || ''; }

  function validMediaUrl(url) {
    if (typeof url !== 'string' || url.length > 8192 || /[\s<>"'`]/.test(url)) return false;
    // A URL may have /name.mp4:hls:manifest.m3u8, as in the verified example.
    return /^https:\/\/[^/]+\/.+/i.test(url) && /\.(?:m3u8|mp4|mpd)(?:[?#]|$)/i.test(url);
  }

  function validApiBase(url) {
    return typeof url === 'string' && url.length < 1024 &&
      /^https:\/\/[^\s?#]+\/?$/i.test(url) && !/[@<>"'`]/.test(url);
  }

  function validDeviceKey(key) {
    return typeof key === 'string' && /^pm_[A-Za-z0-9_-]{32,}$/.test(key);
  }

  function resolverErrorMessage(error) {
    var code = error && error.code;
    if (code === 'BROWSER_VERIFICATION') return 'Ð˜ÑÑ‚Ð¾Ñ‡Ð½Ð¸Ðº Ñ‚Ñ€ÐµÐ±ÑƒÐµÑ‚ Ð¸Ð½Ñ‚ÐµÑ€Ð°ÐºÑ‚Ð¸Ð²Ð½ÑƒÑŽ Ð¿Ñ€Ð¾Ð²ÐµÑ€ÐºÑƒ Ñ‡ÐµÐ»Ð¾Ð²ÐµÐºÐ°.';
    if (code === 'CORS' || code === 'CORS_OR_NETWORK') return 'ByLampa Ð½Ðµ Ð¼Ð¾Ð¶ÐµÑ‚ Ð¿Ñ€Ð¾Ñ‡Ð¸Ñ‚Ð°Ñ‚ÑŒ Ð¾Ñ‚Ð²ÐµÑ‚ Ð¸ÑÑ‚Ð¾Ñ‡Ð½Ð¸ÐºÐ° Ð¸Ð·-Ð·Ð° CORS Ð¸Ð»Ð¸ ÑÐµÑ‚Ð¸.';
    if (code === 'SOURCE_UNAVAILABLE') return 'Ð˜ÑÑ‚Ð¾Ñ‡Ð½Ð¸Ðº Ð²Ñ€ÐµÐ¼ÐµÐ½Ð½Ð¾ Ð½ÐµÐ´Ð¾ÑÑ‚ÑƒÐ¿ÐµÐ½.';
    if (code === 'SOURCE_FORMAT_UNSUPPORTED' || code === 'UNSUPPORTED_FORMAT') return 'Ð˜ÑÑ‚Ð¾Ñ‡Ð½Ð¸Ðº Ð½Ðµ Ð¾Ñ‚Ð´Ð°Ð» Ð¿Ð¾Ð´Ð´ÐµÑ€Ð¶Ð¸Ð²Ð°ÐµÐ¼Ñ‹Ð¹ HLS-Ð°Ð´Ñ€ÐµÑ.';
    if (code === 'FETCH_UNAVAILABLE') return 'Ð’ ÑÑ‚Ð¾Ð¼ Ð¾ÐºÑ€ÑƒÐ¶ÐµÐ½Ð¸Ð¸ Ð½ÐµÑ‚ Ð±Ñ€Ð°ÑƒÐ·ÐµÑ€Ð½Ð¾Ð³Ð¾ fetch.';
    return 'ÐÐ²Ñ‚Ð¾Ð¿Ð¾Ð»ÑƒÑ‡ÐµÐ½Ð¸Ðµ ÑÐµÐ¹Ñ‡Ð°Ñ Ð½ÐµÐ´Ð¾ÑÑ‚ÑƒÐ¿Ð½Ð¾.';
  }

  function loadAutoResolver() {
    if (window.DexterDtvRezkaResolver && window.DexterDtvRezkaResolver.resolveEpisode) {
      return Promise.resolve(window.DexterDtvRezkaResolver);
    }
    return Promise.reject({code: 'FETCH_UNAVAILABLE'});
  }

  function titleFor(n) {
    return 'Ð”ÐµÐºÑÑ‚ÐµÑ€ (2006) Â· S01E' + (n < 10 ? '0' : '') + n + ' Â· DTV / Novamedia';
  }

  function episodeItem(n, url) {
    return {url: url, title: titleFor(n), isonline: true, season: 1, episode: n};
  }

  // Contract: POST {show,season,episode,voice}, Authorization: Bearer pm_â€¦
  // Response: {ok:true,data:{url,expiresAt}}. No credentials or media URL are logged.
  function resolve(n, done) {
    var base = storageGet(RESOLVER_KEY);
    if (!validApiBase(base)) return done(null, 'API Ð½Ðµ Ð½Ð°ÑÑ‚Ñ€Ð¾ÐµÐ½');
    var key = storageGet(DEVICE_KEY);
    if (!validDeviceKey(key)) return done(null, 'ÐšÐ»ÑŽÑ‡ ÑƒÑÑ‚Ñ€Ð¾Ð¹ÑÑ‚Ð²Ð° Ð½Ðµ Ð½Ð°ÑÑ‚Ñ€Ð¾ÐµÐ½');
    var xhr = new XMLHttpRequest();
    var settled = false;
    function finish(url, error) {
      if (settled) return;
      settled = true;
      done(url, error);
    }
    try {
      xhr.open('POST', base, true);
      xhr.timeout = 10000;
      xhr.setRequestHeader('Accept', 'application/json');
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.setRequestHeader('Authorization', 'Bearer ' + key);
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;
        if (xhr.status < 200 || xhr.status > 299) {
          try {
            var failure = JSON.parse(xhr.responseText);
            if (failure && failure.error && failure.error.code === 'SOURCE_NOT_CONFIGURED') {
              return finish(null, 'Ð˜ÑÑ‚Ð¾Ñ‡Ð½Ð¸Ðº Ð½Ð° ÑÐµÑ€Ð²ÐµÑ€Ðµ Ð¿Ð¾ÐºÐ° Ð½Ðµ Ð½Ð°ÑÑ‚Ñ€Ð¾ÐµÐ½.');
            }
          } catch (ignored) {}
          return finish(null, 'API Ð²ÐµÑ€Ð½ÑƒÐ» Ð¾ÑˆÐ¸Ð±ÐºÑƒ HTTP ' + xhr.status);
        }
        try {
          var data = JSON.parse(xhr.responseText);
          var url = String(data && data.ok && data.data && data.data.url || '').trim();
          return validMediaUrl(url) ? finish(url, null) : finish(null, 'Ð’ Ð¾Ñ‚Ð²ÐµÑ‚Ðµ API Ð½ÐµÑ‚ ÐºÐ¾Ñ€Ñ€ÐµÐºÑ‚Ð½Ð¾Ð³Ð¾ URL');
        } catch (e) { return finish(null, 'ÐÐµÐºÐ¾Ñ€Ñ€ÐµÐºÑ‚Ð½Ñ‹Ð¹ Ð¾Ñ‚Ð²ÐµÑ‚ API'); }
      };
      xhr.onerror = function () { finish(null, 'ÐÐµÑ‚ Ð´Ð¾ÑÑ‚ÑƒÐ¿Ð° Ðº API (ÑÐµÑ‚ÑŒ/CORS)'); };
      xhr.ontimeout = function () { finish(null, 'API Ð½Ðµ Ð¾Ñ‚Ð²ÐµÑ‚Ð¸Ð» Ð·Ð° 10 ÑÐµÐºÑƒÐ½Ð´'); };
      xhr.send(JSON.stringify({show: 'dexter', season: 1, episode: n, voice: 'novamedia'}));
    } catch (e) { logSafe(e); finish(null, 'ÐÐµ ÑƒÐ´Ð°Ð»Ð¾ÑÑŒ Ð²Ñ‹Ð·Ð²Ð°Ñ‚ÑŒ API'); }
  }

  function play(n, freshUrl) {
    var url = freshUrl || urlFor(n);
    if (!validMediaUrl(url)) {
      info('Ð¡ÐµÑ€Ð¸Ñ ' + n + ': Ð½ÐµÑ‚ Ð¿Ñ€ÑÐ¼Ð¾Ð¹ ÑÑÑ‹Ð»ÐºÐ¸ HLS/MP4.');
      return;
    }
    var playlist = [];
    var current = null;
    var i;
    for (i = 1; i <= EPISODES; i++) {
      var candidate = i === n && freshUrl ? freshUrl : urlFor(i);
      if (validMediaUrl(candidate)) {
        var entry = episodeItem(i, candidate);
        playlist.push(entry);
        if (i === n) current = entry;
      }
    }
    if (!current) return;
    try {
      // Android Lampa serializes the launch item immediately and reads its
      // `playlist` field to build DDD's video_list extra. Clone the entries so
      // current does not reference itself and create a circular JSON object.
      current.playlist = playlist.map(function (item) {
        return episodeItem(item.episode, item.url);
      });
      Lampa.Player.play(current);
    } catch (e) {
      logSafe(e);
      var errorType = e && typeof e.name === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(e.name)
        ? e.name : 'Ð½ÐµÐ¸Ð·Ð²ÐµÑÑ‚Ð½Ð°Ñ Ð¾ÑˆÐ¸Ð±ÐºÐ°';
      info('Lampa Ð½Ðµ ÑÐ¼Ð¾Ð³Ð»Ð° Ð·Ð°Ð¿ÑƒÑÑ‚Ð¸Ñ‚ÑŒ Dexter DTV (' + errorType + ').');
      return;
    }
    // Also update Lampa's in-page queue state after launch; the Android bridge
    // already received the cloned queue above as part of the launch payload.
    try {
      if (typeof Lampa.Player.playlist === 'function') {
        Lampa.Player.playlist(playlist);
      }
    } catch (e) {
      logSafe(e);
      info('Ð’Ð¸Ð´ÐµÐ¾ Ð·Ð°Ð¿ÑƒÑÐºÐ°ÐµÑ‚ÑÑ, Ð½Ð¾ Lampa Ð½Ðµ Ð¿Ñ€Ð¸Ð½ÑÐ»Ð° ÑÐ¿Ð¸ÑÐ¾Ðº ÑÐµÑ€Ð¸Ð¹.');
    }
  }

  // One session = the controller that was active before our Select opened.
  // Do not infer "content": a full-card uses "full_start" and Lampa restores
  // its selector collection only when that exact controller is toggled.
  function makeSession(launcher) {
    var enabled = null;
    try { enabled = Lampa.Controller.enabled && Lampa.Controller.enabled(); }
    catch (ignored) {}
    return {
      controller: enabled && enabled.name && enabled.name !== 'select' ? enabled.name : null,
      focus: launcher || null,
      restoring: false
    };
  }

  function restore(session) {
    if (!session || !session.controller || session.restoring) return;
    session.restoring = true;
    try {
      // Toggle even when the name already matches.  Lampa's controller.toggle
      // rebuilds Navigator's collection and focus for that controller.
      Lampa.Controller.toggle(session.controller);
      if (session.focus && document.documentElement.contains(session.focus) &&
          Lampa.Controller.collectionFocus) {
        Lampa.Controller.collectionFocus(session.focus, document.body);
      }
    } catch (e) { logSafe(e); }
    finally { session.restoring = false; }
  }

  // Lampa.Input.edit always toggles "settings_component" immediately before
  // invoking its callback. Its callback is consequently the reliable place to restore the card
  // controller, for both Enter and Back/cancel.
  function inputText(session, title, current, callback) {
    restore(session);
    var finished = false;
    try {
      Lampa.Input.edit({title: title, value: current || '', free: true, nosave: true}, function (entered) {
        if (finished) return;
        finished = true;
        restore(session);
        callback(String(entered || '').trim());
      });
    } catch (e) {
      restore(session);
      logSafe(e);
      info('ÐÐµ ÑƒÐ´Ð°Ð»Ð¾ÑÑŒ Ð¾Ñ‚ÐºÑ€Ñ‹Ñ‚ÑŒ Ð¿Ð¾Ð»Ðµ Ð²Ð²Ð¾Ð´Ð°.');
    }
  }

  function editEpisode(n, session, autoplay) {
    var current = urlFor(n);
    inputText(session, 'Ð¡ÐµÑ€Ð¸Ñ ' + n + ' Â· Ð¿Ñ€ÑÐ¼Ð°Ñ ÑÑÑ‹Ð»ÐºÐ° .m3u8 / .mp4', current, function (url) {
      // Lampa reports the current value on Back.  Treat it as a cancellation,
      // rather than writing it again or reopening a stale modal.
      if (!url) return;
      // Input returns its existing value on confirmation. Return to the
      // episode list; do not start an unrelated API-key setup flow.
      if (url === current) return openEpisodes(session);
      if (!validMediaUrl(url)) {
        info('ÐÑƒÐ¶ÐµÐ½ Ð¿Ð¾Ð»Ð½Ñ‹Ð¹ HTTPS-Ð°Ð´Ñ€ÐµÑ .m3u8, .mp4 Ð¸Ð»Ð¸ .mpd.');
        return openEpisodes(session);
      }
      storageSet(KEY_PREFIX + n, url);
      info('Ð¡ÑÑ‹Ð»ÐºÐ° ÑÐµÑ€Ð¸Ð¸ ' + n + ' ÑÐ¾Ñ…Ñ€Ð°Ð½ÐµÐ½Ð° Ð½Ð° ÑÑ‚Ð¾Ð¼ ÑƒÑÑ‚Ñ€Ð¾Ð¹ÑÑ‚Ð²Ðµ.');
      if (autoplay) play(n);
      else openEpisodes(session);
    });
  }

  function parseBatch(raw) {
    var result = {};
    var errors = 0;
    var lines = String(raw || '').split(/\r?\n|\|\|/);
    var sequential = 1;
    lines.forEach(function (line) {
      line = line.trim();
      if (!line) return;
      var match = line.match(/^(?:s0?1\s*e(?:p)?\s*)?(\d{1,2})\s*(?:=|\||\s)\s*(https:\/\/\S+)$/i);
      var n, url;
      if (match) { n = parseInt(match[1], 10); url = match[2]; }
      else { n = sequential; url = line; }
      if (n < 1 || n > EPISODES || !validMediaUrl(url)) { errors++; return; }
      result[n] = url;
      sequential = n + 1;
    });
    return {items: result, errors: errors};
  }

  function importBatch(session) {
    inputText(session, 'Ð¡ÑÑ‹Ð»ÐºÐ¸: 1=https://... || 2=https://...', '', function (entered) {
      if (!entered) return;
      var parsed = parseBatch(entered);
      var count = 0;
      Object.keys(parsed.items).forEach(function (n) {
        storageSet(KEY_PREFIX + n, parsed.items[n]);
        count++;
      });
      info('Ð˜Ð¼Ð¿Ð¾Ñ€Ñ‚Ð¸Ñ€Ð¾Ð²Ð°Ð½Ð¾ ÑÑÑ‹Ð»Ð¾Ðº: ' + count + (parsed.errors ? '; Ð¾ÑˆÐ¸Ð±Ð¾Ðº: ' + parsed.errors : ''));
      if (count) openEpisodes(session);
      else info('ÐÐµ Ð½Ð°Ð¹Ð´ÐµÐ½Ð¾ ÐºÐ¾Ñ€Ñ€ÐµÐºÑ‚Ð½Ñ‹Ñ… HTTPS-ÑÑÑ‹Ð»Ð¾Ðº Ð´Ð»Ñ ÑÐµÑ€Ð¸Ð¹ 1â€“12.');
    });
  }

  function configureResolver(session) {
    var current = storageGet(RESOLVER_KEY);
    inputText(session, 'HTTPS URL Ñ‚Ð²Ð¾ÐµÐ³Ð¾ API /resolve (Ð¿ÑƒÑÑ‚Ð¾ = Ð¾Ñ‚Ð¼ÐµÐ½Ð°)', current, function (url) {
      if (!url || url === current) return openEpisodes(session);
      if (!validApiBase(url)) {
        info('ÐÑƒÐ¶ÐµÐ½ HTTPS-Ð°Ð´Ñ€ÐµÑ API Ð±ÐµÐ· ? Ð¸ #.');
        return openEpisodes(session);
      }
      storageSet(RESOLVER_KEY, url);
      info('ÐÐ´Ñ€ÐµÑ API ÑÐ¾Ñ…Ñ€Ð°Ð½Ñ‘Ð½. Ð¢ÐµÐ¿ÐµÑ€ÑŒ Ð´Ð¾Ð±Ð°Ð²ÑŒ ÐºÐ»ÑŽÑ‡ ÑƒÑÑ‚Ñ€Ð¾Ð¹ÑÑ‚Ð²Ð°.');
      configureDeviceKey(session);
    });
  }

  function configureDeviceKey(session) {
    inputText(session, 'ÐšÐ»ÑŽÑ‡ ÑƒÑÑ‚Ñ€Ð¾Ð¹ÑÑ‚Ð²Ð° pm_â€¦ (Ð½Ðµ Ð¿Ð¾ÐºÐ°Ð·Ñ‹Ð²Ð°ÐµÑ‚ÑÑ Ð¿Ð¾Ð²Ñ‚Ð¾Ñ€Ð½Ð¾; Ð¿ÑƒÑÑ‚Ð¾ = Ð¾Ñ‚Ð¼ÐµÐ½Ð°)', '', function (key) {
      if (!key) return openEpisodes(session);
      if (!validDeviceKey(key)) {
        info('ÐÑƒÐ¶ÐµÐ½ ÐºÐ»ÑŽÑ‡ ÑƒÑÑ‚Ñ€Ð¾Ð¹ÑÑ‚Ð²Ð° Ñ„Ð¾Ñ€Ð¼Ð°Ñ‚Ð° pm_â€¦');
        return openEpisodes(session);
      }
      storageSet(DEVICE_KEY, key);
      info('ÐšÐ»ÑŽÑ‡ ÑƒÑÑ‚Ñ€Ð¾Ð¹ÑÑ‚Ð²Ð° ÑÐ¾Ñ…Ñ€Ð°Ð½Ñ‘Ð½ Ñ‚Ð¾Ð»ÑŒÐºÐ¾ Ð² Ð»Ð¾ÐºÐ°Ð»ÑŒÐ½Ð¾Ð¼ Ñ…Ñ€Ð°Ð½Ð¸Ð»Ð¸Ñ‰Ðµ Lampa.');
      openEpisodes(session);
    });
  }

  function launchEpisode(n, session) {
    var saved = urlFor(n);
    // A user-owned saved direct link is always the first choice. The optional
    // private API is only a source for an empty slot, never a playback gate.
    if (validMediaUrl(saved)) return play(n);
    if (!validApiBase(storageGet(RESOLVER_KEY)) || !validDeviceKey(storageGet(DEVICE_KEY))) {
      return editEpisode(n, session, true);
    }
    info('ÐŸÐ¾Ð»ÑƒÑ‡Ð°ÑŽ ÑÑÑ‹Ð»ÐºÑƒ Ð´Ð»Ñ ÑÐµÑ€Ð¸Ð¸ ' + n + '...');
    resolve(n, function (url, error) {
      if (url) return play(n, url); // API results are not persisted.
      info(error);
      editEpisode(n, session, true);
    });
  }

  function autoPlayEpisode(n, session) {
    info('ÐŸÑ€Ð¾Ð²ÐµÑ€ÑÑŽ ÑÐºÑÐ¿ÐµÑ€Ð¸Ð¼ÐµÐ½Ñ‚Ð°Ð»ÑŒÐ½Ñ‹Ð¹ Ð°Ð²Ñ‚Ð¾Ð¸ÑÑ‚Ð¾Ñ‡Ð½Ð¸Ðº Ð´Ð»Ñ ÑÐµÑ€Ð¸Ð¸ ' + n + '...');
    loadAutoResolver().then(function (resolver) {
      return resolver.resolveEpisode({
        show: 'dexter',
        season: 1,
        episode: n,
        voice: 'novamedia'
      });
    }).then(function (result) {
      if (!result || !validMediaUrl(result.url)) throw {code: 'UNSUPPORTED_FORMAT'};
      // Resolver results are passed to DDD but deliberately never saved in
      // Lampa.Storage.
      play(n, result.url);
    }).catch(function (error) {
      logSafe(error);
      info(resolverErrorMessage(error) + ' Ð ÑƒÑ‡Ð½Ð¾Ð¹ Ð²Ð²Ð¾Ð´ Ð´Ð¾ÑÑ‚ÑƒÐ¿ÐµÐ½ Ð´Ð¾Ð»Ð³Ð¸Ð¼ OK Ð½Ð° ÑÐµÑ€Ð¸Ð¸.');
      restore(session);
    });
  }

  function openAutoEpisodes(session) {
    var items = [];
    for (var n = 1; n <= EPISODES; n++) {
      items.push({
        title: 'Ð¡ÐµÑ€Ð¸Ñ ' + n,
        subtitle: 'Ð­ÐºÑÐ¿ÐµÑ€Ð¸Ð¼ÐµÐ½Ñ‚ Â· Rezka/Novamedia Â· Ð±ÐµÐ· Ð¾Ð±Ñ…Ð¾Ð´Ð° Ð¿Ñ€Ð¾Ð²ÐµÑ€Ð¾Ðº',
        episode: n
      });
    }
    Lampa.Select.show({
      title: 'ÐŸÐ¾Ð»ÑƒÑ‡Ð¸Ñ‚ÑŒ ÑÑÑ‹Ð»ÐºÑƒ Ð°Ð²Ñ‚Ð¾Ð¼Ð°Ñ‚Ð¸Ñ‡ÐµÑÐºÐ¸',
      items: items,
      onBack: function () { restore(session); },
      onSelect: function (item) {
        closeMenu(session);
        autoPlayEpisode(item.episode, session);
      }
    });
  }

  function closeMenu(session) {
    // Select.onSelect only calls hide(); close() additionally clears the
    // Activity "select=open" state and invokes onBack.  This mirrors Lampa's
    // own menus and leaves no invisible select controller behind.
    try { Lampa.Select.close(); }
    catch (e) { logSafe(e); }
    restore(session);
  }

  function openEpisodes(existing, launcher) {
    var session = existing || makeSession(launcher);
    var items = [];
    var hasResolver = validApiBase(storageGet(RESOLVER_KEY)) && validDeviceKey(storageGet(DEVICE_KEY));
    for (var n = 1; n <= EPISODES; n++) {
      items.push({
        title: 'Ð¡ÐµÑ€Ð¸Ñ ' + n,
        subtitle: storageGet(KEY_PREFIX + n) ? 'Ð¡ÑÑ‹Ð»ÐºÐ° Ð·Ð°Ð¼ÐµÐ½ÐµÐ½Ð° Ð½Ð° ÑÑ‚Ð¾Ð¼ ÑƒÑÑ‚Ñ€Ð¾Ð¹ÑÑ‚Ð²Ðµ Â· OK = Ð·Ð°Ð¿ÑƒÑÐº Â· Ð´Ð¾Ð»Ð³Ð¸Ð¹ OK = Ð¸Ð·Ð¼ÐµÐ½Ð¸Ñ‚ÑŒ' :
          (validMediaUrl(DEFAULT_SOURCES[n]) ? 'Ð’ÑÑ‚Ñ€Ð¾ÐµÐ½Ð½Ð°Ñ Novamedia-ÑÑÑ‹Ð»ÐºÐ° Â· OK = Ð·Ð°Ð¿ÑƒÑÐº Â· Ð´Ð¾Ð»Ð³Ð¸Ð¹ OK = Ð·Ð°Ð¼ÐµÐ½Ð¸Ñ‚ÑŒ' :
            (hasResolver ? 'API Ð³Ð¾Ñ‚Ð¾Ð² Â· Ð´Ð¾Ð»Ð³Ð¸Ð¹ OK = Ð´Ð¾Ð±Ð°Ð²Ð¸Ñ‚ÑŒ ÑÐ²Ð¾ÑŽ ÑÑÑ‹Ð»ÐºÑƒ' : 'ÐŸÑƒÑÑ‚Ð¾Ð¹ ÑÐ»Ð¾Ñ‚ Â· Ð´Ð¾Ð»Ð³Ð¸Ð¹ OK = Ð´Ð¾Ð±Ð°Ð²Ð¸Ñ‚ÑŒ ÑÑÑ‹Ð»ÐºÑƒ')),
        episode: n
      });
    }
    items.push({title: 'ÐŸÐ¾Ð»ÑƒÑ‡Ð¸Ñ‚ÑŒ ÑÑÑ‹Ð»ÐºÑƒ Ð°Ð²Ñ‚Ð¾Ð¼Ð°Ñ‚Ð¸Ñ‡ÐµÑÐºÐ¸ (ÑÐºÑÐ¿ÐµÑ€Ð¸Ð¼ÐµÐ½Ñ‚)',
      subtitle: 'Rezka / Novamedia Â· Ð¼Ð¾Ð¶ÐµÑ‚ Ð±Ñ‹Ñ‚ÑŒ Ð·Ð°Ð±Ð»Ð¾ÐºÐ¸Ñ€Ð¾Ð²Ð°Ð½Ð¾ CORS Ð¸Ð»Ð¸ Ð¿Ñ€Ð¾Ð²ÐµÑ€ÐºÐ¾Ð¹', action: 'auto'});
    items.push({title: 'Ð˜Ð¼Ð¿Ð¾Ñ€Ñ‚ ÑÑÑ‹Ð»Ð¾Ðº Ð¿Ð°Ñ‡ÐºÐ¾Ð¹ (1=URL || 2=URL)', action: 'batch'});
    items.push({title: 'ÐÐ²Ñ‚Ð¾Ð¸ÑÑ‚Ð¾Ñ‡Ð½Ð¸Ðº Â· API (Ð´Ð¾Ð¿Ð¾Ð»Ð½Ð¸Ñ‚ÐµÐ»ÑŒÐ½Ð¾)',
      subtitle: hasResolver ? 'Ð›Ð¸Ñ‡Ð½Ñ‹Ð¹ HTTPS API Ð¸ ÐºÐ»ÑŽÑ‡ ÑƒÑÑ‚Ñ€Ð¾Ð¹ÑÑ‚Ð²Ð° Ð½Ð°ÑÑ‚Ñ€Ð¾ÐµÐ½Ñ‹' : 'ÐÐ°ÑÑ‚Ñ€Ð¾Ð¸Ñ‚ÑŒ Ð»Ð¸Ñ‡Ð½Ñ‹Ð¹ API Ð¸ ÐºÐ»ÑŽÑ‡ ÑƒÑÑ‚Ñ€Ð¾Ð¹ÑÑ‚Ð²Ð°', action: 'api'});
    items.push({title: 'Ð’ÐµÑ€ÑÐ¸Ñ Ð¿Ð»Ð°Ð³Ð¸Ð½Ð° ' + VERSION, subtitle: 'DTV/Novamedia Â· 12 ÑÐµÑ€Ð¸Ð¹ Ð¿ÐµÑ€Ð²Ð¾Ð³Ð¾ ÑÐµÐ·Ð¾Ð½Ð°', action: 'about'});
    Lampa.Select.show({
      title: 'Ð”ÐµÐºÑÑ‚ÐµÑ€ (2006) Â· 1 ÑÐµÐ·Ð¾Ð½ Â· DTV',
      items: items,
      onBack: function () { restore(session); },
      onLong: function (item) {
        if (item.episode) {
          closeMenu(session);
          editEpisode(item.episode, session, false);
        }
      },
      onSelect: function (item) {
        closeMenu(session);
        if (item.episode) launchEpisode(item.episode, session);
        else if (item.action === 'auto') openAutoEpisodes(session);
        else if (item.action === 'batch') importBatch(session);
        else if (item.action === 'api') configureResolver(session);
        else if (item.action === 'about') {
          info('v' + VERSION + ': Ð²ÑÑ‚Ñ€Ð¾ÐµÐ½Ð½Ñ‹Ðµ ÑÑÑ‹Ð»ÐºÐ¸ Ð·Ð°Ð¿ÑƒÑÐºÐ°ÑŽÑ‚ÑÑ Ð±ÐµÐ· API.');
          openEpisodes(session);
        }
      }
    });
  }

  function isDexter(movie) {
    if (!movie) return false;
    var title = String(movie.original_name || movie.original_title || movie.name || movie.title || '');
    var year = String(movie.first_air_date || movie.release_date || '').slice(0, 4);
    return /^(dexter|Ð´ÐµÐºÑÑ‚ÐµÑ€)$/i.test(title.trim()) && (!year || year === '2006');
  }

  function addButton(e) {
    if (!e || e.type !== 'complite' || !e.data || !isDexter(e.data.movie)) return;
    try {
      var activity = e.object && e.object.activity;
      if (!activity || !activity.render) return;
      var root = activity.render();
      if (!root || !root.find) return;
      var target = root.find('.full-start-new__buttons, .full-start__buttons').first();
      if (!target.length) return;
      var button = root.find('.dexter-dtv-launcher').first();
      if (!button.length) {
        button = $('<div class="full-start__button selector view--online dexter-dtv-launcher">' +
          '<span>â–¶ Ð”ÐµÐºÑÑ‚ÐµÑ€ Â· DTV</span></div>');
        target.prepend(button);
      }
      bindButton(button);
    } catch (e2) { logSafe(e2); }
  }

  function bindButton(button) {
    // This class belongs only to Dexter DTV, so removing its previous handler
    // is safe and prevents double opens after a plugin reload.
    button.off('hover:enter').on('hover:enter.dexterDtv', function () {
      openEpisodes(null, this);
    });
  }

  function bindExistingButtons() {
    try {
      var buttons = $('.dexter-dtv-launcher');
      if (buttons && buttons.each) buttons.each(function () { bindButton($(this)); });
    } catch (e) { logSafe(e); }
  }

  function start() {
    if (started) return;
    if (!window.Lampa || !Lampa.Listener || !Lampa.Select || !Lampa.Player ||
        !Lampa.Input || !Lampa.Storage || !Lampa.Controller) return;
    started = true;
    Lampa.Listener.follow('full', addButton);
    bindExistingButtons();
    console.log('[Dexter DTV] v' + VERSION + ' initialized');
  }

  function boot() {
    function check() {
      if (disposed || started || retries++ > 100) return;
      if (window.Lampa) {
        start();
        if (!started) return setTimeout(check, 250);
      } else setTimeout(check, 250);
    }
    check();
  }

  window[RUNTIME_KEY] = {
    version: VERSION,
    dispose: function () {
      if (disposed) return;
      disposed = true;
      if (started && window.Lampa && Lampa.Listener && Lampa.Listener.remove) {
        Lampa.Listener.remove('full', addButton);
      }
      try { $('.dexter-dtv-launcher').off('.dexterDtv'); }
      catch (ignored) {}
    }
  };
  boot();
})();
