const {
  isStreamableExtension,
  movieTitleFromName,
  posterUrlFromTitle,
  backdropUrlFromTitle,
  hasBundledPoster,
  hasBundledBackdrop,
} = require("../media");
const { buildSeriesGroups, inferSeriesInfo, isSampleVideo } = require("../library");

function normalize(value) {
  return String(value || "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/\\/g, "/")
    .replace(/[^a-z0-9/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stemKey(fileName) {
  const name = String(fileName || "");
  const dot = name.lastIndexOf(".");
  // Only remove a real media extension. A title such as "Jackass 2.5"
  // must retain its decimal point or its sidecar key will no longer match
  // the video filename.
  const extension = dot > 0 ? name.slice(dot).toLowerCase() : "";
  const mediaExtension = /\.(?:mp4|m4v|mkv|mov|avi|webm|ts|m2ts)$/i.test(extension);
  return normalize(mediaExtension ? name.slice(0, dot) : name);
}

// These are storage/recovery and original-release roots, not active library
// content. Ignoring them at the configured root prevents restored backups and
// torrent sources from creating duplicate cards in Movie Room.
const IGNORED_ROOT_DIRECTORIES = new Set([
  ".incomplete",
  "Applications",
  "_Recovery",
  "Jackass Collection 2000-2026 1080p WEB-DL HEVC x265 5.1 BONE",
  "Jackass.Forever.2022.1080p.WEBRip.DD5.1.X.264-EVO",
  "www.Torrenting.com - Bomb.Girls.Facing.the.Enemy.2014.1080p.WEB.H264-DiMEPiECE",
]);

const GRAPH_ROOT = "https://graph.microsoft.com/v1.0";
const TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const REFRESH_TOKEN_KEY = "onedrive:refresh-token";
const LIBRARY_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_LIBRARY_REFRESH_TIMEOUT_MS = 120_000;

function asProviderError(message, statusCode = 503) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function mapWithConcurrency(items, limit, iteratee) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await iteratee(items[currentIndex], currentIndex);
    }
  }

  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

function retryAfterMs(response, attempt) {
  const retryAfter = Number(response?.headers?.get?.("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter >= 0) {
    return Math.min(4000, retryAfter * 1000);
  }
  return Math.min(4000, 250 * (2 ** attempt));
}

function isRetryableOneDriveResponse(response) {
  return response?.status === 429 || response?.status === 500 || response?.status === 502
    || response?.status === 503 || response?.status === 504;
}

function withTimeout(promise, timeoutMs, message) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(asProviderError(message, 504)), timeoutMs);
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function createFolderEntry(entry, folder) {
  const folderPath = folder ? `${folder}/${entry.name}` : entry.name;
  const parent = folder || "";
  return {
    id: entry.id,
    path: folderPath,
    name: entry.name,
    parent,
    source: "onedrive",
    hidden: entry.name.startsWith("."),
  };
}

function withFolderCounts(folders, movies) {
  return folders.map((folder) => {
    const descendantMovies = movies.filter((movie) => (
      movie.folder === folder.path || movie.folder.startsWith(`${folder.path}/`)
    ));
    return {
      ...folder,
      movieCount: descendantMovies.length,
      playableCount: descendantMovies.filter((movie) => (Number(movie.size) || 0) > 0).length,
      uploadingCount: descendantMovies.filter((movie) => (Number(movie.size) || 0) <= 0).length,
    };
  });
}

// Older persisted catalogs may have been built before episode filenames were
// parsed for their real series name. Reconcile only the generic labels here so
// the cache-first path can safely present the same grouping as a fresh scan,
// even while OneDrive is reconnecting in the background.
function normalizeCachedLibrary(library) {
  if (!library || !Array.isArray(library.movies)) return library;
  const movies = library.movies.map((movie) => {
    if (!movie || movie.contentType !== "episode") return movie;
    const inferred = inferSeriesInfo(
      movie.folder ? `${movie.folder}/${movie.fileName || ""}` : movie.fileName,
      movie.fileName,
    );
    const genericSeriesName = /^(?:movies?|tv\s*shows?|tv\s*series|shows?|series)$/i;
    if (!inferred.seriesName || !inferred.seriesPath || !genericSeriesName.test(movie.seriesName || "")) {
      return movie;
    }
    return { ...movie, ...inferred };
  });
  return { ...library, movies, series: buildSeriesGroups(movies) };
}

function sidecarLookupKey(folder, mediaName) {
  const stem = stemKey(mediaName);
  return `${normalize(folder)}/${stem}`;
}

function oneDriveThumbnailUrl(entry) {
  const thumbnailSet = Array.isArray(entry?.thumbnails) ? entry.thumbnails[0] : null;
  return thumbnailSet?.large?.url
    || thumbnailSet?.medium?.url
    || thumbnailSet?.small?.url
    || "";
}

// Graph thumbnail URLs contain short-lived authorization parameters. Artwork
// is served through Movie Room so refreshes always resolve the same file.
function oneDriveArtworkUrl(itemId) {
  return itemId ? `/api/onedrive/image/${encodeURIComponent(itemId)}` : "";
}

function artworkKind(fileName) {
  const normalizedName = String(fileName || "").toLowerCase();
  if (/^(?:thumb|poster|folder)\.(?:jpe?g|png|webp)$/.test(normalizedName)
    || /-(?:thumb|poster)\.(?:jpe?g|png|webp)$/.test(normalizedName)) return "poster";
  if (/^(?:backdrop|fanart|background)\.(?:jpe?g|png|webp)$/.test(normalizedName)) return "backdrop";
  return "";
}

function artworkPriority(fileName) {
  const name = String(fileName || "");
  if (/^(?:poster|folder)\./i.test(name) || /-poster\./i.test(name)) return 3;
  if (/^thumb\./i.test(name) || /-thumb\./i.test(name)) return 1;
  return 2;
}

function createOneDriveProvider({ env = process.env, fetchImpl = fetch, store }) {
  const config = {
    clientId: env.ONEDRIVE_CLIENT_ID || "",
    clientSecret: env.ONEDRIVE_CLIENT_SECRET || "",
    publicClient: env.ONEDRIVE_PUBLIC_CLIENT === "true",
    redirectUri: env.ONEDRIVE_REDIRECT_URI || "",
    refreshToken: env.ONEDRIVE_REFRESH_TOKEN || "",
    driveId: env.ONEDRIVE_DRIVE_ID || "",
    rootItemId: env.ONEDRIVE_ROOT_ITEM_ID || "",
  };
  const libraryRefreshTimeoutMs = Number.isFinite(Number(env.ONEDRIVE_LIBRARY_REFRESH_TIMEOUT_MS))
    ? Math.max(10, Math.min(240_000, Number(env.ONEDRIVE_LIBRARY_REFRESH_TIMEOUT_MS)))
    : DEFAULT_LIBRARY_REFRESH_TIMEOUT_MS;

  let recentLibrary = null;
  let recentLibraryAt = 0;
  let libraryRequest = null;
  let cachedToken = null;
  let cachedTokenExpiresAt = 0;

  function libraryCacheKey() {
    return `onedrive:library:${config.driveId}:${config.rootItemId}`;
  }

  async function readLibraryCache(maxAgeMs = Infinity) {
    if (!store) return null;
    try {
      const raw = await store.get(libraryCacheKey());
      if (!raw) return null;
      const cached = JSON.parse(raw);
      if (!cached?.library || !Array.isArray(cached.library.movies)) return null;
      if (Number.isFinite(maxAgeMs) && !(Date.now() - Date.parse(cached.cachedAt) < maxAgeMs)) return null;
      return normalizeCachedLibrary(cached.library);
    } catch {
      return null;
    }
  }

  async function writeLibraryCache(library) {
    recentLibrary = library;
    recentLibraryAt = Date.now();
    if (!store) return;
    try {
      await store.set(libraryCacheKey(), JSON.stringify({
        cachedAt: new Date().toISOString(),
        library,
      }), LIBRARY_CACHE_TTL_MS);
    } catch {
      // A cache outage must never make a valid OneDrive catalog fail.
    }
  }

  async function getPersistedRefreshToken() {
    if (!store) {
      return config.refreshToken;
    }

    return (await store.get(REFRESH_TOKEN_KEY)) || config.refreshToken;
  }

  async function persistRefreshToken(refreshToken) {
    if (!refreshToken || !store) {
      return;
    }

    await store.set(REFRESH_TOKEN_KEY, refreshToken);
    config.refreshToken = refreshToken;
  }

  async function fetchJson(url, accessToken, options = {}) {
    let response;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      response = await fetchImpl(url, {
        ...options,
        headers: {
          Accept: "application/json",
          Authorization: "Bearer " + accessToken,
          ...(options.headers || {}),
        },
      });
      if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 1) break;
      const retryAfter = Number(response.headers?.get?.("retry-after"));
      await new Promise((resolve) => setTimeout(resolve, Number.isFinite(retryAfter)
        ? Math.min(Math.max(retryAfter * 1000, 100), 1500)
        : 250));
    }

    if (response.status === 401 || response.status === 403) {
      const error = asProviderError("OneDrive authorization failed.", 502);
      error.oneDriveAuthorizationFailure = true;
      throw error;
    }

    if (response.status === 404) {
      throw asProviderError("The configured OneDrive folder or movie was not found.", 404);
    }

    if (!response.ok) {
      throw asProviderError("OneDrive did not accept the request.", 502);
    }

    return response.json();
  }

  async function fetchDownloadUrl(accessToken, movieId) {
    const response = await fetchImpl(
      `${GRAPH_ROOT}/drives/${encodeURIComponent(config.driveId)}`
        + `/items/${encodeURIComponent(movieId)}/content`,
      {
        headers: {
          Authorization: "Bearer " + accessToken,
        },
        redirect: "manual",
      },
    );

    if (response.status === 401 || response.status === 403) {
      const error = asProviderError("OneDrive authorization failed.", 502);
      error.oneDriveAuthorizationFailure = true;
      throw error;
    }

    if (response.status === 404) {
      throw asProviderError("The configured OneDrive folder or movie was not found.", 404);
    }

    if (response.status < 300 || response.status >= 400) {
      throw asProviderError("OneDrive did not return a playback URL.", 502);
    }

    const downloadUrl = response.headers?.get("location") || "";
    if (!downloadUrl.startsWith("https://")) {
      throw asProviderError("OneDrive did not return a playback URL.", 502);
    }

    return downloadUrl;
  }

  async function getAccessToken() {
    if (!config.clientId || !config.redirectUri || !config.driveId || !config.rootItemId) {
      throw asProviderError("OneDrive is not fully configured.");
    }

    if (!config.publicClient && !config.clientSecret) {
      throw asProviderError(
        "OneDrive is missing ONEDRIVE_CLIENT_SECRET. Set ONEDRIVE_PUBLIC_CLIENT=true only for public-client app registrations.",
      );
    }

    if (cachedToken && cachedTokenExpiresAt > Date.now() + 60_000) {
      return cachedToken;
    }

    const refreshToken = await getPersistedRefreshToken();
    if (!refreshToken) {
      throw asProviderError("OneDrive is missing a refresh token.");
    }

    const body = new URLSearchParams({
      client_id: config.clientId,
      grant_type: "refresh_token",
      redirect_uri: config.redirectUri,
      refresh_token: refreshToken,
      scope: "offline_access Files.Read",
    });

    if (config.clientSecret) {
      body.set("client_secret", config.clientSecret);
    }

    const response = await fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });

    if (!response.ok) {
      throw asProviderError("OneDrive refresh token exchange failed.", 502);
    }

    const payload = await response.json();
    if (!payload.access_token) {
      throw asProviderError("OneDrive did not return an access token.", 502);
    }

    cachedToken = payload.access_token;
    cachedTokenExpiresAt = Date.now() + (Number(payload.expires_in) || 3600) * 1000;

    if (payload.refresh_token) {
      await persistRefreshToken(payload.refresh_token);
    }

    return cachedToken;
  }

  async function withAccessTokenRetry(operation) {
    let accessToken = await getAccessToken();

    try {
      return await operation(accessToken);
    } catch (error) {
      if (!error?.oneDriveAuthorizationFailure) {
        throw error;
      }

      cachedToken = null;
      cachedTokenExpiresAt = 0;
      accessToken = await getAccessToken();
      return operation(accessToken);
    }
  }

  async function fetchMetadataSidecar(accessToken, entry) {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await fetchImpl(
        `${GRAPH_ROOT}/drives/${encodeURIComponent(config.driveId)}`
          + `/items/${encodeURIComponent(entry.id)}/content`,
        {
          headers: { Authorization: "Bearer " + accessToken },
          redirect: "manual",
        },
      );
      if (response.status === 401 || response.status === 403) {
        const error = asProviderError("OneDrive authorization failed.", 502);
        error.oneDriveAuthorizationFailure = true;
        throw error;
      }
      if (isRetryableOneDriveResponse(response)) {
        if (attempt < 3) {
          await new Promise((resolve) => setTimeout(resolve, retryAfterMs(response, attempt)));
          continue;
        }
        return null;
      }
      const location = response.headers?.get?.("location") || "";
      const contentResponse = location
        ? await fetchImpl(location, { headers: { Accept: "application/json" } })
        : response;
      if (contentResponse.status === 401 || contentResponse.status === 403) {
        const error = asProviderError("OneDrive authorization failed.", 502);
        error.oneDriveAuthorizationFailure = true;
        throw error;
      }
      if (isRetryableOneDriveResponse(contentResponse)) {
        if (attempt < 3) {
          await new Promise((resolve) => setTimeout(resolve, retryAfterMs(contentResponse, attempt)));
          continue;
        }
        return null;
      }
      if (!contentResponse.ok || typeof contentResponse.json !== "function") return null;
      try {
        return await contentResponse.json();
      } catch {
        return null;
      }
    }
    return null;
  }

  async function listChildren(accessToken, itemId, folder = "") {
    const movies = [];
    const folders = [];
    const metadataEntries = [];
    const artworkEntries = [];
    let nextUrl = `${GRAPH_ROOT}/drives/${encodeURIComponent(config.driveId)}`
      + `/items/${encodeURIComponent(itemId)}/children`
      + "?$select=id,name,size,file,folder,eTag,lastModifiedDateTime";

    while (nextUrl) {
      const payload = await fetchJson(nextUrl, accessToken);
      const childFolders = [];

      for (const entry of payload.value || []) {
        if (entry.folder) {
          if (!folder && IGNORED_ROOT_DIRECTORIES.has(entry.name)) {
            continue;
          }
          childFolders.push(entry);
          folders.push(createFolderEntry(entry, folder));
          continue;
        }

        if (entry.file && String(entry.name || "").toLowerCase().endsWith(".jellyfin.json")) {
          metadataEntries.push({ entry, folder });
          continue;
        }

        const kind = entry.file ? artworkKind(entry.name) : "";
        if (kind) {
          artworkEntries.push({
            id: entry.id,
            folder,
            kind,
            priority: artworkPriority(entry.name),
            name: entry.name,
            stem: /-(?:thumb|poster)\.(?:jpe?g|png|webp)$/i.test(entry.name)
              ? entry.name.replace(/-(?:thumb|poster)\.(?:jpe?g|png|webp)$/i, "")
              : "",
            url: oneDriveArtworkUrl(entry.id),
          });
          continue;
        }

        if (!entry.file || !isStreamableExtension(entry.name) || isSampleVideo(folder ? `${folder}/${entry.name}` : entry.name, entry.name)) {
          continue;
        }

        const title = movieTitleFromName(entry.name);
        const seriesInfo = inferSeriesInfo(folder ? `${folder}/${entry.name}` : entry.name, entry.name);
        movies.push({
          id: entry.id,
          title,
          fileName: entry.name,
          folder,
          extension: entry.name.slice(entry.name.lastIndexOf(".")).toLowerCase(),
          // A video-frame thumbnail is useful as a wide hero backdrop, but it
          // is not poster art. It may contain captions or the orange stripe
          // seen in OneDrive-generated previews, so cards never use it.
          posterUrl: hasBundledPoster(title) ? posterUrlFromTitle(title) : "",
          backdropUrl: hasBundledBackdrop(title) ? backdropUrlFromTitle(title) : "",
          size: entry.size || 0,
          source: "onedrive",
          ...seriesInfo,
        });
      }

      if (childFolders.length) {
        const nestedMovies = await mapWithConcurrency(
          childFolders,
          3,
          (entry) => {
            const nextFolder = folder ? `${folder}/${entry.name}` : entry.name;
            return listChildren(accessToken, entry.id, nextFolder);
          },
        );
        for (const nestedLibrary of nestedMovies) {
          movies.push(...nestedLibrary.movies);
          folders.push(...nestedLibrary.folders);
          metadataEntries.push(...(nestedLibrary.metadataEntries || []));
          artworkEntries.push(...(nestedLibrary.artworkEntries || []));
        }
      }

      nextUrl = payload["@odata.nextLink"] || "";
    }

    return { movies, folders, metadataEntries, artworkEntries };
  }

  async function listLibraryWithAccessToken(accessToken, cachedLibrary = null) {
    const library = await listChildren(accessToken, config.rootItemId);
    const activeMediaKeys = new Set(library.movies.map((movie) => sidecarLookupKey(movie.folder, movie.fileName)));
    const cachedMoviesByKey = new Map(
      (cachedLibrary?.movies || []).map((movie) => [sidecarLookupKey(movie.folder, movie.fileName), movie]),
    );
    const metadataPairs = await mapWithConcurrency(
      (library.metadataEntries || []).filter(({ entry, folder }) => (
        activeMediaKeys.has(sidecarLookupKey(folder, String(entry.name).replace(/\.jellyfin\.json$/i, "")))
      )),
      6,
      async ({ entry, folder }) => {
        const key = sidecarLookupKey(folder, String(entry.name).replace(/\.jellyfin\.json$/i, ""));
        const cachedMovie = cachedMoviesByKey.get(key);
        const cachedMetadata = cachedMovie?.metadata && typeof cachedMovie.metadata === "object"
          ? cachedMovie.metadata
          : null;
        const cachedETag = String(cachedMovie?.metadataSidecarETag || "");
        const currentETag = String(entry.eTag || "");
        // Older caches did not record the sidecar ETag. Their already-parsed
        // metadata is still a safe baseline; record the current ETag now so a
        // later sidecar edit is detected without downloading every sidecar.
        const canReuse = cachedMetadata && (!cachedETag || !currentETag || cachedETag === currentETag);
        return {
          key,
          metadata: canReuse ? cachedMetadata : await fetchMetadataSidecar(accessToken, entry),
          sidecarETag: currentETag || cachedETag,
        };
      },
    );
    const metadataByKey = new Map(metadataPairs.filter((pair) => pair.metadata).map((pair) => [pair.key, pair]));
    const artworkByFolder = new Map();
    const artworkByMedia = new Map();
    for (const artwork of library.artworkEntries || []) {
      if (!artwork.url || !artwork.id) continue;
      if (artwork.stem) {
        const mediaKey = `${normalize(artwork.folder)}/${stemKey(artwork.stem)}`;
        const current = artworkByMedia.get(mediaKey);
        if (!current || artwork.priority > current.priority) {
          artworkByMedia.set(mediaKey, { url: artwork.url, priority: artwork.priority });
        }
        continue;
      }
      const folderKey = normalize(artwork.folder);
      const current = artworkByFolder.get(folderKey) || {};
      // Prefer a real cover poster, then folder art, and use a thumb/frame
      // only when no cover art exists. This must not depend on Graph order.
      const priority = artwork.priority;
      if (!current[artwork.kind] || priority > (current[`${artwork.kind}Priority`] || 0)) {
        current[artwork.kind] = artwork.url;
        current[`${artwork.kind}Priority`] = priority;
      }
      artworkByFolder.set(folderKey, current);
    }
    library.movies = library.movies.map((movie) => {
      const metadataRecord = metadataByKey.get(sidecarLookupKey(movie.folder, movie.fileName));
      const metadata = metadataRecord?.metadata;
      const metadataTitle = metadata?.title || movie.title;
      const bundledPosterUrl = hasBundledPoster(metadataTitle)
        ? posterUrlFromTitle(metadataTitle)
        : "";
      const bundledBackdropUrl = hasBundledBackdrop(metadataTitle)
        ? backdropUrlFromTitle(metadataTitle)
        : "";
      const folderArtwork = artworkByFolder.get(normalize(movie.folder)) || {};
      const mediaArtwork = artworkByMedia.get(`${normalize(movie.folder)}/${stemKey(movie.fileName)}`)?.url || "";
      const movieWithArtwork = {
        ...movie,
        title: metadataTitle,
        posterUrl: mediaArtwork || folderArtwork.poster || bundledPosterUrl || movie.posterUrl || "",
        backdropUrl: folderArtwork.backdrop || bundledBackdropUrl || movie.backdropUrl || "",
        metadataSidecarETag: metadataRecord?.sidecarETag || "",
      };
      if (!metadata) return movieWithArtwork;
      return {
        ...movieWithArtwork,
        title: metadataTitle,
        // Sidecars can contain a local /api/jellyfin/image route, but the
        // hosted OneDrive provider cannot reach a Jellyfin server running on
        // the owner's PC. A verified, deployed poster wins; otherwise the UI
        // uses its clean fallback while keeping the video frame for the hero.
        originalTitle: metadata.originalTitle || "",
        year: metadata.year || null,
        premiered: metadata.premiered || "",
        dateAdded: metadata.dateAdded || "",
        rating: metadata.rating == null ? "" : String(metadata.rating),
        contentRating: metadata.contentRating || "",
        runtimeTicks: metadata.runtimeTicks || null,
        overview: metadata.overview || "",
        description: metadata.overview || "",
        tagline: metadata.tagline || "",
        genres: Array.isArray(metadata.genres) ? metadata.genres : movie.genres,
        tags: Array.isArray(metadata.tags) ? metadata.tags : [],
        cast: Array.isArray(metadata.cast) ? metadata.cast : [],
        director: Array.isArray(metadata.directors) ? metadata.directors : [],
        metadataSource: "jellyfin",
        metadataProviderId: metadata.providerId || "",
        metadata,
      };
    });
    library.movies.sort((left, right) => {
      const byTitle = left.title.localeCompare(right.title);
      const byFolder = left.folder.localeCompare(right.folder);
      return byTitle || byFolder || left.id.localeCompare(right.id);
    });
    library.folders = withFolderCounts(library.folders, library.movies).sort((left, right) => (
      left.path.localeCompare(right.path)
    ));
    library.series = buildSeriesGroups(library.movies);
    return library;
  }

  function startLibraryRefresh() {
    if (libraryRequest) return libraryRequest;
    libraryRequest = withTimeout(
      refreshLibrary(),
      libraryRefreshTimeoutMs,
      "OneDrive library refresh timed out.",
    ).finally(() => {
      libraryRequest = null;
    });
    return libraryRequest;
  }

  async function awaitLibraryRefresh() {
    try {
      return await startLibraryRefresh();
    } catch (error) {
      const cached = await readLibraryCache();
      if (cached) {
        return {
          ...cached,
          cacheStatus: "stale",
          cacheWarning: "OneDrive refresh did not finish; showing the last complete library.",
        };
      }
      throw error;
    }
  }

  async function listLibraryWithCache() {
    const cached = await readLibraryCache();
    if (cached) {
      // The persisted catalog is the fast path. Refreshes are deliberately
      // detached so a slow Graph/sidecar scan cannot blank the application.
      startLibraryRefresh().catch(() => {});
      return {
        ...cached,
        cacheStatus: "stale",
        cacheWarning: "Showing the last complete library while OneDrive refreshes.",
      };
    }
    return startLibraryRefresh();
  }

  async function refreshLibrary() {
    try {
      const cachedLibrary = await readLibraryCache();
      const library = await withAccessTokenRetry((accessToken) => listLibraryWithAccessToken(accessToken, cachedLibrary));
      await writeLibraryCache(library);
      return { ...library, cacheStatus: "fresh", cacheWarning: "" };
    } catch (error) {
      const cached = await readLibraryCache();
      if (cached) {
        return {
          ...cached,
          cacheStatus: "stale",
          cacheWarning: "OneDrive is temporarily reconnecting; showing the last complete library.",
        };
      }
      throw error;
    }
  }

  async function proxyArtwork(itemId, request) {
    const location = await resolveArtwork(itemId);
    return fetchImpl(location, {
      method: request.method,
      headers: request.headers.range ? { Range: request.headers.range } : {},
    });
  }

  async function resolveArtwork(itemId) {
    if (!itemId || !/^[A-Za-z0-9!_-]+$/.test(String(itemId))) {
      throw asProviderError("Invalid OneDrive artwork id.", 400);
    }
    return withAccessTokenRetry(async (accessToken) => {
      const response = await fetchImpl(
        `${GRAPH_ROOT}/drives/${encodeURIComponent(config.driveId)}`
          + `/items/${encodeURIComponent(itemId)}/content`,
        {
          headers: { Authorization: "Bearer " + accessToken },
          redirect: "manual",
        },
      );
      if (response.status === 401 || response.status === 403) {
        const error = asProviderError("OneDrive authorization failed.", 502);
        error.oneDriveAuthorizationFailure = true;
        throw error;
      }
      if (response.status === 404) throw asProviderError("OneDrive artwork was not found.", 404);
      if (response.status < 300 || response.status >= 400) {
        throw asProviderError("OneDrive did not return artwork.", 502);
      }
      const location = response.headers?.get?.("location") || "";
      if (!location.startsWith("https://")) throw asProviderError("OneDrive did not return artwork.", 502);
      return location;
    });
  }

  return {
    kind: "onedrive",
    async listLibrary() {
      return listLibraryWithCache();
    },
    async refreshLibrary() {
      return awaitLibraryRefresh();
    },
    async listMovies() {
      const library = await listLibraryWithCache();
      return library.movies;
    },
    async resolvePlayback(movieId) {
      return withAccessTokenRetry(async (accessToken) => {
        // Reuse only a recent, folder-scoped catalog for membership checks.
        // Still fetch a fresh URL for the selected video on every play/preview.
        const cached = recentLibrary && Date.now() - recentLibraryAt < 120000
          ? recentLibrary : await readLibraryCache(120000);
        const movies = (cached || await listLibraryWithCache()).movies;
        if (!movies.some((movie) => movie.id === movieId)) {
          throw asProviderError("The movie is not in the configured movie folder.", 404);
        }

        const payload = await fetchJson(
          `${GRAPH_ROOT}/drives/${encodeURIComponent(config.driveId)}`
            + `/items/${encodeURIComponent(movieId)}`
            + "?$select=id,name,file,size,@microsoft.graph.downloadUrl",
          accessToken,
        );

        if (!payload.file || !isStreamableExtension(payload.name || "")) {
          throw asProviderError("Unsupported movie format.", 415);
        }

        const downloadUrl = payload["@microsoft.graph.downloadUrl"]
          || await fetchDownloadUrl(accessToken, movieId);

        return {
          url: downloadUrl,
          expiresAt: null,
        };
      });
    },
    proxyArtwork,
    resolveArtwork,
  };
}

module.exports = {
  createOneDriveProvider,
};
