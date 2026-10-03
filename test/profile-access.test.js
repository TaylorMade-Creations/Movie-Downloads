const test = require("node:test");
const assert = require("node:assert/strict");

const {
  ACCESS_STATES,
  createDefaultProfiles,
  hashPin,
  normalizeAccessState,
  normalizeProfile,
  scopeCatalog,
  verifyPin,
} = require("../lib/profile-access");

test("normalizes only the supported access states and falls back safely", () => {
  for (const state of ACCESS_STATES) {
    assert.equal(normalizeAccessState(state), state);
  }

  assert.equal(normalizeAccessState("unknown"), "needs_setup");
  assert.equal(normalizeAccessState({ state: "profile_locked" }), "profile_locked");
  assert.equal(normalizeAccessState({ state: "unknown" }), "needs_setup");
});

test("seeds the four household profiles without PIN secrets", () => {
  const profiles = createDefaultProfiles();
  assert.deepEqual(profiles.map((profile) => profile.id), ["home", "mom", "morganne", "kids"]);
  assert.deepEqual(profiles.map((profile) => profile.displayName), ["Home", "Mom", "Morganne", "Kids"]);
  for (const profile of profiles) {
    assert.equal(profile.pinRequired, false);
    assert.equal(Object.hasOwn(profile, "pin"), false);
    assert.equal(Object.hasOwn(profile, "pinHash"), false);
    assert.ok(profile.avatarId);
    assert.ok(profile.accentColor);
    assert.deepEqual(profile.settings.appOrder, []);
    assert.deepEqual(profile.watchState, {});
  }
});

test("normalizes profile settings and never returns a plaintext PIN", () => {
  const profile = normalizeProfile({
    id: "  Morganne ",
    displayName: "  Morganne  ",
    avatarId: "morganne-art",
    accentColor: "#ff74ad",
    pin: "1234",
    settings: { appOrder: ["com.example.movie"], hiddenApps: ["com.example.hidden"] },
  });

  assert.equal(profile.id, "morganne");
  assert.equal(profile.displayName, "Morganne");
  assert.equal(profile.avatarId, "morganne-art");
  assert.equal(profile.pinRequired, true);
  assert.equal(Object.hasOwn(profile, "pin"), false);
  assert.equal(Object.hasOwn(profile, "pinHash"), false);
  assert.deepEqual(profile.settings.appOrder, ["com.example.movie"]);
  assert.deepEqual(profile.settings.hiddenApps, ["com.example.hidden"]);
});

test("hashes and verifies a PIN while rejecting malformed and incorrect values", () => {
  const salt = "test-salt";
  const digest = hashPin("4826", salt);
  assert.match(digest, /^[a-f0-9]{128}$/);
  assert.equal(verifyPin("4826", salt, digest), true);
  assert.equal(verifyPin("4827", salt, digest), false);
  assert.equal(verifyPin("", salt, digest), false);
  assert.throws(() => hashPin("12", salt), /PIN/);
});

test("scopes preview and full catalogs by access state and ignores client full flags", () => {
  const catalog = Array.from({ length: 8 }, (_, index) => ({
    id: `movie-${index}`,
    title: `Movie ${index}`,
    preview: index < 2,
    mostWatched: index === 2,
    trending: index === 3,
  }));

  const preview = scopeCatalog(catalog, { state: "needs_setup", scope: "full" });
  assert.deepEqual(preview.map((movie) => movie.id), ["movie-0", "movie-1", "movie-2", "movie-3"]);
  assert.ok(preview.every((movie) => movie.entitlement === "free"));

  assert.deepEqual(scopeCatalog(catalog, "profile_locked"), []);
  assert.equal(scopeCatalog(catalog, "home_unlocked").length, catalog.length);
  assert.equal(scopeCatalog(catalog, "profile_unlocked").length, catalog.length);
});
