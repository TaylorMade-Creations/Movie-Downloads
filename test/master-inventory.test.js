const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

async function loadInventoryModule() {
  return import("../scripts/master/create-preservation-inventory.mjs");
}

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "movie-room-inventory-"));
}

function writeFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value);
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function snapshotTree(root) {
  const result = new Map();
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const absolute = path.join(dir, entry.name);
      const relative = path.relative(root, absolute).replace(/\\/g, "/");
      if (entry.isDirectory()) {
        walk(absolute);
        continue;
      }
      result.set(relative, sha256(fs.readFileSync(absolute)));
    }
  }
  walk(root);
  return result;
}

test("repository inventory hashes safe files, excludes secrets, and does not mutate inputs", async () => {
  const { collectRepositoryInventory, writeInventory } = await loadInventoryModule();
  const repoRoot = makeTempDir();
  const outputRoot = makeTempDir();
  const secretValue = "sk-proj-test-secret-that-must-not-appear";
  writeFile(path.join(repoRoot, "src", "app.js"), "console.log('movie room');\n");
  writeFile(path.join(repoRoot, ".env.local"), `RUNWAYML_API_SECRET=${secretValue}\n`);
  writeFile(path.join(repoRoot, "notes.txt"), `never print ${secretValue}\n`);
  const before = snapshotTree(repoRoot);

  const report = await collectRepositoryInventory({ repoRoot });
  const outputPath = path.join(outputRoot, "inventory.json");
  await writeInventory({ outputPath, inventory: report });
  const after = snapshotTree(repoRoot);

  assert.deepEqual([...after.entries()].sort(), [...before.entries()].sort());
  assert.ok(report.files.some((file) => file.relativePath === "src/app.js" && file.sha256 === sha256("console.log('movie room');\n")));
  assert.ok(report.excluded.some((file) => file.relativePath === ".env.local"));
  assert.ok(report.excluded.some((file) => file.relativePath === "notes.txt" && file.reason === "redacted-secret-pattern"));
  assert.doesNotMatch(JSON.stringify(report), new RegExp(secretValue));
  assert.equal(JSON.parse(fs.readFileSync(outputPath, "utf8")).files.length, report.files.length);
});

test("library inventory records metadata without file hashes or media contents", async () => {
  const { collectLibraryMetadata } = await loadInventoryModule();
  const libraryRoot = makeTempDir();
  const mediaBytes = "movie-bytes-that-should-not-be-read-or-reported";
  writeFile(path.join(libraryRoot, "Series", "Episode 1.mkv"), mediaBytes);
  const before = snapshotTree(libraryRoot);

  const report = await collectLibraryMetadata({ libraryRoot });
  const after = snapshotTree(libraryRoot);

  assert.deepEqual([...after.entries()].sort(), [...before.entries()].sort());
  assert.equal(report.root, libraryRoot);
  assert.equal(report.files.length, 1);
  assert.equal(report.files[0].relativePath, "Series/Episode 1.mkv");
  assert.equal(report.files[0].byteSize, Buffer.byteLength(mediaBytes));
  assert.equal(typeof report.files[0].mtimeMs, "number");
  assert.equal(report.files[0].sha256, undefined);
  assert.doesNotMatch(JSON.stringify(report), /movie-bytes-that-should-not-be-read-or-reported/);
});

test("classifyPath keeps generated outputs and local reports out of Git inventory", async () => {
  const { classifyPath } = await loadInventoryModule();

  assert.equal(classifyPath(".env").include, false);
  assert.equal(classifyPath("config/library.local.json").include, false);
  assert.equal(classifyPath("inventories/local/pre-conversion.json").include, false);
  assert.equal(classifyPath("test-results/firestick.png").include, false);
  assert.equal(classifyPath("tmp-runtime/server.log").include, false);
  assert.equal(classifyPath("public/downloads/TaylorMade-Movies-Android-v1.0.16.apk").include, true);
  assert.equal(classifyPath("public/index.html").include, true);
});
