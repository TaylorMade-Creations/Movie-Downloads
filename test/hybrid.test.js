const test = require("node:test");
const assert = require("node:assert/strict");

const { createHybridProvider } = require("../lib/providers/hybrid");

function metadataMovie(overrides = {}) {
  return {
    id: "jellyfin-movie-1",
    title: "Pilot",
    fileName: "Northern Exposure - S01E01 - Pilot.avi",
    folder: "Northern Exposure/Season 1",
    posterUrl: "/api/jellyfin/image/jellyfin-movie-1",
    overview: "The first episode.",
    source: "jellyfin",
    ...overrides,
  };
}

test("hybrid provider keeps Jellyfin metadata and resolves playback through OneDrive", async () => {
  const playbackRequests = [];
  const jellyfinProvider = {
    async listLibrary() {
      return {
        movies: [metadataMovie()],
        folders: [{ id: "season-1", path: "Northern Exposure/Season 1" }],
      };
    },
    async proxyImage() { return new Response("poster"); },
  };
  const oneDriveProvider = {
    async listLibrary() {
      return {
        movies: [{
          id: "onedrive-file-1",
          fileName: "Northern Exposure - S01E01 - Pilot.avi",
          folder: "TV Shows/Northern Exposure/Northern Exposure Season 1",
          size: 123456,
        }],
        folders: [],
      };
    },
    async resolvePlayback(id) {
      playbackRequests.push(id);
      return { url: "https://onedrive.example/movie", expiresAt: null };
    },
  };

  const provider = createHybridProvider({ jellyfinProvider, oneDriveProvider });
  const library = await provider.listLibrary();

  assert.equal(provider.kind, "hybrid");
  assert.equal(library.movies[0].id, "jellyfin-movie-1");
  assert.equal(library.movies[0].overview, "The first episode.");
  assert.equal(library.movies[0].posterUrl, "/api/jellyfin/image/jellyfin-movie-1");
  assert.equal(library.movies[0].source, "hybrid");
  assert.equal(library.movies[0].playbackSource, "onedrive");
  assert.equal(library.movies[0].playbackAvailable, true);
  assert.equal(library.movies[0].size, 123456);
  assert.deepEqual(await provider.resolvePlayback("jellyfin-movie-1"), {
    url: "https://onedrive.example/movie",
    expiresAt: null,
  });
  assert.deepEqual(playbackRequests, ["onedrive-file-1"]);
});

test("hybrid provider ignores zero-byte upload placeholders when matching playback", async () => {
  const playbackRequests = [];
  const provider = createHybridProvider({
    jellyfinProvider: {
      async listLibrary() {
        return { movies: [metadataMovie({
          fileName: "Bomb Girls Facing the Enemy.mp4",
          folder: "Movies/Bomb Girls Facing the Enemy",
        })], folders: [] };
      },
    },
    oneDriveProvider: {
      async listLibrary() {
        return { movies: [
          { id: "broken-mp4", fileName: "Bomb Girls Facing the Enemy.mp4", folder: "Movies/Bomb Girls Facing the Enemy", size: 0 },
          { id: "healthy-mkv", fileName: "Bomb Girls Facing the Enemy.mkv", folder: "Movies/Bomb Girls Facing the Enemy", size: 5941107910 },
        ], folders: [] };
      },
      async resolvePlayback(id) {
        playbackRequests.push(id);
        return { url: "https://cloud.example/bomb-girls" };
      },
    },
  });

  const library = await provider.listLibrary();
  assert.equal(library.movies[0].playbackAvailable, true);
  assert.equal(library.movies[0].size, 5941107910);
  await provider.resolvePlayback(library.movies[0].id);
  assert.deepEqual(playbackRequests, ["healthy-mkv"]);
});

