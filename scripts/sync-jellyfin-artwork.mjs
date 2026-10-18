import fs from "node:fs/promises";
import path from "node:path";

import media from "../lib/media.js";

const {
  isStreamableExtension,
  movieTitleFromName,
  posterSlugFromTitle,
} = media;

const repoRoot = path.resolve(import.meta.dirname, "..");
const configuredRoot = path.resolve(
  process.env.MOVIE_LIBRARY_ROOT
    || "C:/Users/kylet/OneDrive/Desktop/Movie downloads",
);
const moviesRoot = path.join(configuredRoot, "Movies");
const tvRoot = path.join(configuredRoot, "TV Shows");
const jellyfinUrl = String(process.env.JELLYFIN_URL || "http://127.0.0.1:8096").replace(/\/+$/, "");
const apiKey = String(process.env.JELLYFIN_API_KEY || "").trim();
const force = process.argv.includes("--force");
const artworkFetchTimeoutMs = Math.min(60_000, Math.max(3_000, Number(process.env.MOVIE_ARTWORK_FETCH_TIMEOUT_MS) || 15_000));

function comparableTitle(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function yearFrom(value) {
  const match = String(value || "").match(/\b((?:19|20)\d{2})\b/);
  return match ? Number(match[1]) : null;
}

function imageDimensions(bytes) {
  const buffer = Buffer.from(bytes);
  if (buffer.length >= 24 && buffer.toString("ascii", 1, 4) === "PNG") {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  const startOfFrame = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  while (offset + 8 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9) continue;
    if (offset + 2 > buffer.length) break;
    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > buffer.length) break;
    if (startOfFrame.has(marker)) {
      return {
        height: buffer.readUInt16BE(offset + 3),
        width: buffer.readUInt16BE(offset + 5),
      };
    }
    offset += segmentLength;
  }
  return null;
}

function isPoster(bytes) {
  const dimensions = imageDimensions(bytes);
  return Boolean(dimensions && dimensions.height / dimensions.width >= 1.2);
}

function isBackdrop(bytes) {
  const dimensions = imageDimensions(bytes);
  return Boolean(dimensions && dimensions.width / dimensions.height >= 1.35);
}

