import type {
  LastfmRecentTracksResponse,
  LastfmErrorResponse,
} from "../types/lastfm";

const BASE_URL = "https://ws.audioscrobbler.com/2.0/";

export async function fetchNowPlaying(
  username: string,
  apiKey: string
): Promise<LastfmRecentTracksResponse | LastfmErrorResponse> {
  const url = new URL(BASE_URL);
  url.searchParams.set("method", "user.getrecenttracks");
  url.searchParams.set("user", username);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");

  const response = await fetch(url.toString());
  const data = await response.json();

  if (!response.ok || "error" in (data as object)) {
    return data as LastfmErrorResponse;
  }

  return data as LastfmRecentTracksResponse;
}
