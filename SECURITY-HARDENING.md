# Subscription page security and operations

## Architecture

Each PM2 worker treats the panel API as the source of truth. Configurations are keyed by UUID and loaded through a 1–5 second cache-aside cache. Concurrent misses for one UUID are coalesced. A validated last-known-good value may be served only for the configured bounded interval; a panel 404 evicts it immediately, and invalid data never replaces it. This design needs no cross-worker mutable state and therefore works with multiple PM2 instances.

The authenticated app-config response has a content-derived ETag and supports `If-None-Match`. It is marked `private, no-cache, must-revalidate`, with CDN caching explicitly disabled. The browser polls every 20 seconds and refreshes on focus/visibility changes without re-rendering on 304.

`customLinks` is a backward-compatible array (missing means `[]`). Each item has a stable ID, enabled state, localized display name, URI, one action (`open`, `copy`, or `qr`), optional icon key, order, and mode (`literal`, allowlisted template substitution, or protocol selection from subscription links). URI schemes are centrally allowlisted; HTTP(S) uses the URL parser and VPN schemes use strict syntax and length checks. User URIs are never fetched by the server.

Until a new `@remnawave/subscription-page-types` release is published, the three applications use documented, backward-compatible local adapters around version 0.4.0. Publish the shared schema first, replace the adapters with that exact released version, and remove the duplicated compatibility modules in one coordinated release.

## Threat model and controls

- Public page/static files: immutable absolute build root, GET/HEAD only, dotfiles and source maps denied, strict extension/path allowlist, traversal and double-decoding rejection, generic errors and rate limits.
- Panel API/token: the token remains server-only and should have only metadata, subscription-info, config list/get, and unavoidable subscription read scopes. Request/response proxy headers use allowlists and logs redact UUIDs, tokens, user links, and subscription identifiers.
- App-config: signed short-lived HS256 session cookie with issuer, audience and required claims; `HttpOnly`, `Secure`, `SameSite=Strict`; private cache policy and no public invalidation endpoint.
- Links/SVG: exact URI scheme parsing, fixed template variables and no evaluation. SVG is sanitized on panel write/import and again at the render boundary with narrow tag/attribute allowlists, size/complexity limits and external references disabled.
- HTTP/reverse proxy: restrictive CSP (`object-src` and `base-uri` none; no `unsafe-eval`), no-referrer, Permissions-Policy, HSTS, host allowlist, checked forwarded protocol and an explicit proxy-hop count.
- Containers: non-root user, read-only root filesystem, all capabilities dropped, no-new-privileges, init, PID limit, `/tmp` tmpfs and health check. No host directories, panel filesystem, `.env`, or Docker socket are mounted.

## Build and secure operation

Build with the committed lock files (`npm ci`) and the production Dockerfile. Supply `REMNAWAVE_API_TOKEN_FILE` and `INTERNAL_JWT_SECRET_FILE` as Docker secrets; use a separate random secret of at least 32 characters. Set `ALLOWED_HOSTS` to the public subscription hosts and set `TRUST_PROXY` to the exact number of trusted reverse-proxy hops. Terminate TLS at the trusted proxy, preserve `X-Forwarded-Proto: https`, and keep HSTS enabled there and in the application. Bind published ports to `127.0.0.1` or an internal network only.

Example negative checks (all must return 404/401 without file contents):

```sh
curl -i https://subscriptions.example/.env
curl -i https://subscriptions.example/package.json
curl -i https://subscriptions.example/node_modules/x/package.json
curl -i https://subscriptions.example/proc/self/environ
curl -i 'https://subscriptions.example/%2e%2e/%2e%2e/etc/passwd'
curl -i 'https://subscriptions.example/%252e%252e/%252e%252e/etc/passwd'
curl -i https://subscriptions.example/assets/.app-config-v2.json
```

Before release, run type checking, lint, unit/integration tests, production builds, Playwright E2E, dependency audit, secret scanning, `docker compose config`, and container health/read-only checks in CI.