async function readIfPresent(filePath) {
  try {
    return await fs.readFile(filePath);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function writeIfChanged(filePath, bytes) {
  const current = await readIfPresent(filePath);
  const next = Buffer.from(bytes);
  if (current && current.equals(next)) return false;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, next);
  return true;
}

async function writeIfMissing(filePath, bytes) {
  try {
    const handle = await fs.open(filePath, "wx");
    try { await handle.writeFile(Buffer.from(bytes)); }
    finally { await handle.close(); }
    return true;
  } catch (error) {
    if (["EEXIST", "ENOENT"].includes(error?.code)) return false;
    throw error;
  }
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), artworkFetchTimeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError") throw new Error(`Artwork request timed out after ${artworkFetchTimeoutMs} ms.`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchImage(url, { allowAnonymousRetry = false } = {}) {
  const headers = apiKey
    ? {
      "X-Emby-Token": apiKey,
      Authorization: `MediaBrowser Client="Movie Room Artwork", Device="Windows", DeviceId="movie-room-artwork", Version="1.0.0", Token="${apiKey}"`,
    }
    : {};
  let response = await fetchWithTimeout(url, { headers });
  if (allowAnonymousRetry && (response.status === 401 || response.status === 403) && apiKey) {
    response = await fetchWithTimeout(url);
  }
  if (!response.ok || !/^image\//i.test(response.headers.get("content-type") || "")) return null;
  return Buffer.from(await response.arrayBuffer());
}

function appleArtworkUrl(result) {
  return String(result?.artworkUrl100 || "").replace(/100x100bb\.(jpg|png|webp)$/i, "600x900bb.$1");
}

async function findOfficialPoster(title, year) {
  const appleUrl = new URL("https://itunes.apple.com/search");
  appleUrl.searchParams.set("term", [title, year].filter(Boolean).join(" "));
  appleUrl.searchParams.set("media", "movie");
  appleUrl.searchParams.set("entity", "movie");
  appleUrl.searchParams.set("limit", "15");
  const appleResponse = await fetchWithTimeout(appleUrl, { headers: { Accept: "application/json" } });
  if (appleResponse.ok) {
    const payload = await appleResponse.json();
    const exact = (Array.isArray(payload.results) ? payload.results : []).filter((result) => (
      comparableTitle(result.trackName) === comparableTitle(title)
    ));
    const match = exact.find((result) => !year || yearFrom(result.releaseDate) === Number(year));
    const imageUrl = appleArtworkUrl(match);
    if (imageUrl) {
      const bytes = await fetchImage(imageUrl);
      if (bytes && isPoster(bytes)) return { bytes, source: "Apple" };
    }
  }

  const wikipediaUrl = new URL("https://en.wikipedia.org/w/api.php");
  const params = {
    action: "query",
    format: "json",
    formatversion: "2",
    generator: "search",
    gsrsearch: `${title} ${year || ""} film`.trim(),
    gsrnamespace: "0",
    gsrlimit: "10",
    prop: "pageimages|description",
    piprop: "thumbnail",
    pithumbsize: "900",
    pilicense: "any",
    origin: "*",
  };
  for (const [key, value] of Object.entries(params)) wikipediaUrl.searchParams.set(key, value);
  const wikipediaResponse = await fetchWithTimeout(wikipediaUrl, {
    headers: { Accept: "application/json", "User-Agent": "TaylorMadeMovies/1.0 private media library" },
  });
  if (!wikipediaResponse.ok) return null;
  const payload = await wikipediaResponse.json();
  const pages = Array.isArray(payload?.query?.pages) ? payload.query.pages : [];
  const match = pages.find((page) => {
    if (!page?.thumbnail?.source || !/\b(film|movie)\b/i.test(String(page.description || ""))) return false;
    const pageTitle = String(page.title || "").replace(/\s*\((?:(?:19|20)\d{2}\s+)?film\)\s*$/i, "");
    if (comparableTitle(pageTitle) !== comparableTitle(title)) return false;
    return !year || new RegExp(`\\b${year}\\b`).test(`${page.title || ""} ${page.description || ""}`);
  });
  if (!match) return null;
  const bytes = await fetchImage(match.thumbnail.source);
  return bytes && isPoster(bytes) ? { bytes, source: "Wikipedia" } : null;
}

async function collectEntries(rootDir) {
  const sidecars = new Map();
  const filesByDirectory = new Map();
  const videos = [];
  async function walk(currentDir) {
    let entries;
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch (error) {
      if (error.code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else {
        const files = filesByDirectory.get(currentDir) || new Set();
        files.add(entry.name);
        filesByDirectory.set(currentDir, files);
        if (entry.isFile() && entry.name.toLowerCase().endsWith(".jellyfin.json")) {
        try {
          const metadata = JSON.parse(await fs.readFile(fullPath, "utf8"));
            sidecars.set(path.dirname(fullPath), { directory: path.dirname(fullPath), metadata });
        } catch (error) {
          console.warn(`skip invalid sidecar ${fullPath}: ${error.message}`);
        }
        } else if (entry.isFile() && isStreamableExtension(entry.name)) {
          videos.push({ directory: path.dirname(fullPath), fileName: entry.name });
        }
      }
    }
  }
  await walk(rootDir);
  for (const video of videos) {
    if (sidecars.has(video.directory)) continue;
    sidecars.set(video.directory, {
      directory: video.directory,
      files: filesByDirectory.get(video.directory) || new Set([video.fileName]),
      metadata: {
        title: movieTitleFromName(video.fileName),
        year: yearFrom(video.fileName),
        providerId: "",
        poster: "",
        backdrop: "",
      },
    });
  }
  return [...sidecars.values()].map((entry) => ({
    ...entry,
    files: filesByDirectory.get(entry.directory) || new Set(),
  }));
}

async function collectEpisodeSidecars(rootDir) {
  const results = [];
  const filesByDirectory = new Map();
  async function walk(currentDir) {
    let entries;
    try { entries = await fs.readdir(currentDir, { withFileTypes: true }); }
    catch (error) { if (error.code === "ENOENT") return; throw error; }
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) await walk(fullPath);
      else {
        const files = filesByDirectory.get(currentDir) || new Set();
        files.add(entry.name);
        filesByDirectory.set(currentDir, files);
        if (entry.isFile() && entry.name.toLowerCase().endsWith(".jellyfin.json")) {
          try {
            const metadata = JSON.parse(await fs.readFile(fullPath, "utf8"));
            if (metadata.seriesName) results.push({ directory: currentDir, stem: entry.name.replace(/\.jellyfin\.json$/i, ""), metadata });
          } catch { /* metadata sync will repair malformed sidecars */ }
        }
      }
    }
  }
  await walk(rootDir);
  return results.map((entry) => ({ ...entry, files: filesByDirectory.get(entry.directory) || new Set() }));
}

