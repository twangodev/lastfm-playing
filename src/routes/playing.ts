import { Hono } from "hono";
import type { Env } from "../types/env";
import { allowlist } from "../middleware/allowlist";
import { fetchNowPlaying } from "../services/lastfm";
import { getCached, putCached } from "../lib/cache";
import { shapeResponse } from "../lib/response";

const playing = new Hono<Env>();

playing.get("/:username", allowlist, async (c) => {
  const username = c.req.param("username").toLowerCase();
  const ttl = parseInt(c.env.CACHE_TTL, 10) || 30;

  // Check cache
  const cached = await getCached(username);
  if (cached) {
    const body = await cached.text();
    return c.json(JSON.parse(body), 200, {
      "Cache-Control": `public, max-age=${ttl}`,
      "X-Cache": "HIT",
    });
  }

  // Fetch from Last.fm
  const result = await fetchNowPlaying(username, c.env.LASTFM_API_KEY);

  // Handle Last.fm errors
  if ("error" in result) {
    if (result.error === 6) {
      return c.json(
        {
          error: "not_found",
          message: `Last.fm user '${username}' was not found.`,
        },
        404
      );
    }
    return c.json(
      {
        error: "upstream_error",
        message: "Last.fm API returned an error.",
        detail: result.message,
      },
      502
    );
  }

  // Shape response
  const shaped = shapeResponse(username, result.recenttracks.track);
  const body = JSON.stringify(shaped);

  // Cache asynchronously
  c.executionCtx.waitUntil(putCached(username, body, ttl));

  return c.json(shaped, 200, {
    "Cache-Control": `public, max-age=${ttl}`,
    "X-Cache": "MISS",
  });
});

export { playing };
