# Experimental Auto Resolver: minimal Autoposter contract

## Current feasibility

The direct browser experiment requested the Dexter Novamedia season page on 2026-09-25. The server returned an anti-bot document (“Проверяем, человек ли вы”) rather than the series HTML. That response contains an interactive iframe challenge and does not send the Access-Control-Allow-Origin header.

Consequences:

- ByLampa's browser fetch cannot read this response from another origin.
- A normal Android TV WebView has the same CORS restriction.
- No player HTML, iframe, JSON configuration, or HLS URL was available to inspect after the challenge.
- The plugin deliberately does not solve the challenge, reuse cookies, replay protected requests, or synthesize opaque media paths.

src/resolver/rezka.js can only parse a page or declared iframe that the browser can legally read. It reports BROWSER_VERIFICATION, CORS_OR_NETWORK, SOURCE_UNAVAILABLE, or SOURCE_FORMAT_UNSUPPORTED instead of exposing a URL in diagnostics.

## When a server component is necessary

Use a server only if it has a legitimate, authorized source of the episode metadata and can return an HLS URL without bypassing interactive verification. A server does not remove the source site's access rules; it must return the same diagnostic when it lacks authorized access.

The existing Autoposter project is not changed by this repository. If it is authorized to provide this function, it can expose this minimal endpoint:

~~~
GET /resolve?show=dexter&season=1&episode=3&voice=novamedia
Accept: application/json
~~~

Successful response:

~~~json
{
  "url": "https://…/manifest.m3u8",
  "quality": "720p",
  "expiresAt": null
}
~~~

Failure response:

~~~json
{
  "error": {
    "code": "BROWSER_VERIFICATION",
    "message": "Источник требует интерактивную проверку человека."
  }
}
~~~

Operational requirements:

- Allow the ByLampa origin with a narrow CORS policy; do not use * if credentials are ever introduced.
- Do not log full media URLs, query tokens, cookies, or response bodies.
- Treat URLs as short-lived: do not persist them in the plugin, and cache only non-secret metadata for a short, explicit TTL.
- Validate show, season 1, episode 1..12, and voice=novamedia|dtv.
- Return a 4xx/5xx status plus the stable diagnostic code for blocked, unavailable, unsupported, or invalid requests.
