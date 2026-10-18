const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("Movie Room Web APK wraps the current website for Android and TV", () => {
  const settings = read("settings.gradle");
  const build = read("movieroom-web/build.gradle");
  const manifest = read("movieroom-web/src/main/AndroidManifest.xml");
  const activity = read("movieroom-web/src/main/java/com/movieroom/web/MainActivity.java");
  const nativePlayer = read("movieroom-web/src/main/java/com/movieroom/web/NativePlayerActivity.java");
  const app = read("public/app.js");

  assert.match(settings, /include ":movieroom-web"/);
  assert.match(build, /applicationId\s+"com\.movieroom\.web"/);
  assert.match(build, /media3-exoplayer/);
  assert.match(build, /media3-ui/);
  assert.match(manifest, /android\.permission\.INTERNET/);
  assert.match(manifest, /android\.permission\.ACCESS_NETWORK_STATE/);
  assert.match(manifest, /android\.permission\.READ_EXTERNAL_STORAGE/);
  assert.match(manifest, /android\.permission\.WRITE_EXTERNAL_STORAGE/);
  assert.match(manifest, /android\.permission\.READ_MEDIA_VIDEO/);
  assert.match(manifest, /android\.permission\.WAKE_LOCK/);
  assert.match(manifest, /android\.permission\.ACCESS_WIFI_STATE/);
  assert.match(manifest, /android\.permission\.VIBRATE/);
  assert.match(manifest, /android\.intent\.category\.LEANBACK_LAUNCHER/);
  assert.match(manifest, /\.NativePlayerActivity/);
  assert.doesNotMatch(manifest, /android\.intent\.category\.HOME/);
  assert.doesNotMatch(manifest, /RECEIVE_BOOT_COMPLETED|\.BootReceiver/);
  assert.match(manifest, /android:icon="@mipmap\/ic_launcher"/);
  assert.match(manifest, /android:banner="@drawable\/banner"/);
  assert.match(manifest, /android:label="TaylorMade Movies"/);
  assert.match(manifest, /android:screenOrientation="unspecified"/);
  assert.match(activity, /setBackgroundColor\(0xff061523\)/);
  assert.match(activity, /WebView/);
  assert.match(activity, /BuildConfig\.MOVIE_ROOM_BASE_URL/);
  assert.match(activity, /setJavaScriptEnabled\(true\)/);
  assert.match(activity, /setDomStorageEnabled\(true\)/);
  assert.match(activity, /setMediaPlaybackRequiresUserGesture\(false\)/);
  assert.match(activity, /configureWebViewViewport\(settings\)/);
  assert.match(activity, /settings\.setUseWideViewPort\(televisionDevice\)/);
  assert.match(activity, /settings\.setLoadWithOverviewMode\(televisionDevice\)/);
  assert.match(activity, /settings\.setTextZoom\(100\)/);
  assert.match(activity, /addJavascriptInterface/);
  assert.match(activity, /openNetworkSettings/);
  assert.match(activity, /requestPermissions/);
  assert.match(activity, /onRequestPermissionsResult/);
  assert.match(activity, /DownloadManager/);
  assert.match(activity, /downloadForOffline/);
  assert.match(activity, /Environment\.DIRECTORY_MOVIES/);
  assert.match(activity, /setFocusable\(true\)/);
  assert.match(activity, /setFocusableInTouchMode\(true\)/);
  assert.match(activity, /setDescendantFocusability\(ViewGroup\.FOCUS_AFTER_DESCENDANTS\)/);
  assert.match(activity, /webView\.requestFocus\(View\.FOCUS_DOWN\)/);
  assert.match(activity, /onBackPressed/);
  assert.doesNotMatch(activity, /MovieRoomBack/);
  assert.doesNotMatch(activity, /dispatchKeyEvent/);
  assert.doesNotMatch(activity, /dispatchNativeDirectional/);
  assert.doesNotMatch(activity, /dispatchNativeSelect/);
  assert.doesNotMatch(activity, /dispatchNativeMenu/);
  assert.doesNotMatch(activity, /dispatchNativePlaybackToggle/);
  assert.doesNotMatch(activity, /MovieRoomMove/);
  assert.match(activity, /ActivityInfo\.SCREEN_ORIENTATION_PORTRAIT/);
  assert.match(activity, /ActivityInfo\.SCREEN_ORIENTATION_LANDSCAPE/);
  assert.match(activity, /FEATURE_LEANBACK/);
  assert.match(activity, /FEATURE_TOUCHSCREEN/);
  assert.match(activity, /openAppStorageSettings/);
  assert.match(activity, /AlertDialog/);
  assert.match(activity, /UPDATE_MANIFEST_URL/);
  assert.match(activity, /checkForAppUpdate/);
  assert.match(activity, /network_update_prompt/);
  assert.match(activity, /enterVideoFullscreen/);
  assert.match(activity, /exitVideoFullscreen/);
  assert.match(activity, /postDelayed/);
  assert.match(activity, /MovieRoomFocusInitialHero/);
  assert.doesNotMatch(activity, /finish\(\)/);
  assert.doesNotMatch(app, /function handleNativeBack/);
  assert.match(app, /playInNativePlayer/);
  assert.match(nativePlayer, /ExoPlayer/);
  assert.match(nativePlayer, /setAudioAttributes/);
  assert.match(nativePlayer, /video\/x-matroska/);
});

