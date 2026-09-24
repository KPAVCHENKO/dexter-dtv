/* Dexter DTV / Novamedia — personal direct-stream launcher for Lampa.
 * Test build 0.1.0. Stores URLs only in the Lampa instance on your TV.
 * No scraped content, proxy, cookies or media links shipped with the plugin.
 */
(function () {
  'use strict';

  var KEY = 'dexter_dtv_s1_e';
  var NAME = 'dexter_dtv_local_v1';

  function notify(message) {
    if (Lampa.Noty && Lampa.Noty.show) Lampa.Noty.show(message);
    else console.log('[Dexter DTV] ' + message);
  }

  function value(n) {
    return String(Lampa.Storage.get(KEY + n, '') || '').trim();
  }

  function isVideoUrl(url) {
    return /^https:\/\/\S+/i.test(url) && /(?:\.m3u8|\.mp4|\.mpd)(?:$|[?#])/i.test(url);
  }

  function episodeTitle(n) {
    return 'Декстер (2006) — 1 сезон, ' + n + ' серия [DTV / Novamedia]';
  }

  function playback(n) {
    var url = value(n);
    if (!isVideoUrl(url)) {
      notify('Для серии ' + n + ' нужен прямой https://...m3u8 или mp4 URL');
      return;
    }

    var current = null;
    var playlist = [];
    for (var i = 1; i <= 12; i++) {
      var stream = value(i);
      if (isVideoUrl(stream)) {
        var item = {
          url: stream,
          title: episodeTitle(i),
          isonline: true,
          season: 1,
          episode: i
        };
        playlist.push(item);
        if (i === n) current = item;
      }
    }

    if (!current) return;
    try {
      Lampa.Player.play(current);
      Lampa.Player.playlist(playlist);
    } catch (error) {
      console.error('[Dexter DTV] Player error:', error);
      notify('Не удалось открыть поток. Проверь внешний плеер в настройках Lampa.');
    }
  }

  function editEpisode(n, after) {
    Lampa.Input.edit({
      title: 'Прямая ссылка — серия ' + n,
      value: value(n),
      free: true,
      nosave: true
    }, function (entered) {
      var url = String(entered || '').trim();
      if (!url) return;
      if (!isVideoUrl(url)) {
        notify('Вставь полный https:// URL файла .m3u8, .mp4 или .mpd');
        return;
      }
      Lampa.Storage.set(KEY + n, url);
      notify('Ссылка серии ' + n + ' сохранена только на этом устройстве');
      if (after) setTimeout(after, 200);
    });
  }

  function openEpisodes() {
    var items = [];
    for (var i = 1; i <= 12; i++) {
      items.push({
        title: 'Серия ' + i,
        subtitle: value(i) ? 'HD · URL сохранён' : 'Добавить ссылку',
        episode: i
      });
    }
    items.push({ title: 'Изменить ссылку серии...', edit: true });

    Lampa.Select.show({
      title: 'Декстер · Сезон 1 · DTV / Novamedia',
      items: items,
      onBack: function () { Lampa.Controller.toggle('content'); },
      onSelect: function (item) {
        if (item.edit) {
          var editItems = [];
          for (var n = 1; n <= 12; n++) editItems.push({ title: 'Серия ' + n, episode: n });
          Lampa.Select.show({
            title: 'Изменить ссылку',
            items: editItems,
            onBack: function () { openEpisodes(); },
            onSelect: function (chosen) {
              Lampa.Select.close();
              editEpisode(chosen.episode, openEpisodes);
            }
          });
          return;
        }
        var n = item.episode;
        Lampa.Select.close();
        if (!value(n)) editEpisode(n, function () { playback(n); });
        else playback(n);
      }
    });
  }

  function isDexter(movie) {
    var title = String((movie && (
      movie.original_name || movie.original_title || movie.name || movie.title
    )) || '');
    var date = String((movie && (movie.first_air_date || movie.release_date)) || '');
    return /^(dexter|декстер)$/i.test(title.trim()) && (!date || date.slice(0, 4) === '2006');
  }

  function addButton(e) {
    if (!e || e.type !== 'complite' || !e.data || !isDexter(e.data.movie)) return;
    if (!e.object || !e.object.activity || !e.object.activity.render) return;
    var root = e.object.activity.render();
    var target = root.find('.full-start-new__buttons, .full-start__buttons').first();
    if (!target.length || root.find('.dexter-dtv-launcher').length) return;
    var button = $('<div class="full-start__button selector view--online dexter-dtv-launcher">' +
      '<span>▶ Декстер · DTV</span></div>');
    button.on('hover:enter', openEpisodes);
    target.prepend(button);
  }

  function start() {
    if (window[NAME]) return;
    if (!window.Lampa || !Lampa.Listener || !Lampa.Select || !Lampa.Player ||
        !Lampa.Input || !Lampa.Storage) return;
    window[NAME] = true;
    Lampa.Listener.follow('full', addButton);
    try {
      if (Lampa.Activity && Lampa.Activity.active &&
          Lampa.Activity.active().component === 'full') {
        var active = Lampa.Activity.active();
        addButton({type: 'complite', data: {movie: active.card}, object: active});
      }
    } catch (ignored) {}
    console.log('[Dexter DTV] Plugin 0.1.0 ready. Open Dexter (2006).');
  }

  function boot() {
    if (!window.Lampa) return setTimeout(boot, 250);
    if (window.appready) return start();
    Lampa.Listener.follow('app', function (e) {
      if (e.type === 'ready') start();
    });
    setTimeout(start, 1200);
  }
  boot();
})();
