import { Hono } from "hono";
import type { Env } from "../types/env";
import { allowlist } from "../middleware/allowlist";
import { ListeningCache } from "../lib/cache";
import { ListeningService } from "../services/listening";

const playing = new Hono<Env>();
playing.get("/:username", allowlist, async (c) => {
  const cache = await ListeningCache.open();
  const service = new ListeningService(c.env, cache);
  const result = await service.get(c.req.param("username").toLowerCase());
  return c.json(result.body, result.status, {
    "Cache-Control": "no-store",
    ...(result.retryAfter ? { "Retry-After": String(result.retryAfter) } : {}),
  });
});
export { playing };
