const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const shellRoot = path.join(root, "movieroom-shell");
const playerRoot = path.join(root, "firetv");

function read(relativePath) {
  return fs.readFileSync(path.join(shellRoot, relativePath), "utf8");
}

function readPlayer(relativePath) {
  return fs.readFileSync(path.join(playerRoot, relativePath), "utf8");
}

function claimsHomeRole(manifest) {
  return /<category\s+android:name="android\.intent\.category\.HOME"\s*\/>/.test(manifest);
}

test("only the Movie Room shell owns the Android HOME role", () => {
  const shellManifest = read("src/main/AndroidManifest.xml");
  const playerManifest = readPlayer("src/main/AndroidManifest.xml");

  assert.equal(claimsHomeRole(shellManifest), true);
  assert.equal(claimsHomeRole(playerManifest), false);
});

test("the shell declares the player package and TV presentation assets", () => {
  const manifest = read("src/main/AndroidManifest.xml");

  assert.match(manifest, /<queries>[\s\S]*<package\s+android:name="com\.movieroom\.firetv"\s*\/>[\s\S]*<\/queries>/);
  assert.match(manifest, /android:banner="@drawable\/banner"/);
  assert.match(manifest, /android:icon="@mipmap\/ic_launcher"/);
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
  assert.match(activity, /openNativePlayer/);
  assert.match(activity, /Settings/);
  assert.match(activity, /ACTION_SETTINGS/);
  assert.match(activity, /ACTION_WIFI_SETTINGS/);
  assert.match(activity, /ACTION_BLUETOOTH_SETTINGS/);
  assert.match(activity, /ACTION_DISPLAY_SETTINGS/);
  assert.doesNotMatch(activity, /WebView/);
  assert.doesNotMatch(activity, /ACTION_VIEW|MOVIE_ROOM_BASE_URL/);
  assert.doesNotMatch(activity, /ONEDRIVE|JELLYFIN_API_KEY|VERCEL_|MOVIE_ROOM_PASSWORD/i);
});
