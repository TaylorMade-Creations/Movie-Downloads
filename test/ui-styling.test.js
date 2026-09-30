const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "public", "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "public", "app.js"), "utf8");
const finalPass = html.slice(html.lastIndexOf("/* Final responsive web UI pass"));

test("the final web UI pass keeps search separate and gives remote focus a clear path", () => {
  assert.ok(finalPass.startsWith("/* Final responsive web UI pass"));
  assert.match(finalPass, /\.topbar\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(finalPass, /\.search-row\s*\{[\s\S]*?border-radius:\s*14px/);
  assert.match(finalPass, /\.catalog-status\s*\{[\s\S]*?clip-path:\s*inset\(50%\)/);
  assert.match(finalPass, /:where\(button, input, select, a, \[tabindex\]\):focus-visible[\s\S]*?outline:\s*3px solid var\(--ui-focus\)/);
  assert.match(finalPass, /button:focus-visible[\s\S]*?outline:\s*3px solid #ffd166/);
  assert.match(finalPass, /@media \(min-width: 1200px\)[\s\S]*?\.movie-card/);
  assert.match(finalPass, /@media \(max-width: 720px\)[\s\S]*?\.mobile-nav/);
  assert.match(app, /firstHeroTarget\.focus\(\{ preventScroll: true \}\)/);
});
