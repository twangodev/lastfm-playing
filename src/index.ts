import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./types/env";
import { playing } from "./routes/playing";

const app = new Hono<Env>();

// CORS middleware
app.use("*", async (c, next) => {
  const origins =
    c.env.CORS_ORIGIN === "*"
      ? "*"
      : c.env.CORS_ORIGIN.split(",").map((o) => o.trim());

  const middleware = cors({
    origin: origins,
    allowMethods: ["GET", "OPTIONS"],
    maxAge: 86400,
  });
  return middleware(c, next);
});

// Health check
app.get("/health", (c) => c.json({ status: "ok" }));

// Routes
app.route("/playing", playing);

// Global error handler
app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.json(
    { error: "internal_error", message: "An unexpected error occurred." },
    500
  );
});

// 404 fallback
app.notFound((c) =>
  c.json({ error: "not_found", message: "Route not found." }, 404)
);

export default app;
