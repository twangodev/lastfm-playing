import { env as bindings } from "cloudflare:workers";
import { reset } from "cloudflare:test";
import {
  afterEach,
  beforeEach,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";
import app from "../index";
import type { Env } from "../types/env";

const endpoint = "https://listening.example/playing/";
const payload = {
  recenttracks: {
    track: [
      {
        name: "Song",
        artist: { "#text": "Artist" },
        album: { "#text": "Album" },
        url: "https://www.last.fm/music/Artist/_/Song",
        image: [],
        "@attr": { nowplaying: "true" },
      },
    ],
  },
};
let now: number;
let env: Env["Bindings"];
let limit: ReturnType<typeof vi.fn<RateLimit["limit"]>>;
let upstream: MockInstance<typeof fetch>;

beforeEach(() => {
  now = Date.now();
  vi.spyOn(Date, "now").mockImplementation(() => now);
  limit = vi.fn<RateLimit["limit"]>().mockResolvedValue({ success: true });
  env = { ...(bindings as Env["Bindings"]), LASTFM_RATE_LIMITER: { limit } };
  upstream = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (input, init) => {
      new Request(input, init);
      return Response.json(payload);
    });
});
afterEach(async () => {
  vi.restoreAllMocks();
  await reset();
});

async function playing(username: string) {
  const response = await app.request(endpoint + username, {}, env);
  const body = (await response.json()) as Record<string, unknown>;
  return {
    status: response.status,
    retryAfter: response.headers.get("Retry-After"),
    body,
  };
}

it("coalesces simultaneous requests and serves fresh cache without using the limiter", async () => {
  const results = await Promise.all(
    Array.from({ length: 8 }, () => playing("alice")),
  );
  expect(results.every((r) => r.body.status === "playing")).toBe(true);
  expect(upstream).toHaveBeenCalledTimes(1);
  expect(limit).toHaveBeenCalledExactlyOnceWith({ key: "lastfm-api" });
  await playing("alice");
  expect(limit).toHaveBeenCalledTimes(1);
});

it("uses the same rate-limit key for every username and stops denied requests", async () => {
  await playing("alice");
  limit.mockResolvedValue({ success: false });
  const denied = await playing("bob");
  expect(denied.status).toBe(429);
  expect(denied.retryAfter).toBe("10");
  expect(limit.mock.calls).toEqual([
    [{ key: "lastfm-api" }],
    [{ key: "lastfm-api" }],
  ]);
  expect(upstream).toHaveBeenCalledTimes(1);
});

it("preserves observation time during regional cooldown and expires stale tracks", async () => {
  const first = await playing("alice");
  now += 31_000;
  upstream.mockImplementation(async () =>
    Response.json({ error: 29, message: "Rate limited" }),
  );
  const stale = await playing("alice");
  expect(stale.body.stale).toBe(true);
  expect(stale.body.observed_at).toBe(first.body.observed_at);
  expect((await playing("bob")).status).toBe(429);
  expect(upstream).toHaveBeenCalledTimes(2);
  now += 60_000;
  await playing("alice");
  expect(upstream).toHaveBeenCalledTimes(3);
  now += 30_000;
  const expired = await playing("alice");
  expect(expired.status).toBe(429);
  expect(expired.body.track).toBeUndefined();
});

it("returns cached stale tracks on limiter denial without extending their age", async () => {
  const first = await playing("alice");
  limit.mockResolvedValue({ success: false });
  now += 31_000;
  const stale = await playing("alice");
  expect(stale.status).toBe(200);
  expect(stale.body).toMatchObject({
    stale: true,
    observed_at: first.body.observed_at,
  });
  now += 90_000;
  expect((await playing("alice")).status).toBe(429);
  expect(upstream).toHaveBeenCalledTimes(1);
});

it.each([
  { unexpected: "response" },
  { recenttracks: { track: [{ name: "Song" }] } },
  {
    recenttracks: {
      track: [{ ...payload.recenttracks.track[0], "@attr": { nowplaying: 1 } }],
    },
  },
])("rejects malformed upstream data using the schema", async (body) => {
  upstream.mockImplementation(async () => Response.json(body));
  expect((await playing("alice")).status).toBe(502);
  expect((await playing("bob")).status).toBe(429);
  expect(upstream).toHaveBeenCalledTimes(1);
});

