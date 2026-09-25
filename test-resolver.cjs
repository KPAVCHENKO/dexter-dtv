'use strict';

const assert = require('node:assert/strict');
const {resolveEpisode, episodePage} = require('./src/resolver/rezka.js');

function response(html, url) {
  return {ok: true, type: 'basic', url: url || 'https://source.example/page', text: () => Promise.resolve(html)};
}

async function rejectsWith(run, code) {
  await assert.rejects(run, (error) => error && error.code === code);
}

async function main() {
  assert.equal(episodePage(1).endsWith('/1-sezon'), true, 'episode one uses the real season page');
  assert.equal(episodePage(3).endsWith('/1-sezon/3-serija'), true, 'later episodes use the known series route');

  await rejectsWith(
    () => resolveEpisode({
      show: 'dexter', season: 1, episode: 1, voice: 'novamedia',
      fetch: () => Promise.resolve(response('<title>Один момент</title><div>Проверяем, человек ли вы</div>'))
    }),
    'BROWSER_VERIFICATION'
  );

  await rejectsWith(
    () => resolveEpisode({
      show: 'dexter', season: 1, episode: 1, voice: 'novamedia',
      fetch: () => Promise.reject(new TypeError('Failed to fetch'))
    }),
    'CORS_OR_NETWORK'
  );

  const result = await resolveEpisode({
    show: 'dexter', season: 1, episode: 3, voice: 'novamedia',
    fetch: () => Promise.resolve(response('quality: 720p, file: \"https:\\/\\/media.example.invalid\\/opaque\\/manifest.m3u8?temporary=redacted\"'))
  });
  assert.equal(result.quality, '720p', 'quality is parsed from accessible player data');
  assert.equal(result.url.startsWith('https://media.example.invalid/'), true, 'direct HLS is returned only from a readable document');
  assert.equal(result.expiresAt, null);

  let calls = 0;
  const frameResult = await resolveEpisode({
    show: 'dexter', season: 1, episode: 2, voice: 'dtv',
    fetch: (url) => {
      calls++;
      return Promise.resolve(calls === 1
        ? response('<iframe src=\"/embedded-player\"></iframe>', url)
        : response('https://media.example.invalid/embed/manifest.m3u8', url));
    }
  });
  assert.equal(calls, 2, 'a declared iframe is read once through the same CORS-safe path');
  assert.equal(frameResult.quality, '720p', 'known 720p source is used when player data omits a label');

  await rejectsWith(
    () => resolveEpisode({show: 'dexter', season: 2, episode: 1, voice: 'novamedia', fetch: () => Promise.resolve(response(''))}),
    'UNSUPPORTED_EPISODE'
  );
  console.log('PASS: resolver routes, challenge/CORS diagnostics, readable HLS, iframe, and request validation');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
