import type { Env } from "../types/env";
import {
  ListeningCache,
  maxListeningAgeSeconds,
  snapshotAgeSeconds,
  type ListeningSnapshot,
  type UpstreamCooldown,
} from "../lib/cache";
import { shapeResponse } from "../lib/response";
import { fetchRecentTracks, LastfmError } from "./lastfm";
import type { LastfmTrack } from "../schemas/lastfm";

type ListeningResult = {
  status: 200 | 404 | 429 | 502;
  body:
    | (ListeningSnapshot & { stale: boolean })
    | { error: string; message: string };
  retryAfter?: number;
};

// Coalesce cache misses within this isolate. Other isolates use the binding's limit.
const pendingRequests = new Map<string, Promise<ListeningResult>>();

export class ListeningService {
  constructor(
    private env: Env["Bindings"],
    private cache: ListeningCache,
  ) {}

  async get(username: string): Promise<ListeningResult> {
    const pending = pendingRequests.get(username);
    if (pending) return pending;
    const request = this.fetchOrReadCache(username);
    pendingRequests.set(username, request);
    try {
      return await request;
    } finally {
      pendingRequests.delete(username);
    }
  }

  private async fetchOrReadCache(username: string): Promise<ListeningResult> {
    const cached = await this.cache.getTrack(username);
    const configuredTTL = Number(this.env.CACHE_TTL);
    const freshFor = Number.isFinite(configuredTTL)
      ? Math.min(60, Math.max(30, configuredTTL))
      : 30;
    if (cached && snapshotAgeSeconds(cached) < freshFor)
      return this.success(cached, false);

    const cooldown = await this.cache.getCooldown();
    if (cooldown && cooldown.until > Date.now()) {
      return this.unavailable(
        cached,
        429,
        Math.ceil((cooldown.until - Date.now()) / 1000),
      );
    }
    const { success } = await this.env.LASTFM_RATE_LIMITER.limit({
      key: "lastfm-api",
    });
    if (!success) return this.unavailable(cached, 429, 10);

    let tracks: LastfmTrack[];
    try {
      tracks = await fetchRecentTracks(username, this.env.LASTFM_API_KEY);
    } catch (error) {
      if (!(error instanceof LastfmError)) {
        console.warn("Last.fm fetch failed", {
          name: error instanceof Error ? error.name : "UnknownError",
        });
      }
      return this.upstreamFailure(username, cached, cooldown, error);
    }

    const snapshot = {
      ...shapeResponse(username, tracks),
      observed_at: new Date(Date.now()).toISOString(),
    };
    await this.cache.putTrack(snapshot);
    await this.cache.clearCooldown();
    return this.success(snapshot, false);
  }

  private async upstreamFailure(
    username: string,
    cached: ListeningSnapshot | undefined,
    cooldown: UpstreamCooldown | undefined,
    error: unknown,
  ): Promise<ListeningResult> {
    if (error instanceof LastfmError && error.status === 404) {
      await this.cache.deleteTrack(username);
      return {
        status: 404,
        body: { error: "not_found", message: "Last.fm user was not found." },
      };
    }
    const failures = Math.min(5, (cooldown?.failures ?? 0) + 1);
    const retryAfter = Math.max(
      30 * 2 ** (failures - 1),
      error instanceof LastfmError ? error.retryAfter : 60,
    );
    await this.cache.putCooldown({
      failures,
      until: Date.now() + retryAfter * 1000,
    });
    return this.unavailable(
      cached,
      error instanceof LastfmError ? error.status : 502,
      retryAfter,
    );
  }

  private success(
    snapshot: ListeningSnapshot,
    stale: boolean,
    retryAfter?: number,
  ): ListeningResult {
    return { status: 200, body: { ...snapshot, stale }, retryAfter };
  }

  private unavailable(
    cached: ListeningSnapshot | undefined,
    status: 404 | 429 | 502,
    retryAfter: number,
  ): ListeningResult {
    if (cached && snapshotAgeSeconds(cached) < maxListeningAgeSeconds)
      return this.success(cached, true, retryAfter);
    return {
      status,
      retryAfter,
      body: {
        error: status === 429 ? "rate_limited" : "upstream_error",
        message: "Listening data is temporarily unavailable.",
      },
    };
  }
}