test("Movie Room ships a public interface with organized search and no login controls", () => {
  const html = read("public/index.html");

  assert.doesNotMatch(html, /id="auth-panel"|id="password-form"|Enter shared password|id="logout"/);
  assert.match(html, /id="search-scope"/);
  assert.match(html, /id="search-year"/);
  assert.match(html, /id="search-sort"/);
  assert.match(html, /id="home-profile-tabs"/);
  assert.match(html, /id="home-genre-tabs"/);
});

test("the home surface exposes image-led profile and genre tabs", () => {
  const html = read("public/index.html");
  const app = read("public/app.js");
  assert.match(html, /class="image-tab-rail profile-image-tabs"/);
  assert.match(html, /class="image-tab-rail genre-image-tabs"/);
  assert.match(app, /function renderHomeImageTabs/);
  assert.match(app, /profile-image-tab/);
  assert.match(app, /genre-image-tab/);
  assert.match(app, /tabArtworkFallbacks/);
  assert.match(app, /home:\s*["']\/profile-home\.jpeg["']/);
  assert.match(app, /kids:\s*["']\/profile-kids\.jpeg["']/);
  assert.match(app, /morganne:\s*["']\/profile-morganne\.jpeg["']/);
  assert.match(app, /mom:\s*["']\/profile-mom\.jpeg["']/);
  assert.ok(fs.statSync(path.join(root, "public/profile-kids.jpeg")).size > 0);
  assert.ok(fs.statSync(path.join(root, "public/profile-morganne.jpeg")).size > 0);
  assert.ok(fs.statSync(path.join(root, "public/profile-mom.jpeg")).size > 0);
  assert.ok(fs.statSync(path.join(root, "public/profile-home.jpeg")).size > 0);
});

test("the Android wrapper exposes storage permission and an offline movie download action", () => {
  const html = read("public/index.html");
  const app = read("public/app.js");
  assert.match(html, /id="details-offline"/);
  assert.match(app, /downloadForOffline/);
  assert.match(app, /movieroom-storage-permission/);
  assert.match(app, /enterVideoFullscreen/);
  assert.match(app, /exitVideoFullscreen/);
  assert.match(app, /fullscreenchange/);
});

test("Fire TV remote commands are not intercepted before the WebView can handle focus", () => {
  const activity = read("movieroom-web/src/main/java/com/movieroom/web/MainActivity.java");
  assert.doesNotMatch(activity, /pendingRemoteCommands/);
  assert.doesNotMatch(activity, /flushPendingRemoteCommands/);
  assert.doesNotMatch(activity, /KEYCODE_BACK/);
  assert.doesNotMatch(activity, /dispatchNativeBack/);
  assert.match(activity, /webView\.requestFocus\(View\.FOCUS_DOWN\)/);
});

test("Fire TV home rows rely on Android/WebView focus instead of a custom remote geometry router", () => {
  const app = read("public/app.js");
  assert.doesNotMatch(app, /function remoteFocusZones/);
  assert.doesNotMatch(app, /function focusWithinRemoteZone/);
  assert.doesNotMatch(app, /function remoteMovieCardRowFor/);
  assert.doesNotMatch(app, /lastRemoteFocusedElement/);
  assert.doesNotMatch(app, /startupTarget = activePage === "home"/);
  assert.doesNotMatch(app, /launchHeaderDownTarget = activePage === "home"/);
  assert.doesNotMatch(app, /remoteUiReady/);
  assert.doesNotMatch(app, /pendingRemoteUiCommands/);
  assert.doesNotMatch(app, /const fallback = direction === "left" \|\| direction === "up" \? elements\[elements\.length - 1\] : elements\[0\]/);
});

test("the library exposes separate alphabetized Movies and Series shelves", () => {
  const html = read("public/index.html");
  const app = read("public/app.js");
  assert.match(html, /id="library-movies-grid"/);
  assert.match(html, /id="library-series-grid"/);
  assert.match(html, /id="library-movies-section"/);
  assert.match(html, /id="library-series-section"/);
  assert.match(app, /libraryMoviesGrid/);
  assert.match(app, /librarySeriesGrid/);
  assert.match(app, /localeCompare/);
  assert.match(app, /focusLibraryPrimaryTarget/);
});

test("the home hero and selected-title page expose video background layers", () => {
  const html = read("public/index.html");
  const app = read("public/app.js");
  assert.match(html, /id="hero-preview-video"/);
  assert.match(html, /id="details-preview-video"/);
  assert.match(app, /function startHeroPreview/);
  assert.match(app, /function setDetailsHero/);
  assert.match(app, /details-preview-video/);
});

test("selected-title pages move Jellyfin movie information out of the hero", () => {
  const html = read("public/index.html");
  const app = read("public/app.js");
  assert.match(html, /id="details-info-panel"/);
  assert.match(html, /id="details-info-description"/);
  assert.match(html, /id="details-info-cast"/);
  assert.match(html, /id="details-info-genres"/);
  assert.match(html, /id="cast-tv-guide"[^>]*hidden/);
  assert.match(app, /function renderSelectedMovieInfo/);
  assert.match(app, /detailsInfoCast/);
  assert.match(app, /Cast pending from Jellyfin/);
  assert.match(app, /detailsDescription\.textContent = ""/);
  assert.match(app, /showCastGuide/);
});

test("the Fire TV theme has a crisp high-contrast 1080p presentation", () => {
  const html = read("public/index.html");
  assert.match(html, /body\[data-tv-device="true"\][\s\S]*?-webkit-font-smoothing:\s*antialiased/);
  assert.match(html, /body\[data-tv-device="true"\]::before[\s\S]*?filter:\s*none/);
  assert.match(html, /body\[data-tv-device="true"\] \.hero-preview-video[\s\S]*?opacity:\s*\.9/);
  assert.match(html, /body\[data-tv-device="true"\] \.movie-card[\s\S]*?contain:\s*layout paint/);
});

test("uploaded profile artwork is not replaced by catalog movie posters", () => {
  const app = read("public/app.js");
  assert.match(app, /className\.includes\(["']profile-image-tab["']\)/);
  assert.match(app, /usesUploadedProfileArtwork/);
  assert.match(app, /!usesUploadedProfileArtwork/);
});

test("the visible web and PWA palette is gold-first instead of purple-first", () => {
  const html = read("public/index.html");
  assert.match(html, /Gold-first cinema palette for both the web\/PWA and Fire TV/);
  assert.match(html, /--pop-pink:\s*#d9a92f/);
  assert.match(html, /\.profile-image-tab[\s\S]*?border-color:\s*rgba\(217, 169, 47/);
});
