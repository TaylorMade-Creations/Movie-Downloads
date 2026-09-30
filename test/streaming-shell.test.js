const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");

test("Movie Room keeps a familiar streaming-home layout with original branding", () => {
  assert.match(html, /id="hero-movie"/);
  assert.match(html, /class="discovery-shelves"/);
  assert.match(html, /id="continue-watching-shelf"/);
  assert.match(html, /id="recently-added-shelf"/);
  assert.match(html, /id="picks-shelf"/);
  assert.match(html, /#40d8c0/);
  assert.match(html, /TaylorMade Movies/);
  assert.doesNotMatch(html, /Amazon Prime|Fire OS|com\.amazon/i);
});
