const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createPlaybackResolver, createServer } = require("../server");
const { createApp, classifyMovie, filterMovieFolders } = require("../public/app");
const { MemoryStore } = require("../lib/store");
const { createOneDriveProvider } = require("../lib/providers/onedrive");
const { movieTitleFromName, posterUrlFromTitle } = require("../lib/media");
const { createViewerStateClient } = require("../public/viewer-state");
const { createArtworkResolver, noArtworkSvg } = require("../lib/artwork");

function createTempLibrary() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "movie-room-"));
  const moviesDir = path.join(root, "movies");
  const publicDir = path.join(root, "public");
  fs.mkdirSync(path.join(moviesDir, "Collections"), { recursive: true });
  fs.mkdirSync(publicDir, { recursive: true });
  fs.writeFileSync(path.join(publicDir, "index.html"), "<h1>Movie Room</h1>");
  fs.writeFileSync(path.join(publicDir, "app.js"), "console.log('ok');");
  return { root, moviesDir, publicDir };
}

async function waitForCondition(predicate, timeoutMs = 1000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for condition.");
}

function seedOneDriveLibraryCache(store, library) {
  return store.set(
    "onedrive:library:drive-id:root-item",
    JSON.stringify({ cachedAt: new Date().toISOString(), library }),
    7 * 24 * 60 * 60 * 1000,
  );
}

function createAuthOptions(overrides = {}) {
  const authOverrides = overrides.auth || {};
  const { auth: _ignored, ...rest } = overrides;
  return {
    auth: {
      password: "lowercase",
      sessionSecret: "0123456789abcdef0123456789abcdef",
      sessionTtlMs: 60_000,
      rateLimitMaxAttempts: 2,
      rateLimitWindowMs: 60_000,
      ...authOverrides,
    },
    ...rest,
  };
}

async function startServer(options) {
  const server = createServer(options);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return server;
}

async function login(port, password = "lowercase", headers = {}) {
  return fetch(`http://127.0.0.1:${port}/api/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: `http://127.0.0.1:${port}`,
      ...headers,
    },
    body: JSON.stringify({ password }),
  });
}

async function pairFireTv(port, label = "Test Fire TV") {
  const origin = `http://127.0.0.1:${port}`;
  const pollSecret = `poll-secret-${Math.random()}`;
  const createResponse = await fetch(`${origin}/api/tv/pairings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceLabel: label, pollSecret }),
  });
  assert.equal(createResponse.status, 201);
  const created = await createResponse.json();

  const authResponse = await login(port);
  const approveResponse = await fetch(`${origin}/api/tv/pairings/approve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: authResponse.headers.get("set-cookie"),
      Origin: origin,
    },
    body: JSON.stringify({ code: created.code }),
  });
  assert.equal(approveResponse.status, 200);

  const pollResponse = await fetch(`${origin}/api/tv/pairings/${created.pairingId}`, {
    headers: { Authorization: `Bearer ${pollSecret}` },
  });
  assert.equal(pollResponse.status, 200);
  const approved = await pollResponse.json();
  assert.ok(approved.deviceToken);
  return approved.deviceToken;
}

test("cleans movie file names and derives poster URLs", () => {
  assert.equal(movieTitleFromName("Family.Movie.1080p.WEB-DL.x264.AAC.mp4"), "Family Movie");
  assert.equal(movieTitleFromName("ACME-Night_4K_BluRay_HEVC.mkv"), "ACME Night");
  assert.equal(
    movieTitleFromName("01 Home Alone 1   Family Comedy 1990 Eng Subs [H246 mp4].mp4"),
    "Home Alone 1",
  );
  assert.equal(
    movieTitleFromName("Coyote.vs.Acme.2026.1080p.HEVC.x265.RMTeam.mkv"),
    "Coyote vs Acme",
  );
  assert.equal(posterUrlFromTitle("ACME Night"), "/posters/acme-night.jpg");
});

