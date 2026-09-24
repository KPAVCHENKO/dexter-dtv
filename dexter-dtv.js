/* Dexter DTV for Lampa / ByLampa — v0.2.0
 * Custom launch menu for Dexter (2006), S01. Direct HLS playback, optional user-owned
 * HTTPS resolver endpoint. No hard-coded stream URLs, cookies, tokens or scraping.
 * Source: https://github.com/kpavchenko/dexter-dtv
 */
(function () {
  'use strict';

  var VERSION = '0.2.0';
  var BOOT_FLAG = '__dexter_dtv_v020_boot';
  var KEY_PREFIX = 'dexter_dtv_s1_e'; // Preserve v0.1.0 saved episode URLs.
  var RESOLVER_KEY = 'dexter_dtv_v2_resolver';
  var EPISODES = 12;
  var started = false;
  var retries = 0;

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
      Lampa.Player.play(current);
      if (Lampa.Player.playlist) Lampa.Player.playlist(playlist);
    } catch (e) {
      logSafe(e);
      info('Не удалось передать видео плееру. Проверь DDD в настройках Lampa.');
    }
  }

  function inputText(title, current, callback) {
    Lampa.Input.edit({title: title, value: current || '', free: true, nosave: true}, callback);
  }

  // One session = one captured caller context. Never blindly switch to "content";
  // newer Lampa builds and ByLampa can have different active controllers.
  function makeSession() {
    var controller = 'content';
    try {
      var enabled = Lampa.Controller.enabled && Lampa.Controller.enabled();
      if (enabled && enabled.name && enabled.name !== 'select') controller = enabled.name;
    } catch (ignored) {}
    var focus = null;
    try { focus = $('.dexter-dtv-launcher.focus').first()[0] || null; }
    catch (ignored2) {}
    return {controller: controller, focus: focus, locked: false};
  }

  function restore(session) {
    if (!session || session.locked) return;
    session.locked = true;
    try {
      if (Lampa.Controller.enabled && Lampa.Controller.enabled().name === session.controller) return;
      Lampa.Controller.toggle(session.controller);
      // Restoring focus only when our button is still in the live document.
      if (session.focus && document.documentElement.contains(session.focus) &&
          Lampa.Controller.collectionFocus) {
        Lampa.Controller.collectionFocus(session.focus, $(session.focus).parent());
      }
    } catch (e) { logSafe(e); }
    finally { session.locked = false; }
  }

  function editEpisode(n, session, autoplay) {
    restore(session); // Restore underlying controller BEFORE opening keyboard.
    inputText('Серия ' + n + ' · прямая ссылка .m3u8 / .mp4', urlFor(n), function (entered) {
      var url = String(entered || '').trim();
      if (!url) return; // Cancel leaves original UI controller intact.
      if (!validMediaUrl(url)) {
        info('Нужен полный HTTPS-адрес .m3u8, .mp4 или .mpd.');
        return;
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
    restore(session);
    inputText('Ссылки: 1=https://... || 2=https://...', '', function (entered) {
      var parsed = parseBatch(entered);
      var count = 0;
      Object.keys(parsed.items).forEach(function (n) {
        storageSet(KEY_PREFIX + n, parsed.items[n]);
        count++;
      });
      info('Импортировано ссылок: ' + count + (parsed.errors ? '; ошибок: ' + parsed.errors : ''));
      if (count) openEpisodes(session);
    });
  }

  function configureResolver(session) {
    restore(session);
    inputText('HTTPS URL твоего API /resolve (пусто = отмена)', storageGet(RESOLVER_KEY), function (entered) {
      var url = String(entered || '').trim();
      if (!url) return;
      if (!validApiBase(url)) return info('Нужен HTTPS-адрес API без ? и #.');
      storageSet(RESOLVER_KEY, url);
      info('API сохранён. Он должен отдавать JSON {"url":"https://...m3u8"}.');
      openEpisodes(session);
    });
  }

  function launchEpisode(n, session) {
    restore(session);
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

  function openEpisodes(existing) {
    var session = existing || makeSession();
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
          // close() restores the original controller via onBack.
          Lampa.Select.close();
          editEpisode(item.episode, session, false);
        }
      },
      onSelect: function (item) {
        // Lampa.Select auto-hides itself BEFORE invoking onSelect.
        // Restore the captured caller, NOT a hard-coded controller.
        restore(session);
        if (item.episode) launchEpisode(item.episode, session);
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
      if (!target.length || root.find('.dexter-dtv-launcher').length) return;
      var button = $('<div class="full-start__button selector view--online dexter-dtv-launcher">' +
        '<span>▶ Декстер · DTV</span></div>');
      button.on('hover:enter', function () { openEpisodes(); });
      target.prepend(button);
    } catch (e2) { logSafe(e2); }
  }

  function start() {
    if (started) return;
    if (!window.Lampa || !Lampa.Listener || !Lampa.Select || !Lampa.Player ||
        !Lampa.Input || !Lampa.Storage || !Lampa.Controller) return;
    started = true;
    Lampa.Listener.follow('full', addButton);
    console.log('[Dexter DTV] v' + VERSION + ' initialized');
  }

  function boot() {
    if (window[BOOT_FLAG]) return;
    window[BOOT_FLAG] = true;
    function check() {
      if (started || retries++ > 100) return;
      if (window.Lampa) {
        start();
        if (!started) return setTimeout(check, 250);
      } else setTimeout(check, 250);
    }
    check();
  }
  boot();
})();
