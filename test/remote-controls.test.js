const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "public", "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "public", "app.js"), "utf8");

test("Movie Room uses the physical remote without rendering an on-page control strip", () => {
  assert.doesNotMatch(html, /id="remote-control-bar"/);
  for (const control of ["remote-up", "remote-left", "remote-select", "remote-right", "remote-down", "remote-back", "remote-home", "remote-play", "remote-settings"]) {
    assert.doesNotMatch(html, new RegExp(`id="${control}"`));
  }
  assert.match(html, /id="settings-dialog"/);
  assert.match(html, /id="settings-network"/);
  assert.match(html, /id="settings-display"/);
  assert.match(html, /id="settings-bluetooth"/);
  assert.match(app, /openSettings/);
  assert.match(app, /MovieRoomRemote/);
  assert.match(app, /windowRef\.MovieRoomRemote/);
  assert.match(html, /\.movie-grid\s*\{[\s\S]*minmax\(120px,\s*138px\)/);
  assert.match(html, /\.movie-rail[^\{]*\{[\s\S]*grid-auto-columns:\s*minmax\(112px,\s*132px\)/);
  assert.match(html, /\.remote-target-active/);
  assert.match(html, /\.movie-card:focus-visible[\s\S]*outline/);
  assert.doesNotMatch(app, /function moveRemoteFocus/);
  assert.doesNotMatch(app, /moveRemoteFocus\(key\.replace\("arrow", ""\)\)/);
});

test("the basic remote path leaves arrow movement to the WebView focus engine", () => {
  assert.match(app, /documentRef\.addEventListener\("keydown"/);
  assert.match(app, /if \(\["arrowup", "arrowleft", "arrowright", "arrowdown"\]\.includes\(key\)\)/);
  assert.doesNotMatch(app, /event\.preventDefault\(\);\s*moveRemoteFocus/);
});

test("permission completion returns focus to the hero instead of opening Search", () => {
  assert.match(app, /const firstRemoteTarget = heroPlay \|\| heroDetails \|\| null/);
  assert.doesNotMatch(app, /markPermissionPanelDone[\s\S]{0,500}visibleRemoteTargets\(\)\[0\]/);
});

test("selecting a movie starts the player immediately and previews the focused title", () => {
  assert.match(app, /player\.autoplay\s*=\s*true/);
  assert.match(app, /player\.play\(\)/);
  assert.match(app, /function setFeaturedMovie/);
  assert.match(app, /movie-card.*addEventListener\("focus"/s);
  assert.match(app, /hero-preview-active/);
});

test("thumbnail previews start after the opening credits and remain while focused", () => {
  assert.match(app, /const previewStartSeconds = 180/);
  assert.match(app, /const previewDurationMs = 40000/);
  assert.match(app, /currentTime = previewStartSeconds/);
  assert.match(app, /setTimeoutImpl\(.*previewDurationMs/s);
});

test("the initial TV focus keeps the trending hero at the top until the user moves down", () => {
  assert.match(app, /function focusInitialHero/);
  assert.match(app, /focusInitialHero\(\)/);
  assert.match(app, /behavior:\s*"auto", block:\s*"start"/);
  assert.match(app, /const previewVideo = heroVisible \? heroPreviewVideo/);
  assert.match(html, /Trending now/);
});

test("the mobile startup hero clears the sticky Chrome-style top bar", () => {
  assert.match(html, /\.hero-movie\s*\{[^}]*scroll-margin-top:\s*84px/);
  assert.match(html, /@media \(max-width: 720px\)[\s\S]*?\.hero-movie\s*\{[^}]*scroll-margin-top:\s*128px/);
});

test("the home hero uses the selected movie video instead of leaving the poster visible", () => {
  assert.match(app, /hero-video-active/);
  assert.match(html, /\.hero-movie\.hero-video-active > img \{ opacity: 0; \}/);
});

test("selecting a title opens More info and promotes that movie to the video hero", () => {
  assert.match(app, /let detailsPreviousFocus = null/);
  assert.match(app, /function closeMovieDetails/);
  assert.match(app, /detailsPreviousFocus = documentRef\.activeElement/);
  assert.match(app, /setFeaturedMovie\(movie\)/);
  assert.match(app, /if \(detailsPlay && hasMethod\(detailsPlay, "focus"\)\) detailsPlay\.focus\(\)/);
  assert.match(app, /card\.addEventListener\("click", \(\) => \{[\s\S]*?openMovieDetails\(movie\)/);
  assert.match(html, /id="details-title"/);
  assert.match(html, /id="details-play"/);
});

test("the physical Menu keeps browse destinations available without restoring a cluttered top bar", () => {
  for (const destination of ["menu-home", "menu-library", "menu-collections", "menu-genres", "menu-profile-home", "menu-profile-mom", "menu-profile-kids"]) {
    assert.match(html, new RegExp(`id="${destination}"`));
  }
  assert.match(app, /function selectBrowseDestination/);
  assert.match(app, /activeLibraryView = "collections"/);
  assert.match(app, /activeLibraryView = "genres"/);
  assert.match(app, /menuHomeButton/);
});

test("the web player requests landscape only for fullscreen and returns to the device default", () => {
  assert.match(app, /function setVideoFullscreenOrientation/);
  assert.match(app, /screenOrientation\.lock\(isFullscreen \? "landscape" : "portrait"\)/);
  assert.match(app, /bridge\.enterVideoFullscreen/);
  assert.match(app, /bridge\.exitVideoFullscreen/);
  assert.match(app, /webkitbeginfullscreen/);
  assert.match(app, /webkitendfullscreen/);
});
