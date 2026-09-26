import fs from "node:fs/promises";
import path from "node:path";

const rootDir = process.cwd();

function parseEnvFile(contents) {
  const values = {};
  for (const line of String(contents || "").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

async function loadConfig() {
  const config = { ...parseEnvFile(await fs.readFile(path.join(rootDir, ".env.jellyfin.local"), "utf8").catch(() => "")), ...process.env };
  const libraryRoot = path.resolve(config.MOVIE_LIBRARY_ROOT || path.join(rootDir, "movies"));
  const jellyfinUrl = String(config.JELLYFIN_URL || "http://127.0.0.1:8096").replace(/\/+$/, "");
  const apiKey = String(config.JELLYFIN_API_KEY || "").trim();
  if (!apiKey) throw new Error("JELLYFIN_API_KEY is not configured in the local environment.");
  return { libraryRoot, jellyfinUrl, apiKey, libraryId: String(config.JELLYFIN_LIBRARY_ID || "").trim() };
}

function metadataFromItem(item) {
  const people = Array.isArray(item.People) ? item.People : [];
  const namesByType = (type) => people.filter((person) => person && person.Type === type && person.Name).map((person) => person.Name).filter((name, index, names) => names.indexOf(name) === index);
  return {
    provider: "jellyfin",
    providerId: item.Id || "",
    title: item.Name || "",
    originalTitle: item.OriginalTitle || "",
    year: item.ProductionYear || null,
    premiered: item.PremiereDate || "",
    rating: item.CommunityRating || null,
    contentRating: item.OfficialRating || "",
    runtimeTicks: item.RunTimeTicks || null,
    overview: item.Overview || "",
    tagline: item.Tagline || "",
    genres: Array.isArray(item.Genres) ? item.Genres : [],
    tags: Array.isArray(item.Tags) ? item.Tags : [],
    cast: namesByType("Actor"),
    directors: namesByType("Director"),
    seriesName: item.SeriesName || "",
    seasonNumber: item.ParentIndexNumber ?? null,
    episodeNumber: item.IndexNumber ?? null,
    poster: item.ImageTags?.Primary ? `/api/jellyfin/image/${encodeURIComponent(item.Id)}` : "",
    backdrop: Array.isArray(item.BackdropImageTags) && item.BackdropImageTags.length ? `/api/jellyfin/image/${encodeURIComponent(item.Id)}?type=Backdrop` : "",
  };
}

async function fetchItems(config) {
  const params = new URLSearchParams({
    Recursive: "true",
    IncludeItemTypes: "Movie,Episode",
    Fields: "Path,Genres,ProductionYear,Overview,SeriesName,ParentIndexNumber,IndexNumber,People,Tags,OriginalTitle,Tagline,OfficialRating,CommunityRating,PremiereDate,RunTimeTicks,ImageTags,BackdropImageTags",
    Limit: "10000",
  });
  if (config.libraryId) params.set("ParentId", config.libraryId);
  const response = await fetch(`${config.jellyfinUrl}/Items?${params.toString()}`, {
    headers: { Accept: "application/json", "X-Emby-Token": config.apiKey },
  });
  if (!response.ok) throw new Error(`Jellyfin returned HTTP ${response.status}.`);
  const payload = await response.json();
  return Array.isArray(payload.Items) ? payload.Items.filter((item) => item && item.Path) : [];
}

async function syncOnce() {
  const config = await loadConfig();
  const items = await fetchItems(config);
  let written = 0;
  let skipped = 0;
  for (const item of items) {
    const mediaPath = path.resolve(item.Path);
    const relative = path.relative(config.libraryRoot, mediaPath);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
      skipped += 1;
      continue;
    }
    const directory = path.dirname(mediaPath);
    const stem = path.basename(mediaPath, path.extname(mediaPath));
    const sidecarPath = path.join(directory, `${stem}.jellyfin.json`);
    const contents = `${JSON.stringify(metadataFromItem(item), null, 2)}\n`;
    let existing = "";
    try { existing = await fs.readFile(sidecarPath, "utf8"); } catch { /* new sidecar */ }
    if (existing !== contents) {
      await fs.writeFile(sidecarPath, contents, "utf8");
      written += 1;
    }
  }
  return { checked: items.length, written, unchanged: items.length - written - skipped, skipped };
}

const watch = process.argv.includes("--watch");
const intervalMs = Math.max(30_000, Number(process.env.MOVIE_METADATA_SYNC_INTERVAL_MS) || 300_000);

async function run() {
  const result = await syncOnce();
  console.log(JSON.stringify({ ok: true, ...result, watch, intervalMs }));
}

run().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }));
  process.exitCode = 1;
});

if (watch) {
  setInterval(() => run().catch((error) => console.error(JSON.stringify({ ok: false, error: error.message }))), intervalMs);
}
