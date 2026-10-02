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

test("the final web UI pass carries the approved purple-and-ivory theme", () => {
  assert.match(finalPass, /--ui-plum:\s*#24112f/);
  assert.match(finalPass, /--ui-purple:\s*#5d2a73/);
  assert.match(finalPass, /--ui-ivory:\s*#fff8e7/);
  assert.match(finalPass, /--ui-gold:\s*#d4af37/);
  assert.match(finalPass, /linear-gradient\([^;]*var\(--ui-plum\)[^;]*var\(--ui-purple\)/);
  assert.match(finalPass, /\.hero-movie::after\s*\{[\s\S]*?var\(--ui-plum\)[\s\S]*?var\(--ui-purple\)/);
  assert.match(finalPass, /\.movie-card:hover[\s\S]*?var\(--ui-gold\)/);
  assert.match(finalPass, /\.auth-panel,\s*\.permission-card\s*\{[\s\S]*?background:\s*linear-gradient\([^;]*var\(--ui-ivory\)/);
});

test("every page has a muted ambient video background with a graceful fallback", () => {
  assert.match(html, /id="site-background-video"\s+class="site-background-video"[^>]*muted[^>]*loop[^>]*playsinline/);
  assert.match(finalPass, /\.site-background-video\s*\{[\s\S]*?position:\s*fixed[\s\S]*?pointer-events:\s*none/);
  assert.match(finalPass, /\.site-background-video\s*\{[\s\S]*?opacity:\s*\.22/);
  assert.match(app, /siteBackgroundVideo/);
  assert.match(app, /startSiteBackgroundVideo\(/);
  assert.match(app, /prefers-reduced-motion/);
});
