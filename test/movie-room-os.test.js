const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const osRoot = path.join(root, "movie-room-os");

function read(relativePath) {
  return fs.readFileSync(path.join(osRoot, relativePath), "utf8");
}

test("Movie Room OS declares a reproducible x86_64 emulator product", () => {
  const product = read("device/movieroom/emulator/movieroom_x86_64.mk");
  const products = read("device/movieroom/emulator/AndroidProducts.mk");
  assert.match(products, /movieroom_x86_64-userdebug/);
  assert.match(product, /PRODUCT_NAME := movieroom_x86_64/);
  assert.match(product, /PRODUCT_MODEL := Movie Room OS Emulator/);
  assert.doesNotMatch(product, /MovieRoomShell/);
  assert.doesNotMatch(product, /PRODUCT_PACKAGE_OVERLAYS/);
  assert.equal(fs.existsSync(path.join(root, "movieroom-shell", "Android.bp")), true);
});

test("Movie Room OS leaves the standard Android launcher in control", () => {
  const product = read("device/movieroom/emulator/movieroom_x86_64.mk");
  const configPath = path.join(osRoot, "device/movieroom/emulator/overlay/frameworks/base/core/res/res/values/config.xml");
  assert.doesNotMatch(product, /config_defaultHomeComponent/);
  assert.equal(fs.existsSync(configPath), false);
});

test("Movie Room OS source scaffold contains no credentials or proprietary package references", () => {
  const files = [];
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else files.push(absolute);
    }
  }
  walk(osRoot);
  const contents = files.map((file) => fs.readFileSync(file, "utf8")).join("\n");
  assert.doesNotMatch(contents, /ONEDRIVE_API|JELLYFIN_API_KEY|VERCEL_|MOVIE_ROOM_PASSWORD|amazon\.com|com\.amazon/i);
});
