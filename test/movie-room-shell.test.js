const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const shellRoot = path.join(root, "movieroom-shell");
const playerRoot = path.join(root, "firetv");
const webRoot = path.join(root, "movieroom-web");

function read(relativePath) {
  return fs.readFileSync(path.join(shellRoot, relativePath), "utf8");
}

function readPlayer(relativePath) {
  return fs.readFileSync(path.join(playerRoot, relativePath), "utf8");
}

function readWeb(relativePath) {
  return fs.readFileSync(path.join(webRoot, relativePath), "utf8");
}

function readPublic(relativePath) {
  return fs.readFileSync(path.join(root, "public", relativePath), "utf8");
}

function claimsHomeRole(manifest) {
  return /<category\s+android:name="android\.intent\.category\.HOME"\s*\/>/.test(manifest);
}

test("only the native Movie Room shell owns the Android HOME role", () => {
  const shellManifest = read("src/main/AndroidManifest.xml");
  const playerManifest = readPlayer("src/main/AndroidManifest.xml");
  const webManifest = readWeb("src/main/AndroidManifest.xml");

  assert.equal(claimsHomeRole(shellManifest), true);
  assert.equal(claimsHomeRole(playerManifest), false);
  assert.equal(claimsHomeRole(webManifest), false);
});

test("the shell declares the web app and TV presentation assets", () => {
  const manifest = read("src/main/AndroidManifest.xml");
  const activity = read("src/main/java/com/movieroom/shell/ShellActivity.java");

  assert.match(manifest, /<queries>[\s\S]*<package\s+android:name="com\.movieroom\.web"\s*\/>[\s\S]*<\/queries>/);
  assert.match(manifest, /android:banner="@drawable\/taylormade_movies_cover"/);
  assert.match(manifest, /android:icon="@mipmap\/ic_launcher"/);
  assert.match(activity, /com\.movieroom\.web/);
  assert.match(activity, /com\.movieroom\.web\.MainActivity/);
  assert.doesNotMatch(activity, /com\.movieroom\.firetv/);
});

test("Movie Room shell is a separate HOME/LEANBACK Android package", () => {
  const manifest = read("src/main/AndroidManifest.xml");
  const build = read("build.gradle");
  assert.match(manifest, /package="com\.movieroom\.shell"/);
  assert.match(manifest, /android\.intent\.category\.HOME/);
  assert.match(manifest, /android\.intent\.category\.LEANBACK_LAUNCHER/);
  assert.match(build, /applicationId\s+"com\.movieroom\.shell"/);
});

test("Movie Room shell renders a native home screen with profiles and controls", () => {
  const activity = read("src/main/java/com/movieroom/shell/ShellActivity.java");
  assert.match(activity, /LinearLayout/);
  assert.match(activity, /Movie Room OS/);
  assert.match(activity, /Home/);
  assert.match(activity, /Mom/);
  assert.match(activity, /Morganne/);
  assert.match(activity, /Kids/);
  assert.match(activity, /setContentView\(root\)/);
  assert.match(activity, /openMovieRoomApp/);
  assert.match(activity, /Settings/);
  assert.match(activity, /ACTION_SETTINGS/);
  assert.match(activity, /ACTION_WIFI_SETTINGS/);
  assert.match(activity, /ACTION_BLUETOOTH_SETTINGS/);
  assert.match(activity, /ACTION_DISPLAY_SETTINGS/);
  assert.doesNotMatch(activity, /WebView/);
  assert.doesNotMatch(activity, /ACTION_VIEW|MOVIE_ROOM_BASE_URL/);
  assert.doesNotMatch(activity, /ONEDRIVE|JELLYFIN_API_KEY|VERCEL_|MOVIE_ROOM_PASSWORD/i);
});

test("Movie Room shell explains the active network and exposes Wi-Fi and mobile settings", () => {
  const activity = read("src/main/java/com/movieroom/shell/ShellActivity.java");

  assert.match(activity, /ConnectivityManager/);
  assert.match(activity, /NetworkCapabilities/);
  assert.match(activity, /TRANSPORT_WIFI/);
  assert.match(activity, /TRANSPORT_CELLULAR/);
  assert.match(activity, /ACTION_WIFI_SETTINGS/);
  assert.match(activity, /ACTION_WIRELESS_SETTINGS/);
  assert.match(activity, /Current connection/);
  assert.match(activity, /Mobile data/);
});

test("Movie Room shell provides an explicit Fire TV focus path across library shelves", () => {
  const activity = read("src/main/java/com/movieroom/shell/ShellActivity.java");

  assert.match(activity, /setNextFocusLeftId/);
  assert.match(activity, /setNextFocusRightId/);
  assert.match(activity, /setNextFocusUpId/);
  assert.match(activity, /setNextFocusDownId/);
  assert.match(activity, /KEYCODE_BACK/);
  assert.match(activity, /KEYCODE_MENU/);
  assert.match(activity, /KEYCODE_MEDIA_PLAY_PAUSE/);
  assert.match(activity, /dispatchKeyEvent/);
  assert.match(activity, /moveShellFocus/);
  assert.match(activity, /KEYCODE_DPAD_UP/);
  assert.match(activity, /KEYCODE_DPAD_LEFT/);
  assert.match(activity, /KEYCODE_DPAD_CENTER/);
  assert.match(activity, /KEYCODE_DPAD_RIGHT/);
  assert.match(activity, /KEYCODE_DPAD_DOWN/);
  assert.match(activity, /performClick/);
  assert.match(activity, /requestFocus/);
  assert.match(activity, /ImageView/);
  assert.match(activity, /taylormade_movies_cover/);
  assert.match(activity, /showSettingsScreen/);
  assert.match(activity, /Developer options/);
  assert.match(activity, /Open Fire OS settings/);
  assert.match(activity, /showProfilesScreen/);
  assert.match(activity, /showGenresScreen/);
  assert.match(activity, /GENRES/);
  assert.match(activity, /Comedy/);
  assert.match(activity, /Soap/);
});

test("the published OS launcher artifact matches the shell version", () => {
  const build = read("build.gradle");
  const update = JSON.parse(readPublic("apk/os-update.json"));
  assert.match(build, /versionCode\s+4/);
  assert.match(build, /versionName\s+"0\.3\.1"/);
  assert.equal(update.packageName, "com.movieroom.shell");
  assert.equal(update.versionCode, 4);
  assert.equal(update.versionName, "0.3.1");
  assert.match(update.downloadUrl, /MovieRoom-OS-v0\.3\.1\.apk$/);
  assert.equal(fs.existsSync(path.join(root, "public", "downloads", "MovieRoom-OS-v0.3.1.apk")), true);
});
