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
  return normalize(dot > 0 ? name.slice(0, dot) : name);
}

// These are storage/recovery and original-release roots, not active library
// content. Ignoring them at the configured root prevents restored backups and
// torrent sources from creating duplicate cards in Movie Room.
const IGNORED_ROOT_DIRECTORIES = new Set([
  "Applications",
  "_Recovery",
  "Jackass Collection 2000-2026 1080p WEB-DL HEVC x265 5.1 BONE",
  "Jackass.Forever.2022.1080p.WEBRip.DD5.1.X.264-EVO",
  "www.Torrenting.com - Bomb.Girls.Facing.the.Enemy.2014.1080p.WEB.H264-DiMEPiECE",
]);

const GRAPH_ROOT = "https://graph.microsoft.com/v1.0";
const TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const REFRESH_TOKEN_KEY = "onedrive:refresh-token";

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

  let cachedToken = null;
  let cachedTokenExpiresAt = 0;

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
    const response = await fetchImpl(url, {
      ...options,
      headers: {
        Accept: "application/json",
        Authorization: "Bearer " + accessToken,
        ...(options.headers || {}),
      },
    });

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
    const location = response.headers?.get?.("location") || "";
    const contentResponse = location
      ? await fetchImpl(location, { headers: { Accept: "application/json" } })
      : response;
    if (!contentResponse.ok || typeof contentResponse.json !== "function") return null;
    try {
      return await contentResponse.json();
    } catch {
      return null;
    }
  }

  async function listChildren(accessToken, itemId, folder = "") {
    const movies = [];
    const folders = [];
    const metadataEntries = [];
    const artworkEntries = [];
    let nextUrl = `${GRAPH_ROOT}/drives/${encodeURIComponent(config.driveId)}`
      + `/items/${encodeURIComponent(itemId)}/children`
      + "?$select=id,name,size,file,folder,thumbnails&$expand=thumbnails";

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

  async function listLibraryWithAccessToken(accessToken) {
    const library = await listChildren(accessToken, config.rootItemId);
    const metadataPairs = await mapWithConcurrency(library.metadataEntries || [], 3, async ({ entry, folder }) => ({
      key: sidecarLookupKey(folder, String(entry.name).replace(/\.jellyfin\.json$/i, "")),
      metadata: await fetchMetadataSidecar(accessToken, entry),
    }));
    const metadataByKey = new Map(metadataPairs.filter((pair) => pair.metadata).map((pair) => [pair.key, pair.metadata]));
    const artworkByFolder = new Map();
    const artworkByMedia = new Map();
    for (const artwork of library.artworkEntries || []) {
      if (!artwork.url || !artwork.id) continue;
      if (artwork.stem) {
        artworkByMedia.set(`${normalize(artwork.folder)}/${stemKey(artwork.stem)}`, artwork.url);
        continue;
      }
      const folderKey = normalize(artwork.folder);
      const current = artworkByFolder.get(folderKey) || {};
      // The dedicated Jellyfin thumb is the catalog-card source. poster.jpg
      // and folder.jpg remain compatible fallbacks for existing libraries.
      const priority = /^thumb\./i.test(artwork.name)
        ? 3
        : /^poster\./i.test(artwork.name) ? 2 : 1;
      if (!current[artwork.kind] || priority > (current[`${artwork.kind}Priority`] || 0)) {
        current[artwork.kind] = artwork.url;
        current[`${artwork.kind}Priority`] = priority;
      }
      artworkByFolder.set(folderKey, current);
    }
    library.movies = library.movies.map((movie) => {
      const metadata = metadataByKey.get(sidecarLookupKey(movie.folder, movie.fileName));
      const metadataTitle = metadata?.title || movie.title;
      const bundledPosterUrl = hasBundledPoster(metadataTitle)
        ? posterUrlFromTitle(metadataTitle)
        : "";
      const bundledBackdropUrl = hasBundledBackdrop(metadataTitle)
        ? backdropUrlFromTitle(metadataTitle)
        : "";
      const folderArtwork = artworkByFolder.get(normalize(movie.folder)) || {};
      const mediaArtwork = artworkByMedia.get(`${normalize(movie.folder)}/${stemKey(movie.fileName)}`) || "";
      const movieWithArtwork = {
        ...movie,
        title: metadataTitle,
        posterUrl: mediaArtwork || folderArtwork.poster || bundledPosterUrl || movie.posterUrl || "",
        backdropUrl: folderArtwork.backdrop || bundledBackdropUrl || movie.backdropUrl || "",
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

  async function proxyArtwork(itemId, request) {
    if (!itemId || !/^[A-Za-z0-9!_-]+$/.test(String(itemId))) {
      throw asProviderError("Invalid OneDrive artwork id.", 400);
    }
    return withAccessTokenRetry(async (accessToken) => {
      const response = await fetchImpl(
        `${GRAPH_ROOT}/drives/${encodeURIComponent(config.driveId)}`
          + `/items/${encodeURIComponent(itemId)}/content`,
        {
          method: request.method,
          headers: {
            Authorization: "Bearer " + accessToken,
            ...(request.headers.range ? { Range: request.headers.range } : {}),
          },
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
      return fetchImpl(location, {
        method: request.method,
        headers: request.headers.range ? { Range: request.headers.range } : {},
      });
    });
  }

  return {
    kind: "onedrive",
    async listLibrary() {
      return withAccessTokenRetry((accessToken) => listLibraryWithAccessToken(accessToken));
    },
    async listMovies() {
      const library = await withAccessTokenRetry((accessToken) => listLibraryWithAccessToken(accessToken));
      return library.movies;
    },
    async resolvePlayback(movieId) {
      return withAccessTokenRetry(async (accessToken) => {
        const movies = (await listLibraryWithAccessToken(accessToken)).movies;
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
  };
}

module.exports = {
  createOneDriveProvider,
};