async function syncEntry({ directory, metadata, files = new Set() }) {
  const title = String(metadata.title || "").trim();
  if (!title) return;
  const slug = posterSlugFromTitle(title);
  const localPoster = path.join(directory, "poster.jpg");
  const localFolderPoster = path.join(directory, "folder.jpg");
  const localThumb = path.join(directory, "thumb.jpg");
  const deployedPoster = path.join(repoRoot, "public", "posters", `${slug}.jpg`);
  const localBackdrop = path.join(directory, "backdrop.jpg");
  const deployedBackdrop = path.join(repoRoot, "public", "backdrops", `${slug}.jpg`);

  const existingPosterBytes = force ? await readIfPresent(localPoster) : null;
  let posterBytes = force ? null : undefined;
  let posterSource = !force && files.has("poster.jpg") ? "existing movie folder" : "";
  if (force && existingPosterBytes && isPoster(existingPosterBytes)) {
    posterBytes = existingPosterBytes;
    posterSource = "existing movie folder";
  }
  let jellyfinPrimaryBytes = null;
  if (!posterSource && metadata.providerId && metadata.poster) {
    const url = `${jellyfinUrl}/Items/${encodeURIComponent(metadata.providerId)}/Images/Primary?maxWidth=900&quality=92`;
    const candidate = await fetchImage(url, { allowAnonymousRetry: true });
    jellyfinPrimaryBytes = candidate;
    if (candidate && isPoster(candidate)) {
      posterBytes = candidate;
      posterSource = "Jellyfin";
    }
  }
  if (!posterSource) {
    const official = await findOfficialPoster(title, metadata.year);
    if (official) {
      posterBytes = official.bytes;
      posterSource = official.source;
    }
  }
  if (!posterSource && jellyfinPrimaryBytes) {
    posterBytes = jellyfinPrimaryBytes;
    posterSource = "Jellyfin thumbnail";
  }
  // A force run may use older folder artwork as a last-resort poster. The
  // unattended path never opens an existing cloud-only image.
  if (!posterSource && force) {
    const fallbackArtwork = await readIfPresent(path.join(directory, "folder.jpg"))
      || await readIfPresent(path.join(directory, "thumb.jpg"))
      || await readIfPresent(localBackdrop);
    if (fallbackArtwork) {
      posterBytes = fallbackArtwork;
      posterSource = "existing artwork fallback";
    }
  }
  if (posterSource && posterBytes) {
    const writes = force
      ? [writeIfChanged(localPoster, posterBytes), writeIfChanged(localFolderPoster, posterBytes), writeIfChanged(localThumb, posterBytes), writeIfChanged(deployedPoster, posterBytes)]
      : [writeIfMissing(localPoster, posterBytes), writeIfMissing(localFolderPoster, posterBytes), writeIfMissing(localThumb, posterBytes), writeIfChanged(deployedPoster, posterBytes)];
    await Promise.all(writes);
    console.log(`poster ${title} (${metadata.year || "year unknown"}) <- ${posterSource}`);
  } else if (posterSource) {
    console.log(`poster ${title} (${metadata.year || "year unknown"}) <- ${posterSource}`);
  } else {
    console.warn(`poster missing ${title} (${metadata.year || "year unknown"})`);
  }

  let backdropBytes = force ? await readIfPresent(localBackdrop) : null;
  let backdropSource = !force && files.has("backdrop.jpg") ? "existing movie folder" : "";
  if (force && backdropBytes && isBackdrop(backdropBytes)) backdropSource = "existing movie folder";
  if (!backdropSource && metadata.providerId && metadata.backdrop) {
    const url = `${jellyfinUrl}/Items/${encodeURIComponent(metadata.providerId)}/Images/Backdrop?maxWidth=1600&quality=88`;
    const candidate = await fetchImage(url, { allowAnonymousRetry: true });
    if (candidate && isBackdrop(candidate)) {
      backdropBytes = candidate;
      backdropSource = "Jellyfin";
    }
  }
  if (backdropSource && backdropBytes) {
    const writes = force
      ? [writeIfChanged(localBackdrop, backdropBytes), writeIfChanged(deployedBackdrop, backdropBytes)]
      : [writeIfMissing(localBackdrop, backdropBytes), writeIfChanged(deployedBackdrop, backdropBytes)];
    await Promise.all(writes);
    console.log(`backdrop ${title} <- ${backdropSource}`);
  } else if (backdropSource) {
    console.log(`backdrop ${title} <- ${backdropSource}`);
  }
}