it("honors upstream Retry-After across usernames", async () => {
  upstream.mockImplementation(
    async () =>
      new Response("Unavailable", {
        status: 429,
        headers: { "Retry-After": "300" },
      }),
  );
  const response = await playing("alice");
  expect(response.status).toBe(429);
  expect(response.retryAfter).toBe("300");
  now += 200_000;
  expect((await playing("bob")).status).toBe(429);
  expect(upstream).toHaveBeenCalledTimes(1);
});

it("replaces cached playing data with genuine idle", async () => {
  await playing("alice");
  now += 31_000;
  upstream.mockImplementation(async () =>
    Response.json({ recenttracks: { track: [] } }),
  );
  expect((await playing("alice")).body).toMatchObject({
    status: "idle",
    track: null,
    stale: false,
  });
  expect((await playing("alice")).body.status).toBe("idle");
});

it("validates usernames and supports restricting the public endpoint", async () => {
  expect((await playing("bad%20name")).status).toBe(400);
  env.ALLOWED_USERS = "alice";
  expect((await playing("bob")).status).toBe(403);
  expect(upstream).not.toHaveBeenCalled();
  expect(limit).not.toHaveBeenCalled();
});

it("enforces the configured native Cloudflare binding in the local runtime", async () => {
  env = bindings as Env["Bindings"];
  for (let i = 0; i < 5; i++)
    expect((await playing(`user${i}`)).status).toBe(200);
  expect((await playing("user5")).status).toBe(429);
  expect(upstream).toHaveBeenCalledTimes(5);
});

it.each(["match", "put", "delete"] as const)(
  "preserves successful upstream data when cache %s fails",
  async (operation) => {
    const cache = await caches.open("lastfm-playing-v2");
    vi.spyOn(caches, "open").mockResolvedValue(cache);
    const write = vi.spyOn(cache, "put");
    vi.spyOn(cache, operation).mockRejectedValue(
      new Error("cache unavailable"),
    );
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});

    for (const username of ["alice", "bob"]) {
      const result = await playing(username);
      expect(result.status).toBe(200);
      expect(result.body).toMatchObject({ status: "playing", stale: false });
    }
    expect(upstream).toHaveBeenCalledTimes(2);
    expect(limit).toHaveBeenCalledTimes(2);
    expect(
      write.mock.calls.some(([key]) =>
        String(key).includes("upstream-cooldown"),
      ),
    ).toBe(false);
    expect(warning).toHaveBeenCalled();
  },
);

it("keeps rate limiting when the cache cannot be opened", async () => {
  vi.spyOn(caches, "open").mockRejectedValue(new Error("cache unavailable"));
  vi.spyOn(console, "warn").mockImplementation(() => {});
  expect((await playing("alice")).status).toBe(200);
  limit.mockResolvedValue({ success: false });
  expect((await playing("bob")).status).toBe(429);
  expect(upstream).toHaveBeenCalledTimes(1);
  expect(limit).toHaveBeenCalledTimes(2);
});

it("preserves upstream Retry-After when cooldown persistence fails", async () => {
  const cache = await caches.open("lastfm-playing-v2");
  vi.spyOn(caches, "open").mockResolvedValue(cache);
  vi.spyOn(cache, "put").mockRejectedValue(new Error("cache unavailable"));
  vi.spyOn(console, "warn").mockImplementation(() => {});
  upstream.mockImplementation(
    async () =>
      new Response("Unavailable", {
        status: 429,
        headers: { "Retry-After": "300" },
      }),
  );
  const result = await playing("alice");
  expect(result.status).toBe(429);
  expect(result.retryAfter).toBe("300");
  expect(result.body.error).toBe("rate_limited");
});

it("preserves a usable stale result when cooldown persistence fails", async () => {
  const first = await playing("alice");
  now += 31_000;
  const cache = await caches.open("lastfm-playing-v2");
  vi.spyOn(caches, "open").mockResolvedValue(cache);
  vi.spyOn(cache, "put").mockRejectedValue(new Error("cache unavailable"));
  vi.spyOn(console, "warn").mockImplementation(() => {});
  upstream.mockImplementation(
    async () => new Response("Unavailable", { status: 503 }),
  );
  const result = await playing("alice");
  expect(result.status).toBe(200);
  expect(result.body).toMatchObject({
    stale: true,
    observed_at: first.body.observed_at,
  });
});

it("rejects upstream redirects without following them", async () => {
  upstream.mockImplementationOnce(async (input, init) => {
    const request = new Request(input, init);
    expect(request.redirect).toBe("manual");
    return new Response(null, {
      status: 302,
      headers: { Location: "https://example.com/" },
    });
  });
  expect((await playing("alice")).status).toBe(502);
  expect(upstream).toHaveBeenCalledTimes(1);
});
