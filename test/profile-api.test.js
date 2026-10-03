const test = require("node:test");
const assert = require("node:assert/strict");

const { createServer } = require("../server");
const { MemoryStore } = require("../lib/store");

const SESSION_SECRET = "0123456789abcdef0123456789abcdef";

function createProvider() {
  const movies = Array.from({ length: 5 }, (_, index) => ({
    id: `movie-${index}`,
    title: `Movie ${index}`,
    preview: index < 2,
    mostWatched: index === 2,
    trending: index === 3,
  }));

  return {
    kind: "test",
    async listMovies() {
      return movies;
    },
    async listLibrary() {
      return { movies, folders: [] };
    },
  };
}

async function startServer() {
  const server = createServer({
    auth: { publicAccess: true, sessionSecret: SESSION_SECRET },
    profileAccess: true,
    provider: createProvider(),
    store: new MemoryStore(),
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return server;
}

function originFor(server) {
  return `http://127.0.0.1:${server.address().port}`;
}

function cookieValue(response) {
  return response.headers.get("set-cookie")?.split(";", 1)[0] || "";
}

function jsonHeaders(origin, cookie = "") {
  return {
    "Content-Type": "application/json",
    Origin: origin,
    ...(cookie ? { Cookie: cookie } : {}),
  };
}

async function postJson(origin, path, body, cookie = "") {
  return fetch(`${origin}${path}`, {
    method: "POST",
    headers: jsonHeaders(origin, cookie),
    body: JSON.stringify(body),
  });
}

test("profile access state starts gated, exposes only preview, and blocks the full library", async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const origin = originFor(server);

  const stateResponse = await fetch(`${origin}/api/access-state`);
  assert.equal(stateResponse.status, 200);
  assert.equal((await stateResponse.json()).state, "needs_setup");

  const previewResponse = await fetch(`${origin}/api/preview`);
  assert.equal(previewResponse.status, 200);
  assert.deepEqual((await previewResponse.json()).movies.map((movie) => movie.id), [
    "movie-0",
    "movie-1",
    "movie-2",
    "movie-3",
  ]);

  const libraryResponse = await fetch(`${origin}/api/library`);
  assert.equal(libraryResponse.status, 401);
});

test("setup creates an unlocked Home profile and grants the full library", async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const origin = originFor(server);

  const setupResponse = await postJson(origin, "/api/account/setup", {
    displayName: "Taylor Home",
    avatarId: "home-family",
    accentColor: "#f0c45b",
  });
  assert.equal(setupResponse.status, 201);
  const cookie = cookieValue(setupResponse);
  assert.match(cookie, /^movie_room_profile_session=/);

  const stateResponse = await fetch(`${origin}/api/access-state`, { headers: { Cookie: cookie } });
  assert.equal(stateResponse.status, 200);
  const state = await stateResponse.json();
  assert.equal(state.state, "home_unlocked");
  assert.equal(state.profile.displayName, "Taylor Home");

  const libraryResponse = await fetch(`${origin}/api/library?scope=preview`, { headers: { Cookie: cookie } });
  assert.equal(libraryResponse.status, 200);
  assert.equal((await libraryResponse.json()).movies.length, 5);
});

test("protected profiles are isolated, require their PIN, and persist edits", async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const origin = originFor(server);

  const setupResponse = await postJson(origin, "/api/account/setup", { displayName: "Home" });
  const homeCookie = cookieValue(setupResponse);

  const createResponse = await postJson(origin, "/api/profiles", {
    displayName: "Guest",
    avatarId: "default-profile",
    accentColor: "#28c48f",
    pin: "4826",
  }, homeCookie);
  assert.equal(createResponse.status, 201);
  const created = await createResponse.json();
  assert.equal(created.profile.id, "guest");
  assert.equal(created.profile.pinRequired, true);
  assert.equal(Object.hasOwn(created.profile, "pinHash"), false);

  const wrongUnlock = await postJson(origin, "/api/profiles/guest/unlock", { pin: "4827" }, homeCookie);
  assert.equal(wrongUnlock.status, 401);

  const unlockResponse = await postJson(origin, "/api/profiles/guest/unlock", { pin: "4826" }, homeCookie);
  assert.equal(unlockResponse.status, 200);
  const momCookie = cookieValue(unlockResponse);
  assert.match(momCookie, /^movie_room_profile_session=/);

  const momStateResponse = await fetch(`${origin}/api/access-state`, { headers: { Cookie: momCookie } });
  const momState = await momStateResponse.json();
  assert.equal(momState.state, "profile_unlocked");
  assert.equal(momState.profile.id, "guest");

  const patchResponse = await fetch(`${origin}/api/profiles/guest`, {
    method: "PATCH",
    headers: jsonHeaders(origin, momCookie),
    body: JSON.stringify({ displayName: "Mom Movies", accentColor: "#f0c45b" }),
  });
  assert.equal(patchResponse.status, 200);
  const patched = await patchResponse.json();
  assert.equal(patched.profile.displayName, "Mom Movies");
  assert.equal(patched.profile.accentColor, "#f0c45b");

  const profilesResponse = await fetch(`${origin}/api/profiles`, { headers: { Cookie: momCookie } });
  const profiles = await profilesResponse.json();
  assert.equal(profiles.profiles.find((profile) => profile.id === "guest").displayName, "Mom Movies");

  const resetResponse = await postJson(origin, "/api/account/reset", {}, momCookie);
  assert.equal(resetResponse.status, 204);
  const resetState = await fetch(`${origin}/api/access-state`, { headers: { Cookie: momCookie } });
  assert.equal((await resetState.json()).state, "needs_setup");
});
