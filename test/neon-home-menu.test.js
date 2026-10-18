const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "public", "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "public", "app.js"), "utf8");
const finalPass = html.slice(html.lastIndexOf("/* Neon Theater home menu pass"));

test("the web menu opens on profile-aware recently watched videos without Browse", () => {
  assert.doesNotMatch(html, /data-menu-tab="browse"/);
  assert.match(html, /data-menu-tab="recent"/);
  assert.match(html, /id="menu-panel-recent"/);
  assert.match(html, /id="menu-recently-watched-shelf"/);
  assert.match(app, /data-video-aware/);
  assert.match(app, /shelfType === "recently-watched"/);
  assert.match(app, /installHoverPreview\(card, poster, movie, ready\)/);
  assert.match(app, /setMenuTab\("recent"/);
  assert.match(app, /function renderRecentlyWatchedMenu\(\)/);
  assert.match(app, /profileRecentlyWatchedShelf/);
});

test("Neon Theater defines readable color tokens and distinct navigation states", () => {
  assert.match(finalPass, /--neon-red:\s*#c91f4b/);
  assert.match(finalPass, /--neon-black:\s*#070407/);
  assert.match(finalPass, /--neon-teal:\s*#5eead4/);
  assert.match(finalPass, /--neon-gold:\s*#ffd166/);
  assert.match(finalPass, /--neon-magenta:\s*#ff5bbd/);
  assert.match(finalPass, /\.navigation-page-header[\s\S]*?--neon-red/);
  assert.match(finalPass, /\.menu-recently-watched-rail[\s\S]*?--neon-gold/);
  assert.match(finalPass, /\.menu-group\[data-menu-group="my-room"\][\s\S]*?--neon-magenta/);
  assert.match(finalPass, /\.primary-nav button\.active[\s\S]*?box-shadow/);
  assert.match(finalPass, /\.navigation-grid button:focus-visible[\s\S]*?outline/);
});

test("home menu destinations use existing navigation automation and shelf targets", () => {
  assert.match(app, /function scrollHomeDestination\(target\)/);
  assert.match(app, /continue-watching-shelf/);
  assert.match(app, /recently-added-shelf/);
  assert.match(app, /querySelector\("\.tv-guide"\)/);
  assert.match(app, /data\.homeTarget/);
  assert.match(app, /data\.savedFilter/);
});
