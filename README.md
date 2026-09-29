# lastfm-playing

[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com)
[![Hono](https://img.shields.io/badge/Hono-v4-E36002?logo=hono&logoColor=white)](https://hono.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Last.fm](https://img.shields.io/badge/Last.fm-API-D51007?logo=lastdotfm&logoColor=white)](https://www.last.fm/api)
[![License](https://img.shields.io/github/license/twangodev/lastfm-playing)](LICENSE)

A lightweight Cloudflare Worker that exposes a user's currently playing Last.fm track as a JSON API.

## API

### `GET /playing/:username`

Returns the currently playing track for a Last.fm user. Public usernames are enabled by default; `ALLOWED_USERS` can restrict access.

**Response:**

```json
{
  "status": "playing",
  "user": "twangodev",
  "observed_at": "2026-09-28T23:00:00.000Z",
  "stale": false,
  "track": {
    "name": "Redbone",
    "artist": "Childish Gambino",
    "album": "Awaken, My Love!",
    "url": "https://www.last.fm/music/...",
    "image": {
      "small": "https://...",
      "medium": "https://...",
      "large": "https://...",
      "extralarge": "https://..."
    }
  }
}
```

When nothing is playing, `status` is `"idle"` and `track` is `null`.

### `GET /health`

Returns `{ "status": "ok" }`.

## Setup

### Prerequisites

- [Node.js](https://nodejs.org)
- A [Last.fm API key](https://www.last.fm/api/account/create)
- A [Cloudflare](https://cloudflare.com) account (for deployment)

### Install

```sh
pnpm install
```

### Configure

Create a `.dev.vars` file for local development:

```
LASTFM_API_KEY=your_api_key_here
```

Adjust the public variables in `wrangler.jsonc` as needed:

| Variable        | Description                                         | Default         |
| --------------- | --------------------------------------------------- | --------------- |
| `ALLOWED_USERS` | Comma-separated list of permitted Last.fm usernames | `*` (all users) |
| `CORS_ORIGIN`   | Allowed CORS origin(s)                              | `*`             |
| `CACHE_TTL`     | Cache duration in seconds (clamped to 30–60)        | `30`            |

### Development

```sh
pnpm dev
```

### Deploy

Set the API key as a secret in Cloudflare:

```sh
pnpm wrangler secret put LASTFM_API_KEY
```

Then deploy:

```sh
pnpm deploy
```

## Cache and rate limiting

Cloudflare's native rate-limiting binding allows five upstream requests per ten
seconds, using one key shared by all usernames **within each Cloudflare location**.
It is an approximate regional limit, can allow bursts, and is not a global quota.
No Durable Object or database is required.

Fresh cached results bypass the limiter. The Cache API stores each username's
response locally for up to two minutes; results are refreshed after 30 seconds
by default. Concurrent requests for the same username share one fetch within a
Worker isolate. Separate isolates and regions can still make separate requests.

When the limit is reached or Last.fm fails, the service may return cached data
with `stale: true`. `observed_at` remains the time of the last successful upstream
fetch. Clients must stop displaying it two minutes after that timestamp. With
no usable cache, the endpoint returns HTTP 429 or 502 and `Retry-After`.

Upstream failures create a regional cooldown in the Cache API, with increasing
backoff and support for upstream `Retry-After`. Cache entries can be evicted and
concurrent writes are not coordinated, so cooldowns are best effort. The native
rate limiter remains the request gate when no cache entry exists. Cache failures
are logged separately and do not discard a valid upstream response or count as
Last.fm failures.

Zod schemas validate Last.fm responses before caching them. Unexpected responses
produce errors instead of a false idle status. Start times and loved-track status
are not provided by this endpoint.

## Validation and rollout

```sh
pnpm check
pnpm test
pnpm exec wrangler deploy --dry-run
```

Keep the existing `LASTFM_API_KEY` secret. Deploy this service before releasing
clients that require `observed_at`; the old response has no freshness metadata.
Integration tests mock Last.fm and exercise the native binding locally.
