# lastfm-playing

[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com)
[![Hono](https://img.shields.io/badge/Hono-v4-E36002?logo=hono&logoColor=white)](https://hono.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Last.fm](https://img.shields.io/badge/Last.fm-API-D51007?logo=lastdotfm&logoColor=white)](https://www.last.fm/api)
[![License](https://img.shields.io/github/license/twangodev/lastfm-playing)](LICENSE)

A lightweight Cloudflare Worker that exposes a user's currently playing Last.fm track as a JSON API.

## API

### `GET /playing/:username`

Returns the currently playing (or most recently played) track for an allowlisted Last.fm user.

**Response:**

```json
{
  "status": "playing",
  "user": "twangodev",
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

| Variable        | Description                                         | Default     |
|-----------------|-----------------------------------------------------|-------------|
| `ALLOWED_USERS` | Comma-separated list of permitted Last.fm usernames | `twangodev` |
| `CORS_ORIGIN`   | Allowed CORS origin(s)                              | `*`         |
| `CACHE_TTL`     | Cache duration in seconds                           | `30`        |

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