test("artwork resolver uses a real title-matched source and caches it", async () => {
  const calls = [];
  const resolver = createArtworkResolver({
    fetchImpl: async (url) => {
      calls.push(String(url));
      if (String(url).includes("itunes.apple.com")) {
        return new Response(JSON.stringify({
          results: [{ trackName: "Home Alone", artworkUrl100: "https://img.example/home-alone/100x100bb.jpg" }],
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      throw new Error("unexpected secondary lookup");
    },
  });
  const first = await resolver.search("Home Alone", "1990");
  const second = await resolver.search("Home Alone", "1990");
  assert.equal(first.source, "iTunes");
  assert.equal(first.url, "https://img.example/home-alone/600x900bb.jpg");
  assert.deepEqual(second, first);
  assert.equal(calls.length, 1);
});

test("no-artwork fallback is an explicit image, never a video frame", () => {
  const svg = noArtworkSvg("Unknown Movie");
  assert.match(svg, /<svg/);
  assert.match(svg, /ARTWORK UNAVAILABLE/);
  assert.match(svg, /Unknown Movie/);
});

test("authenticated artwork route returns the resolved poster bytes", async () => {
  const calls = [];
  const server = await startServer(createAuthOptions({
    fetchImpl: async (url) => {
      calls.push(String(url));
      if (String(url).includes("itunes.apple.com")) {
        return new Response(JSON.stringify({
          results: [{ trackName: "Home Alone", artworkUrl100: "https://img.example/home-alone/100x100bb.jpg" }],
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (String(url).startsWith("https://img.example/")) {
        return new Response(Buffer.from("poster-bytes"), { status: 200, headers: { "content-type": "image/jpeg" } });
      }
      throw new Error(`unexpected artwork request: ${url}`);
    },
  }));
  const port = server.address().port;
  try {
    const loginResponse = await login(port);
    const artworkResponse = await fetch(`http://127.0.0.1:${port}/api/artwork?title=Home%20Alone&year=1990`, {
      headers: { Cookie: loginResponse.headers.get("set-cookie") },
    });
    assert.equal(artworkResponse.status, 200);
    assert.match(artworkResponse.headers.get("content-type") || "", /^image\/jpeg/);
    assert.equal(Buffer.from(await artworkResponse.arrayBuffer()).toString(), "poster-bytes");
    assert.equal(calls.length, 2);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("organizes the library into family categories and hides technical folders", () => {
  assert.equal(classifyMovie({ title: "Toy Story 5" }), "kids");
  assert.equal(classifyMovie({ title: "Northern Exposure" }), "mom");
  assert.equal(classifyMovie({ title: "Home Alone" }), "kids");
  assert.equal(classifyMovie({ title: "In The Grey" }), "adults");
  assert.deepEqual(
    filterMovieFolders([
      { path: "Home Alone Collection", name: "Home Alone Collection", movieCount: 5 },
      { path: "Home Alone Collection/Home Alone Complete Collection", name: "Home Alone Complete Collection", movieCount: 5 },
      { path: "Home Alone Collection/Home Alone Complete Collection/Subs", name: "Subs", movieCount: 0 },
      { path: "TV Shows", name: "TV Shows", movieCount: 110 },
      { path: "TV Shows/Northern Exposure", name: "Northern Exposure", movieCount: 110 },
      { path: "TV Shows/Northern Exposure/Season 1", name: "Season 1", movieCount: 8 },
      { path: "TV Shows/Northern Exposure/Season 2", name: "Season 2", movieCount: 23 },
      { path: "Movie Room Application Mac Copy/firetv/src", name: "src", movieCount: 0 },
    ]).map((folder) => folder.path),
    [
      "Home Alone Collection",
      "TV Shows/Northern Exposure",
    ],
  );
});

test("ships discovery shelves and a profile-aware viewer-state client", async () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
  const appSource = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
  assert.match(html, /id="hero-movie"/);
  assert.match(html, /hero-movie \{[^}]*min-height: clamp\(220px, 30vw, 360px\)/);
  assert.match(html, /background-image: var\(--page-backdrop/);
  assert.match(html, /aspect-ratio: 2 \/ 3/);
  assert.match(html, /\.poster > img \+ \.poster-fallback/);
  assert.match(appSource, /style\.setProperty\("--page-backdrop"/);
  assert.match(html, /data-mobile-action="library"/);
  assert.match(appSource, /activeLibraryView = "movies";\s*activeFolder = "all";\s*activeCategory = "all";\s*setActivePage\("library"\);\s*renderLibrary\(\);/);
  assert.match(html, /id="recent-title">Recently Downloaded/);
  assert.ok(html.indexOf('id="hero-movie"') < html.indexOf('id="category-shelf"'));
  assert.ok(html.indexOf('id="category-shelf"') < html.indexOf('id="continue-watching-shelf"'));
  assert.ok(html.indexOf('id="continue-watching-shelf"') < html.indexOf('id="recently-added-shelf"'));
  assert.ok(html.indexOf('id="recently-added-shelf"') < html.indexOf('id="movie-grid"'));
  assert.match(html, /id="continue-watching-shelf"/);
  assert.match(html, /id="recently-added-shelf"/);
  assert.match(html, /id="movie-details-page"/);
  assert.match(html, /id="mobile-nav"/);
  assert.match(appSource, /\["all", "Entire Library"\]/);
  assert.match(appSource, /\["family", "Family"\]/);
  assert.match(appSource, /\["horror", "Horror"\]/);
  assert.match(appSource, /\["action", "Action"\]/);
  assert.match(appSource, /function genresForMovie/);
  assert.match(appSource, /collection-preview-strip/);
  assert.match(appSource, /function installHoverPreview/);
  assert.match(appSource, /preview\.muted = true/);
  assert.match(html, /\.watch-stage\.player-page \{[^}]*align-items: start/);
  assert.match(html, /\.watch-stage\.player-page \.player-frame \{[^}]*justify-self: stretch/);
  assert.match(html, /\.player-frame \{[^}]*overflow: visible/);
  assert.match(html, /video \{[^}]*max-height: none/);
  assert.match(html, /video \{[^}]*object-fit: contain/);
  assert.match(html, /id="player-side-panel"/);
  assert.match(html, /id="player-settings"/);
  assert.match(html, /id="player-network-settings"/);
  assert.match(html, /\.watch-stage\.player-page \{[^}]*grid-template-columns: minmax\(0, min\(40vw/);
  assert.match(html, /\.watch-stage\.player-page \.player-frame \{[^}]*grid-column: 1/);
  assert.match(html, /id="hero-preview-video"/);
  assert.match(appSource, /heroPreviewVersion/);

  const calls = [];
  const client = createViewerStateClient({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, status: 200, async json() { return { revision: 1 }; } };
    },
  });
  const state = await client.load("mom");
  assert.deepEqual(state, { revision: 1 });
  await client.apply("mom", [{ type: "queueAdd", movieId: "movie-1" }]);
  assert.equal(calls[0].url, "/api/viewer-state?profileId=mom");
  assert.equal(calls[1].options.method, "PATCH");
  assert.match(calls[1].options.body, /queueAdd/);
});

test("exposes synchronized playback controls and player modes", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
  assert.match(html, /id="theater-mode"/);
  assert.match(html, /id="miniplayer-mode"/);
  assert.match(html, /id="up-next-panel"/);
  assert.match(html, /data-key="j"/i);
});

test("serves the watch page and protects the movie catalog", async (t) => {
  const { root, moviesDir, publicDir } = createTempLibrary();
  fs.writeFileSync(path.join(moviesDir, "Family-Night.mp4"), "abcdef");

  const server = await startServer(createAuthOptions({ moviesDir, publicDir }));

  t.after(() => {
    server.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  const { port } = server.address();
  const pageResponse = await fetch(`http://127.0.0.1:${port}/`);
  assert.equal(pageResponse.status, 200);
  assert.match(await pageResponse.text(), /Movie Room/);
  assert.match(
    pageResponse.headers.get("permissions-policy") || "",
    /screen-wake-lock=\(self\)/,
  );

  const moviesResponse = await fetch(`http://127.0.0.1:${port}/api/movies`);
  assert.equal(moviesResponse.status, 401);
});

test("preloads the selected movie for smoother in-page playback", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
  assert.match(html, /<video\s+id="player"[\s\S]*preload="auto"[\s\S]*><\/video>/);
});

test("exposes phone and TV playback controls", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
  assert.match(html, /id="cast-tv"/);
  assert.match(html, /id="pair-fire-tv"/);
  assert.match(html, /id="fire-tv-pairing-form"/);
  assert.match(html, /id="fire-tv-code"/);
  assert.match(html, /id="fire-tv-pairing-status"/);
  assert.match(html, /Pair Fire TV/);
  assert.match(html, /id="keep-awake"/);
  assert.match(html, /id="fullscreen-player"/);
  assert.match(html, /id="seek-backward"/);
  assert.match(html, /id="seek-forward"/);
  assert.match(html, /player-frame:fullscreen \.fullscreen-overlay/);
  assert.match(html, /id="profile-toggle"/);
  assert.match(html, /data-viewer-profile="mom"/);
  assert.match(html, /data-viewer-profile="morganne"/);
  assert.match(html, /data-viewer-profile="kids"/);
  assert.match(html, /x-webkit-airplay="allow"/);
  assert.match(html, /webkit-playsinline/);
  assert.match(html, /id="buffer-status"/);
  assert.match(html, /id="tv-guide-steps"/);
  assert.match(html, /id="tv-guide-status"/);
  assert.match(html, /iPhone to TV/);
  assert.match(html, /id="permission-panel"/);
  assert.match(html, /id="enable-permissions"/);
  assert.match(html, /id="skip-permissions"/);
  assert.match(html, /cast_sender\.js\?loadCastFramework=1/);
  assert.match(html, /__onGCastApiAvailable/);
  assert.doesNotMatch(html, /disableremoteplayback/i);
  const script = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
  assert.match(script, /firetv_code/);
});

test("configures Fire TV playback for buffered seeking", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "firetv", "src", "main", "java", "com", "movieroom", "firetv", "MainActivity.java"),
    "utf8",
  );
  assert.match(source, /setShowRewindButton\(true\)/);
  assert.match(source, /setShowFastForwardButton\(true\)/);
  assert.match(source, /KEYCODE_MEDIA_FAST_FORWARD/);
  assert.match(source, /KEYCODE_MEDIA_REWIND/);
  assert.match(source, /setBufferDurationsMs\(60_000, 300_000, 5_000, 10_000\)/);
  assert.match(source, /setPrioritizeTimeOverSizeThresholds\(true\)/);
});

test("ships a Safari-compatible browser script for older iPhones", () => {
  const script = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");

  assert.doesNotMatch(script, /\?\./, "optional chaining can stop older Safari before the app starts");
  assert.doesNotMatch(script, /\?\?/, "nullish coalescing can stop older Safari before the app starts");
});

test("configures Vercel media permissions for static pages", () => {
  const vercelConfig = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "vercel.json"), "utf8"));
  const permissionsHeader = vercelConfig.headers
    .flatMap((entry) => entry.headers)
    .find((header) => header.key.toLowerCase() === "permissions-policy");

  assert.match(permissionsHeader.value, /screen-wake-lock=\(self\)/);
  assert.doesNotMatch(permissionsHeader.value, /bluetooth=/);
  assert.match(permissionsHeader.value, /fullscreen=\(self\)/);
  assert.match(permissionsHeader.value, /local-network=\(self\)/);
  assert.match(permissionsHeader.value, /local-network-access=\(self\)/);
  assert.match(permissionsHeader.value, /loopback-network=\(self\)/);
  assert.match(permissionsHeader.value, /picture-in-picture=\(self\)/);
  assert.doesNotMatch(permissionsHeader.value, /presentation=/);
});

test("logs in, lists nested local movies, resolves playback, and logs out", async (t) => {
  const { root, moviesDir, publicDir } = createTempLibrary();
  fs.writeFileSync(path.join(moviesDir, "Collections", "Family-Night.mp4"), "abcdef");

  const server = await startServer(createAuthOptions({ moviesDir, publicDir }));

  t.after(() => {
    server.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  const { port } = server.address();
  const authResponse = await login(port);
  assert.equal(authResponse.status, 204);
  const sessionCookie = authResponse.headers.get("set-cookie");
  assert.match(sessionCookie, /movie_room_session=/);

  const moviesResponse = await fetch(`http://127.0.0.1:${port}/api/movies`, {
    headers: { Cookie: sessionCookie },
  });
  assert.equal(moviesResponse.status, 200);

  const movies = await moviesResponse.json();
  assert.equal(movies[0].title, "Family Night");
  assert.equal(movies[0].folder, "Collections");
  assert.equal(movies[0].posterUrl, "/posters/family-night.jpg");

  const playbackResponse = await fetch(`http://127.0.0.1:${port}/api/playback/${encodeURIComponent(movies[0].id)}`, {
    headers: { Cookie: sessionCookie },
  });
  assert.equal(playbackResponse.status, 200);
  assert.deepEqual(await playbackResponse.json(), {
    url: "/api/stream/Collections/Family-Night.mp4",
    expiresAt: null,
  });

  const vercelPlaybackResponse = await fetch(`http://127.0.0.1:${port}/api/playback`, {
    method: "POST",
    headers: {
      Cookie: sessionCookie,
      "Content-Type": "application/json",
      Origin: `http://127.0.0.1:${port}`,
    },
    body: JSON.stringify({ movieId: movies[0].id }),
  });
  assert.equal(vercelPlaybackResponse.status, 200);
  assert.deepEqual(await vercelPlaybackResponse.json(), {
    url: "/api/stream/Collections/Family-Night.mp4",
    expiresAt: null,
  });

  const headResponse = await fetch(`http://127.0.0.1:${port}/api/stream/Collections/Family-Night.mp4`, {
    method: "HEAD",
    headers: { Cookie: sessionCookie },
  });
  assert.equal(headResponse.status, 200);

  const secondAuthResponse = await login(port);
  const secondSessionCookie = secondAuthResponse.headers.get("set-cookie");
  const [viewerOneResponse, viewerTwoResponse] = await Promise.all([
    fetch(`http://127.0.0.1:${port}/api/stream/Collections/Family-Night.mp4`, {
      headers: { Cookie: sessionCookie, Range: "bytes=0-2" },
    }),
    fetch(`http://127.0.0.1:${port}/api/stream/Collections/Family-Night.mp4`, {
      headers: { Cookie: secondSessionCookie, Range: "bytes=3-5" },
    }),
  ]);
  assert.equal(viewerOneResponse.status, 206);
  assert.equal(viewerTwoResponse.status, 206);
  assert.equal(await viewerOneResponse.text(), "abc");
  assert.equal(await viewerTwoResponse.text(), "def");

  const logoutResponse = await fetch(`http://127.0.0.1:${port}/api/logout`, {
    method: "POST",
    headers: {
      Cookie: sessionCookie,
      "Content-Type": "application/json",
      Origin: `http://127.0.0.1:${port}`,
    },
    body: "{}",
  });
  assert.equal(logoutResponse.status, 204);

  const afterLogoutResponse = await fetch(`http://127.0.0.1:${port}/api/movies`, {
    headers: { Cookie: sessionCookie },
  });
  assert.equal(afterLogoutResponse.status, 401);
});

test("coalesces simultaneous playback-link resolution for independent viewers", async () => {
  let resolveCalls = 0;
  let releaseResolution;
  const resolutionGate = new Promise((resolve) => {
    releaseResolution = resolve;
  });
  const provider = {
    kind: "onedrive",
    async resolvePlayback(movieId) {
      resolveCalls += 1;
      await resolutionGate;
      return {
        url: `https://download.example/${encodeURIComponent(movieId)}`,
        expiresAt: null,
      };
    },
  };
  const resolvePlayback = createPlaybackResolver(provider);
  const first = resolvePlayback("toy-story-5.mp4");
  const second = resolvePlayback("toy-story-5.mp4");
  await Promise.resolve();
  assert.equal(resolveCalls, 1);
  releaseResolution();

  assert.deepEqual(
    await Promise.all([first, second]),
    [
      { url: "https://download.example/toy-story-5.mp4", expiresAt: null },
      { url: "https://download.example/toy-story-5.mp4", expiresAt: null },
    ],
  );
});

test("issues an opaque Cast ticket that streams without the browser session and then expires", async (t) => {
  const { root, moviesDir, publicDir } = createTempLibrary();
  fs.writeFileSync(path.join(moviesDir, "Cast-Night.mp4"), "0123456789");
  const clock = { now: 10_000 };
  const store = new MemoryStore(() => clock.now);
  const castPlaybackTtlMs = 30_000;
  const server = await startServer(createAuthOptions({
    moviesDir,
    publicDir,
    store,
    now: () => clock.now,
    castPlaybackTtlMs,
    auth: { sessionTtlMs: 60_000 },
  }));

  t.after(() => {
    server.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  const { port } = server.address();
  const origin = `http://127.0.0.1:${port}`;
  const unsignedTicketResponse = await fetch(`${origin}/api/cast/playback`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
    },
    body: JSON.stringify({ movieId: "Cast-Night.mp4" }),
  });
  assert.equal(unsignedTicketResponse.status, 401);

  const authResponse = await login(port);
  const sessionCookie = authResponse.headers.get("set-cookie");

  const crossSiteTicketResponse = await fetch(`${origin}/api/cast/playback`, {
    method: "POST",
    headers: {
      Cookie: sessionCookie,
      "Content-Type": "application/json",
      Origin: "https://attacker.example",
    },
    body: JSON.stringify({ movieId: "Cast-Night.mp4" }),
  });
  assert.equal(crossSiteTicketResponse.status, 403);

  const ticketResponse = await fetch(`${origin}/api/cast/playback`, {
    method: "POST",
    headers: {
      Cookie: sessionCookie,
      "Content-Type": "application/json",
      Origin: origin,
    },
    body: JSON.stringify({ movieId: "Cast-Night.mp4" }),
  });

  assert.equal(ticketResponse.status, 200);
  const ticket = await ticketResponse.json();
  assert.equal(ticket.contentType, "video/mp4");
  assert.equal(ticket.title, "Cast Night");
  assert.equal(ticket.expiresAt, clock.now + castPlaybackTtlMs);
  assert.match(ticket.url, new RegExp(`^${origin.replaceAll(".", "\\.")}/api/cast/stream\\?ticket=`));
  assert.doesNotMatch(ticket.url, /Cast-Night|movie_room_session/);

  const streamResponse = await fetch(ticket.url, {
    headers: { Range: "bytes=2-5" },
  });
  assert.equal(streamResponse.status, 206);
  assert.equal(streamResponse.headers.get("access-control-allow-origin"), "*");
  assert.equal(streamResponse.headers.get("accept-ranges"), "bytes");
  assert.equal(await streamResponse.text(), "2345");

  const tamperedUrl = new URL(ticket.url);
  tamperedUrl.searchParams.set("ticket", `${tamperedUrl.searchParams.get("ticket")}x`);
  const tamperedResponse = await fetch(tamperedUrl);
  assert.equal(tamperedResponse.status, 401);

  clock.now += castPlaybackTtlMs + 1;
  const expiredResponse = await fetch(ticket.url);
  assert.equal(expiredResponse.status, 401);
});

test("pairs a Fire TV through a browser-approved one-time code", async (t) => {
  const { root, moviesDir, publicDir } = createTempLibrary();
  const clock = { now: 1_000_000 };
  const store = new MemoryStore(() => clock.now);
  const server = await startServer(createAuthOptions({
    moviesDir,
    publicDir,
    now: () => clock.now,
    store,
  }));

  t.after(() => {
    server.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  const { port } = server.address();
  const origin = `http://127.0.0.1:${port}`;
  const pollSecret = "poll-secret-from-tv";
  const createResponse = await fetch(`${origin}/api/tv/pairings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      deviceLabel: "Living Room Fire TV",
      pollSecret,
    }),
  });

  assert.equal(createResponse.status, 201);
  const created = await createResponse.json();
  assert.match(created.pairingId, /^[A-Za-z0-9_-]{16,}$/);
  assert.match(created.code, /^[A-Z0-9]{6}$/);
  assert.equal(created.expiresAt, clock.now + 10 * 60 * 1000);
  assert.equal(Object.hasOwn(created, "deviceToken"), false);

  const storedPairing = JSON.parse(await store.get(`tv-pairing:${created.pairingId}`));
  assert.equal(Object.hasOwn(storedPairing, "code"), false);
  assert.match(storedPairing.codeHash, /^[A-Za-z0-9_-]{43}$/);

  const pendingResponse = await fetch(`${origin}/api/tv/pairings/${created.pairingId}`, {
    headers: { Authorization: `Bearer ${pollSecret}` },
  });
  assert.equal(pendingResponse.status, 200);
  assert.deepEqual(await pendingResponse.json(), {
    status: "pending",
    expiresAt: created.expiresAt,
  });

  const authResponse = await login(port);
  const cookie = authResponse.headers.get("set-cookie");
  const approveResponse = await fetch(`${origin}/api/tv/pairings/approve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
      Origin: origin,
    },
    body: JSON.stringify({ code: created.code }),
  });

  assert.equal(approveResponse.status, 200);
  const approved = await approveResponse.json();
  assert.equal(approved.status, "approved");
  assert.match(approved.deviceLabel, /Living Room Fire TV/);

  const tvApprovedResponse = await fetch(`${origin}/api/tv/pairings/${created.pairingId}`, {
    headers: { Authorization: `Bearer ${pollSecret}` },
  });
  assert.equal(tvApprovedResponse.status, 200);
  const tvApproved = await tvApprovedResponse.json();
  assert.equal(tvApproved.status, "approved");
  assert.match(tvApproved.deviceId, /^[A-Za-z0-9_-]{16,}$/);
  assert.match(tvApproved.deviceToken, /^[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{32,}$/);

  const secondPollResponse = await fetch(`${origin}/api/tv/pairings/${created.pairingId}`, {
    headers: { Authorization: `Bearer ${pollSecret}` },
  });
  assert.equal(secondPollResponse.status, 200);
  assert.deepEqual(await secondPollResponse.json(), {
    status: "approved",
    deviceId: tvApproved.deviceId,
  });
});

test("rejects expired Fire TV pairings and wrong polling secrets", async (t) => {
  const { root, moviesDir, publicDir } = createTempLibrary();
  const clock = { now: 2_000_000 };
  const server = await startServer(createAuthOptions({
    moviesDir,
    publicDir,
    now: () => clock.now,
    store: new MemoryStore(() => clock.now),
  }));

  t.after(() => {
    server.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  const { port } = server.address();
  const origin = `http://127.0.0.1:${port}`;
  const createResponse = await fetch(`${origin}/api/tv/pairings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      deviceLabel: "Bedroom Fire TV",
      pollSecret: "correct-poll-secret",
    }),
  });
  const created = await createResponse.json();

  const wrongSecretResponse = await fetch(`${origin}/api/tv/pairings/${created.pairingId}`, {
    headers: { Authorization: "Bearer wrong-poll-secret" },
  });
  assert.equal(wrongSecretResponse.status, 401);

  clock.now += 10 * 60 * 1000 + 1;
  const expiredPollResponse = await fetch(`${origin}/api/tv/pairings/${created.pairingId}`, {
    headers: { Authorization: "Bearer correct-poll-secret" },
  });
  assert.equal(expiredPollResponse.status, 410);

  const authResponse = await login(port);
  const expiredApproveResponse = await fetch(`${origin}/api/tv/pairings/approve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: authResponse.headers.get("set-cookie"),
      Origin: origin,
    },
    body: JSON.stringify({ code: created.code }),
  });
  assert.equal(expiredApproveResponse.status, 410);
});

test("requires a signed-in same-origin browser to approve a Fire TV", async (t) => {
  const { root, moviesDir, publicDir } = createTempLibrary();
  const server = await startServer(createAuthOptions({ moviesDir, publicDir }));

  t.after(() => {
    server.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  const { port } = server.address();
  const origin = `http://127.0.0.1:${port}`;
  const createResponse = await fetch(`${origin}/api/tv/pairings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      deviceLabel: "Family Room Fire TV",
      pollSecret: "poll-secret",
    }),
  });
  const created = await createResponse.json();

  const anonymousResponse = await fetch(`${origin}/api/tv/pairings/approve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
    },
    body: JSON.stringify({ code: created.code }),
  });
  assert.equal(anonymousResponse.status, 401);

  const authResponse = await login(port);
  const crossSiteResponse = await fetch(`${origin}/api/tv/pairings/approve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: authResponse.headers.get("set-cookie"),
      Origin: "https://evil.example",
    },
    body: JSON.stringify({ code: created.code }),
  });
  assert.equal(crossSiteResponse.status, 403);
});

test("throttles anonymous Fire TV pairing creation", async (t) => {
  const { root, moviesDir, publicDir } = createTempLibrary();
  const server = await startServer(createAuthOptions({
    moviesDir,
    publicDir,
    tvPairingRateLimitMaxAttempts: 1,
    tvPairingRateLimitWindowMs: 60_000,
  }));

  t.after(() => {
    server.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  const { port } = server.address();
  const origin = `http://127.0.0.1:${port}`;
  const createPairing = (pollSecret) => fetch(`${origin}/api/tv/pairings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceLabel: "Rate Test Fire TV", pollSecret }),
  });

  const firstResponse = await createPairing("first-poll-secret");
  assert.equal(firstResponse.status, 201);

  const throttledResponse = await createPairing("second-poll-secret");
  assert.equal(throttledResponse.status, 429);
});

test("paired Fire TV lists the library and receives a cookie-free playback ticket", async (t) => {
  const { root, moviesDir, publicDir } = createTempLibrary();
  fs.writeFileSync(path.join(moviesDir, "Family-Night.mp4"), "abcdef");
  fs.writeFileSync(path.join(moviesDir, "Still-Uploading.mp4"), "");
  const server = await startServer(createAuthOptions({ moviesDir, publicDir }));

  t.after(() => {
    server.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  const { port } = server.address();
  const origin = `http://127.0.0.1:${port}`;
  const deviceToken = await pairFireTv(port);

  const anonymousLibraryResponse = await fetch(`${origin}/api/tv/library`);
  assert.equal(anonymousLibraryResponse.status, 401);

  const [deviceId] = deviceToken.split(".");
  const badTokenResponse = await fetch(`${origin}/api/tv/library`, {
    headers: { Authorization: `Bearer ${deviceId}.wrong-secret` },
  });
  assert.equal(badTokenResponse.status, 401);

  const libraryResponse = await fetch(`${origin}/api/tv/library`, {
    headers: { Authorization: `Bearer ${deviceToken}` },
  });
  assert.equal(libraryResponse.status, 200);
  const library = await libraryResponse.json();
  assert.equal(library.movies.length, 2);
  const playable = library.movies.find((movie) => movie.fileName === "Family-Night.mp4");
  const uploading = library.movies.find((movie) => movie.fileName === "Still-Uploading.mp4");
  assert.ok(playable.id);
  assert.equal(uploading.size, 0);

  const uploadingPlaybackResponse = await fetch(`${origin}/api/tv/playback`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${deviceToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ movieId: uploading.id }),
  });
  assert.equal(uploadingPlaybackResponse.status, 409);

  const playbackResponse = await fetch(`${origin}/api/tv/playback`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${deviceToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ movieId: playable.id }),
  });
  assert.equal(playbackResponse.status, 200);
  const playback = await playbackResponse.json();
  assert.match(playback.url, new RegExp(`^${origin.replaceAll(".", "\\.")}/api/cast/stream\\?ticket=`));
  assert.equal(playback.contentType, "video/mp4");
  assert.equal(playback.title, "Family Night");

  const ticketResponse = await fetch(playback.url, { headers: { Range: "bytes=0-2" } });
  assert.equal(ticketResponse.status, 206);
  assert.equal(await ticketResponse.text(), "abc");
});

test("renews an active Fire TV device token instead of forcing a new pairing", async (t) => {
  const { root, moviesDir, publicDir } = createTempLibrary();
  fs.writeFileSync(path.join(moviesDir, "Family-Night.mp4"), "abcdef");
  const clock = { now: 10_000 };
  const store = new MemoryStore(() => clock.now);
  const deviceTtlMs = 100;
  const server = await startServer(createAuthOptions({
    moviesDir,
    publicDir,
    now: () => clock.now,
    store,
    tvDeviceTtlMs: deviceTtlMs,
  }));

  t.after(() => {
    server.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  const { port } = server.address();
  const origin = `http://127.0.0.1:${port}`;
  const deviceToken = await pairFireTv(port);
  const [deviceId] = deviceToken.split(".");

  clock.now += 50;
  const firstUse = await fetch(`${origin}/api/tv/library`, {
    headers: { Authorization: `Bearer ${deviceToken}` },
  });
  assert.equal(firstUse.status, 200);
  const refreshed = JSON.parse(await store.get(`tv-device:${deviceId}`));
  assert.equal(refreshed.expiresAt, clock.now + deviceTtlMs);

  clock.now += 75;
  const secondUse = await fetch(`${origin}/api/tv/library`, {
    headers: { Authorization: `Bearer ${deviceToken}` },
  });
  assert.equal(secondUse.status, 200);
});

test("paired Fire TV playback redirects OneDrive movies through a secure ticket", async (t) => {
  const { root, publicDir } = createTempLibrary();
  const provider = {
    kind: "onedrive",
    async listMovies() {
      return [{
        id: "movie-1",
        fileName: "OneDrive-Movie.mp4",
        title: "OneDrive Movie",
        size: 1024,
      }];
    },
    async listLibrary() {
      return {
        movies: await this.listMovies(),
        folders: [],
      };
    },
    async resolvePlayback(movieId) {
      assert.equal(movieId, "movie-1");
      return {
        url: "https://onedrive.example/download/movie.mp4",
        contentType: "video/mp4",
      };
    },
  };
  const server = await startServer(createAuthOptions({ publicDir, provider }));

  t.after(() => {
    server.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  const { port } = server.address();
  const origin = `http://127.0.0.1:${port}`;
  const deviceToken = await pairFireTv(port);
  const playbackResponse = await fetch(`${origin}/api/tv/playback`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${deviceToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ movieId: "movie-1" }),
  });
  assert.equal(playbackResponse.status, 200);
  const playback = await playbackResponse.json();
  const streamResponse = await fetch(playback.url, { redirect: "manual" });
  assert.equal(streamResponse.status, 307);
  assert.equal(streamResponse.headers.get("location"), "https://onedrive.example/download/movie.mp4");
});

test("synchronizes viewer state between a browser profile and its paired Fire TV", async (t) => {
  const { root, moviesDir, publicDir } = createTempLibrary();
  fs.writeFileSync(path.join(moviesDir, "Family-Night.mp4"), "abcdef");
  fs.writeFileSync(path.join(moviesDir, "Movie-Two.mp4"), "ghijkl");
  const store = new MemoryStore();
  const server = await startServer(createAuthOptions({ moviesDir, publicDir, store }));

  t.after(() => {
    server.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  const { port } = server.address();
  const origin = `http://127.0.0.1:${port}`;
  const authResponse = await login(port);
  const sessionCookie = authResponse.headers.get("set-cookie");
  const moviesResponse = await fetch(`${origin}/api/movies`, { headers: { Cookie: sessionCookie } });
  const libraryMovies = await moviesResponse.json();
  const firstMovie = libraryMovies[0].id;
  const secondMovie = libraryMovies[1].id;

  const initial = await fetch(`${origin}/api/viewer-state?profileId=mom`, {
    headers: { Cookie: sessionCookie },
  });
  assert.equal(initial.status, 200);
  assert.equal((await initial.json()).profileId, "mom");

  const update = await fetch(`${origin}/api/viewer-state`, {
    method: "PATCH",
    headers: {
      Cookie: sessionCookie,
      Origin: origin,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      profileId: "mom",
      operations: [
        { type: "progress", movieId: firstMovie, positionSeconds: 42, durationSeconds: 600 },
        { type: "setFlag", movieId: firstMovie, flag: "favorite", value: true },
        { type: "queueAdd", movieId: secondMovie },
      ],
    }),
  });
  assert.equal(update.status, 200);
  const updatedState = await update.json();
  assert.equal(updatedState.movies[firstMovie].positionSeconds, 42);
  assert.equal(updatedState.movies[firstMovie].favorite, true);
  assert.deepEqual(updatedState.queue, [secondMovie]);

  const homeState = await fetch(`${origin}/api/viewer-state?profileId=home`, {
    headers: { Cookie: sessionCookie },
  });
  assert.equal(homeState.status, 200);
  assert.deepEqual((await homeState.json()).queue, []);

  const pollSecret = "viewer-state-poll-secret";
  const pairingResponse = await fetch(`${origin}/api/tv/pairings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceLabel: "Family Fire TV", pollSecret }),
  });
  const pairing = await pairingResponse.json();
  const approveResponse = await fetch(`${origin}/api/tv/pairings/approve`, {
    method: "POST",
    headers: {
      Cookie: sessionCookie,
      Origin: origin,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ code: pairing.code, profileId: "family" }),
  });
  assert.equal(approveResponse.status, 200);
  const approved = await fetch(`${origin}/api/tv/pairings/${pairing.pairingId}`, {
    headers: { Authorization: `Bearer ${pollSecret}` },
  });
  const deviceToken = (await approved.json()).deviceToken;

  const tvState = await fetch(`${origin}/api/tv/viewer-state`, {
    headers: { Authorization: `Bearer ${deviceToken}` },
  });
  assert.equal(tvState.status, 200);
  assert.equal((await tvState.json()).movies[firstMovie].favorite, true);

  const tvUpdate = await fetch(`${origin}/api/tv/viewer-state`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${deviceToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ operations: [{ type: "queueRemove", movieId: secondMovie }] }),
  });
  assert.equal(tvUpdate.status, 200);
  assert.deepEqual((await tvUpdate.json()).queue, []);
});

test("rejects invalid viewer-state profiles and TV profile overrides", async (t) => {
  const { root, moviesDir, publicDir } = createTempLibrary();
  fs.writeFileSync(path.join(moviesDir, "Family-Night.mp4"), "abcdef");
  const server = await startServer(createAuthOptions({ moviesDir, publicDir, store: new MemoryStore() }));
  t.after(() => {
    server.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  const { port } = server.address();
  const origin = `http://127.0.0.1:${port}`;
  const authResponse = await login(port);
  const sessionCookie = authResponse.headers.get("set-cookie");
  const invalidProfile = await fetch(`${origin}/api/viewer-state?profileId=admin`, {
    headers: { Cookie: sessionCookie },
  });
  assert.equal(invalidProfile.status, 400);

  const crossSite = await fetch(`${origin}/api/viewer-state`, {
    method: "PATCH",
    headers: {
      Cookie: sessionCookie,
      Origin: "https://attacker.example",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ profileId: "home", operations: [] }),
  });
  assert.equal(crossSite.status, 403);

  const notConfiguredServer = await startServer(createAuthOptions({
    moviesDir,
    publicDir,
    env: { VERCEL: "1", MOVIE_PROVIDER: "local" },
    store: new MemoryStore(),
  }));
  t.after(() => notConfiguredServer.close());
  const notConfigured = await fetch(`http://127.0.0.1:${notConfiguredServer.address().port}/api/viewer-state?profileId=home`);
  assert.equal(notConfigured.status, 503);
});

test("redirects a valid Cast ticket to a fresh OneDrive playback URL", async (t) => {
  const { root, publicDir } = createTempLibrary();
  const provider = {
    kind: "onedrive",
    async listMovies() {
      return [{
        id: "onedrive-movie-id",
        title: "Family Movie",
        fileName: "Family-Movie.mp4",
        folder: "Desktop Movie Downloads",
        size: 1024,
      }];
    },
    async resolvePlayback(movieId) {
      assert.equal(movieId, "onedrive-movie-id");
      return { url: "https://onedrive.example/fresh-download", expiresAt: null };
    },
  };
  const server = await startServer(createAuthOptions({ publicDir, provider }));

  t.after(() => {
    server.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  const { port } = server.address();
  const origin = `http://127.0.0.1:${port}`;
  const authResponse = await login(port);
  const ticketResponse = await fetch(`${origin}/api/cast/playback`, {
    method: "POST",
    headers: {
      Cookie: authResponse.headers.get("set-cookie"),
      "Content-Type": "application/json",
      Origin: origin,
    },
    body: JSON.stringify({ movieId: "onedrive-movie-id" }),
  });
  const ticket = await ticketResponse.json();

  const streamResponse = await fetch(ticket.url, { redirect: "manual" });
  assert.equal(streamResponse.status, 307);
  assert.equal(streamResponse.headers.get("location"), "https://onedrive.example/fresh-download");
  assert.equal(streamResponse.headers.get("access-control-allow-origin"), "*");
});

test("library API prefers a deployed poster over a stale OneDrive artwork URL", async (t) => {
  const { root, publicDir } = createTempLibrary();
  fs.mkdirSync(path.join(publicDir, "posters"), { recursive: true });
  fs.writeFileSync(path.join(publicDir, "posters", "stable-movie.jpg"), "stable-poster");
  const provider = {
    kind: "onedrive",
    async listLibrary() {
      return {
        movies: [{
          id: "stable-movie",
          title: "Stable Movie",
          fileName: "Stable Movie.mp4",
          year: 2025,
          size: 1024,
          posterUrl: "/api/onedrive/image/expired-poster-id",
        }],
        folders: [],
      };
    },
  };
  const server = await startServer(createAuthOptions({ publicDir, provider }));
  t.after(() => {
    server.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  const { port } = server.address();
  const authResponse = await login(port);
  const libraryResponse = await fetch(`http://127.0.0.1:${port}/api/library`, {
    headers: { Cookie: authResponse.headers.get("set-cookie") },
  });
  assert.equal(libraryResponse.status, 200);
  const library = await libraryResponse.json();
  assert.equal(library.movies[0].posterUrl, "/posters/stable-movie.jpg");
  assert.equal(library.movies[0].posterFallbackUrl, "/api/artwork?title=Stable+Movie&year=2025");
});

test("authenticated library refresh route awaits the provider refresh", async (t) => {
  const { root, publicDir } = createTempLibrary();
  let listCalls = 0;
  let refreshCalls = 0;
  const provider = {
    kind: "onedrive",
    async listLibrary() {
      listCalls += 1;
      return { movies: [{ id: "cached", title: "Cached Movie", size: 1 }], folders: [], cacheStatus: "stale" };
    },
    async refreshLibrary() {
      refreshCalls += 1;
      return { movies: [{ id: "fresh", title: "Fresh Movie", size: 2 }], folders: [], cacheStatus: "fresh" };
    },
  };
  const server = await startServer(createAuthOptions({ publicDir, provider }));
  t.after(() => {
    server.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  const { port } = server.address();
  const authResponse = await login(port);
  const headers = { Cookie: authResponse.headers.get("set-cookie") };
  const cachedResponse = await fetch(`http://127.0.0.1:${port}/api/library`, { headers });
  const freshResponse = await fetch(`http://127.0.0.1:${port}/api/library?refresh=1`, { headers });
  assert.equal((await cachedResponse.json()).movies[0].title, "Cached Movie");
  assert.equal((await freshResponse.json()).movies[0].title, "Fresh Movie");
  assert.equal(listCalls, 1);
  assert.equal(refreshCalls, 1);
});

test("artwork resolver falls back to television artwork for series titles", async () => {
  const calls = [];
  const resolver = createArtworkResolver({
    fetchImpl: async (url) => {
      calls.push(String(url));
      if (String(url).includes("media=movie")) {
        return new Response(JSON.stringify({ results: [] }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (String(url).includes("media=tvShow")) {
        return new Response(JSON.stringify({
          results: [{ collectionName: "Rick and Morty", artworkUrl100: "https://img.example/rick-and-morty/100x100bb.jpg" }],
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      throw new Error("unexpected secondary lookup");
    },
  });
  const result = await resolver.search("Rick and Morty");
  assert.equal(result.source, "iTunes");
  assert.equal(result.url, "https://img.example/rick-and-morty/600x900bb.jpg");
  assert.equal(calls.length, 2);
});

test("proxies hybrid Cast playback instead of rejecting Jellyfin compatibility routes", async (t) => {
  const { root, publicDir } = createTempLibrary();
  const provider = {
    kind: "hybrid",
    async listMovies() {
      return [{ id: "hybrid-movie-id", title: "Hybrid Movie", fileName: "Hybrid Movie.mkv", size: 1024 }];
    },
    async resolvePlayback() {
      return { url: "/api/jellyfin/stream?movieId=hybrid-movie-id&transcode=1", contentType: "video/mp4" };
    },
    async proxyStream(movieId, request) {
      assert.equal(movieId, "hybrid-movie-id");
      assert.equal(request.headers.range, "bytes=0-");
      return new Response("transcoded-video", { status: 200, headers: { "content-type": "video/mp4" } });
    },
  };
  const server = await startServer(createAuthOptions({ publicDir, provider }));
  t.after(() => {
    server.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  const { port } = server.address();
  const origin = `http://127.0.0.1:${port}`;
  const authResponse = await login(port);
  const ticketResponse = await fetch(`${origin}/api/cast/playback`, {
    method: "POST",
    headers: {
      Cookie: authResponse.headers.get("set-cookie"),
      "Content-Type": "application/json",
      Origin: origin,
    },
    body: JSON.stringify({ movieId: "hybrid-movie-id" }),
  });
  const ticket = await ticketResponse.json();
  const streamResponse = await fetch(ticket.url, { headers: { Range: "bytes=0-" } });
  assert.equal(streamResponse.status, 200);
  assert.equal(await streamResponse.text(), "transcoded-video");
});

test("returns folder previews including empty hidden local folders", async (t) => {
  const { root, moviesDir, publicDir } = createTempLibrary();
  fs.mkdirSync(path.join(moviesDir, ".Hidden Uploads"), { recursive: true });
  fs.mkdirSync(path.join(moviesDir, "Coming Soon"), { recursive: true });
  fs.writeFileSync(path.join(moviesDir, "Coming Soon", "Ready.mp4"), "abcdef");

  const server = await startServer(createAuthOptions({ moviesDir, publicDir }));

  t.after(() => {
    server.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  const { port } = server.address();
  const authResponse = await login(port);
  const sessionCookie = authResponse.headers.get("set-cookie");

  const libraryResponse = await fetch(`http://127.0.0.1:${port}/api/library`, {
    headers: { Cookie: sessionCookie },
  });
  assert.equal(libraryResponse.status, 200);

  const library = await libraryResponse.json();
  assert.deepEqual(
    library.movies.map((movie) => ({ title: movie.title, folder: movie.folder, extension: movie.extension })),
    [{ title: "Ready", folder: "Coming Soon", extension: ".mp4" }],
  );
  assert.deepEqual(
    library.folders.map((folder) => ({
      path: folder.path,
      hidden: folder.hidden,
      movieCount: folder.movieCount,
      playableCount: folder.playableCount,
    })),
    [
      { path: ".Hidden Uploads", hidden: true, movieCount: 0, playableCount: 0 },
      { path: "Collections", hidden: false, movieCount: 0, playableCount: 0 },
      { path: "Coming Soon", hidden: false, movieCount: 1, playableCount: 1 },
    ],
  );
});

test("expires and rejects tampered sessions", async (t) => {
  const { root, moviesDir, publicDir } = createTempLibrary();
  fs.writeFileSync(path.join(moviesDir, "clip.mp4"), "0123456789");

  const clock = { now: 1000 };
  const server = await startServer(createAuthOptions({
    moviesDir,
    publicDir,
    now: () => clock.now,
    store: new MemoryStore(() => clock.now),
    auth: { sessionTtlMs: 500 },
  }));

  t.after(() => {
    server.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  const { port } = server.address();
  const authResponse = await login(port);
  const sessionCookie = authResponse.headers.get("set-cookie");
  const cookieParts = sessionCookie.split(";");
  const [cookieName, cookieValue] = cookieParts[0].split("=");
  const tamperedCookie = `${cookieName}=${cookieValue.slice(0, -1)}x;${cookieParts.slice(1).join(";")}`;

  const tamperedResponse = await fetch(`http://127.0.0.1:${port}/api/session`, {
    headers: {
      Cookie: tamperedCookie,
    },
  });
  assert.equal(tamperedResponse.status, 200);
  assert.deepEqual(await tamperedResponse.json(), {
    authenticated: false,
    authConfigured: true,
    expiresAt: null,
    provider: "local",
  });

  clock.now += 600;
  const expiredSessionResponse = await fetch(`http://127.0.0.1:${port}/api/session`, {
    headers: { Cookie: sessionCookie },
  });
  assert.equal(expiredSessionResponse.status, 200);
  assert.deepEqual(await expiredSessionResponse.json(), {
    authenticated: false,
    authConfigured: true,
    expiresAt: null,
    provider: "local",
  });

  const expiredResponse = await fetch(`http://127.0.0.1:${port}/api/movies`, {
    headers: { Cookie: sessionCookie },
  });
  assert.equal(expiredResponse.status, 401);
});

test("throttles repeated failed logins", async () => {
  const { root, moviesDir, publicDir } = createTempLibrary();
  const server = await startServer(createAuthOptions({ moviesDir, publicDir }));

  try {
    const { port } = server.address();
    assert.equal((await login(port, "wrong")).status, 401);
    assert.equal((await login(port, "wrong-again")).status, 401);
    assert.equal((await login(port, "wrong-third")).status, 429);
  } finally {
    server.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("fails closed on Vercel when durable session storage is not configured", async (t) => {
  const { root, moviesDir, publicDir } = createTempLibrary();
  const server = await startServer(createAuthOptions({
    moviesDir,
    publicDir,
    env: {
      MOVIE_PROVIDER: "local",
      VERCEL: "1",
    },
  }));

  t.after(() => {
    server.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  const { port } = server.address();
  const sessionResponse = await fetch(`http://127.0.0.1:${port}/api/session`);
  assert.equal(sessionResponse.status, 200);
  assert.deepEqual(await sessionResponse.json(), {
    authenticated: false,
    authConfigured: false,
    expiresAt: null,
    provider: "local",
  });

  const loginResponse = await login(port);
  assert.equal(loginResponse.status, 503);
});

test("public access mode serves the catalog without a browser login", async (t) => {
  const { root, moviesDir, publicDir } = createTempLibrary();
  fs.writeFileSync(path.join(moviesDir, "Family-Night.mp4"), "abcdef");
  const server = await startServer(createAuthOptions({
    moviesDir,
    publicDir,
    auth: { publicAccess: true },
  }));

  t.after(() => {
    server.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  const { port } = server.address();
  const sessionResponse = await fetch(`http://127.0.0.1:${port}/api/session`);
  assert.equal(sessionResponse.status, 200);
  assert.deepEqual(await sessionResponse.json(), {
    authenticated: true,
    authConfigured: false,
    publicAccess: true,
    expiresAt: null,
    provider: "local",
  });

  const libraryResponse = await fetch(`http://127.0.0.1:${port}/api/library`);
  assert.equal(libraryResponse.status, 200);
  assert.equal((await libraryResponse.json()).movies.length, 1);
});

test("accepts Vercel Marketplace Upstash credentials as durable session storage", async (t) => {
  const { root, moviesDir, publicDir } = createTempLibrary();
  const server = await startServer(createAuthOptions({
    moviesDir,
    publicDir,
    env: {
      MOVIE_PROVIDER: "local",
      VERCEL: "1",
      UPSTASH_REDIS_REST_URL: "https://redis.example",
      UPSTASH_REDIS_REST_TOKEN: "upstash-token",
    },
  }));

  t.after(() => {
    server.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/api/session`);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).authConfigured, true);
});

test("fails closed when the session signing secret is too short", async (t) => {
  const { root, moviesDir, publicDir } = createTempLibrary();
  const server = await startServer(createAuthOptions({
    moviesDir,
    publicDir,
    auth: { sessionSecret: "too-short" },
  }));

  t.after(() => {
    server.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  const { port } = server.address();
  const sessionResponse = await fetch(`http://127.0.0.1:${port}/api/session`);
  assert.equal(sessionResponse.status, 200);
  assert.equal((await sessionResponse.json()).authConfigured, false);
  assert.equal((await login(port)).status, 503);
});

test("supports partial content requests for background buffering and seeking", async (t) => {
  const { root, moviesDir, publicDir } = createTempLibrary();
  fs.writeFileSync(path.join(moviesDir, "clip.mp4"), "0123456789");

  const server = await startServer(createAuthOptions({ moviesDir, publicDir }));

  t.after(() => {
    server.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  const { port } = server.address();
  const authResponse = await login(port);
  const sessionCookie = authResponse.headers.get("set-cookie");

  const response = await fetch(`http://127.0.0.1:${port}/api/stream/clip.mp4`, {
    headers: {
      Cookie: sessionCookie,
      Range: "bytes=2-5",
    },
  });

  assert.equal(response.status, 206);
  assert.equal(response.headers.get("accept-ranges"), "bytes");
  assert.equal(response.headers.get("content-range"), "bytes 2-5/10");
  assert.equal(await response.text(), "2345");
});

test("keeps the shared timeline usable when native video controls differ by device", async () => {
  const listeners = {};
  const timeline = {
    value: "0",
    min: "0",
    max: "0",
    disabled: true,
    addEventListener(name, listener) {
      listeners[`timeline:${name}`] = listener;
    },
    setAttribute() {},
  };
  const timelineCurrent = { textContent: "0:00" };
  const timelineDuration = { textContent: "0:00" };
  const movieSelect = {
    value: "",
    innerHTML: "",
    disabled: true,
    addEventListener() {},
    appendChild(option) {
      if (!this.value) this.value = option.value;
    },
  };
  const player = {
    currentTime: 0,
    duration: 120,
    paused: true,
    ended: false,
    buffered: { length: 0 },
    addEventListener(name, listener) {
      listeners[`player:${name}`] = listener;
    },
    load() {},
    removeAttribute() {},
  };

  const app = createApp({
    movieSelect,
    reloadButton: { addEventListener() {} },
    logoutButton: { addEventListener() {} },
    passwordForm: { addEventListener() {} },
    passwordInput: {},
    player,
    status: { textContent: "" },
    loginStatus: {},
    authPanel: {},
    libraryPanel: {},
    timeline,
    timelineCurrent,
    timelineDuration,
    fetchImpl: async (url) => {
      if (url === "/api/session") {
        return { ok: true, status: 200, json: async () => ({ authenticated: true, authConfigured: true }) };
      }
      if (url === "/api/library") {
        return { ok: true, status: 200, json: async () => [{ id: "movie-1", title: "Movie One", size: 100 }] };
      }
      throw new Error(`Unexpected request: ${url}`);
    },
    createOption: () => ({}),
  });

  app.initialize();
  await new Promise((resolve) => setTimeout(resolve, 0));

  listeners["player:loadedmetadata"]();
  assert.equal(timeline.min, "0");
  assert.equal(timeline.max, "120");
  assert.equal(timeline.disabled, false);
  assert.equal(timelineDuration.textContent, "2:00");

  player.currentTime = 37;
  listeners["player:timeupdate"]();
  assert.equal(timeline.value, "37");
  assert.equal(timelineCurrent.textContent, "0:37");

  listeners["timeline:input"]({ target: { value: "52" } });
  assert.equal(player.currentTime, 52);
});

test("supports suffix byte ranges and HEAD range probes", async (t) => {
  const { root, moviesDir, publicDir } = createTempLibrary();
  fs.writeFileSync(path.join(moviesDir, "clip.mp4"), "0123456789");

  const server = await startServer(createAuthOptions({ moviesDir, publicDir }));

  t.after(() => {
    server.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  const { port } = server.address();
  const authResponse = await login(port);
  const sessionCookie = authResponse.headers.get("set-cookie");

  const suffixResponse = await fetch(`http://127.0.0.1:${port}/api/stream/clip.mp4`, {
    headers: {
      Cookie: sessionCookie,
      Range: "bytes=-4",
    },
  });

  assert.equal(suffixResponse.status, 206);
  assert.equal(suffixResponse.headers.get("content-range"), "bytes 6-9/10");
  assert.equal(await suffixResponse.text(), "6789");

  const headResponse = await fetch(`http://127.0.0.1:${port}/api/stream/clip.mp4`, {
    method: "HEAD",
    headers: {
      Cookie: sessionCookie,
      Range: "bytes=2-5",
    },
  });

  assert.equal(headResponse.status, 206);
  assert.equal(headResponse.headers.get("content-range"), "bytes 2-5/10");
  assert.equal(headResponse.headers.get("content-length"), "4");
  assert.equal(await headResponse.text(), "");
});

test("clamps oversized ranges and rejects traversal attempts", async (t) => {
  const { root, moviesDir, publicDir } = createTempLibrary();
  fs.writeFileSync(path.join(moviesDir, "clip.mp4"), "0123456789");

  const server = await startServer(createAuthOptions({ moviesDir, publicDir }));

  t.after(() => {
    server.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  const { port } = server.address();
  const authResponse = await login(port);
  const sessionCookie = authResponse.headers.get("set-cookie");

  const oversizedRangeResponse = await fetch(`http://127.0.0.1:${port}/api/stream/clip.mp4`, {
    headers: {
      Cookie: sessionCookie,
      Range: "bytes=0-999999",
    },
  });

  assert.equal(oversizedRangeResponse.status, 206);
  assert.equal(oversizedRangeResponse.headers.get("content-range"), "bytes 0-9/10");
  assert.equal(await oversizedRangeResponse.text(), "0123456789");

  const traversalResponse = await fetch(`http://127.0.0.1:${port}/api/stream/..%2Fclip.mp4`, {
    headers: { Cookie: sessionCookie },
  });
  assert.equal(traversalResponse.status, 400);

  const invalidRangeResponse = await fetch(`http://127.0.0.1:${port}/api/stream/clip.mp4`, {
    headers: {
      Cookie: sessionCookie,
      Range: "bytes=100-200",
    },
  });
  assert.equal(invalidRangeResponse.status, 416);
  assert.equal(invalidRangeResponse.headers.get("content-range"), "bytes */10");
});

test("surfaces movie library load failures in the status message", async () => {
  const movieSelect = {
    value: "",
    innerHTML: "",
    addEventListener() {},
    appendChild() {},
  };
  const reloadButton = { addEventListener() {} };
  const logoutButton = { addEventListener() {} };
  const passwordForm = { addEventListener() {} };
  const passwordInput = {
    value: "",
    addEventListener() {},
    removeAttribute() {},
    select() {},
    setAttribute() {},
  };
  const submitButton = { disabled: false };
  const player = {
    currentSrc: "",
    load() {},
    addEventListener() {},
    removeAttribute() {},
  };
  const status = { textContent: "" };
  const loginStatus = { focus() {}, textContent: "" };
  const authPanel = { hidden: false };
  const libraryPanel = { hidden: true };

  const app = createApp({
    movieSelect,
    reloadButton,
    logoutButton,
    passwordForm,
    passwordInput,
    submitButton,
    player,
    status,
    loginStatus,
    authPanel,
    libraryPanel,
    fetchImpl: async (url) => {
      if (url === "/api/session") {
        return { ok: true, status: 200, json: async () => ({ authenticated: true }) };
      }
      return { ok: false, status: 500, json: async () => ({ error: "Unable to load movie library." }) };
    },
    locationOrigin: "http://127.0.0.1:3000",
    createOption: () => ({}),
  });

  app.initialize();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(status.textContent, "Unable to load movie library.");
});

test("waits for an explicit movie selection after a successful login", async () => {
  const movieSelect = {
    value: "",
    innerHTML: "",
    disabled: true,
    addEventListener() {},
    appendChild(option) {
      if (!this.value) {
        this.value = option.value;
      }
    },
  };
  const reloadButton = { addEventListener() {} };
  const logoutButton = { addEventListener() {} };
  const passwordForm = { addEventListener() {} };
  const passwordInput = {
    value: "lowercase",
    disabled: false,
    removeAttribute() {},
    select() {},
    setAttribute() {},
  };
  const submitButton = { disabled: false };
  const player = {
    src: "",
    load() {},
    addEventListener() {},
    removeAttribute() {},
  };
  const status = { textContent: "" };
  const loginStatus = { focus() {}, textContent: "" };
  const authPanel = { hidden: false };
  const libraryPanel = { hidden: true };
  const requests = [];

  const app = createApp({
    movieSelect,
    reloadButton,
    logoutButton,
    passwordForm,
    passwordInput,
    submitButton,
    player,
    status,
    loginStatus,
    authPanel,
    libraryPanel,
    fetchImpl: async (url, options = {}) => {
      requests.push({ url, options });
      if (url === "/api/login") {
        return { ok: true, status: 204 };
      }
      if (url === "/api/library") {
        return {
          ok: true,
          status: 200,
          json: async () => ([
            { id: "movie-1", title: "Movie One", folder: "", size: 1024 },
          ]),
        };
      }
      if (url === "/api/playback") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ url: "https://download.example/movie-1" }),
        };
      }
      throw new Error(`Unexpected request: ${url}`);
    },
    locationOrigin: "http://127.0.0.1:3000",
    createOption: () => ({}),
  });

  await app.handleLogin({ preventDefault() {} });

  assert.equal(player.src, "");
  assert.equal(status.textContent, "Library ready. Choose a movie to start streaming.");
  assert.deepEqual(
    requests.map((request) => request.url),
    ["/api/login", "/api/library"],
  );
});

test("does not let a stale session check hide the library after login", async () => {
  const movieSelect = { value: "", innerHTML: "", disabled: true, addEventListener() {}, appendChild(option) { this.value ||= option.value; } };
  const player = { src: "", load() {}, addEventListener() {}, removeAttribute() {} };
  const status = { textContent: "" };
  const loginStatus = { textContent: "", focus() {} };
  const authPanel = { hidden: false };
  const libraryPanel = { hidden: true };
  let releaseSession;
  const sessionPending = new Promise((resolve) => { releaseSession = resolve; });
  const app = createApp({
    movieSelect,
    reloadButton: { addEventListener() {} },
    logoutButton: { addEventListener() {} },
    passwordForm: { addEventListener() {} },
    passwordInput: { value: "lowercase", disabled: false, select() {}, setAttribute() {}, removeAttribute() {} },
    submitButton: { disabled: false },
    player,
    status,
    loginStatus,
    authPanel,
    libraryPanel,
    fetchImpl: async (url) => {
      if (url === "/api/session") return sessionPending;
      if (url === "/api/login") return { ok: true, status: 204 };
      if (url === "/api/library") return { ok: true, status: 200, json: async () => [{ id: "movie-1", title: "Movie One", size: 1024 }] };
      throw new Error(`Unexpected request: ${url}`);
    },
    locationOrigin: "http://127.0.0.1:3000",
    createOption: () => ({}),
  });

  app.initialize();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await app.handleLogin({ preventDefault() {} });
  assert.equal(libraryPanel.hidden, false);
  releaseSession({ ok: true, status: 200, json: async () => ({ authenticated: false }) });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(libraryPanel.hidden, false);
});

test("refreshes a temporary playback link once after a player error", async () => {
  const listeners = {};
  let resumedPlayCalls = 0;
  const movieSelect = {
    value: "",
    innerHTML: "",
    disabled: true,
    addEventListener(name, listener) {
      listeners[`select:${name}`] = listener;
    },
    appendChild(option) {
      if (!this.value) {
        this.value = option.value;
      }
    },
  };
  const reloadButton = { addEventListener() {} };
  const logoutButton = { addEventListener() {} };
  const passwordForm = { addEventListener() {} };
  const passwordInput = {
    value: "",
    disabled: false,
    removeAttribute() {},
    select() {},
    setAttribute() {},
  };
  const submitButton = { disabled: false };
  const player = {
    src: "",
    error: { code: 2 },
    currentTime: 42,
    duration: 120,
    paused: false,
    ended: false,
    load() {},
    play: async () => {
      resumedPlayCalls += 1;
    },
    addEventListener(name, listener) {
      listeners[`player:${name}`] = listener;
    },
    removeAttribute() {},
  };
  const status = { textContent: "" };
  const loginStatus = { focus() {}, textContent: "" };
  const authPanel = { hidden: false };
  const libraryPanel = { hidden: true };
  let playbackRequests = 0;

  const app = createApp({
    movieSelect,
    reloadButton,
    logoutButton,
    passwordForm,
    passwordInput,
    submitButton,
    player,
    status,
    loginStatus,
    authPanel,
    libraryPanel,
    fetchImpl: async (url, options = {}) => {
      if (url === "/api/session") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ authenticated: true, authConfigured: true }),
        };
      }
      if (url === "/api/library") {
        return {
          ok: true,
          status: 200,
          json: async () => ([
            { id: "movie-1", title: "Movie One", folder: "", size: 1024 },
          ]),
        };
      }
      if (url === "/api/playback") {
        assert.equal(options.method, "POST");
        assert.equal(options.body, JSON.stringify({ movieId: "movie-1" }));
        playbackRequests += 1;
        return {
          ok: true,
          status: 200,
          json: async () => ({ url: `https://download.example/movie-1-${playbackRequests}` }),
        };
      }
      throw new Error(`Unexpected request: ${url}`);
    },
    locationOrigin: "http://127.0.0.1:3000",
    createOption: () => ({}),
    maxPlaybackRefreshes: 1,
  });

  app.initialize();
  await new Promise((resolve) => setTimeout(resolve, 0));
  movieSelect.value = "movie-1";
  await app.playSelectedMovie();
  assert.equal(player.src, "https://download.example/movie-1-1");

  listeners["player:error"]();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(player.src, "https://download.example/movie-1-2");
  assert.equal(playbackRequests, 2);

  player.currentTime = 0;
  listeners["player:loadedmetadata"]();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(player.currentTime, 42);
  assert.equal(resumedPlayCalls, 1);

  listeners["player:error"]();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(playbackRequests, 2);
  assert.equal(status.textContent, "This movie could not keep a stable streaming connection.");
});

test("selects an uploaded movie and labels unfinished OneDrive entries", async () => {
  const options = [];
  const movieSelect = {
    value: "",
    innerHTML: "",
    disabled: true,
    appendChild(option) {
      options.push(option);
      if (!this.value) {
        this.value = option.value;
      }
    },
  };
  const player = {
    load() {},
    removeAttribute() {},
  };
  const status = { textContent: "" };

  const app = createApp({
    movieSelect,
    reloadButton: {},
    logoutButton: {},
    passwordForm: {},
    passwordInput: {},
    player,
    status,
    loginStatus: {},
    authPanel: {},
    libraryPanel: {},
    fetchImpl: async (url) => {
      assert.equal(url, "/api/library");
      return {
        ok: true,
        status: 200,
        json: async () => ([
          { id: "uploading", title: "Movie Uploading", folder: "", size: 0 },
          { id: "metadata-only", title: "Metadata Only", folder: "", size: 1639238719, playbackAvailable: false },
          { id: "ready", title: "Movie Ready", folder: "", size: 1639238719 },
        ]),
      };
    },
    locationOrigin: "http://127.0.0.1:3000",
    createOption: () => ({}),
  });

  const playableMovies = await app.loadLibrary();

  assert.equal(playableMovies.length, 1);
  assert.equal(movieSelect.value, "ready");
  assert.equal(movieSelect.disabled, false);
  assert.equal(options[0].disabled, true);
  assert.match(options[0].textContent, /still uploading/i);
  assert.equal(options[1].disabled, true);
  assert.match(options[1].textContent, /still uploading/i);
  assert.equal(options[2].disabled, false);
});

test("stale library first paint starts one awaited server refresh request", async () => {
  const requests = [];
  const options = [];
  const movieSelect = {
    value: "",
    disabled: true,
    addEventListener() {},
    appendChild(option) {
      options.push(option);
      if (!this.value) this.value = option.value;
    },
  };
  Object.defineProperty(movieSelect, "innerHTML", {
    get() { return ""; },
    set() {
      options.length = 0;
      this.value = "";
    },
  });
  const app = createApp({
    movieSelect,
    reloadButton: {},
    logoutButton: {},
    passwordForm: {},
    passwordInput: {},
    player: { load() {}, removeAttribute() {} },
    status: { textContent: "" },
    loginStatus: {},
    authPanel: {},
    libraryPanel: {},
    fetchImpl: async (url) => {
      requests.push(url);
      if (url === "/api/library") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            movies: [{ id: "cached", title: "Cached Movie", size: 1 }],
            folders: [],
            cacheStatus: "stale",
          }),
        };
      }
      if (url === "/api/library?refresh=1") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            movies: [{ id: "fresh", title: "Fresh Movie", size: 2 }],
            folders: [],
            cacheStatus: "fresh",
          }),
        };
      }
      throw new Error(`Unexpected request: ${url}`);
    },
    createOption: () => ({}),
  });

  const firstPaint = await app.loadLibrary();
  assert.equal(firstPaint[0].title, "Cached Movie");
  await waitForCondition(() => requests.includes("/api/library?refresh=1"));
  await waitForCondition(() => options.some((option) => option.textContent.includes("Fresh Movie")));
  assert.deepEqual(requests, ["/api/library", "/api/library?refresh=1"]);
});

test("shows Chrome cast guidance when browser cast APIs are unavailable", async () => {
  const listeners = {};
  const player = {
    disableRemotePlayback: true,
    addEventListener() {},
    load() {},
    removeAttribute() {},
    setAttribute() {},
  };
  const status = { textContent: "" };
  const castButton = {
    disabled: true,
    textContent: "",
    addEventListener(name, listener) {
      listeners[name] = listener;
    },
  };

  const app = createApp({
    movieSelect: { value: "", addEventListener() {} },
    reloadButton: { addEventListener() {} },
    logoutButton: { addEventListener() {} },
    searchInput: { disabled: false, addEventListener() {} },
    passwordForm: { addEventListener() {} },
    passwordInput: { disabled: false, removeAttribute() {}, setAttribute() {} },
    submitButton: { disabled: false },
    player,
    status,
    bufferStatus: { textContent: "", style: { setProperty() {} } },
    loginStatus: { textContent: "" },
    castButton,
    keepAwakeButton: { addEventListener() {} },
    fullscreenButton: { addEventListener() {} },
    authPanel: { hidden: false },
    libraryPanel: { hidden: true },
    fetchImpl: async (url) => {
      if (url === "/api/session") {
        return { ok: true, status: 200, json: async () => ({ authenticated: false, authConfigured: true }) };
      }
      throw new Error(`Unexpected request: ${url}`);
    },
    locationOrigin: "http://127.0.0.1:3000",
    createOption: () => ({}),
    documentRef: { addEventListener() {}, visibilityState: "visible" },
    navigatorRef: {
      userAgent: "Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/140.0.0.0 Mobile Safari/537.36",
      vendor: "Google Inc.",
    },
  });

  app.initialize();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(player.disableRemotePlayback, false);
  assert.equal(castButton.textContent, "Google Cast Help");
  listeners.click();
  assert.match(status.textContent, /same Wi-Fi/i);
  assert.doesNotMatch(status.textContent, /Bluetooth/i);
});

test("approves a Fire TV pairing code from the signed-in web UI", async () => {
  const listeners = {};
  const fireTvStatus = { textContent: "" };
  const fireTvCode = { value: "AB12CD" };
  const fireTvForm = {
    hidden: true,
    addEventListener(name, listener) {
      listeners[`form:${name}`] = listener;
    },
  };
  const pairFireTvButton = {
    disabled: true,
    addEventListener(name, listener) {
      listeners[`button:${name}`] = listener;
    },
  };
  const requests = [];
  const app = createApp({
    movieSelect: { value: "", disabled: false, addEventListener() {}, appendChild() {}, innerHTML: "" },
    reloadButton: { disabled: false, addEventListener() {} },
    logoutButton: { disabled: false, addEventListener() {} },
    searchInput: { disabled: false, addEventListener() {}, value: "" },
    passwordForm: { addEventListener() {} },
    passwordInput: { disabled: false, value: "", setAttribute() {}, removeAttribute() {}, select() {} },
    submitButton: { disabled: false },
    player: { removeAttribute() {}, load() {}, addEventListener() {}, setAttribute() {}, buffered: { length: 0 } },
    status: { textContent: "" },
    bufferStatus: { textContent: "", style: { setProperty() {} } },
    loginStatus: { textContent: "", focus() {} },
    librarySummary: { textContent: "" },
    folderShelf: { replaceChildren() {}, ownerDocument: { createElement: () => ({ addEventListener() {}, dataset: {} }) } },
    movieGrid: { replaceChildren() {}, ownerDocument: { createElement: () => ({ append() {}, addEventListener() {}, dataset: {} }) } },
    permissionPanel: { hidden: true },
    enablePermissionsButton: { addEventListener() {}, disabled: false },
    skipPermissionsButton: { addEventListener() {} },
    permissionStatus: { textContent: "" },
    castButton: { disabled: false, addEventListener() {} },
    tvGuideTitle: { textContent: "" },
    tvGuideSteps: { ownerDocument: { createElement: () => ({ textContent: "" }) }, replaceChildren() {}, append() {} },
    tvGuideStatus: { textContent: "" },
    keepAwakeButton: { disabled: false, textContent: "", addEventListener() {} },
    fullscreenButton: { disabled: false, addEventListener() {} },
    authPanel: { hidden: false },
    libraryPanel: { hidden: true },
    pairFireTvButton,
    fireTvPairingForm: fireTvForm,
    fireTvCodeInput: fireTvCode,
    fireTvPairingStatus: fireTvStatus,
    fetchImpl: async (url, options = {}) => {
      requests.push({ url, options });
      if (url === "/api/session") {
        return { ok: true, status: 200, json: async () => ({ authenticated: true, authConfigured: true }) };
      }
      if (url === "/api/library") {
        return { ok: true, status: 200, json: async () => ({ movies: [], folders: [] }) };
      }
      if (url === "/api/tv/pairings/approve") {
        return { ok: true, status: 200, json: async () => ({ status: "approved", deviceLabel: "Living Room Fire TV" }) };
      }
      throw new Error(url);
    },
    locationOrigin: "https://movie-downloads.example",
    createOption: () => ({}),
    navigatorRef: { userAgent: "Mozilla/5.0 Safari/605.1.15", vendor: "Apple Computer, Inc." },
    localStorageRef: { getItem: () => "done", setItem() {} },
    windowRef: {},
  });

  app.initialize();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(pairFireTvButton.disabled, false);

  listeners["button:click"]();
  assert.equal(fireTvForm.hidden, false);

  await listeners["form:submit"]({ preventDefault() {} });
  assert.equal(fireTvStatus.textContent, "Living Room Fire TV is approved. Open the Fire TV app to continue.");
  const approval = requests.find((request) => request.url === "/api/tv/pairings/approve");
  assert.equal(approval.options.method, "POST");
  assert.deepEqual(JSON.parse(approval.options.body), { code: "AB12CD" });
});

test("opens the Google Cast picker and loads a ticketed movie on the named TV", async () => {
  const listeners = {};
  const loadRequests = [];
  let currentSession = null;
  let requestSessionCalls = 0;
  let pausedCalls = 0;
  let castOptions = null;

  class MediaInfo {
    constructor(contentId, contentType) {
      this.contentId = contentId;
      this.contentType = contentType;
      this.metadata = null;
    }
  }

  class LoadRequest {
    constructor(media) {
      this.media = media;
      this.autoplay = false;
      this.currentTime = 0;
    }
  }

  class GenericMediaMetadata {
    constructor() {
      this.title = "";
      this.subtitle = "";
    }
  }

  const castSession = {
    getCastDevice() {
      return { friendlyName: "Living Room TV" };
    },
    async loadMedia(request) {
      loadRequests.push(request);
    },
  };
  const castContext = {
    addEventListener() {},
    getCastState() {
      return "NOT_CONNECTED";
    },
    getCurrentSession() {
      return currentSession;
    },
    async requestSession() {
      requestSessionCalls += 1;
      currentSession = castSession;
      return null;
    },
    setOptions(options) {
      castOptions = options;
    },
  };
  const windowRef = {
    __movieRoomCastApiReady: Promise.resolve(true),
    cast: {
      framework: {
        CastContext: { getInstance: () => castContext },
        CastContextEventType: {
          CAST_STATE_CHANGED: "CAST_STATE_CHANGED",
          SESSION_STATE_CHANGED: "SESSION_STATE_CHANGED",
        },
        CastState: {
          CONNECTED: "CONNECTED",
          CONNECTING: "CONNECTING",
          NO_DEVICES_AVAILABLE: "NO_DEVICES_AVAILABLE",
          NOT_CONNECTED: "NOT_CONNECTED",
        },
      },
    },
    chrome: {
      cast: {
        AutoJoinPolicy: { ORIGIN_SCOPED: "ORIGIN_SCOPED" },
        media: {
          DEFAULT_MEDIA_RECEIVER_APP_ID: "CC1AD845",
          GenericMediaMetadata,
          LoadRequest,
          MediaInfo,
        },
      },
    },
  };
  const movieSelect = {
    value: "",
    innerHTML: "",
    disabled: true,
    addEventListener() {},
    appendChild(option) {
      if (!this.value) {
        this.value = option.value;
      }
    },
  };
  const player = {
    currentTime: 37,
    disableRemotePlayback: true,
    paused: false,
    addEventListener() {},
    load() {},
    pause() {
      pausedCalls += 1;
    },
    removeAttribute() {},
    setAttribute() {},
  };
  const status = { textContent: "" };
  const tvGuideTitle = { textContent: "iPhone to TV" };
  const castButton = {
    disabled: true,
    textContent: "",
    addEventListener(name, listener) {
      listeners[`cast:${name}`] = listener;
    },
  };
  const fetchRequests = [];

  const app = createApp({
    movieSelect,
    reloadButton: { addEventListener() {} },
    logoutButton: { addEventListener() {} },
    searchInput: { disabled: false, addEventListener() {} },
    passwordForm: { addEventListener() {} },
    passwordInput: { disabled: false, removeAttribute() {}, setAttribute() {} },
    submitButton: { disabled: false },
    player,
    status,
    bufferStatus: { textContent: "", style: { setProperty() {} } },
    loginStatus: { textContent: "" },
    castButton,
    tvGuideTitle,
    tvGuideStatus: { textContent: "" },
    keepAwakeButton: { addEventListener() {} },
    fullscreenButton: { addEventListener() {} },
    authPanel: { hidden: false },
    libraryPanel: { hidden: true },
    fetchImpl: async (url, options = {}) => {
      fetchRequests.push({ url, options });
      if (url === "/api/session") {
        return { ok: true, status: 200, json: async () => ({ authenticated: true, authConfigured: true }) };
      }
      if (url === "/api/library") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            movies: [{
              id: "movie-1",
              title: "Family Movie",
              fileName: "Family-Movie.mp4",
              folder: "Family",
              size: 1024,
            }],
            folders: [],
          }),
        };
      }
      if (url === "/api/playback") {
        return { ok: true, status: 200, json: async () => ({ url: "/api/stream/Family-Movie.mp4" }) };
      }
      if (url === "/api/cast/playback") {
        assert.equal(options.method, "POST");
        assert.equal(options.body, JSON.stringify({ movieId: "movie-1" }));
        return {
          ok: true,
          status: 200,
          json: async () => ({
            url: "https://movie-downloads.example/api/cast/stream?ticket=opaque-signed-ticket",
            contentType: "video/mp4",
            title: "Family Movie",
            expiresAt: Date.now() + 60_000,
          }),
        };
      }
      throw new Error(`Unexpected request: ${url}`);
    },
    locationOrigin: "https://movie-downloads.example",
    createOption: () => ({}),
    documentRef: { addEventListener() {}, visibilityState: "visible" },
    navigatorRef: {
      userAgent: "Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/140.0.0.0 Mobile Safari/537.36",
      vendor: "Google Inc.",
    },
    windowRef,
  });

  app.initialize();
  for (let index = 0; index < 4; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  assert.equal(castOptions.receiverApplicationId, "CC1AD845");
  assert.equal(castOptions.autoJoinPolicy, "ORIGIN_SCOPED");
  assert.equal(castButton.textContent, "Choose Google TV");
  assert.equal(tvGuideTitle.textContent, "Google Cast to TV");

  listeners["cast:click"]();
  for (let index = 0; index < 3; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  assert.equal(requestSessionCalls, 1);
  assert.equal(loadRequests.length, 1, status.textContent);
  assert.equal(loadRequests[0].media.contentId, "https://movie-downloads.example/api/cast/stream?ticket=opaque-signed-ticket");
  assert.equal(loadRequests[0].media.contentType, "video/mp4");
  assert.equal(loadRequests[0].media.metadata.title, "Family Movie");
  assert.equal(loadRequests[0].autoplay, true);
  assert.equal(loadRequests[0].currentTime, 37);
  assert.equal(pausedCalls, 1);
  assert.match(status.textContent, /Living Room TV/);
  assert.ok(fetchRequests.some((request) => request.url === "/api/cast/playback"));
});

test("shows iPhone AirPlay guidance and opens the Safari picker", async () => {
  const listeners = {};
  let airPlayPickerOpened = 0;
  const guideSteps = [];
  const ownerDocument = {
    createElement: () => ({ textContent: "" }),
  };
  const tvGuideSteps = {
    ownerDocument,
    replaceChildren() {
      guideSteps.length = 0;
    },
    append(item) {
      guideSteps.push(item.textContent);
    },
  };
  const player = {
    disableRemotePlayback: true,
    webkitShowPlaybackTargetPicker() {
      airPlayPickerOpened += 1;
    },
    addEventListener() {},
    load() {},
    removeAttribute() {},
    setAttribute() {},
  };
  const status = { textContent: "" };
  const castButton = {
    disabled: true,
    textContent: "",
    addEventListener(name, listener) {
      listeners[name] = listener;
    },
  };
  const tvGuideStatus = { textContent: "" };
  const tvGuideTitle = { textContent: "" };

  const app = createApp({
    movieSelect: { value: "", addEventListener() {} },
    reloadButton: { addEventListener() {} },
    logoutButton: { addEventListener() {} },
    searchInput: { disabled: false, addEventListener() {} },
    passwordForm: { addEventListener() {} },
    passwordInput: { disabled: false, removeAttribute() {}, setAttribute() {} },
    submitButton: { disabled: false },
    player,
    status,
    bufferStatus: { textContent: "", style: { setProperty() {} } },
    loginStatus: { textContent: "" },
    librarySummary: { textContent: "" },
    folderShelf: { replaceChildren() {}, ownerDocument: { createElement: () => ({ addEventListener() {} }) } },
    movieGrid: { replaceChildren() {}, ownerDocument: { createElement: () => ({ append() {}, addEventListener() {}, dataset: {} }) } },
    castButton,
    tvGuideTitle,
    tvGuideSteps,
    tvGuideStatus,
    keepAwakeButton: { addEventListener() {} },
    fullscreenButton: { addEventListener() {} },
    authPanel: { hidden: false },
    libraryPanel: { hidden: true },
    fetchImpl: async (url) => {
      if (url === "/api/session") {
        return { ok: true, status: 200, json: async () => ({ authenticated: false, authConfigured: true }) };
      }
      throw new Error(`Unexpected request: ${url}`);
    },
    locationOrigin: "http://127.0.0.1:3000",
    createOption: () => ({}),
    documentRef: { addEventListener() {}, visibilityState: "visible" },
    navigatorRef: {
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Version/18.6 Mobile/15E148 Safari/604.1",
      vendor: "Apple Computer, Inc.",
      platform: "iPhone",
      maxTouchPoints: 5,
    },
  });

  app.initialize();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(player.disableRemotePlayback, false);
  assert.equal(castButton.textContent, "Safari AirPlay");
  assert.equal(tvGuideTitle.textContent, "iPhone to TV");
  assert.match(tvGuideStatus.textContent, /AirPlay is available/i);
  assert.match(guideSteps.join(" "), /same Wi-Fi/i);
  listeners.click();
  assert.equal(airPlayPickerOpened, 1);
  assert.match(status.textContent, /Apple TV or AirPlay TV/i);
});

test("shows a first-run permission setup panel and saves the choice", async () => {
  const listeners = {};
  const localStorageValues = new Map();
  let locationRequests = 0;
  let bluetoothRequests = 0;
  const permissionPanel = { hidden: true };
  const permissionStatus = { textContent: "" };
  const enablePermissionsButton = {
    disabled: false,
    addEventListener(name, listener) {
      listeners[`allow:${name}`] = listener;
    },
  };
  const player = {
    disableRemotePlayback: true,
    addEventListener() {},
    load() {},
    removeAttribute() {},
    setAttribute() {},
  };

  const app = createApp({
    movieSelect: { value: "", addEventListener() {} },
    reloadButton: { addEventListener() {} },
    logoutButton: { addEventListener() {} },
    searchInput: { disabled: false, addEventListener() {} },
    passwordForm: { addEventListener() {} },
    passwordInput: { disabled: false, removeAttribute() {}, setAttribute() {} },
    submitButton: { disabled: false },
    player,
    status: { textContent: "" },
    bufferStatus: { textContent: "", style: { setProperty() {} } },
    loginStatus: { textContent: "" },
    librarySummary: { textContent: "" },
    folderShelf: { replaceChildren() {}, ownerDocument: { createElement: () => ({ addEventListener() {} }) } },
    movieGrid: { replaceChildren() {}, ownerDocument: { createElement: () => ({ append() {}, addEventListener() {}, dataset: {} }) } },
    permissionPanel,
    enablePermissionsButton,
    skipPermissionsButton: { addEventListener() {} },
    permissionStatus,
    castButton: { addEventListener() {} },
    keepAwakeButton: { addEventListener() {} },
    fullscreenButton: { addEventListener() {} },
    authPanel: { hidden: false },
    libraryPanel: { hidden: true },
    fetchImpl: async (url) => {
      if (url === "/api/session") {
        return { ok: true, status: 200, json: async () => ({ authenticated: false, authConfigured: true }) };
      }
      throw new Error(`Unexpected request: ${url}`);
    },
    locationOrigin: "http://127.0.0.1:3000",
    createOption: () => ({}),
    documentRef: { addEventListener() {}, visibilityState: "visible" },
    navigatorRef: {
      bluetooth: {
        async requestDevice() {
          bluetoothRequests += 1;
          return {};
        },
      },
      geolocation: {
        getCurrentPosition(success) {
          locationRequests += 1;
          success({});
        },
      },
      userAgent: "Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/140.0.0.0 Mobile Safari/537.36",
      vendor: "Google Inc.",
    },
    localStorageRef: {
      getItem(key) {
        return localStorageValues.get(key) || null;
      },
      setItem(key, value) {
        localStorageValues.set(key, value);
      },
    },
  });

  app.initialize();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(permissionPanel.hidden, false);

  listeners["allow:click"]();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(permissionPanel.hidden, true);
  assert.equal(locationRequests, 1);
  assert.equal(bluetoothRequests, 0);
  assert.match(permissionStatus.textContent, /Wi-Fi/i);
  assert.doesNotMatch(permissionStatus.textContent, /Bluetooth/i);
  assert.equal(localStorageValues.get("movie_room_permissions_v2"), "done");
});

test("refreshes and resumes a stream after a sustained stall", async () => {
  const listeners = {};
  const timers = [];
  let resumedPlayCalls = 0;
  let playbackRequests = 0;
  let resolveRefreshResponse;
  const movieSelect = {
    value: "",
    innerHTML: "",
    disabled: true,
    addEventListener(name, listener) {
      listeners[`select:${name}`] = listener;
    },
    appendChild(option) {
      if (!this.value) {
        this.value = option.value;
      }
    },
  };
  const player = {
    src: "",
    currentTime: 42,
    duration: 120,
    paused: false,
    ended: false,
    buffered: { length: 0 },
    load() {},
    play: async () => {
      resumedPlayCalls += 1;
    },
    addEventListener(name, listener) {
      listeners[`player:${name}`] = listener;
    },
    removeAttribute() {},
  };

  const app = createApp({
    movieSelect,
    reloadButton: { addEventListener() {} },
    logoutButton: { addEventListener() {} },
    passwordForm: { addEventListener() {} },
    passwordInput: {
      disabled: false,
      removeAttribute() {},
      setAttribute() {},
    },
    submitButton: { disabled: false },
    player,
    status: { textContent: "" },
    loginStatus: { textContent: "" },
    authPanel: { hidden: false },
    libraryPanel: { hidden: true },
    fetchImpl: async (url, options = {}) => {
      if (url === "/api/session") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ authenticated: true, authConfigured: true }),
        };
      }
      if (url === "/api/library") {
        return {
          ok: true,
          status: 200,
          json: async () => ([
            { id: "movie-1", title: "Movie One", folder: "", size: 1024 },
          ]),
        };
      }
      if (url === "/api/playback") {
        assert.equal(options.body, JSON.stringify({ movieId: "movie-1" }));
        playbackRequests += 1;
        if (playbackRequests === 2) {
          return new Promise((resolve) => {
            resolveRefreshResponse = () => resolve({
              ok: true,
              status: 200,
              json: async () => ({ url: "https://download.example/movie-1-2" }),
            });
          });
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ url: `https://download.example/movie-1-${playbackRequests}` }),
        };
      }
      throw new Error(`Unexpected request: ${url}`);
    },
    locationOrigin: "http://127.0.0.1:3000",
    createOption: () => ({}),
    setTimeoutImpl: (callback, delay) => {
      assert.equal(delay, 12000);
      timers.push(callback);
      return timers.length;
    },
    clearTimeoutImpl() {},
  });

  app.initialize();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(playbackRequests, 0);
  movieSelect.value = "movie-1";
  await app.playSelectedMovie();
  assert.equal(playbackRequests, 1);

  listeners["player:waiting"]();
  listeners["player:stalled"]();
  assert.equal(timers.length, 1);

  timers[0]();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(playbackRequests, 2);
  assert.equal(typeof resolveRefreshResponse, "function");

  player.currentTime = 5;
  listeners["player:loadedmetadata"]();
  assert.equal(player.currentTime, 5);
  assert.equal(resumedPlayCalls, 0);

  resolveRefreshResponse();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(player.src, "https://download.example/movie-1-2");

  player.currentTime = 0;
  listeners["player:loadedmetadata"]();
  assert.equal(player.currentTime, 42);
  assert.equal(resumedPlayCalls, 1);
});

test("ignores a superseded playback failure after a newer movie loads", async () => {
  let rejectOldPlayback;
  const movieSelect = { value: "movie-old" };
  const player = {
    src: "",
    load() {},
  };
  const status = { textContent: "" };

  const app = createApp({
    movieSelect,
    reloadButton: {},
    logoutButton: {},
    passwordForm: {},
    passwordInput: {},
    player,
    status,
    loginStatus: {},
    authPanel: {},
    libraryPanel: {},
    fetchImpl: async (url, options) => {
      assert.equal(url, "/api/playback");
      const { movieId } = JSON.parse(options.body);
      if (movieId === "movie-old") {
        return new Promise((resolve, reject) => {
          rejectOldPlayback = reject;
        });
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ url: "https://download.example/movie-new" }),
      };
    },
    locationOrigin: "http://127.0.0.1:3000",
    createOption: () => ({}),
  });

  const oldRequest = app.playSelectedMovie();
  movieSelect.value = "movie-new";
  assert.equal(await app.playSelectedMovie(), true);
  assert.equal(player.src, "https://download.example/movie-new");

  rejectOldPlayback(new Error("Old stream failed"));
  assert.equal(await oldRequest, false);
  assert.equal(player.src, "https://download.example/movie-new");
  assert.equal(status.textContent, "Loading video ahead for smooth playback…");
});

test("returns 403 for unreadable movie streams on HEAD requests", async (t) => {
  if (process.platform === "win32") {
    t.skip("POSIX-style permission checks are not reliable on Windows.");
    return;
  }

  const { root, moviesDir, publicDir } = createTempLibrary();
  const moviePath = path.join(moviesDir, "locked.mp4");
  fs.writeFileSync(moviePath, "0123456789");
  fs.chmodSync(moviePath, 0o000);

  const server = await startServer(createAuthOptions({ moviesDir, publicDir }));

  t.after(() => {
    server.close();
    fs.chmodSync(moviePath, 0o644);
    fs.rmSync(root, { recursive: true, force: true });
  });

  const { port } = server.address();
  const authResponse = await login(port);
  const sessionCookie = authResponse.headers.get("set-cookie");
  const response = await fetch(`http://127.0.0.1:${port}/api/stream/locked.mp4`, {
    method: "HEAD",
    headers: { Cookie: sessionCookie },
  });

  assert.equal(response.status, 403);
});

test("recursively lists OneDrive items and resolves fresh playback links", async () => {
  const store = new MemoryStore();
  const requests = [];

  const provider = createOneDriveProvider({
    env: {
      ONEDRIVE_CLIENT_ID: "client-id",
      ONEDRIVE_CLIENT_SECRET: "client-secret",
      ONEDRIVE_REDIRECT_URI: "http://localhost/callback",
      ONEDRIVE_REFRESH_TOKEN: "refresh-token",
      ONEDRIVE_DRIVE_ID: "drive-id",
      ONEDRIVE_ROOT_ITEM_ID: "root-item",
    },
    store,
    fetchImpl: async (url, options = {}) => {
      requests.push({ url: String(url), options });

      if (String(url).includes("/oauth2/v2.0/token")) {
        return {
          ok: true,
          json: async () => ({
            access_token: "access-token",
            expires_in: 3600,
            refresh_token: "rotated-token",
          }),
        };
      }

      if (String(url).includes("/children")) {
        if (String(url).includes("/root-item/children")) {
          return {
            ok: true,
            json: async () => ({
              value: [
                { id: "folder-1", name: "Collections", folder: {} },
                { id: "recovery", name: "_Recovery", folder: {} },
                { id: "old-release", name: "www.Torrenting.com - Bomb.Girls.Facing.the.Enemy.2014.1080p.WEB.H264-DiMEPiECE", folder: {} },
                { id: "movie-1", name: "Movie-One.mp4", file: {}, size: 1024 },
              ],
            }),
          };
        }

        return {
          ok: true,
          json: async () => ({
            value: [
              {
                id: "movie-2",
                name: "Movie-Two.mkv",
                file: {},
                size: 2048,
                thumbnails: [{ medium: { url: "https://thumbs.example/movie-two.jpg" } }],
              },
              {
                id: "poster-cover-2",
                name: "poster.jpg",
                file: { mimeType: "image/jpeg" },
                size: 4096,
                thumbnails: [{ large: { url: "https://thumbs.example/movie-two-cover.jpg" } }],
              },
              {
                id: "poster-2",
                name: "thumb.jpg",
                file: { mimeType: "image/jpeg" },
                size: 4096,
                thumbnails: [{ large: { url: "https://thumbs.example/movie-two-poster.jpg" } }],
              },
            ],
          }),
        };
      }

      return {
        ok: true,
        json: async () => ({
          id: "movie-1",
          name: "Movie-One.mp4",
          file: {},
          "@microsoft.graph.downloadUrl": "https://download.example/movie-one",
        }),
      };
    },
  });

  const movies = await provider.listMovies();
  assert.deepEqual(
    movies.map((movie) => ({ title: movie.title, folder: movie.folder, posterUrl: movie.posterUrl, backdropUrl: movie.backdropUrl || "" })),
    [
      { title: "Movie One", folder: "", posterUrl: "", backdropUrl: "" },
      { title: "Movie Two", folder: "Collections", posterUrl: "/api/onedrive/image/poster-cover-2", backdropUrl: "" },
    ],
  );

  const scansBeforePlayback = requests.filter(request => request.url.includes("/children")).length;
  const playback = await provider.resolvePlayback("movie-1");
  await provider.resolvePlayback("movie-1");
  assert.equal(requests.filter(request => request.url.includes("/children")).length, scansBeforePlayback);
  assert.equal(requests.filter(request => request.url.includes("/items/movie-1?")).length, 2);
  assert.deepEqual(playback, {
    url: "https://download.example/movie-one",
    expiresAt: null,
  });
  assert.equal(await store.get("onedrive:refresh-token"), "rotated-token");
  assert.match(requests[0].url, /oauth2\/v2\.0\/token/);
  assert.equal(requests[0].options.body.get("scope"), "offline_access Files.Read");
});

test("matches Jellyfin sidecars when a title contains a decimal point", async () => {
  const provider = createOneDriveProvider({
    env: {
      ONEDRIVE_CLIENT_ID: "client-id",
      ONEDRIVE_CLIENT_SECRET: "client-secret",
      ONEDRIVE_REDIRECT_URI: "http://localhost/callback",
      ONEDRIVE_REFRESH_TOKEN: "refresh-token",
      ONEDRIVE_DRIVE_ID: "drive-id",
      ONEDRIVE_ROOT_ITEM_ID: "root-item",
    },
    fetchImpl: async (url) => {
      const value = String(url);
      if (value.includes("/oauth2/v2.0/token")) {
        return { ok: true, json: async () => ({ access_token: "access-token", expires_in: 3600 }) };
      }
      if (value.includes("/root-item/children")) {
        return { ok: true, json: async () => ({ value: [{ id: "folder-1", name: "Movies", folder: {} }] }) };
      }
      if (value.includes("/folder-1/children")) {
        return {
          ok: true,
          json: async () => ({ value: [
            { id: "movie-1", name: "Jackass 2.5 2007 1080p.mkv", file: {}, size: 100 },
            { id: "sidecar-1", name: "Jackass 2.5 2007 1080p.jellyfin.json", file: {}, size: 100 },
          ] }),
        };
      }
      if (value.includes("/sidecar-1/content")) {
        return {
          status: 302,
          headers: { get: (name) => name === "location" ? "https://content.example/sidecar" : "" },
        };
      }
      if (value === "https://content.example/sidecar") {
        return {
          ok: true,
          json: async () => ({ provider: "jellyfin", title: "Jackass 2.5", year: 2007, overview: "metadata" }),
        };
      }
      throw new Error(`Unexpected request ${value}`);
    },
  });

  const library = await provider.listLibrary();
  assert.equal(library.movies.length, 1);
  assert.equal(library.movies[0].metadataSource, "jellyfin");
  assert.equal(library.movies[0].title, "Jackass 2.5");
  assert.equal(library.movies[0].year, 2007);
});

test("serves the persisted OneDrive catalog immediately while refresh is hung", async () => {
  const store = new MemoryStore();
  const cachedLibrary = { movies: [{ id: "cached-movie", title: "Cached Movie" }], folders: [], series: [] };
  await seedOneDriveLibraryCache(store, cachedLibrary);
  let refreshStarted = false;
  const provider = createOneDriveProvider({
    env: {
      ONEDRIVE_CLIENT_ID: "client-id",
      ONEDRIVE_CLIENT_SECRET: "client-secret",
      ONEDRIVE_REDIRECT_URI: "http://localhost/callback",
      ONEDRIVE_REFRESH_TOKEN: "refresh-token",
      ONEDRIVE_DRIVE_ID: "drive-id",
      ONEDRIVE_ROOT_ITEM_ID: "root-item",
      ONEDRIVE_LIBRARY_REFRESH_TIMEOUT_MS: "25",
    },
    store,
    fetchImpl: async (url) => {
      if (String(url).includes("/oauth2/v2.0/token")) {
        return { ok: true, json: async () => ({ access_token: "access-token", expires_in: 3600 }) };
      }
      refreshStarted = true;
      return new Promise(() => {});
    },
  });

  const result = await Promise.race([
    provider.listLibrary(),
    new Promise((_, reject) => setTimeout(() => reject(new Error("cache-first read timed out")), 100)),
  ]);

  assert.equal(result.cacheStatus, "stale");
  assert.equal(result.movies[0].title, "Cached Movie");
  await waitForCondition(() => refreshStarted);
  await new Promise((resolve) => setTimeout(resolve, 50));
});

test("awaited OneDrive refresh reuses unchanged sidecars and discovers new cloud movies", async () => {
  const store = new MemoryStore();
  await seedOneDriveLibraryCache(store, {
    movies: [{
      id: "existing-video",
      title: "Existing Metadata",
      fileName: "Existing.mp4",
      folder: "",
      size: 100,
      metadataSource: "jellyfin",
      metadataSidecarETag: "sidecar-v1",
      metadata: { title: "Existing Metadata", year: 2020, overview: "Cached sidecar" },
    }],
    folders: [],
    series: [],
  });
  const sidecarFetches = [];
  const provider = createOneDriveProvider({
    env: {
      ONEDRIVE_CLIENT_ID: "client-id",
      ONEDRIVE_CLIENT_SECRET: "client-secret",
      ONEDRIVE_REDIRECT_URI: "http://localhost/callback",
      ONEDRIVE_REFRESH_TOKEN: "refresh-token",
      ONEDRIVE_DRIVE_ID: "drive-id",
      ONEDRIVE_ROOT_ITEM_ID: "root-item",
      ONEDRIVE_LIBRARY_REFRESH_TIMEOUT_MS: "1000",
    },
    store,
    fetchImpl: async (url) => {
      const requestUrl = String(url);
      if (requestUrl.includes("/oauth2/v2.0/token")) {
        return new Response(JSON.stringify({ access_token: "access-token", expires_in: 3600 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (requestUrl.includes("/root-item/children")) {
        return new Response(JSON.stringify({
          value: [
            { id: "incomplete-folder", name: ".incomplete", folder: {} },
            { id: "existing-video", name: "Existing.mp4", file: {}, size: 100 },
            { id: "existing-sidecar", name: "Existing.jellyfin.json", file: {}, eTag: "sidecar-v1" },
            { id: "fresh-video", name: "Fresh.mp4", file: {}, size: 200 },
            { id: "fresh-sidecar", name: "Fresh.jellyfin.json", file: {}, eTag: "fresh-v1" },
          ],
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (requestUrl.includes("/existing-sidecar/content")) {
        throw new Error("unchanged sidecar was downloaded again");
      }
      if (requestUrl.includes("/fresh-sidecar/content")) {
        sidecarFetches.push("fresh");
        return new Response(null, { status: 302, headers: { Location: "https://content.example/fresh-sidecar" } });
      }
      if (requestUrl === "https://content.example/fresh-sidecar") {
        return new Response(JSON.stringify({ title: "Fresh Metadata", year: 2026, overview: "New sidecar" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (requestUrl.includes("/incomplete-folder/children")) {
        throw new Error("the incomplete download folder was scanned");
      }
      throw new Error(`Unexpected request ${requestUrl}`);
    },
  });

  const refreshed = await provider.refreshLibrary();
  assert.deepEqual(refreshed.movies.map((movie) => movie.title), ["Existing Metadata", "Fresh Metadata"]);
  assert.deepEqual(sidecarFetches, ["fresh"]);
  const persisted = JSON.parse(await store.get("onedrive:library:drive-id:root-item"));
  assert.deepEqual(persisted.library.movies.map((movie) => movie.title), ["Existing Metadata", "Fresh Metadata"]);
});

test("awaited OneDrive refresh keeps the persisted catalog when Graph times out", async () => {
  const store = new MemoryStore();
  const cachedLibrary = {
    movies: [{ id: "safe", title: "Safe Movie", fileName: "Safe.mp4", size: 100 }],
    folders: [],
    series: [],
  };
  await seedOneDriveLibraryCache(store, cachedLibrary);
  const provider = createOneDriveProvider({
    env: {
      ONEDRIVE_CLIENT_ID: "client-id",
      ONEDRIVE_CLIENT_SECRET: "client-secret",
      ONEDRIVE_REDIRECT_URI: "http://localhost/callback",
      ONEDRIVE_REFRESH_TOKEN: "refresh-token",
      ONEDRIVE_DRIVE_ID: "drive-id",
      ONEDRIVE_ROOT_ITEM_ID: "root-item",
      ONEDRIVE_LIBRARY_REFRESH_TIMEOUT_MS: "25",
    },
    store,
    fetchImpl: async (url) => {
      if (String(url).includes("/oauth2/v2.0/token")) {
        return new Response(JSON.stringify({ access_token: "access-token", expires_in: 3600 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Promise(() => {});
    },
  });

  const refreshed = await provider.refreshLibrary();
  assert.equal(refreshed.cacheStatus, "stale");
  assert.equal(refreshed.movies[0].title, "Safe Movie");
  const persisted = JSON.parse(await store.get("onedrive:library:drive-id:root-item"));
  assert.deepEqual(persisted.library, cachedLibrary);
});

test("normalizes stale cached episode names before rebuilding series groups", async () => {
  const store = new MemoryStore();
  await seedOneDriveLibraryCache(store, {
    movies: [{
      id: "rick-episode-1",
      title: "Rick and Morty S09E01",
      fileName: "Rick.and.Morty.S09E01.1080p.WEB-DL.mkv",
      folder: "Movies",
      contentType: "episode",
      seriesName: "Movies",
      seriesPath: "Movies",
      seasonName: "Season 9",
      seasonNumber: 9,
      episodeNumber: 1,
    }],
    folders: [],
    series: [],
  });
  const provider = createOneDriveProvider({
    env: {
      ONEDRIVE_CLIENT_ID: "client-id",
      ONEDRIVE_CLIENT_SECRET: "client-secret",
      ONEDRIVE_REDIRECT_URI: "http://localhost/callback",
      ONEDRIVE_REFRESH_TOKEN: "refresh-token",
      ONEDRIVE_DRIVE_ID: "drive-id",
      ONEDRIVE_ROOT_ITEM_ID: "root-item",
      ONEDRIVE_LIBRARY_REFRESH_TIMEOUT_MS: "25",
    },
    store,
    fetchImpl: async () => new Promise(() => {}),
  });

  const library = await provider.listLibrary();
  assert.equal(library.movies[0].seriesName, "Rick and Morty");
  assert.equal(library.series.length, 1);
  assert.equal(library.series[0].title, "Rick and Morty");
  assert.equal(library.series[0].episodeCount, 1);
});

test("refreshes the OneDrive catalog in the background and updates durable cache", async () => {
  const store = new MemoryStore();
  await seedOneDriveLibraryCache(store, { movies: [{ id: "old-movie", title: "Old Movie" }], folders: [], series: [] });
  let rootCalls = 0;
  const provider = createOneDriveProvider({
    env: {
      ONEDRIVE_CLIENT_ID: "client-id",
      ONEDRIVE_CLIENT_SECRET: "client-secret",
      ONEDRIVE_REDIRECT_URI: "http://localhost/callback",
      ONEDRIVE_REFRESH_TOKEN: "refresh-token",
      ONEDRIVE_DRIVE_ID: "drive-id",
      ONEDRIVE_ROOT_ITEM_ID: "root-item",
      ONEDRIVE_LIBRARY_REFRESH_TIMEOUT_MS: "100",
    },
    store,
    fetchImpl: async (url) => {
      const requestUrl = String(url);
      if (requestUrl.includes("/oauth2/v2.0/token")) {
        return { ok: true, json: async () => ({ access_token: "access-token", expires_in: 3600 }) };
      }
      if (requestUrl.includes("/root-item/children")) {
        rootCalls += 1;
        return { ok: true, json: async () => ({ value: [{ id: "new-movie", name: "New-Movie.mp4", file: {}, size: 123 }] }) };
      }
      return { ok: true, json: async () => ({ value: [] }) };
    },
  });

  const immediate = await provider.listLibrary();
  assert.equal(immediate.cacheStatus, "stale");
  assert.equal(immediate.movies[0].title, "Old Movie");
  await waitForCondition(async () => {
    const raw = await store.get("onedrive:library:drive-id:root-item");
    return raw ? JSON.parse(raw).library.movies[0].title === "New Movie" : false;
  });
  assert.equal(rootCalls, 1);
  const refreshed = JSON.parse(await store.get("onedrive:library:drive-id:root-item"));
  assert.equal(refreshed.library.movies[0].title, "New Movie");
});

test("retains the last complete OneDrive catalog when background refresh rejects", async () => {
  const store = new MemoryStore();
  const cachedLibrary = { movies: [{ id: "safe-movie", title: "Safe Movie" }], folders: [], series: [] };
  await seedOneDriveLibraryCache(store, cachedLibrary);
  let refreshAttempts = 0;
  const provider = createOneDriveProvider({
    env: {
      ONEDRIVE_CLIENT_ID: "client-id",
      ONEDRIVE_CLIENT_SECRET: "client-secret",
      ONEDRIVE_REDIRECT_URI: "http://localhost/callback",
      ONEDRIVE_REFRESH_TOKEN: "refresh-token",
      ONEDRIVE_DRIVE_ID: "drive-id",
      ONEDRIVE_ROOT_ITEM_ID: "root-item",
      ONEDRIVE_LIBRARY_REFRESH_TIMEOUT_MS: "100",
    },
    store,
    fetchImpl: async (url) => {
      const requestUrl = String(url);
      if (requestUrl.includes("/oauth2/v2.0/token")) {
        return { ok: true, json: async () => ({ access_token: "access-token", expires_in: 3600 }) };
      }
      refreshAttempts += 1;
      return { ok: false, status: 503, headers: new Headers() };
    },
  });

  const result = await provider.listLibrary();
  assert.equal(result.cacheStatus, "stale");
  assert.equal(result.movies[0].title, "Safe Movie");
  await waitForCondition(() => refreshAttempts > 0);
  const persisted = JSON.parse(await store.get("onedrive:library:drive-id:root-item"));
  assert.deepEqual(persisted.library, cachedLibrary);
});

test("keeps the last complete OneDrive library when a refresh is temporarily rejected", async () => {
  const store = new MemoryStore();
  let childrenCalls = 0;
  const provider = createOneDriveProvider({
    env: {
      ONEDRIVE_CLIENT_ID: "client-id",
      ONEDRIVE_CLIENT_SECRET: "client-secret",
      ONEDRIVE_REDIRECT_URI: "http://localhost/callback",
      ONEDRIVE_REFRESH_TOKEN: "refresh-token",
      ONEDRIVE_DRIVE_ID: "drive-id",
      ONEDRIVE_ROOT_ITEM_ID: "root-item",
    },
    store,
    fetchImpl: async (url) => {
      const requestUrl = String(url);
      if (requestUrl.includes("/oauth2/v2.0/token")) {
        return { ok: true, json: async () => ({ access_token: "access-token", expires_in: 3600 }) };
      }
      if (requestUrl.includes("/root-item/children")) {
        childrenCalls += 1;
        if (childrenCalls > 1) return { ok: false, status: 503, headers: new Headers() };
        return { ok: true, json: async () => ({ value: [{ id: "movie-1", name: "Home-Alone.mp4", file: {}, size: 123 }] }) };
      }
      return { ok: true, json: async () => ({ value: [] }) };
    },
  });

  const first = await provider.listLibrary();
  const second = await provider.listLibrary();
  assert.equal(first.movies[0].title, "Home Alone");
  assert.equal(second.movies[0].title, "Home Alone");
  assert.equal(second.cacheStatus, "stale");
});

test("uses the OneDrive content redirect when a file response omits its download URL", async () => {
  const provider = createOneDriveProvider({
    env: {
      ONEDRIVE_CLIENT_ID: "client-id",
      ONEDRIVE_CLIENT_SECRET: "client-secret",
      ONEDRIVE_REDIRECT_URI: "http://localhost/callback",
      ONEDRIVE_REFRESH_TOKEN: "refresh-token",
      ONEDRIVE_DRIVE_ID: "drive-id",
      ONEDRIVE_ROOT_ITEM_ID: "root-item",
    },
    store: new MemoryStore(),
    fetchImpl: async (url) => {
      const requestUrl = String(url);

      if (requestUrl.includes("/oauth2/v2.0/token")) {
        return {
          ok: true,
          json: async () => ({ access_token: "access-token", expires_in: 3600 }),
        };
      }

      if (requestUrl.includes("/root-item/children")) {
        return {
          ok: true,
          json: async () => ({
            value: [{ id: "movie-1", name: "Movie-One.mp4", file: {} }],
          }),
        };
      }

      if (requestUrl.includes("/items/movie-1/content")) {
        return {
          status: 302,
          headers: new Headers({ Location: "https://download.example/movie-one" }),
        };
      }

      return {
        ok: true,
        json: async () => ({ id: "movie-1", name: "Movie-One.mp4", file: {} }),
      };
    },
  });

  const playback = await provider.resolvePlayback("movie-1");
  assert.deepEqual(playback, {
    url: "https://download.example/movie-one",
    expiresAt: null,
  });
});

test("surfaces a OneDrive token refresh failure", async () => {
  const provider = createOneDriveProvider({
    env: {
      ONEDRIVE_CLIENT_ID: "client-id",
      ONEDRIVE_CLIENT_SECRET: "client-secret",
      ONEDRIVE_REDIRECT_URI: "http://localhost/callback",
      ONEDRIVE_REFRESH_TOKEN: "refresh-token",
      ONEDRIVE_DRIVE_ID: "drive-id",
      ONEDRIVE_ROOT_ITEM_ID: "root-item",
    },
    store: new MemoryStore(),
    fetchImpl: async () => ({
      ok: false,
      status: 400,
      json: async () => ({ error: "bad_request" }),
    }),
  });

  await assert.rejects(
    provider.listMovies(),
    /refresh token exchange failed/i,
  );
});

test("refreshes and retries once when Microsoft Graph rejects a cached access token", async () => {
  let tokenRequests = 0;
  let childrenRequests = 0;

  const provider = createOneDriveProvider({
    env: {
      ONEDRIVE_CLIENT_ID: "client-id",
      ONEDRIVE_CLIENT_SECRET: "client-secret",
      ONEDRIVE_REDIRECT_URI: "http://localhost/callback",
      ONEDRIVE_REFRESH_TOKEN: "refresh-token",
      ONEDRIVE_DRIVE_ID: "drive-id",
      ONEDRIVE_ROOT_ITEM_ID: "root-item",
    },
    store: new MemoryStore(),
    fetchImpl: async (url, options = {}) => {
      if (String(url).includes("/oauth2/v2.0/token")) {
        tokenRequests += 1;
        return {
          ok: true,
          json: async () => ({
            access_token: `access-token-${tokenRequests}`,
            expires_in: 3600,
          }),
        };
      }

      childrenRequests += 1;
      if (childrenRequests === 2 && options.headers.Authorization === "Bearer access-token-1") {
        return { ok: false, status: 401 };
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({
          value: [
            { id: "movie-1", name: "Movie-One.mp4", file: {}, size: 1024 },
          ],
        }),
      };
    },
  });

  assert.equal((await provider.listMovies()).length, 1);
  assert.equal((await provider.listMovies()).length, 1);
  await waitForCondition(() => tokenRequests === 2 && childrenRequests === 3);
  assert.equal(tokenRequests, 2);
  assert.equal(childrenRequests, 3);
});

test("rejects a OneDrive playback response without a usable file url", async () => {
  const provider = createOneDriveProvider({
    env: {
      ONEDRIVE_CLIENT_ID: "client-id",
      ONEDRIVE_CLIENT_SECRET: "client-secret",
      ONEDRIVE_REDIRECT_URI: "http://localhost/callback",
      ONEDRIVE_REFRESH_TOKEN: "refresh-token",
      ONEDRIVE_DRIVE_ID: "drive-id",
      ONEDRIVE_ROOT_ITEM_ID: "root-item",
    },
    store: new MemoryStore(),
    fetchImpl: async (url) => {
      if (String(url).includes("/oauth2/v2.0/token")) {
        return {
          ok: true,
          json: async () => ({
            access_token: "access-token",
            expires_in: 3600,
          }),
        };
      }

      if (String(url).includes("/children")) {
        return {
          ok: true,
          json: async () => ({
            value: [
              { id: "movie-1", name: "Movie-One.mp4", file: {}, size: 1024 },
            ],
          }),
        };
      }

      return {
        ok: true,
        json: async () => ({
          id: "movie-1",
          name: "Movie-One.mp4",
          file: {},
        }),
      };
    },
  });

  await assert.rejects(
    provider.resolvePlayback("movie-1"),
    /did not return a playback url/i,
  );
});

test("rejects OneDrive playback ids outside the configured movie folder", async () => {
  const provider = createOneDriveProvider({
    env: {
      ONEDRIVE_CLIENT_ID: "client-id",
      ONEDRIVE_CLIENT_SECRET: "client-secret",
      ONEDRIVE_REDIRECT_URI: "http://localhost/callback",
      ONEDRIVE_REFRESH_TOKEN: "refresh-token",
      ONEDRIVE_DRIVE_ID: "drive-id",
      ONEDRIVE_ROOT_ITEM_ID: "root-item",
    },
    store: new MemoryStore(),
    fetchImpl: async (url) => {
      const requestUrl = String(url);

      if (requestUrl.includes("/oauth2/v2.0/token")) {
        return {
          ok: true,
          json: async () => ({
            access_token: "access-token",
            expires_in: 3600,
          }),
        };
      }

      if (requestUrl.includes("/root-item/children")) {
        return {
          ok: true,
          json: async () => ({
            value: [
              { id: "allowed-movie", name: "Allowed.mp4", file: {}, size: 1024 },
            ],
          }),
        };
      }

      return {
        ok: true,
        json: async () => ({
          id: "outside-movie",
          name: "Private-Outside-Folder.mp4",
          file: {},
          "@microsoft.graph.downloadUrl": "https://download.example/private",
        }),
      };
    },
  });

  await assert.rejects(
    provider.resolvePlayback("outside-movie"),
    /not in the configured movie folder/i,
  );
});
