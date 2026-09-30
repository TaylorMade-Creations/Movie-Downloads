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
  assert.match(manifest, /android:banner="@drawable\/taylormade_movies_cover"/);
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
  assert.match(activity, /MovieRoomBack/);
  assert.match(activity, /dispatchKeyEvent/);
  assert.match(activity, /dispatchNativeDirectional/);
  assert.match(activity, /dispatchNativeSelect/);
  assert.match(activity, /dispatchNativeMenu/);
  assert.match(activity, /dispatchNativePlaybackToggle/);
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
  assert.match(activity, /finish\(\)/);
  assert.match(app, /function handleNativeBack/);
  assert.match(app, /function handleNativeBack[\s\S]*?focusInitialHero\(\);\s*return false;/);
  assert.match(app, /playInNativePlayer/);
  assert.match(nativePlayer, /ExoPlayer/);
  assert.match(nativePlayer, /setAudioAttributes/);
  assert.match(nativePlayer, /video\/x-matroska/);
});

test("Movie Room public mode starts without a login screen", () => {
  const html = read("public/index.html");
  const app = read("public/app.js");
  const server = read("server.js");

  assert.match(html, /id="auth-panel"[^>]*hidden/);
  assert.match(app, /publicAccess = Boolean\(session\.publicAccess\)/);
  assert.match(app, /logoutButton\.hidden = publicAccess/);
  assert.match(server, /MOVIE_ROOM_PUBLIC/);
  assert.match(server, /publicAccess: true/);
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
