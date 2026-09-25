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
    // The requested Novamedia source is known to be 1280×720. Keep that
    // constrained fallback only when a readable document supplied the URL.
    return {url: url, quality: inferQuality(html, url) || '720p', expiresAt: null};
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

/* --- Dexter DTV bundled resolver --- */
/* Dexter DTV for Lampa / ByLampa — v0.3.0
 * Custom launch menu for Dexter (2006), S01. Direct HLS playback, optional user-owned
 * HTTPS resolver endpoint. No hard-coded stream URLs, cookies, tokens or scraping.
 * Source: https://github.com/kpavchenko/dexter-dtv
 */
(function () {
  'use strict';

  var VERSION = '0.3.0';
  var RUNTIME_KEY = '__dexter_dtv_runtime';
  var KEY_PREFIX = 'dexter_dtv_s1_e'; // Preserve v0.1.0 saved episode URLs.
  var RESOLVER_KEY = 'dexter_dtv_v2_resolver';
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

  function urlFor(n) { return storageGet(KEY_PREFIX + n); }

  function validMediaUrl(url) {
    if (typeof url !== 'string' || url.length > 8192 || /[\s<>"'`]/.test(url)) return false;
    // A URL may have /name.mp4:hls:manifest.m3u8, as in the verified example.
    return /^https:\/\/[^/]+\/.+/i.test(url) && /\.(?:m3u8|mp4|mpd)(?:[?#]|$)/i.test(url);
  }

  function validApiBase(url) {
    return typeof url === 'string' && url.length < 1024 &&
      /^https:\/\/[^\s?#]+\/?$/i.test(url) && !/[@<>"'`]/.test(url);
  }

  function resolverErrorMessage(error) {
    var code = error && error.code;
    if (code === 'BROWSER_VERIFICATION') return 'Источник требует интерактивную проверку человека.';
    if (code === 'CORS' || code === 'CORS_OR_NETWORK') return 'ByLampa не может прочитать ответ источника из-за CORS или сети.';
    if (code === 'SOURCE_UNAVAILABLE') return 'Источник временно недоступен.';
    if (code === 'SOURCE_FORMAT_UNSUPPORTED' || code === 'UNSUPPORTED_FORMAT') return 'Источник не отдал поддерживаемый HLS-адрес.';
    if (code === 'FETCH_UNAVAILABLE') return 'В этом окружении нет браузерного fetch.';
    return 'Автополучение сейчас недоступно.';
  }

  function loadAutoResolver() {
    if (window.DexterDtvRezkaResolver && window.DexterDtvRezkaResolver.resolveEpisode) {
      return Promise.resolve(window.DexterDtvRezkaResolver);
    }
    return Promise.reject({code: 'FETCH_UNAVAILABLE'});
  }

  function titleFor(n) {
    return 'Декстер (2006) · S01E' + (n < 10 ? '0' : '') + n + ' · DTV / Novamedia';
  }

  function episodeItem(n, url) {
    return {url: url, title: titleFor(n), isonline: true, season: 1, episode: n};
  }

  // Resolves a user-configured HTTPS API. Response: {"url":"https://...m3u8"}.
  // CORS must allow the origin of ByLampa. This does NOT extract Rezka streams.
  function resolve(n, done) {
    var base = storageGet(RESOLVER_KEY);
    if (!validApiBase(base)) return done(null, 'API не настроен');
    var sep = base.indexOf('?') >= 0 ? '&' : '?';
    // No stream URL, storage data, auth tokens or cookies are sent to the API.
    var endpoint = base + sep + 'season=1&episode=' + n + '&voice=dtv';
    var xhr = new XMLHttpRequest();
    var settled = false;
    function finish(url, error) {
      if (settled) return;
      settled = true;
      done(url, error);
    }
    try {
      xhr.open('GET', endpoint, true);
      xhr.timeout = 10000;
      xhr.setRequestHeader('Accept', 'application/json');
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;
        if (xhr.status < 200 || xhr.status > 299) return finish(null, 'API вернул ошибку HTTP ' + xhr.status);
        try {
          var data = JSON.parse(xhr.responseText);
          var url = String(data && data.url || '').trim();
          return validMediaUrl(url) ? finish(url, null) : finish(null, 'В ответе API нет корректного URL');
        } catch (e) { return finish(null, 'Некорректный ответ API'); }
      };
      xhr.onerror = function () { finish(null, 'Нет доступа к API (сеть/CORS)'); };
      xhr.ontimeout = function () { finish(null, 'API не ответил за 10 секунд'); };
      xhr.send();
    } catch (e) { logSafe(e); finish(null, 'Не удалось вызвать API'); }
  }

  function play(n, freshUrl) {
    var url = freshUrl || urlFor(n);
    if (!validMediaUrl(url)) {
      info('Серия ' + n + ': нет прямой ссылки HLS/MP4.');
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
      // Keep the same supported Lampa playback path that invokes the selected
      // external Android player (e.g. DDD) in compatible Android app builds.
      // Lampa reads data.playlist synchronously when Player.play starts.  It
      // must therefore be on the launch object, not sent afterwards: Android
      // external players (including DDD) can receive the launch immediately.
      current.playlist = playlist;
      Lampa.Player.play(current);
    } catch (e) {
      logSafe(e);
      info('Не удалось передать видео плееру. Проверь DDD в настройках Lampa.');
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
      info('Не удалось открыть поле ввода.');
    }
  }

  function editEpisode(n, session, autoplay) {
    var current = urlFor(n);
    inputText(session, 'Серия ' + n + ' · прямая ссылка .m3u8 / .mp4', current, function (url) {
      // Lampa reports the current value on Back.  Treat it as a cancellation,
      // rather than writing it again or reopening a stale modal.
      if (!url || url === current) return;
      if (!validMediaUrl(url)) {
        info('Нужен полный HTTPS-адрес .m3u8, .mp4 или .mpd.');
        return openEpisodes(session);
      }
      storageSet(KEY_PREFIX + n, url);
      info('Ссылка серии ' + n + ' сохранена на этом устройстве.');
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
    inputText(session, 'Ссылки: 1=https://... || 2=https://...', '', function (entered) {
      if (!entered) return;
      var parsed = parseBatch(entered);
      var count = 0;
      Object.keys(parsed.items).forEach(function (n) {
        storageSet(KEY_PREFIX + n, parsed.items[n]);
        count++;
      });
      info('Импортировано ссылок: ' + count + (parsed.errors ? '; ошибок: ' + parsed.errors : ''));
      if (count) openEpisodes(session);
      else info('Не найдено корректных HTTPS-ссылок для серий 1–12.');
    });
  }

  function configureResolver(session) {
    var current = storageGet(RESOLVER_KEY);
    inputText(session, 'HTTPS URL твоего API /resolve (пусто = отмена)', current, function (url) {
      if (!url || url === current) return;
      if (!validApiBase(url)) {
        info('Нужен HTTPS-адрес API без ? и #.');
        return openEpisodes(session);
      }
      storageSet(RESOLVER_KEY, url);
      info('API сохранён. Он должен отдавать JSON {"url":"https://...m3u8"}.');
      openEpisodes(session);
    });
  }

  function launchEpisode(n, session) {
    var saved = urlFor(n);
    if (!validApiBase(storageGet(RESOLVER_KEY))) {
      if (validMediaUrl(saved)) return play(n);
      return editEpisode(n, session, true);
    }
    info('Получаю ссылку для серии ' + n + '...');
    resolve(n, function (url, error) {
      if (url) return play(n, url); // Fresh short-lived URL is never persisted.
      info(error + (validMediaUrl(saved) ? ' · пробую сохранённую ссылку' : ''));
      if (validMediaUrl(saved)) play(n);
      else editEpisode(n, session, true);
    });
  }

  function autoPlayEpisode(n, session) {
    info('Проверяю экспериментальный автоисточник для серии ' + n + '...');
    loadAutoResolver().then(function (resolver) {
      return resolver.resolveEpisode({
        show: 'dexter',
        season: 1,
        episode: n,
        voice: 'novamedia'
      });
    }).then(function (result) {
      if (!result || !validMediaUrl(result.url)) throw {code: 'UNSUPPORTED_FORMAT'};
      // Fresh resolver results may be short-lived. They are passed to DDD but
      // deliberately never saved in Lampa.Storage.
      play(n, result.url);
    }).catch(function (error) {
      logSafe(error);
      info(resolverErrorMessage(error) + ' Ручной ввод доступен долгим OK на серии.');
      restore(session);
    });
  }

  function openAutoEpisodes(session) {
    var items = [];
    for (var n = 1; n <= EPISODES; n++) {
      items.push({
        title: 'Серия ' + n,
        subtitle: 'Эксперимент · Rezka/Novamedia · без обхода проверок',
        episode: n
      });
    }
    Lampa.Select.show({
      title: 'Получить ссылку автоматически',
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
    var hasResolver = validApiBase(storageGet(RESOLVER_KEY));
    for (var n = 1; n <= EPISODES; n++) {
      items.push({
        title: 'Серия ' + n,
        subtitle: hasResolver ? 'Автоисточник · долгий OK = заменить URL' :
          (validMediaUrl(urlFor(n)) ? 'Ссылка сохранена · долгий OK = заменить' : 'Добавить ссылку'),
        episode: n
      });
    }
    items.push({title: 'Получить ссылку автоматически (эксперимент)',
      subtitle: 'Rezka / Novamedia · может быть заблокировано CORS или проверкой', action: 'auto'});
    items.push({title: 'Импорт ссылок пачкой (1=URL || 2=URL)', action: 'batch'});
    items.push({title: 'Автоисточник · API (дополнительно)',
      subtitle: hasResolver ? 'Свой HTTPS API настроен' : 'Нужен отдельный сервер-резолвер', action: 'api'});
    items.push({title: 'Версия плагина ' + VERSION, subtitle: 'HD · DTV/Novamedia · 12 серий', action: 'about'});
    Lampa.Select.show({
      title: 'Декстер (2006) · 1 сезон · DTV',
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
          info('v' + VERSION + ': исправлено управление; автоисточник требует свой API.');
          openEpisodes(session);
        }
      }
    });
  }

  function isDexter(movie) {
    if (!movie) return false;
    var title = String(movie.original_name || movie.original_title || movie.name || movie.title || '');
    var year = String(movie.first_air_date || movie.release_date || '').slice(0, 4);
    return /^(dexter|декстер)$/i.test(title.trim()) && (!year || year === '2006');
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
          '<span>▶ Декстер · DTV</span></div>');
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
