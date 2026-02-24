export interface LastfmRecentTracksResponse {
  recenttracks: {
    track: LastfmTrack[];
    "@attr": {
      user: string;
      page: string;
      perPage: string;
      total: string;
      totalPages: string;
    };
  };
}

export interface LastfmTrack {
  name: string;
  url: string;
  mbid: string;
  artist: { "#text": string; mbid: string };
  album: { "#text": string; mbid: string };
  image: Array<{ "#text": string; size: "small" | "medium" | "large" | "extralarge" }>;
  streamable: string;
  date?: { uts: string; "#text": string };
  "@attr"?: { nowplaying: string };
}

export interface LastfmErrorResponse {
  error: number;
  message: string;
}