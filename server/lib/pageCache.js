const TTL_MS = Math.max(1000, Number(process.env.PAGE_CACHE_MS || 10000));

let entry = null;
let inflight = null;

export async function cachedEventPage(load) {
  if (entry && Date.now() - entry.at < TTL_MS) return entry.data;
  if (inflight) return inflight;

  inflight = load()
    .then((data) => {
      entry = { at: Date.now(), data };
      return data;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function invalidateEventPageCache() {
  entry = null;
}
