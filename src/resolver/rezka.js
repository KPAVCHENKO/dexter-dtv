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
      fail('UNSUPPORTED_EPISODE', 'Поддерживается только Dexter, сезон 1, серии 1–12, озвучка Novamedia/DTV.');
    }
  }

  function isChallenge(html) {
    return /checking_human|Проверяем, человек ли вы|security_check|antibot\/|captcha/i.test(html);
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
      if (!response || response.type === 'opaque') fail('CORS', 'Источник не разрешил браузеру прочитать ответ (CORS).');
      if (!response.ok) fail('SOURCE_UNAVAILABLE', 'Источник временно недоступен.');
      return response.text().then(function (html) {
        if (typeof html !== 'string' || html.length > MAX_DOCUMENT_BYTES) {
          fail('UNSUPPORTED_FORMAT', 'Источник вернул неподдерживаемый документ.');
        }
        if (isChallenge(html)) fail('BROWSER_VERIFICATION', 'Источник требует интерактивную проверку человека.');
        return {html: html, url: response.url || url};
      });
    }).catch(function (error) {
      if (error && error.name === 'DexterDtvResolverError') throw error;
      fail('CORS_OR_NETWORK', 'Браузер не может прочитать источник: CORS или сетевая ошибка.');
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
    if (!fetchImpl) return Promise.reject(new ResolverError('FETCH_UNAVAILABLE', 'В этом окружении недоступен браузерный fetch.'));

    return readDocument(fetchImpl, episodePage(Number(options.episode))).then(function (page) {
      var candidates = mediaCandidates(page.html);
      if (candidates.length) {
        var preferred = candidates.find(function (url) { return inferQuality(page.html, url) === '720p'; }) || candidates[0];
        return resultFor(page.html, preferred);
      }

      var iframe = findIframe(page.html, page.url);
      if (!iframe) fail('SOURCE_FORMAT_UNSUPPORTED', 'В HTML не найден доступный адрес HLS или iframe плеера.');

      return readDocument(fetchImpl, iframe).then(function (frame) {
        var frameCandidates = mediaCandidates(frame.html);
        if (!frameCandidates.length) fail('SOURCE_FORMAT_UNSUPPORTED', 'В iframe плеера нет доступного адреса HLS.');
        var selected = frameCandidates.find(function (url) { return inferQuality(frame.html, url) === '720p'; }) || frameCandidates[0];
        return resultFor(frame.html, selected);
      });
    });
  }

  return {resolveEpisode: resolveEpisode, ResolverError: ResolverError, episodePage: episodePage};
});
