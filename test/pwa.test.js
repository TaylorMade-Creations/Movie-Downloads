const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const publicDir = path.join(__dirname, "..", "public");

test("Movie Room ships an installable standalone PWA shell", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(publicDir, "manifest.webmanifest"), "utf8"));
  const html = fs.readFileSync(path.join(publicDir, "index.html"), "utf8");
  const app = fs.readFileSync(path.join(publicDir, "app.js"), "utf8");
  const serviceWorker = fs.readFileSync(path.join(publicDir, "sw.js"), "utf8");

  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.orientation, "portrait");
  assert.equal(manifest.start_url, "/");
  assert.match(html, /rel="manifest" href="\/manifest\.webmanifest"/);
  assert.match(html, /rel="icon"[^>]+taylormade-movies-cover\.png/);
  assert.match(app, /serviceWorker\.register\("\/sw\.js"/);
  assert.match(serviceWorker, /movie-room-shell-v22/);
  assert.match(html, /app\.js\?v=20261001-reference-home-v12/);
  assert.match(serviceWorker, /app\.js\?v=20261001-reference-home-v12/);
  assert.match(serviceWorker, /url\.pathname\.startsWith\("\/api\/"\)/);
  assert.match(app, /registration\.update\(\)/);
  assert.match(app, /controllerchange/);
});
