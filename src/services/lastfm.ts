import {
  recentTracksSchema,
  lastfmErrorSchema,
  type LastfmTrack,
} from "../schemas/lastfm";

export class LastfmError extends Error {
  constructor(
    public status: 404 | 429 | 502,
    public retryAfter = 60,
  ) {
    super("Last.fm request failed");
  }
}

function retryAfterSeconds(header: string | null): number {
  if (!header) return 60;
  const seconds = /^\d+$/.test(header)
    ? Number(header)
    : (Date.parse(header) - Date.now()) / 1000;
  return Number.isFinite(seconds) ? Math.max(60, Math.ceil(seconds)) : 60;
}

export async function fetchRecentTracks(
  username: string,
  apiKey: string,
): Promise<LastfmTrack[]> {
  const url = new URL("https://ws.audioscrobbler.com/2.0/");
  url.search = new URLSearchParams({
    method: "user.getrecenttracks",
    user: username,
    api_key: apiKey,
    format: "json",
    limit: "1",
  }).toString();
  const response = await fetch(url, {
    signal: AbortSignal.timeout(8000),
    redirect: "manual",
  });
  const retryAfter = retryAfterSeconds(response.headers.get("Retry-After"));
  if (!response.ok) {
    console.warn("Last.fm HTTP error", { status: response.status });
    throw new LastfmError(response.status === 429 ? 429 : 502, retryAfter);
  }

  const body: unknown = await response.json();
  const failure = lastfmErrorSchema.safeParse(body);
  if (failure.success) {
    console.warn("Last.fm API error", { code: failure.data.error });
    const status =
      failure.data.error === 29 ? 429 : failure.data.error === 6 ? 404 : 502;
    throw new LastfmError(status, retryAfter);
  }
  const result = recentTracksSchema.safeParse(body);
  if (!result.success) {
    console.warn("Invalid Last.fm response", {
      issues: result.error.issues.map(({ code, path }) => ({ code, path })),
    });
    throw new LastfmError(502);
  }
  return result.data.recenttracks.track;
}
