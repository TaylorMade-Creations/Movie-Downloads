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
  assert.match(manifest, /android\.intent\.category\.LEANBACK_LAUNCHER/);
  assert.match(manifest, /android:icon="@mipmap\/ic_launcher"/);
  assert.match(manifest, /android:banner="@drawable\/taylormade_movies_cover"/);
  assert.match(manifest, /android:label="TaylorMade Movies"/);
  assert.match(activity, /setBackgroundColor\(0xff061523\)/);
  assert.match(activity, /WebView/);
  assert.match(activity, /BuildConfig\.MOVIE_ROOM_BASE_URL/);
  assert.match(activity, /setJavaScriptEnabled\(true\)/);
  assert.match(activity, /setDomStorageEnabled\(true\)/);
  assert.match(activity, /setMediaPlaybackRequiresUserGesture\(false\)/);
  assert.match(activity, /addJavascriptInterface/);
  assert.match(activity, /openNetworkSettings/);
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
