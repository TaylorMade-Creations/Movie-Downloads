const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "public", "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "public", "app.js"), "utf8");

test("profile selection navigates to a dedicated page with watched rails", () => {
  assert.match(html, /id="profile-page"/);
  assert.match(html, /id="profile-most-watched-shelf"/);
  assert.match(html, /id="profile-recently-watched-shelf"/);
  assert.match(app, /function openProfilePage/);
  assert.match(app, /function renderProfilePage/);
  assert.match(app, /setActivePage\("profile"\)/);
  assert.match(app, /profileMostWatchedShelf/);
  assert.match(app, /profileRecentlyWatchedShelf/);
  assert.match(app, /lastWatchedAt/);
  assert.match(app, /playCount/);
});

test("profile themes use home black and gold, kids orange, mom emerald, and Morganne pink", () => {
  assert.match(html, /body\[data-viewer-profile="home"\][^}]*--gold:\s*#f0c45b/i);
  assert.match(html, /body\[data-viewer-profile="kids"\][^}]*--gold:\s*#f59e0b/i);
  assert.match(html, /body\[data-viewer-profile="mom"\][^}]*--gold:\s*#28c48f/i);
  assert.match(html, /body\[data-viewer-profile="morganne"\][^}]*--gold:\s*#ff74ad/i);
});

test("profile menu destinations use the profile page instead of returning home", () => {
  const profileBranch = app.match(/if \(target\.startsWith\("profile-"\)\)\s*\{([\s\S]*?)\n    \}/);
  assert.ok(profileBranch, "profile browse branch should exist");
  assert.match(profileBranch[1], /openProfilePage\(/);
  assert.doesNotMatch(profileBranch[1], /setActivePage\("home"\)/);
});

test("search, menu, library, and genres are full page destinations", () => {
  assert.match(html, /id="search-page"[^>]*class="page search-page"/);
  assert.doesNotMatch(html, /id="search-page"[^>]*role="dialog"/);
  assert.match(html, /id="navigation-page"[^>]*class="page navigation-page"/);
  assert.match(html, /data-browse-destination="search"/);
  assert.match(html, /data-browse-destination="genres"/);
  assert.match(app, /activePage === "search"/);
  assert.match(app, /activePage === "menu"/);
  assert.match(app, /function setSearchOverlayVisible/);
  assert.match(app, /viewerStateClient\.load\(activeProfile\)/);
});

test("a selected movie opens its own hero page instead of a modal dialog", () => {
  assert.match(html, /id="movie-details-page"[^>]*class="page movie-details-page"/);
  assert.doesNotMatch(html, /<dialog[^>]*id="movie-details-page"/);
  assert.match(html, /id="details-backdrop"/);
  assert.match(html, /id="details-preview-video"/);
  assert.match(app, /activePage === "details"/);
  assert.match(app, /function setDetailsHero/);
  assert.doesNotMatch(app, /movieDetailsDialog\.showModal/);
});

test("profile navigation has separate persisted local state and profile-scoped library picks", () => {
  assert.match(app, /profileNavigationPrefix/);
  assert.match(app, /writeLocalValue\(`\$\{profileNavigationPrefix\}/);
  assert.match(app, /viewerProfiles\[activeProfile\]/);
  assert.match(app, /movieMatchesFilter[\s\S]*profile\.pick/);
  assert.match(html, /data-profile-navigation="home"/);
  assert.match(html, /data-profile-navigation="mom"/);
  assert.match(html, /data-profile-navigation="kids"/);
  assert.match(html, /data-profile-navigation="morganne"/);
});

test("home keeps a visible profile library rail and page shortcuts", () => {
  assert.match(html, /id="home-library-section"/);
  assert.match(html, /id="home-library-shelf"/);
  assert.match(html, /data-browse-destination="library"/);
  assert.match(app, /homeLibraryShelf/);
  assert.match(app, /renderShelf\(homeLibraryShelf/);
});
