'use strict';

const fs = require('fs');
const vm = require('vm');
const assert = require('node:assert/strict');

const plugin = fs.readFileSync(__dirname + '/dexter-dtv.js', 'utf8');
const capturedSources = JSON.parse(fs.readFileSync(__dirname + '/dexter-dtv-sources.json', 'utf8'));
const bundledMatch = plugin.match(/var DEFAULT_SOURCES = (\{[\s\S]*?\});\s*var EPISODES/);
assert.ok(bundledMatch, 'the plugin includes a built-in episode source map');
const bundledSources = JSON.parse(bundledMatch[1]);
assert.equal(Object.keys(bundledSources).length, 12, 'source map has exactly twelve episode slots');
assert.equal(new Set(Object.values(bundledSources)).size, 12, 'source map has twelve distinct HLS URLs');
for (let n = 1; n <= 12; n++) {
  assert.equal(bundledSources[n], capturedSources.episodes[String(n)].selectedUrl,
    'bundled source matches the captured JSON for episode ' + n);
}
const storage = {
  dexter_dtv_s1_e1: 'https://cdn.example.org/show/s01e01/manifest.m3u8'
};
let active = 'full_start';
let activeMenu = null;
let input = null;
let launched = null;
let playlistCalls = 0;
let injected = false;
let selectCloses = 0;
let controllerToggles = [];
let focusCalls = 0;
const fullListeners = [];

const button = {
  length: 1,
  handlers: {},
  on(type, callback) {
    if (type.indexOf('hover:enter') === 0) this.handlers.enter = callback;
    return this;
  },
  off(type) {
    if (!type || type.indexOf('hover:enter') === 0 || type === '.dexterDtv') delete this.handlers.enter;
    return this;
  },
  first() { return this; }
};
const empty = {length: 0, first() { return this; }};
const target = {
  length: 1,
  first() { return this; },
  prepend(item) { injected = true; assert.equal(item, button); }
};
const root = {
  find(selector) {
    if (selector.includes('dexter-dtv-launcher')) return injected ? button : empty;
    if (selector.includes('buttons')) return target;
    return empty;
  }
};
function $(value) {
  if (typeof value === 'string' && value[0] === '<') return button;
  if (value === '.dexter-dtv-launcher') {
    return {each(callback) { if (injected) callback.call(button); }};
  }
  return value;
}

const ctrl = {
  enabled: () => ({name: active}),
  toggle: (name) => { active = name; controllerToggles.push(name); },
  collectionFocus: () => { focusCalls++; }
};
const context = {
  window: {},
  document: {body: {}, documentElement: {contains: (node) => node === button}},
  console,
  setTimeout: () => {},
  XMLHttpRequest: function () {},
  $
};
context.window.Lampa = context.Lampa = {
  Noty: {show: () => {}},
  Storage: {get: (key, fallback) => storage[key] || fallback, set: (key, value) => { storage[key] = value; }},
  Controller: ctrl,
  Listener: {
    follow: (name, callback) => { if (name === 'full') fullListeners.push(callback); },
    remove: (name, callback) => {
      if (name !== 'full') return;
      const index = fullListeners.indexOf(callback);
      if (index !== -1) fullListeners.splice(index, 1);
    }
  },
  Select: {
    show: (menu) => { activeMenu = menu; active = 'select'; },
    close: () => {
      selectCloses++;
      const menu = activeMenu;
      if (menu && menu.onBack) menu.onBack();
    }
  },
  Input: {
    edit: (config, callback) => {
      active = 'keyboard';
      input = {
        config,
        complete(value) {
          // This is Lampa.Input.edit's real post-keyboard controller side effect.
          active = 'settings_component';
          callback(value);
        }
      };
    }
  },
  Player: {
    play: (item) => { launched = item; },
    playlist: () => { playlistCalls++; }
  }
};

function deliverFullEvent() {
  fullListeners.slice().forEach((listener) => listener({
    type: 'complite',
    data: {movie: {original_name: 'Dexter', first_air_date: '2006-10-01'}},
    object: {activity: {render: () => root}}
  }));
}
function openMenu() {
  active = 'full_start';
  button.handlers.enter.call(button);
  assert.equal(active, 'select', 'launcher opens Select');
}
function itemForEpisode(n) {
  return activeMenu.items.find((item) => item.episode === n);
}

