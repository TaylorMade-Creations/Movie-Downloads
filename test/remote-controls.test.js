const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "public", "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "public", "app.js"), "utf8");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("Movie Room leaves webpage focus to the native Fire TV WebView", () => {
  assert.doesNotMatch(html, /id="remote-control-bar"/);
  for (const control of ["remote-up", "remote-left", "remote-select", "remote-right", "remote-down", "remote-back", "remote-home", "remote-play", "remote-settings"]) {
    assert.doesNotMatch(html, new RegExp(`id="${control}"`));
  }
  assert.match(html, /id="settings-dialog"/);
  assert.match(app, /windowRef\.MovieRoomBack/);
  assert.match(app, /function moveRemoteFocus/);
  assert.match(app, /function handleRemoteCommand/);
  assert.match(app, /windowRef\.MovieRoomHandleRemoteKey/);
  assert.match(app, /windowRef\.MovieRoomMenu/);
  assert.match(app, /windowRef\.MovieRoomTogglePlayback/);
  assert.match(html, /\.movie-grid\s*\{[\s\S]*minmax\(120px,\s*138px\)/);
  assert.match(html, /\.movie-rail[^\{]*\{[\s\S]*grid-auto-columns:\s*minmax\(112px,\s*132px\)/);
  assert.match(html, /\.movie-card:focus-visible[\s\S]*outline/);
  assert.match(app, /handleRemoteCommand\(command\)/);
});

test("the app handles keyboard and Fire TV remote commands without double-click behavior", () => {
  assert.match(app, /documentRef\.addEventListener\("keydown"/);
  assert.match(app, /handleRemoteCommand/);
  assert.doesNotMatch(app, /dblclick/);
});

test("the WebView allows native focus to reach webpage descendants", () => {
  const activity = read("movieroom-web/src/main/java/com/movieroom/web/MainActivity.java");
  assert.match(activity, /setFocusable\(true\)/);
  assert.match(activity, /setFocusableInTouchMode\(true\)/);
  assert.match(activity, /setDescendantFocusability\(ViewGroup\.FOCUS_AFTER_DESCENDANTS\)/);
  assert.match(activity, /dispatchKeyEvent/);
  for (const key of ["KEYCODE_DPAD_UP", "KEYCODE_DPAD_LEFT", "KEYCODE_DPAD_CENTER", "KEYCODE_DPAD_RIGHT", "KEYCODE_DPAD_DOWN"]) {
    assert.match(activity, new RegExp(key));
  }
});

test("the app keeps page Back but leaves Menu and media routing to Fire TV/WebView", () => {
  const activity = read("movieroom-web/src/main/java/com/movieroom/web/MainActivity.java");
  assert.match(activity, /onBackPressed/);
  assert.match(activity, /MovieRoomBack/);
  assert.match(app, /function handleNativeBack/);
  assert.match(activity, /KEYCODE_MENU/);
  assert.match(activity, /KEYCODE_MEDIA_PLAY_PAUSE/);
  assert.match(app, /windowRef\.MovieRoomMenu/);
});

test("the player has remote-selectable playback controls", () => {
  assert.match(html, /id="player-play-pause"/);
  assert.match(html, /id="fullscreen-player"/);
  assert.match(app, /playerPlayPause/);
  assert.match(app, /togglePlayerPlayback/);
});

test("the web app gives search its own row and exposes Menu tabs", () => {
  const searchRowStart = html.indexOf('class="search-row"');
  const searchInput = html.indexOf('id="library-search"');
  const primaryNav = html.indexOf('class="primary-nav"');
  assert.ok(searchRowStart >= 0 && searchInput > searchRowStart);
  assert.ok(primaryNav >= 0 && searchRowStart > primaryNav);
  assert.match(html, /role="tablist"/);
  for (const tab of ["browse", "profiles", "settings"]) {
    assert.match(html, new RegExp(`data-menu-tab="${tab}"`));
    assert.match(html, new RegExp(`data-menu-panel="${tab}"`));
  }
  assert.match(app, /function setMenuTab/);
});

test("the native Fire TV player handles Menu and playback commands", () => {
  const activity = read("firetv/src/main/java/com/movieroom/firetv/MainActivity.java");
  assert.match(activity, /public boolean onKeyDown\(int keyCode, KeyEvent event\)/);
  assert.match(activity, /KEYCODE_MENU/);
  assert.match(activity, /KEYCODE_MEDIA_PLAY_PAUSE/);
  assert.match(activity, /KEYCODE_MEDIA_PLAY/);
  assert.match(activity, /KEYCODE_MEDIA_PAUSE/);
  assert.match(activity, /showShellSettings\(\)/);
  assert.match(activity, /player\.isPlaying\(\)/);
});

test("native Fire TV artwork URL encoding uses an Android-compatible overload", () => {
  const api = read("firetv/src/main/java/com/movieroom/firetv/MovieRoomApi.java");
  assert.match(api, /URLEncoder\.encode\([^,]+,\s*"UTF-8"\)/);
  assert.doesNotMatch(api, /URLEncoder\.encode\([^)]*StandardCharsets\.UTF_8/);
});

test("native Fire TV player links every shelf with deterministic remote focus", () => {
  const activity = read("firetv/src/main/java/com/movieroom/firetv/MainActivity.java");
  assert.match(activity, /connectTvFocusRows/);
  assert.match(activity, /setNextFocusLeftId/);
  assert.match(activity, /setNextFocusRightId/);
  assert.match(activity, /setNextFocusUpId/);
  assert.match(activity, /setNextFocusDownId/);
  assert.match(activity, /KEYCODE_BACK/);
});

test("permission completion returns native focus to the hero instead of opening Search", () => {
  assert.match(app, /const firstStartupTarget = heroPlay \|\| heroDetails \|\| null/);
  assert.doesNotMatch(app, /markPermissionPanelDone[\s\S]{0,500}visibleFocusableElements\(\)\[0\]/);
});

test("selecting a movie starts the player immediately and previews the focused title", () => {
  assert.match(app, /player\.autoplay\s*=\s*true/);
  assert.match(app, /player\.play\(\)/);
  assert.match(app, /function setFeaturedMovie/);
  assert.match(app, /movie-card.*addEventListener\("focus"/s);
  assert.match(app, /hero-preview-active/);
});

test("thumbnail previews start at the title frame and stop after one minute", () => {
  assert.match(app, /const previewStartSeconds = 0/);
  assert.match(app, /const previewDurationMs = 60000/);
  assert.match(app, /currentTime = previewStartSeconds/);
  assert.match(app, /setTimeoutImpl\(.*previewDurationMs/s);
  assert.match(app, /Return to the best available title artwork/);
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
  assert.match(app, /setDetailsHero\(movie\)/);
  assert.match(app, /if \(detailsPlay && hasMethod\(detailsPlay, "focus"\)\) detailsPlay\.focus\(\)/);
  assert.match(app, /card\.addEventListener\("click", \(\) => \{[\s\S]*?openMovieDetails\(movie\)/);
  assert.match(html, /id="details-title"/);
  assert.match(html, /id="details-play"/);
});

test("the Menu page keeps browse and profile destinations inside its panels", () => {
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
