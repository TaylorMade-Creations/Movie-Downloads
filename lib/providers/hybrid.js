const path = require("node:path");
const { buildSeriesGroups } = require("../library");

function providerError(message, statusCode = 503) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function normalize(value) {
  return String(value || "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/\\/g, "/")
    .replace(/[^a-z0-9/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function fileKey(fileName) {
  return normalize(path.posix.basename(String(fileName || "").replace(/\\/g, "/")));
}

function stemKey(fileName) {
  const name = path.posix.basename(String(fileName || "").replace(/\\/g, "/"));
  return normalize(name.slice(0, name.length - path.extname(name).length));
}

function folderTokens(folder) {
  return new Set(normalize(folder).split(/[ /]+/).filter(Boolean));
}

function folderScore(left, right) {
  const leftTokens = folderTokens(left);
  const rightTokens = folderTokens(right);
  let score = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) score += 1;
  }
  return score;
}

function chooseCandidate(metadataItem, candidates) {
  if (candidates.length <= 1) return candidates[0] || null;
  const ranked = [...candidates].sort((left, right) => (
    folderScore(metadataItem.folder, right.folder) - folderScore(metadataItem.folder, left.folder)
    || String(left.folder).localeCompare(String(right.folder))
    || String(left.id).localeCompare(String(right.id))
  ));
  // Never pick an arbitrary movie when filenames collide without a clear folder match.
  if (folderScore(metadataItem.folder, ranked[0].folder) <= folderScore(metadataItem.folder, ranked[1].folder)) return null;
  return ranked[0];
}

function createHybridProvider({ jellyfinProvider, oneDriveProvider, localProvider = null }) {
  if (!jellyfinProvider || !oneDriveProvider) {
    throw new TypeError("Hybrid provider requires Jellyfin and OneDrive providers.");
  }

  const playbackIds = new Map();

  async function buildLibrary() {
    const [metadataResult, cloudLibrary, localLibrary] = await Promise.all([
      Promise.resolve().then(() => jellyfinProvider.listLibrary()).catch((error) => ({ error })),
      oneDriveProvider.listLibrary(),
      localProvider ? Promise.resolve().then(() => localProvider.listLibrary()).catch(() => null) : Promise.resolve(null),
    ]);
    let metadataLibrary = metadataResult?.error ? null : metadataResult;
    if ((!metadataLibrary?.movies?.length || metadataResult?.error) && localLibrary) {
      metadataLibrary = localLibrary;
    }
    // Cloud files remain available even when the optional home metadata server is offline.
    metadataLibrary ||= { movies: [], folders: [] };
    const metadataSource = metadataLibrary === localLibrary ? "filesystem" : "jellyfin";
    const exactFiles = new Map();
    const stems = new Map();

    for (const cloudItem of cloudLibrary.movies) {
      const exact = fileKey(cloudItem.fileName);
      const stem = stemKey(cloudItem.fileName);
      if (exact) exactFiles.set(exact, [...(exactFiles.get(exact) || []), cloudItem]);
      if (stem) stems.set(stem, [...(stems.get(stem) || []), cloudItem]);
    }

    const nextPlaybackIds = new Map();
    const matchedCloudIds = new Set();
    const knownFileKeys = new Set();
    const movies = metadataLibrary.movies.map((metadataItem) => {
      knownFileKeys.add(`${normalize(metadataItem.folder)}/${fileKey(metadataItem.fileName)}`);
      const exactMatches = exactFiles.get(fileKey(metadataItem.fileName)) || [];
      const stemMatches = stems.get(stemKey(metadataItem.fileName)) || [];
      const cloudItem = chooseCandidate(
        metadataItem,
        exactMatches.length ? exactMatches : stemMatches,
      );
      if (cloudItem) {
        nextPlaybackIds.set(metadataItem.id, cloudItem.id);
        matchedCloudIds.add(cloudItem.id);
      }
      return {
        ...cloudItem,
        ...metadataItem,
        folder: metadataItem.folder || cloudItem?.folder || "",
        source: "hybrid",
        metadataSource,
        metadataProviderId: metadataSource === "jellyfin" ? metadataItem.id : "",
        playbackSource: "onedrive",
        playbackAvailable: Boolean(cloudItem),
        size: Number(cloudItem?.size) || Number(metadataItem.size) || 0,
        posterUrl: metadataItem.posterUrl || cloudItem?.posterUrl || "",
        posterFallbackUrl: cloudItem?.posterUrl || "",
        backdropUrl: metadataItem.backdropUrl || cloudItem?.backdropUrl || "",
        backdropFallbackUrl: cloudItem?.backdropUrl || "",
      };
    });

    // Jellyfin may not have indexed every folder under the canonical Movie
    // downloads root yet. Keep those files visible and grouped while still
    // using Jellyfin metadata wherever it exists.
    if (localLibrary && metadataLibrary !== localLibrary) {
      for (const localItem of localLibrary.movies) {
        const key = `${normalize(localItem.folder)}/${fileKey(localItem.fileName)}`;
        if (!key || knownFileKeys.has(key)) continue;
        knownFileKeys.add(key);
        const exactMatches = exactFiles.get(fileKey(localItem.fileName)) || [];
        const stemMatches = stems.get(stemKey(localItem.fileName)) || [];
        const cloudItem = chooseCandidate(localItem, exactMatches.length ? exactMatches : stemMatches);
        if (cloudItem && matchedCloudIds.has(cloudItem.id)) continue;
        if (cloudItem) {
          nextPlaybackIds.set(localItem.id, cloudItem.id);
          matchedCloudIds.add(cloudItem.id);
        }
        movies.push({
          ...localItem,
          source: "hybrid",
          metadataSource: "filesystem",
          metadataProviderId: "",
          playbackSource: "onedrive",
          playbackAvailable: Boolean(cloudItem),
          size: Number(cloudItem?.size) || Number(localItem.size) || 0,
        });
      }
    }

    // Include new uploads and duplicate filenames in separate folders by drive item ID.
    for (const cloudItem of cloudLibrary.movies) {
      if (matchedCloudIds.has(cloudItem.id)) continue;
      nextPlaybackIds.set(cloudItem.id, cloudItem.id);
      movies.push({ ...cloudItem, source: "hybrid", playbackSource: "onedrive",
        metadataSource: cloudItem.metadataSource || "onedrive",
        playbackAvailable: cloudItem.playbackAvailable !== false && Number(cloudItem.size) > 0 });
    }
    playbackIds.clear();
    for (const [id, cloudId] of nextPlaybackIds) playbackIds.set(id, cloudId);
    const folders = [...(metadataLibrary.folders || [])];
    if (localLibrary && metadataLibrary !== localLibrary) {
      const seenFolders = new Set(folders.map((folder) => String(folder.path)));
      for (const folder of localLibrary.folders || []) {
        if (seenFolders.has(String(folder.path))) continue;
        seenFolders.add(String(folder.path));
        folders.push(folder);
      }
    }
    const seenFolderPaths = new Set(folders.map((folder) => folder.path));
    for (const folder of cloudLibrary.folders || []) {
      if (!seenFolderPaths.has(folder.path)) { folders.push(folder); seenFolderPaths.add(folder.path); }
    }
    return {
      movies,
      folders,
      metadataStatus: metadataResult?.error ? "offline" : "connected",
      cacheStatus: cloudLibrary.cacheStatus || "fresh",
      cacheWarning: cloudLibrary.cacheWarning || "",
      series: buildSeriesGroups(movies),
      metadataProvider: "jellyfin",
      playbackProvider: "onedrive",
      refreshedAt: new Date().toISOString(),
    };
  }

  async function resolvePlayback(movieId) {
    let oneDriveId = playbackIds.get(movieId);
    if (!oneDriveId) {
      await buildLibrary();
      oneDriveId = playbackIds.get(movieId);
    }
    if (!oneDriveId) {
      throw providerError("This Jellyfin title could not be matched to a OneDrive video file.", 404);
    }
    return oneDriveProvider.resolvePlayback(oneDriveId);
  }

  return {
    kind: "hybrid",
    metadataKind: "jellyfin",
    playbackKind: "onedrive",
    async listLibrary() { return buildLibrary(); },
    async listMovies() { return (await buildLibrary()).movies; },
    async resolvePlayback(movieId) { return resolvePlayback(movieId); },
    proxyImage: jellyfinProvider.proxyImage,
    proxyArtwork: oneDriveProvider.proxyArtwork,
    resolveArtwork: oneDriveProvider.resolveArtwork,
  };
}

module.exports = { createHybridProvider, fileKey, stemKey };
