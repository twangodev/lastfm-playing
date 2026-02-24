import type { LastfmTrack } from "../types/lastfm";

export interface NowPlayingResponse {
  status: "playing" | "idle";
  user: string;
  track: {
    name: string;
    artist: string;
    album: string;
    url: string;
    image: {
      small: string;
      medium: string;
      large: string;
      extralarge: string;
    };
  } | null;
}

export function shapeResponse(
  username: string,
  tracks: LastfmTrack[]
): NowPlayingResponse {
  const first = tracks[0];

  if (!first || first["@attr"]?.nowplaying !== "true") {
    return { status: "idle", user: username, track: null };
  }

  const imageMap: Record<string, string> = {};
  for (const img of first.image) {
    imageMap[img.size] = img["#text"];
  }

  return {
    status: "playing",
    user: username,
    track: {
      name: first.name,
      artist: first.artist["#text"],
      album: first.album["#text"],
      url: first.url,
      image: {
        small: imageMap.small ?? "",
        medium: imageMap.medium ?? "",
        large: imageMap.large ?? "",
        extralarge: imageMap.extralarge ?? "",
      },
    },
  };
}