vm.runInNewContext(plugin, context);
assert.equal(fullListeners.length, 1, 'one full listener is registered');
deliverFullEvent();
assert.equal(typeof button.handlers.enter, 'function', 'Dexter launcher is injected and bound');

openMenu();
context.Lampa.Select.close();
assert.equal(active, 'full_start', 'Back restores the original full-card controller');
assert.ok(focusCalls > 0, 'Back restores focus to the launcher');

openMenu();
activeMenu.onSelect(itemForEpisode(1));
assert.equal(active, 'full_start', 'episode selection fully closes Select and restores card navigation');
assert.equal(launched.url, storage.dexter_dtv_s1_e1, 'v0.1 saved URL remains playable');
assert.equal(launched.playlist.length, 12, 'all bundled episode sources are supplied in Player.play data');
assert.equal(Array.from(launched.playlist, (item) => item.episode).join(','),
  '1,2,3,4,5,6,7,8,9,10,11,12', 'playlist has one correctly numbered entry per episode');
assert.equal(new Set(launched.playlist.map((item) => item.url)).size, 12,
  'every episode has its own distinct source URL');
assert.ok(launched.playlist.every((item) => /manifest\.m3u8(?:[?#]|$)/i.test(item.url)),
  'all bundled episode sources are HLS manifests');
assert.equal(playlistCalls, 0, 'playlist is not sent too late after Player.play');

openMenu();
activeMenu.onLong(itemForEpisode(2));
assert.equal(active, 'keyboard', 'long OK opens the replacement editor');
input.complete('');
assert.equal(active, 'full_start', 'cancelled input restores card controller, not settings_component');

openMenu();
activeMenu.onLong(itemForEpisode(2));
assert.equal(active, 'keyboard', 'long OK closes menu before opening the nested editor');
input.complete('https://cdn.example.org/show/s01e02/manifest.m3u8');
assert.equal(storage.dexter_dtv_s1_e2, 'https://cdn.example.org/show/s01e02/manifest.m3u8', 'edited URL is stored');
assert.equal(active, 'select', 'successful edit reopens exactly one fresh menu');
context.Lampa.Select.close();
assert.equal(active, 'full_start', 'Back after nested editor still restores navigation');

openMenu();
const batch = activeMenu.items.find((item) => item.action === 'batch');
activeMenu.onSelect(batch);
input.complete('1=https://cdn.example.org/show/s01e01/new.m3u8\n2=https://cdn.example.org/show/s01e02/new.m3u8');
assert.equal(storage.dexter_dtv_s1_e1, 'https://cdn.example.org/show/s01e01/new.m3u8', 'batch import preserves episode mapping');
assert.equal(storage.dexter_dtv_s1_e2, 'https://cdn.example.org/show/s01e02/new.m3u8', 'batch import saves second URL');
assert.equal(active, 'select', 'batch import returns to a usable menu');
context.Lampa.Select.close();

openMenu();
activeMenu.onLong(itemForEpisode(1));
const unchangedSavedUrl = input.config.value;
input.complete(unchangedSavedUrl);
assert.equal(active, 'select', 'confirming a saved URL returns to episodes without opening API-key input');
assert.equal(storage.dexter_dtv_s1_e1, unchangedSavedUrl, 'confirming a saved URL does not alter its own slot');
context.Lampa.Select.close();

openMenu();
activeMenu.onSelect(activeMenu.items.find((item) => item.action === 'api'));
input.complete('');
assert.equal(active, 'select', 'cancelling API configuration returns to a usable episode menu');
context.Lampa.Select.close();

// Re-evaluating the plugin simulates Lampa loading the same plugin URL again.
vm.runInNewContext(plugin, context);
assert.equal(fullListeners.length, 1, 'reload removes the previous full listener');
deliverFullEvent();
assert.equal(typeof button.handlers.enter, 'function', 'reload rebinds existing launcher without duplicating it');
openMenu();
assert.equal(activeMenu.items.filter((item) => item.episode).length, 12, 'reopened menu has one entry per episode');
context.Lampa.Select.close();

assert.ok(selectCloses >= 7, 'every exit path uses Select.close rather than leaving an invisible Select controller');
assert.ok(controllerToggles.every((name) => name === 'full_start' || name === 'select'), 'no hard-coded content controller is used');

async function testAutoResolverIntegration() {
  let receivedRequest = null;
  context.window.DexterDtvRezkaResolver = {
    resolveEpisode: (request) => {
      receivedRequest = request;
      return Promise.resolve({url: 'https://media.example.invalid/fresh/manifest.m3u8', quality: '720p', expiresAt: null});
    }
  };
  openMenu();
  activeMenu.onSelect(activeMenu.items.find((item) => item.action === 'auto'));
  assert.equal(active, 'select', 'automatic-source option opens an episode picker');
  activeMenu.onSelect(itemForEpisode(3));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(receivedRequest.show, 'dexter');
  assert.equal(receivedRequest.season, 1);
  assert.equal(receivedRequest.episode, 3);
  assert.equal(receivedRequest.voice, 'novamedia');
  assert.equal(launched.url, 'https://media.example.invalid/fresh/manifest.m3u8', 'fresh resolver output launches Player');
  assert.equal(launched.playlist.find((item) => item.episode === 3).url, launched.url, 'fresh source is in the launch playlist');
  assert.equal(storage.dexter_dtv_s1_e3, undefined, 'automatic resolver output is never saved');

  context.window.DexterDtvRezkaResolver = {
    resolveEpisode: () => Promise.reject({code: 'BROWSER_VERIFICATION'})
  };
  openMenu();
  activeMenu.onSelect(activeMenu.items.find((item) => item.action === 'auto'));
  activeMenu.onSelect(itemForEpisode(4));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(active, 'full_start', 'resolver diagnostic leaves remote navigation on the card');
}

async function testPrivateMediaApiContract() {
  const calls = [];
  context.XMLHttpRequest = function () {
    this.headers = {};
    this.open = (method, url) => { this.method = method; this.url = url; };
    this.setRequestHeader = (name, value) => { this.headers[name] = value; };
    this.send = (body) => {
      calls.push({method: this.method, url: this.url, headers: this.headers, body});
      this.status = 200;
      this.readyState = 4;
      this.responseText = JSON.stringify({ok: true, data: {url: 'https://media.example.invalid/api/manifest.m3u8', expiresAt: null}});
      this.onreadystatechange();
    };
  };
  storage.dexter_dtv_v2_resolver = 'https://autoposter.example/api/internal/media/resolve';
  storage.dexter_dtv_v2_device_key = 'pm_abcdefghijklmnopqrstuvwxyz1234567890';
  openMenu();
  activeMenu.onSelect(itemForEpisode(5));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.length, 0, 'an embedded episode source bypasses the optional private API');
  assert.ok(/manifest\.m3u8$/i.test(launched.url), 'embedded HLS starts directly');
  assert.equal(storage.dexter_dtv_s1_e5, undefined, 'embedded sources are not copied to device storage');

  storage.dexter_dtv_s1_e5 = 'not-a-media-url';
  openMenu();
  activeMenu.onSelect(itemForEpisode(5));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.length, 1, 'API remains available when a slot has no valid direct URL');
  assert.equal(calls[0].method, 'POST', 'private API contract uses POST');
  assert.equal(calls[0].url, storage.dexter_dtv_v2_resolver, 'episode parameters are not placed in the URL');
  assert.equal(calls[0].headers.Authorization, 'Bearer ' + storage.dexter_dtv_v2_device_key, 'device key uses Authorization');
  assert.deepEqual(JSON.parse(calls[0].body), {show: 'dexter', season: 1, episode: 5, voice: 'novamedia'});
  assert.equal(launched.url, 'https://media.example.invalid/api/manifest.m3u8', 'enveloped API result launches Player');
  delete storage.dexter_dtv_s1_e5;

  openMenu();
  activeMenu.onSelect(itemForEpisode(1));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.length, 1, 'saved direct URLs do not add another optional API call');
  assert.equal(launched.url, storage.dexter_dtv_s1_e1, 'saved direct URL remains the playback priority');
}

testAutoResolverIntegration().then(testPrivateMediaApiContract).then(() => {
  console.log('PASS: remote navigation, focus restoration, long-OK editing, 12 unique HLS playlist entries, auto-resolver isolation, and API-independent playback');
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
