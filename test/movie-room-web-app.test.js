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

  assert.match(settings, /include ":movieroom-web"/);
  assert.match(build, /applicationId\s+"com\.movieroom\.web"/);
  assert.match(manifest, /android\.permission\.INTERNET/);
  assert.match(manifest, /android\.permission\.ACCESS_NETWORK_STATE/);
  assert.match(manifest, /android\.permission\.READ_EXTERNAL_STORAGE/);
  assert.match(manifest, /android\.permission\.WRITE_EXTERNAL_STORAGE/);
  assert.match(manifest, /android\.permission\.READ_MEDIA_VIDEO/);
  assert.match(manifest, /android\.permission\.WAKE_LOCK/);
  assert.match(manifest, /android\.permission\.ACCESS_WIFI_STATE/);
  assert.match(manifest, /android\.permission\.VIBRATE/);
  assert.match(manifest, /android\.permission\.RECEIVE_BOOT_COMPLETED/);
  assert.match(manifest, /android\.intent\.category\.LEANBACK_LAUNCHER/);
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
  assert.match(activity, /addJavascriptInterface/);
  assert.match(activity, /openNetworkSettings/);
  assert.match(activity, /requestPermissions/);
  assert.match(activity, /onRequestPermissionsResult/);
  assert.match(activity, /DownloadManager/);
  assert.match(activity, /downloadForOffline/);
  assert.match(activity, /Environment\.DIRECTORY_MOVIES/);
  assert.match(activity, /KEYCODE_DPAD_UP/);
  assert.match(activity, /evaluateJavascript/);
  assert.match(activity, /document\.dispatchEvent/);
  assert.match(activity, /dispatchKeyEvent/);
  assert.doesNotMatch(activity, /setOnKeyListener/);
  assert.match(activity, /event\.getAction\(\) == KeyEvent\.ACTION_DOWN/);
  assert.match(activity, /event\.getRepeatCount\(\)/);
  assert.match(activity, /new KeyboardEvent/);
  assert.match(activity, /ArrowUp/);
  assert.match(activity, /Enter/);
  assert.match(activity, /Backspace/);
  assert.match(activity, /ContextMenu/);
  assert.match(activity, /ActivityInfo\.SCREEN_ORIENTATION_PORTRAIT/);
  assert.match(activity, /ActivityInfo\.SCREEN_ORIENTATION_LANDSCAPE/);
  assert.match(activity, /FEATURE_LEANBACK/);
  assert.match(activity, /enterVideoFullscreen/);
  assert.match(activity, /exitVideoFullscreen/);
  assert.match(activity, /postDelayed/);
  const bootReceiver = read("movieroom-web/src/main/java/com/movieroom/web/BootReceiver.java");
  assert.match(manifest, /\.BootReceiver/);
  assert.match(bootReceiver, /ACTION_BOOT_COMPLETED/);
  assert.match(bootReceiver, /MainActivity\.class/);
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
