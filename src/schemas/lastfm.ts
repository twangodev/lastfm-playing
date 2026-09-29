import { z } from "zod";

const trackSchema = z.object({
  name: z.string().min(1),
  url: z.string(),
  artist: z.object({ "#text": z.string().min(1) }),
  album: z.object({ "#text": z.string() }),
  image: z.array(z.object({ size: z.string(), "#text": z.string() })),
  "@attr": z
    .object({ nowplaying: z.enum(["true", "false"]).optional() })
    .optional(),
});

export const recentTracksSchema = z.object({
  recenttracks: z.object({ track: z.array(trackSchema) }),
});
export const lastfmErrorSchema = z.object({
  error: z.number().int(),
  message: z.string(),
});
export type LastfmTrack = z.infer<typeof trackSchema>;
