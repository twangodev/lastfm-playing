import { createMiddleware } from "hono/factory";
import type { Env } from "../types/env";

export const allowlist = createMiddleware<Env>(async (c, next) => {
  const username = c.req.param("username")?.toLowerCase();
  if (!username || !/^[a-z0-9_-]{1,50}$/.test(username)) {
    return c.json(
      {
        error: "bad_request",
        message: "A valid Last.fm username is required.",
      },
      400,
    );
  }

  const allowed = c.env.ALLOWED_USERS.split(",").map((u) =>
    u.trim().toLowerCase(),
  );

  if (!allowed.includes("*") && !allowed.includes(username)) {
    return c.json(
      {
        error: "forbidden",
        message: `User '${username}' is not in the allowlist.`,
      },
      403,
    );
  }

  await next();
});
