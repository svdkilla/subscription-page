# Subscription page security and operations

## How configuration moves through the service

The panel API is the source of truth. Each PM2 worker caches a configuration by UUID for 1 to 5 seconds, and concurrent misses for the same UUID share one upstream request. A worker can fall back to a validated last-known-good copy for a bounded period. A panel `404` removes that copy at once. Invalid panel data never enters the cache.

The protected app-config response uses a content-derived ETag. Browsers can send `If-None-Match` and receive `304` when nothing changed. Responses carry `private, no-cache, must-revalidate`, while `CDN-Cache-Control` and `Surrogate-Control` both disable shared caching. The frontend checks for changes every 20 seconds and also refreshes after focus or visibility events.

`customLinks` stays backward compatible. A missing field means an empty array. Links have a stable ID, localized label, URI, action, order, optional icon, and one of three modes: literal URI, fixed template substitution, or protocol selection from the user's subscription links. The server never fetches a custom-link URI.

The three repositories currently keep small adapters around `@remnawave/subscription-page-types` 0.4.0. Publish the shared schema before replacing those adapters. Both consumers must move to the same real package version in one release.

## Security boundaries

- Public files come from one absolute build directory. Only `GET` and `HEAD` pass the public request guard. Dotfiles, source maps, traversal, double decoding, mixed slashes, Windows paths, and sensitive filenames are rejected.
- App-config requires a short-lived HS256 session cookie with the expected issuer, audience, and claims. The cookie is `HttpOnly`, `Secure`, and `SameSite=Strict`.
- SVG is cleaned when the panel accepts a configuration and again before display. The allowlist excludes scripts, events, embedded HTML, external references, CSS, oversized documents, and deep element trees.
- Localized guide text keeps a small formatting subset. It cannot create links, images, SVG, events, or arbitrary attributes.
- Button and branding URLs use explicit scheme checks. HTTP links pass through the platform URL parser. App links use a fixed scheme list and fixed template names. No template is evaluated as code.
- The reverse proxy must overwrite forwarded headers. The application trusts a configured hop count, reads the raw `Host` header for its allowlist, requires HTTPS from the trusted hop, and ignores `X-Forwarded-Host` for host authorization.
- Production containers run as UID 1000 with a read-only root filesystem, `no-new-privileges`, no Linux capabilities, a PID limit, and a small `/tmp` tmpfs. Published ports bind to `127.0.0.1`.

## API token scopes

Give the subscription page a dedicated token. The smallest working set is:

- `system:metadata`
- `subscription-page-configs:list`
- `subscription-page-configs:get`
- `subscriptions:subpage-config`
- `subscriptions:get`

Add `users:by-username` only when Marzban legacy links are enabled. Do not grant wildcard scopes or any write scope. `subscriptions:get` is required because the browser bootstrap now reads extended subscription information through an authenticated panel endpoint.

## Production setup

Build from the committed lock files with `npm ci`. Put the panel token and JWT key in Docker secrets through `REMNAWAVE_API_TOKEN_FILE` and `INTERNAL_JWT_SECRET_FILE`. The JWT key needs at least 32 random characters and must be separate from every panel secret.

Set `ALLOWED_HOSTS` to the public subscription hostnames. Set `TRUST_PROXY` to the exact number of proxy hops. TLS ends at that proxy, which must replace `X-Forwarded-For`, set `X-Forwarded-Proto: https`, clear `X-Forwarded-Host`, and reject unknown `Host` values. Keep the application port on loopback or an internal Docker network.

These safe probes must return a generic `400`, `401`, or `404` with no file content:

```sh
curl -i https://subscriptions.example/.env
curl -i https://subscriptions.example/package.json
curl -i https://subscriptions.example/node_modules/x/package.json
curl -i https://subscriptions.example/proc/self/environ
curl -i 'https://subscriptions.example/%2e%2e/%2e%2e/etc/passwd'
curl -i 'https://subscriptions.example/%252e%252e/%252e%252e/etc/passwd'
curl -i https://subscriptions.example/assets/.app-config-v2.json
```

Release CI should run type checks, lint, unit and integration tests, production builds, Playwright, dependency audit, secret scanning, `docker compose config`, and a health check against the read-only container.
