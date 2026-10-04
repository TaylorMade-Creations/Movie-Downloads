const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { test } = require("node:test");

const root = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

async function loadControl() {
  const modulePath = path.join(root, "movie-workflow-blueprint", "control.mjs");
  return import(`${pathToFileURL(modulePath).href}?t=${Date.now()}`);
}

test("master manifest describes the renamed source of truth and all client modules", async () => {
  const control = await loadControl();
  const manifestText = read("movie-workflow-blueprint/manifest.json");
  const manifest = JSON.parse(manifestText);

  assert.equal(manifest.version, 2);
  assert.equal(manifest.sourceOfTruth.repository, "https://github.com/taylormade02471/Movie-Room-Master");
  assert.equal(manifest.sourceOfTruth.branch, "main");
  assert.equal(control.productionUrl, "https://movie-downloads-six.vercel.app");
  assert.equal(control.libraryConfigPath, "config/library.local.json");
  assert.doesNotMatch(manifestText, /C:\\Users\\/);
  assert.doesNotMatch(manifestText, /(ONEDRIVE_REFRESH_TOKEN|JELLYFIN_API_KEY|RUNWAYML_API_SECRET|SESSION_SECRET|MOVIE_ROOM_PASSWORD)/);

  const apps = Object.fromEntries(control.applications.map((app) => [app.id, app]));
  assert.equal(apps.web.packageName, "pwa");
  assert.equal(apps.android.packageName, "com.movieroom.web");
  assert.equal(apps.firetv.packageName, "com.movieroom.firetv");
  assert.equal(apps.shell.packageName, "com.movieroom.shell");
  assert.equal(apps.aospPrototype.releaseEligible, false);

  assert.deepEqual(control.artifactManifests.map((item) => item.path).sort(), [
    "public/apk/firetv-update.json",
    "public/apk/os-update.json",
    "public/apk/update.json"
  ]);
  assert.ok(control.buildCommands.androidDebug.includes(":movieroom-web:assembleDebug"));
  assert.ok(control.buildCommands.fireTvDebug.includes(":firetv:assembleDebug"));
  assert.ok(control.buildCommands.shellDebug.includes(":movieroom-shell:assembleDebug"));
  assert.equal(manifest.animationBuckets.storage, "object-storage");
  assert.equal(manifest.animationBuckets.metadata, "sql-catalog");
});

test("validateManifest rejects missing modules and production origin drift", async () => {
  const { manifest, validateManifest } = await loadControl();
  assert.doesNotThrow(() => validateManifest(manifest));

  const missingShell = structuredClone(manifest);
  missingShell.applications = missingShell.applications.filter((app) => app.id !== "shell");
  assert.throws(() => validateManifest(missingShell), /Missing required application: shell/);

  const wrongOrigin = structuredClone(manifest);
  wrongOrigin.deployment.productionUrl = "https://example.invalid";
  assert.throws(() => validateManifest(wrongOrigin), /Production URL must remain/);
});

test("repository metadata, workspace, and docs point at Movie Room Master", () => {
  const pkg = JSON.parse(read("package.json"));
  const settings = read("settings.gradle");
  const readme = read("README.md");
  const workspace = JSON.parse(read("Movie-Room-Master.code-workspace"));

  assert.equal(pkg.name, "movie-room-master");
  assert.equal(pkg.repository.url, "https://github.com/taylormade02471/Movie-Room-Master.git");
  assert.match(settings, /rootProject\.name = "MovieRoomMaster"/);
  assert.match(readme, /Movie Room Master/);
  assert.match(readme, /GitHub stores source control, not the movie library/);
  assert.ok(workspace.folders.some((folder) => folder.path === "."));
  assert.ok(workspace.folders.some((folder) => folder.path === "movie-workflow-blueprint"));
});