async function syncEpisodeThumbnail({ directory, stem, metadata, files = new Set() }) {
  const safeStem = stem.replace(/[^a-z0-9._ -]+/gi, " ").replace(/\s+/g, " ").trim();
  if (!force && (files.has(`${safeStem}-thumb.jpg`) || files.has(`${safeStem}-poster.jpg`))) return false;
  let bytes = null;
  if (metadata.providerId && metadata.poster) {
    const url = `${jellyfinUrl}/Items/${encodeURIComponent(metadata.providerId)}/Images/Primary?maxWidth=900&quality=92`;
    bytes = await fetchImage(url, { allowAnonymousRetry: true });
  }
  if (!bytes && force) {
    bytes = await readIfPresent(path.join(directory, "poster.jpg"))
      || await readIfPresent(path.join(directory, "thumb.jpg"))
      || await readIfPresent(path.join(path.dirname(directory), "poster.jpg"))
      || await readIfPresent(path.join(path.dirname(directory), "thumb.jpg"));
  }
  // Episode artwork may be a landscape still rather than a portrait poster;
  // it is still the authoritative Jellyfin thumbnail for that episode.
  if (!bytes) return false;
  const writes = force
    ? [writeIfChanged(path.join(directory, `${safeStem}-thumb.jpg`), bytes), writeIfChanged(path.join(directory, `${safeStem}-poster.jpg`), bytes)]
    : [writeIfMissing(path.join(directory, `${safeStem}-thumb.jpg`), bytes), writeIfMissing(path.join(directory, `${safeStem}-poster.jpg`), bytes)];
  await Promise.all(writes);
  return true;
}

const entries = [
  ...(await collectEntries(moviesRoot)),
  ...(await collectEntries(tvRoot)),
];
const episodeEntries = await collectEpisodeSidecars(tvRoot);
if (!entries.length) {
  console.warn(`No movie sidecars or videos found under ${moviesRoot}`);
  process.exitCode = 1;
} else {
  for (const entry of entries) {
    try {
      await syncEntry(entry);
    } catch (error) {
      console.warn(`artwork failed ${entry.metadata?.title || entry.directory}: ${error.message}`);
    }
  }
  let episodeArtworkCount = 0;
  for (const episode of episodeEntries) {
    try { if (await syncEpisodeThumbnail(episode)) episodeArtworkCount += 1; }
    catch (error) { console.warn(`episode artwork failed ${episode.stem}: ${error.message}`); }
  }
  console.log(`Artwork scan complete: ${entries.length} movie folders checked, ${episodeArtworkCount} episode thumbnails refreshed.`);
}