test("hybrid provider uses Jellyfin compatibility playback for browser-hostile containers", async () => {
  const compatibilityRequests = [];
  const provider = createHybridProvider({
    jellyfinProvider: {
      async listLibrary() {
        return { movies: [metadataMovie({ fileName: "Bomb Girls.mkv" })], folders: [] };
      },
      async proxyImage() { return new Response("poster"); },
      async resolvePlayback(id, options) {
        compatibilityRequests.push({ id, options });
        return { url: `/api/jellyfin/stream?movieId=${id}&transcode=1`, contentType: "video/mp4" };
      },
    },
    oneDriveProvider: {
      async listLibrary() {
        return { movies: [{ id: "cloud-bomb-girls", fileName: "Bomb Girls.mkv", folder: "Movies/Bomb Girls", size: 100 }], folders: [] };
      },
      async resolvePlayback() { throw new Error("browser-hostile media must use Jellyfin compatibility playback"); },
    },
  });

  await provider.listLibrary();
  assert.deepEqual(await provider.resolvePlayback("jellyfin-movie-1"), {
    url: "/api/jellyfin/stream?movieId=jellyfin-movie-1&transcode=1",
    contentType: "video/mp4",
  });
  assert.deepEqual(compatibilityRequests, [{ id: "jellyfin-movie-1", options: { transcode: true } }]);
});

test("hybrid provider refreshes a stale Jellyfin index before exposing a new MKV", async () => {
  let refreshed = false;
  const jellyfinProvider = {
    async listLibrary() {
      return refreshed
        ? { movies: [{ id: "jellyfin-bomb", fileName: "Bomb Girls Facing the Enemy.mkv", folder: "Movies/Bomb Girls Facing the Enemy", extension: ".mkv" }], folders: [] }
        : { movies: [], folders: [] };
    },
    async refreshLibrary() { refreshed = true; },
    async resolvePlayback(id, options) {
      assert.equal(id, "jellyfin-bomb");
      assert.deepEqual(options, { transcode: true });
      return { url: "/api/jellyfin/stream?movieId=jellyfin-bomb&transcode=1", contentType: "video/mp4" };
    },
  };
  const provider = createHybridProvider({
    jellyfinProvider,
    oneDriveProvider: {
      async listLibrary() {
        return { movies: [{ id: "cloud-bomb", fileName: "Bomb Girls Facing the Enemy.mkv", folder: "Movies/Bomb Girls Facing the Enemy", size: 100 }], folders: [] };
      },
      async resolvePlayback() { return { url: "https://cloud.example/bomb" }; },
    },
    localProvider: {
      async listLibrary() {
        return { movies: [{ id: "local-bomb", fileName: "Bomb Girls Facing the Enemy.mkv", folder: "Movies/Bomb Girls Facing the Enemy", extension: ".mkv", size: 100 }], folders: [] };
      },
    },
  });

  const library = await provider.listLibrary();
  assert.equal(library.movies[0].id, "jellyfin-bomb");
  assert.deepEqual(await provider.resolvePlayback("jellyfin-bomb"), {
    url: "/api/jellyfin/stream?movieId=jellyfin-bomb&transcode=1",
    contentType: "video/mp4",
  });
});

test("hybrid provider fails safely instead of playing an unrelated cloud file", async () => {
  const provider = createHybridProvider({
    jellyfinProvider: {
      async listLibrary() { return { movies: [metadataMovie()], folders: [] }; },
      async proxyImage() { return new Response("poster"); },
    },
    oneDriveProvider: {
      async listLibrary() {
        return { movies: [{ id: "wrong", fileName: "Different Movie.mp4", folder: "Movies" }], folders: [] };
      },
      async resolvePlayback() { throw new Error("must not be called"); },
    },
  });

  const library = await provider.listLibrary();
  assert.equal(library.movies[0].playbackAvailable, false);
  await assert.rejects(
    provider.resolvePlayback("jellyfin-movie-1"),
    /could not be matched to a OneDrive video file/i,
  );
});

