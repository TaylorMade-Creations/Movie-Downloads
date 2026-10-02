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

test("the final web UI pass uses red and black first with ivory and purple accents", () => {
  assert.match(finalPass, /--ui-black:\s*#070407/);
  assert.match(finalPass, /--ui-red:\s*#e1264d/);
  assert.match(finalPass, /--ui-red-deep:\s*#7a0b24/);
  assert.match(finalPass, /--ui-purple:\s*#963d9e/);
  assert.match(finalPass, /--ui-purple-deep:\s*#4d1f59/);
  assert.match(finalPass, /--ui-ivory:\s*#fff4e5/);
  assert.match(finalPass, /--ui-font-display:\s*"Bodoni MT"/);
  assert.match(finalPass, /--ui-font-body:\s*"Avenir Next"/);
  assert.match(finalPass, /--ui-font-meta:\s*"Franklin Gothic Medium"/);
  assert.match(finalPass, /\.movie-card::before\s*\{[\s\S]*?border:[^;]*var\(--ui-purple\)/);
  assert.match(finalPass, /\.movie-card \.movie-title\s*\{[\s\S]*?font-family:\s*var\(--ui-font-display\)/);
  assert.match(finalPass, /\.movie-card \.movie-meta\s*\{[\s\S]*?color:\s*#d79be2/);
  assert.match(finalPass, /linear-gradient\([^;]*var\(--ui-black\)[^;]*var\(--ui-red-deep\)/);
  assert.match(finalPass, /\.hero-movie::after\s*\{[\s\S]*?var\(--ui-red-deep\)[\s\S]*?var\(--ui-purple\)/);
  assert.match(finalPass, /\.movie-grid,[\s\S]*?minmax\(108px, 124px\)/);
  assert.match(finalPass, /\.movie-card,[\s\S]*?border-color:\s*transparent/);
  assert.match(finalPass, /\.permission-panel\s*\{[\s\S]*?left:\s*12px/);
});

test("every page has a muted ambient video background with a graceful fallback", () => {
  assert.match(html, /id="site-background-video"\s+class="site-background-video"[^>]*muted[^>]*loop[^>]*playsinline/);
  assert.match(finalPass, /\.site-background-video\s*\{[\s\S]*?position:\s*fixed[\s\S]*?pointer-events:\s*none/);
  assert.match(finalPass, /\.site-background-video\s*\{[\s\S]*?opacity:\s*\.22/);
  assert.match(app, /siteBackgroundVideo/);
  assert.match(app, /startSiteBackgroundVideo\(/);
  assert.match(app, /prefers-reduced-motion/);
});

test("generated poster fallbacks stay inside the red-black theme", () => {
  assert.match(app, /function generatedPosterUrl/);
  assert.match(app, /stop-color="#650918"/);
  assert.match(app, /stop-color="#070407"/);
  assert.match(app, /fill="#6f2f7e"/);
  assert.match(app, /fill="#c1122f"/);
  assert.match(app, /fill="#fff4e5"/);
  assert.doesNotMatch(app, /#32769d|#62e3db|#102b4a|#061a31/);
});
