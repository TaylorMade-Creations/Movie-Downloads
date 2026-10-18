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

test("Pop Cinema concept keeps the cursive brand, landscape cards, and concept tab layout", () => {
  assert.match(html, /data-browse-destination="home"[^>]*>Home<\/button>/);
  assert.match(html, /data-browse-destination="library"[^>]*>Movies<\/button>/);
  assert.match(html, /data-browse-destination="collections"[^>]*>Series<\/button>/);
  assert.match(html, /data-browse-destination="saved"[^>]*>My List<\/button>/);
  assert.match(html, /data-browse-destination="saved"[^>]*>Downloads<\/button>/);
  assert.match(finalPass, /--pop-font-script:\s*"Segoe Script"/);
  assert.match(finalPass, /\.brand-primary\s*\{[\s\S]*?font-family:\s*var\(--pop-font-script\)/);
  assert.match(finalPass, /\.poster\s*\{[\s\S]*?aspect-ratio:\s*16\s*\/\s*9/);
  assert.match(finalPass, /\.movie-rail[\s\S]*?grid-auto-columns:\s*minmax\(220px,\s*300px\)/);
  assert.match(finalPass, /\.hero-preview-video\s*\{[\s\S]*?inset:\s*0/);
  assert.match(finalPass, /\.image-tab-rail\s*\{[\s\S]*?display:\s*grid/);
  assert.match(finalPass, /\.image-tab\s*\{[\s\S]*?aspect-ratio:\s*1\s*\/\s*\.8/);
  assert.match(finalPass, /\.image-tab \.tab-image\s*\{[\s\S]*?object-fit:\s*cover/);
});

test("home shelves use crisp landscape artwork, compact cards, and profile-menu-only selection", () => {
  assert.match(app, /preferBackdrop/);
  assert.match(finalPass, /#library-panel\.home-surface \.profile-image-tabs\s*\{[\s\S]*?display:\s*none/);
  assert.match(finalPass, /#library-panel\.home-surface \.genre-image-tabs\s*\{[\s\S]*?display:\s*flex/);
  assert.match(finalPass, /\.genre-image-tab\s*\{[\s\S]*?border-radius:\s*999px/);
  assert.match(finalPass, /#library-panel\.home-surface \.movie-rail\s*\{[\s\S]*?grid-template-columns:\s*repeat\(6,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(finalPass, /#library-panel\.home-surface \.movie-rail\s*\{[\s\S]*?overflow-x:\s*hidden/);
  assert.match(finalPass, /#library-panel\.home-surface \.movie-rail\s*\{[\s\S]*?scrollbar-width:\s*none/);
  assert.match(finalPass, /#library-panel\.home-surface \.movie-rail\s*\{[\s\S]*?gap:\s*18px/);
  assert.match(finalPass, /@media \(max-width: 720px\)[\s\S]*?#library-panel\.home-surface \.movie-rail\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
});

test("home genre chips sit above the hero while TV rows hide chevrons and move thumbnail-to-thumbnail", () => {
  const navigationIndex = html.indexOf('id="home-navigation"');
  const heroIndex = html.indexOf('id="hero-movie"');
  assert.ok(navigationIndex >= 0 && heroIndex >= 0 && navigationIndex < heroIndex);
  assert.match(html, /class="rail-scroll rail-scroll-left"[^>]*aria-label="Scroll Continue Watching left"/);
  assert.match(html, /class="rail-scroll rail-scroll-right"[^>]*aria-label="Scroll Continue Watching right"/);
  assert.match(finalPass, /\.rail-frame\s*\{[\s\S]*?position:\s*relative/);
  assert.match(finalPass, /\.rail-scroll\s*\{[\s\S]*?background:\s*rgba\(0,\s*0,\s*0,\s*\.94\)/);
  assert.match(finalPass, /\.rail-scroll\s*\{[\s\S]*?font-size:\s*clamp\(42px,\s*5vw,\s*74px\)/);
  assert.match(finalPass, /#library-panel\.home-surface \.movie-rail\s*\{[\s\S]*?grid-template-columns:\s*repeat\(6,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(finalPass, /body\[data-tv-device="true"\] \.rail-scroll,[\s\S]*?body\[data-tv-device="true"\] \.hero-carousel-nav\s*\{[\s\S]*?display:\s*none !important/);
  assert.match(finalPass, /body\[data-tv-device="true"\] #library-panel\.home-surface \.movie-rail\s*\{[\s\S]*?grid-template-columns:\s*repeat\(11,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(finalPass, /#library-panel\.home-surface \.movie-rail::-webkit-scrollbar\s*\{[\s\S]*?display:\s*none/);
  assert.match(finalPass, /#library-panel\.home-surface \.view-more-poster\s*\{[\s\S]*?text-align:\s*center/);
  assert.match(finalPass, /\.view-more-collage\s*\{/);
  assert.match(app, /function bindRailScrollButtons/);
  assert.match(app, /function pageShelf\(shelf,\s*direction\)/);
  assert.match(app, /if \(shelfWindows\.has\(rail\)\) \{\s*pageShelf\(rail,\s*direction\);/);
  assert.match(app, /movies\.slice\(state\.start,\s*state\.start \+ 10\)/);
  assert.match(app, /cards\.push\(createViewMoreCard\(shelfType,\s*movies\.length,\s*movies\.slice\(state\.start \+ 10,\s*state\.start \+ 14\)\)\)/);
  assert.doesNotMatch(app, /button\.addEventListener\("keydown", \(event\) =>/);
  assert.doesNotMatch(app, /next\.focus\(\{ preventScroll: true \}\)/);
  assert.match(finalPass, /\.hero-movie\s*\{[\s\S]*?min-height:\s*clamp\(430px,\s*50vw,\s*680px\)/);
  assert.match(finalPass, /\.hero-copy\s*\{[\s\S]*?clamp\(92px,\s*8vw,\s*132px\)/);
});

test("active hero video removes the smoky color wash over the autoplay preview", () => {
  assert.match(finalPass, /\.hero-movie\.hero-video-active::after,[\s\S]*?body\[data-tv-device="true"\] \.hero-movie\.hero-video-active::after\s*\{[\s\S]*?background:\s*transparent !important/);
  assert.match(finalPass, /\.hero-movie\.hero-video-active \.hero-preview-video,[\s\S]*?body\[data-tv-device="true"\] \.hero-movie\.hero-video-active \.hero-preview-video\s*\{[\s\S]*?opacity:\s*1 !important/);
  assert.match(finalPass, /\.hero-movie\.hero-video-active \.hero-preview-video,[\s\S]*?filter:\s*none !important/);
});

test("home card selection normalizes the chosen movie before opening details", () => {
  assert.match(app, /card\.addEventListener\("click",\s*\(\) => \{[\s\S]*?openMovieInfoPopup\(movie\)/);
  assert.match(app, /const detailsPrimary = remoteArtworkUrl\(movie\)/);
  assert.match(app, /attachArtworkImage\(detailsPoster,\s*detailsPrimary/);
});

test("movie previews can start when a landscape card becomes meaningfully visible", () => {
  assert.match(app, /IntersectionObserver/);
  assert.match(app, /threshold:\s*0\.6/);
  assert.match(app, /visibilityObserver\.observe\(card\)/);
});
