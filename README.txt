# Dexter DTV / Novamedia for Lampa and ByLampa — v0.4.0

Dexter DTV adds a first-season menu with 12 separate episode slots to the Dexter (2006) card. It sends the chosen video and its playlist through Lampa.Player; select DDD Video Player in Lampa if it is the Android TV player you use.

## Install or update in ByLampa

1. Open **Settings → Extensions → Add plugin**.
2. Enter https://kpavchenko.github.io/dexter-dtv/dexter-dtv.js.
3. Restart Lampa, then open the **Dexter (2006)** card.
4. Choose **Декстер · DTV**.

If an older copy is already installed at this URL, restart Lampa after updating; v0.4.0 removes its previous listener before registering a new one.

## Saved direct links

The normal, independent playback mode is saved direct links:

- Long-press OK on an episode and enter a direct HTTPS .m3u8, .mp4, or .mpd media URL.
- The URL is stored only in Lampa.Storage on this device, in that episode's own slot: dexter_dtv_s1_e1 through dexter_dtv_s1_e12.
- Selecting a saved episode starts its saved URL immediately. It does not contact Rezka or require Autoposter.
- Long-press OK again to replace only that episode's URL. Other episode slots are unchanged.
- Confirming the unchanged value returns to the episode list.

One observed first-episode HLS URL continued to work for about 15 hours after it was obtained. Its actual expiry period is unknown; the plugin does not label saved links permanent.

Use **Импорт ссылок пачкой** for lines such as 1=https://…/manifest.m3u8, one line per episode. Never put direct URLs with temporary parameters into the repository, logs, or public messages.

## Optional sources

- **Личный HTTPS API** is optional. Configure an authorized Autoposter-compatible endpoint and its device key through **Автоисточник · API**. The plugin uses a POST request with the episode data and stores the key only in local Lampa.Storage. It is used for an empty episode slot; it never replaces or blocks a saved direct link.
- **Получить ссылку автоматически (эксперимент)** only reads CORS-accessible public HTML and declared iframes. It does not bypass human verification, reuse cookies, replay protected requests, or construct opaque paths. A blocked source reports a diagnostic and leaves remote navigation usable.

## What to check on Haier Android TV

1. Open the launcher and traverse all 12 episodes with the remote.
2. Press Back from the menu and from an input: focus must return to the Dexter card.
3. Add a URL, reopen the menu, confirm it unchanged, then replace it.
4. Start a saved episode in DDD and verify the playlist contains the saved episodes.
5. With the private API configured, start a saved episode and confirm it does not request the API.
6. Restart Lampa and verify there is exactly one Dexter DTV button and handler.

Developer checks:

~~~text
node scripts/build.cjs
node --check dexter-dtv.js
node --check src/resolver/rezka.js
node test-resolver.cjs
node test-plugin.cjs
~~~
