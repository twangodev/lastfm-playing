const CACHE_NAME = "lastfm-playing";

function buildCacheKey(username: string): Request {
  return new Request(
    `https://cache.internal/playing/${username.toLowerCase()}`
  );
}

export async function getCached(
  username: string
): Promise<Response | undefined> {
  const cache = await caches.open(CACHE_NAME);
  const response = await cache.match(buildCacheKey(username));
  return response ?? undefined;
}

export async function putCached(
  username: string,
  body: string,
  ttl: number
): Promise<void> {
  const cache = await caches.open(CACHE_NAME);
  const response = new Response(body, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": `public, max-age=${ttl}, s-maxage=${ttl}`,
    },
  });
  await cache.put(buildCacheKey(username), response);
}