test("hybrid provider uses folder similarity to disambiguate duplicate filenames", async () => {
  const provider = createHybridProvider({
    jellyfinProvider: {
      async listLibrary() {
        return {
          movies: [metadataMovie({ id: "episode-2", fileName: "Episode 1.avi", folder: "Northern Exposure/Season 2" })],
          folders: [],
        };
      },
      async proxyImage() { return new Response("poster"); },
    },
    oneDriveProvider: {
      async listLibrary() {
        return {
          movies: [
            { id: "season-1", fileName: "Episode 1.avi", folder: "TV Shows/Northern Exposure/Season 1" },
            { id: "season-2", fileName: "Episode 1.avi", folder: "TV Shows/Northern Exposure/Season 2" },
          ],
          folders: [],
        };
      },
      async resolvePlayback(id) { return { url: `https://onedrive.example/${id}` }; },
    },
  });

  await provider.listLibrary();
  assert.equal((await provider.resolvePlayback("episode-2")).url, "https://onedrive.example/season-2");
});

test("cloud-only movies and folders survive a Jellyfin outage and unavailable local disk", async () => {
  const provider = createHybridProvider({
    jellyfinProvider: { async listLibrary() { throw new Error("offline"); } },
    localProvider: { async listLibrary() { throw new Error("no home disk"); } },
    oneDriveProvider: {
      async listLibrary() { return { movies: [{ id: "cloud-new", fileName: "New.mp4", folder: "B", size: 100, overview: "Synced description", metadataSource: "jellyfin" }], folders: [{ path: "B" }] }; },
      async resolvePlayback(id) { return { url: `https://cloud.example/${id}` }; },
    },
  });
  const library = await provider.listLibrary();
  assert.equal(library.movies.length, 1);
  assert.equal(library.movies[0].overview, "Synced description");
  assert.equal(library.movies[0].playbackAvailable, true);
  assert.equal(library.metadataStatus, "offline");
  assert.equal(library.folders[0].path, "B");
  assert.equal((await provider.resolvePlayback("cloud-new")).url, "https://cloud.example/cloud-new");
});

test("new cloud uploads remain visible alongside matched Windows-path Jellyfin movies", async () => {
  const provider = createHybridProvider({
    jellyfinProvider: { async listLibrary() { return { movies: [metadataMovie({ fileName: "C:\\Movies\\Pilot.mp4" })], folders: [] }; } },
    oneDriveProvider: {
      async listLibrary() { return { movies: [
        { id: "cloud-match", fileName: "Pilot.mp4", folder: "B", size: 100, posterUrl: "/cloud-cover.jpg" },
        { id: "cloud-new", fileName: "New.mp4", folder: "B", size: 100 },
      ], folders: [] }; },
      async resolvePlayback(id) { return { url: `https://cloud.example/${id}` }; },
    },
  });
  const library = await provider.listLibrary();
  assert.equal(library.movies.length, 2);
  assert.equal(library.movies[0].posterFallbackUrl, "/cloud-cover.jpg");
  assert.equal((await provider.resolvePlayback("jellyfin-movie-1")).url, "https://cloud.example/cloud-match");
  assert.equal((await provider.resolvePlayback("cloud-new")).url, "https://cloud.example/cloud-new");
});

test("ambiguous duplicate filenames cannot select an unrelated cloud movie", async () => {
  const provider = createHybridProvider({
    jellyfinProvider: { async listLibrary() { return { movies: [metadataMovie({ fileName: "Movie.mp4", folder: "" })], folders: [] }; } },
    oneDriveProvider: {
      async listLibrary() { return { movies: [
        { id: "one", fileName: "Movie.mp4", folder: "Film One", size: 100 },
        { id: "two", fileName: "Movie.mp4", folder: "Film Two", size: 100 },
      ], folders: [] }; },
      async resolvePlayback(id) { return { url: `https://cloud.example/${id}` }; },
    },
  });
  const library = await provider.listLibrary();
  assert.equal(library.movies.length, 3);
  assert.equal(library.movies[0].playbackAvailable, false);
  assert.deepEqual(library.movies.slice(1).map(movie => movie.id), ["one", "two"]);
  await assert.rejects(provider.resolvePlayback("jellyfin-movie-1"), /could not be matched/);
});
