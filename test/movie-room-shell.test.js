const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const shellRoot = path.join(root, "movieroom-shell");

function read(relativePath) {
  return fs.readFileSync(path.join(shellRoot, relativePath), "utf8");
}

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
  assert.doesNotMatch(activity, /WebView/);
  assert.doesNotMatch(activity, /ACTION_VIEW|MOVIE_ROOM_BASE_URL/);
  assert.doesNotMatch(activity, /ONEDRIVE|JELLYFIN_API_KEY|VERCEL_|MOVIE_ROOM_PASSWORD/i);
});
