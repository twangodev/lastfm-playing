import type { NowPlayingResponse } from "./response";

export const maxListeningAgeSeconds = 120;
export type ListeningSnapshot = NowPlayingResponse & { observed_at: string };
export type UpstreamCooldown = { until: number; failures: number };

export class ListeningCache {
  constructor(private cache?: Cache) {}

  static async open(): Promise<ListeningCache> {
    try {
      return new ListeningCache(await caches.open("lastfm-playing-v2"));
    } catch (error) {
      console.warn("Listening cache could not be opened", error);
      return new ListeningCache();
    }
  }

  getTrack(username: string): Promise<ListeningSnapshot | undefined> {
    return this.read<ListeningSnapshot>(this.trackKey(username));
  }

  putTrack(snapshot: ListeningSnapshot): Promise<void> {
    return this.write(
      this.trackKey(snapshot.user),
      snapshot,
      maxListeningAgeSeconds,
    );
  }

  deleteTrack(username: string): Promise<void> {
    return this.remove(this.trackKey(username));
  }

  getCooldown(): Promise<UpstreamCooldown | undefined> {
    return this.read<UpstreamCooldown>(this.cooldownKey);
  }

  putCooldown(cooldown: UpstreamCooldown): Promise<void> {
    const seconds = Math.max(
      3600,
      Math.ceil((cooldown.until - Date.now()) / 1000),
    );
    return this.write(this.cooldownKey, cooldown, seconds);
  }

  clearCooldown(): Promise<void> {
    return this.remove(this.cooldownKey);
  }

  private async read<T>(key: string): Promise<T | undefined> {
    try {
      const response = await this.cache?.match(key);
      return await response?.json<T>();
    } catch (error) {
      console.warn("Listening cache read failed", error);
      return undefined;
    }
  }

  private async write(
    key: string,
    body: ListeningSnapshot | UpstreamCooldown,
    ttl: number,
  ): Promise<void> {
    try {
      await this.cache?.put(
        key,
        Response.json(body, { headers: { "Cache-Control": `max-age=${ttl}` } }),
      );
    } catch (error) {
      console.warn("Listening cache write failed", error);
    }
  }

  private async remove(key: string): Promise<void> {
    try {
      await this.cache?.delete(key);
    } catch (error) {
      console.warn("Listening cache delete failed", error);
    }
  }

  private trackKey(username: string): string {
    return `https://listening-cache.internal/playing/${encodeURIComponent(username)}`;
  }
  private readonly cooldownKey =
    "https://listening-cache.internal/upstream-cooldown";
}

export function snapshotAgeSeconds(snapshot: ListeningSnapshot): number {
  return (Date.now() - Date.parse(snapshot.observed_at)) / 1000;
}
