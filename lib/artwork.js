const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function comparableTitle(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function artworkUrlForResult(result) {
  const raw = result?.artworkUrl100 || result?.artworkUrl600 || "";
  if (!raw) return "";
  return raw.replace(/100x100bb\.(jpg|png|webp)$/i, "600x900bb.$1");
}

function resultTitle(result) {
  return result?.trackName || result?.collectionName || result?.artistName || "";
}

function titleScore(candidate, requested, year = "") {
  const left = comparableTitle(candidate);
  const right = comparableTitle(requested);
  if (!left || !right) return 0;
  let score = left === right ? 100 : 0;
  if (left.startsWith(right) || right.startsWith(left)) score += 30;
  const requestedTokens = new Set(right.split(" ").filter(Boolean));
  const candidateTokens = new Set(left.split(" ").filter(Boolean));
  score += [...requestedTokens].filter((token) => candidateTokens.has(token)).length * 5;
  if (year && String(candidate?.releaseDate || candidate?.releaseYear || "").startsWith(String(year))) score += 15;
  return score;
}

function withTimeout(fetchImpl, url, options, timeoutMs) {
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  const requestOptions = controller ? { ...options, signal: controller.signal } : options;
  return Promise.resolve(fetchImpl(url, requestOptions)).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function createArtworkResolver({ fetchImpl = fetch, now = Date.now, timeoutMs = DEFAULT_TIMEOUT_MS, cacheTtlMs = DEFAULT_CACHE_TTL_MS } = {}) {
  const cache = new Map();

  async function search(title, year = "") {
    const cleanTitle = String(title || "").trim();
    if (!cleanTitle) return null;
    const key = `${comparableTitle(cleanTitle)}|${year || ""}`;
    const cached = cache.get(key);
    if (cached && cached.expiresAt > now()) return cached.value;

    let value = null;
    for (const query of [
      { media: "movie", entity: "movie" },
      { media: "tvShow", entity: "tvShow" },
    ]) {
      if (value) break;
      try {
        const itunesUrl = new URL("https://itunes.apple.com/search");
        itunesUrl.searchParams.set("term", year ? `${cleanTitle} ${year}` : cleanTitle);
        itunesUrl.searchParams.set("media", query.media);
        itunesUrl.searchParams.set("entity", query.entity);
        itunesUrl.searchParams.set("limit", "8");
        const response = await withTimeout(fetchImpl, itunesUrl, { headers: { Accept: "application/json" } }, timeoutMs);
        if (!response.ok) continue;
        const payload = await response.json();
        const results = Array.isArray(payload?.results) ? payload.results : [];
        const best = results
          .map((result) => ({ result, score: titleScore(resultTitle(result), cleanTitle, year) }))
          .sort((left, right) => right.score - left.score)[0];
        const posterUrl = artworkUrlForResult(best?.result);
        if (posterUrl && (best.score >= 35 || results.length === 1)) {
          value = { url: posterUrl, source: "iTunes", matchedTitle: resultTitle(best.result) || cleanTitle };
        }
      } catch {
        // Continue to the next independent artwork source/query.
      }
    }

    if (!value) {
      try {
        const wikipediaUrl = new URL("https://en.wikipedia.org/w/api.php");
        for (const [keyName, valueName] of Object.entries({
          action: "query", format: "json", formatversion: "2", generator: "search",
          gsrsearch: `${cleanTitle} film movie`, gsrnamespace: "0", gsrlimit: "8",
          prop: "pageimages|description", piprop: "thumbnail", pithumbsize: "600",
          pilicense: "any", origin: "*",
        })) wikipediaUrl.searchParams.set(keyName, valueName);
        const response = await withTimeout(fetchImpl, wikipediaUrl, {
          headers: { Accept: "application/json", "User-Agent": "MovieRoom/1.0 artwork resolver" },
        }, timeoutMs);
        if (response.ok) {
          const payload = await response.json();
          const pages = Array.isArray(payload?.query?.pages) ? payload.query.pages : [];
          const best = pages
            .filter((page) => page?.thumbnail?.source)
            .map((page) => ({ page, score: titleScore(page.title, cleanTitle, year) }))
            .sort((left, right) => right.score - left.score)[0];
          if (best?.page?.thumbnail?.source && best.score >= 20) {
            value = { url: best.page.thumbnail.source, source: "Wikimedia", matchedTitle: best.page.title || cleanTitle };
          }
        }
      } catch {
        // The caller will receive the explicit no-artwork placeholder below.
      }
    }

    cache.set(key, { value, expiresAt: now() + cacheTtlMs });
    return value;
  }

  return { search };
}

function escapeXml(value) {
  return String(value || "Movie")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;").replace(/'/g, "&apos;");
}

function noArtworkSvg(title) {
  const label = escapeXml(String(title || "Movie").slice(0, 80));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 900" role="img" aria-label="Artwork unavailable for ${label}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#111827"/><stop offset="1" stop-color="#030712"/></linearGradient></defs><rect width="600" height="900" fill="url(#g)"/><rect x="28" y="28" width="544" height="844" rx="24" fill="none" stroke="#b89b5e" stroke-opacity=".55" stroke-width="3"/><text x="300" y="390" fill="#f4e7c1" font-family="Arial,sans-serif" font-size="26" font-weight="700" text-anchor="middle">ARTWORK UNAVAILABLE</text><text x="300" y="450" fill="#fff" font-family="Arial,sans-serif" font-size="30" font-weight="700" text-anchor="middle">${label}</text><text x="300" y="820" fill="#b89b5e" font-family="Arial,sans-serif" font-size="18" text-anchor="middle">TAYLORMADE MOVIES</text></svg>`;
}

module.exports = { createArtworkResolver, noArtworkSvg, comparableTitle };
