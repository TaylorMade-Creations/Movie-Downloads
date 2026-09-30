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
