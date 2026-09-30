const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "public", "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "public", "app.js"), "utf8");

test("Movie Room exposes a visible remote control line for keyboard and TV navigation", () => {
  assert.match(html, /id="remote-control-bar"/);
  for (const control of ["remote-up", "remote-left", "remote-select", "remote-right", "remote-down", "remote-back", "remote-home", "remote-play"]) {
    assert.match(html, new RegExp(`id="${control}"`));
  }
  assert.match(html, /id="remote-settings"/);
  assert.match(html, /id="settings-dialog"/);
  assert.match(html, /id="settings-network"/);
  assert.match(html, /id="settings-display"/);
  assert.match(html, /id="settings-bluetooth"/);
  assert.match(app, /function moveRemoteFocus/);
  assert.match(app, /openSettings/);
  assert.match(app, /MovieRoomRemote/);
  assert.match(app, /remote-control-bar/);
  assert.match(app, /arrowleft|arrowright/i);
  assert.match(html, /\.movie-grid\s*\{[\s\S]*minmax\(120px,\s*138px\)/);
  assert.match(html, /\.movie-rail[^\{]*\{[\s\S]*grid-auto-columns:\s*minmax\(112px,\s*132px\)/);
  assert.match(html, /\.remote-control-button:focus-visible[\s\S]*background:\s*#ffd166/);
  assert.match(html, /\.movie-card:focus-visible[\s\S]*outline/);
});
