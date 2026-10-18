const assert = require("node:assert/strict");
const test = require("node:test");

const { browseGenreOptions, resetPageScroll, searchMovies } = require("../public/app.js");

const movies = [
  { id: "bomb", title: "Bomb Girls Facing the Enemy", folder: "Movies/Bomb Girls", genres: ["Drama"], year: 2014, dateAdded: "2025-04-01T00:00:00Z", size: 10 },
  { id: "paddington", title: "Paddington in Peru", folder: "Movies/Paddington", genres: ["Family", "Comedy"], year: 2024, dateAdded: "2025-02-01T00:00:00Z", size: 10 },
  { id: "northern", title: "Northern Exposure Pilot", folder: "TV Shows/Northern Exposure/Season 1", genres: ["Drama"], year: 1990, dateAdded: "2025-05-01T00:00:00Z", contentType: "episode", seriesName: "Northern Exposure", size: 10 },
  { id: "holiday", title: "A Christmas Story", folder: "Movies/Holiday Collection", genres: ["Family"], year: 1983, dateAdded: "2025-06-01T00:00:00Z", size: 10 },
  { id: "sample", title: "Paddington sample", folder: "Movies/Paddington/Sample", size: 10 },
];

test("search browse matches title, folder, and metadata genre while excluding samples", () => {
  assert.deepEqual(searchMovies(movies, { term: "bomb" }).map((movie) => movie.id), ["bomb"]);
  assert.deepEqual(searchMovies(movies, { term: "comedy" }).map((movie) => movie.id), ["paddington"]);
  assert.deepEqual(searchMovies(movies, { genre: "family" }).map((movie) => movie.id), ["holiday", "paddington"]);
  assert.deepEqual(searchMovies(movies, { genre: "all" }).map((movie) => movie.id), ["holiday", "bomb", "northern", "paddington"]);
});

test("browse genre options include audience groups and discovered genres with counts", () => {
  assert.deepEqual(
    browseGenreOptions(movies).filter((option) => ["all", "family", "drama", "comedy"].includes(option.id)),
    [
      { id: "all", label: "All Movies", count: 4 },
      { id: "family", label: "Family", count: 2 },
      { id: "drama", label: "Drama", count: 2 },
      { id: "comedy", label: "Comedy", count: 1 },
    ],
  );
});

test("search browse filters movies, series, collections, and decades before applying the selected sort", () => {
  assert.deepEqual(
    searchMovies(movies, { scope: "series" }).map((movie) => movie.id),
    ["northern"],
  );
  assert.deepEqual(
    searchMovies(movies, { scope: "collections" }).map((movie) => movie.id),
    ["holiday"],
  );
  assert.deepEqual(
    searchMovies(movies, { year: "2020s" }).map((movie) => movie.id),
    ["paddington"],
  );
  assert.deepEqual(
    searchMovies(movies, { sort: "year-desc" }).map((movie) => movie.id),
    ["paddington", "bomb", "northern", "holiday"],
  );
  assert.deepEqual(
    searchMovies(movies, { sort: "recent" }).map((movie) => movie.id),
    ["holiday", "northern", "bomb", "paddington"],
  );
});

test("full page destinations reset to the page title without moving for the profile menu", () => {
  const calls = [];
  const windowRef = {
    scrollTo(options) {
      calls.push(options);
    },
  };

  assert.equal(resetPageScroll(windowRef, "search"), true);
  assert.deepEqual(calls, [{ top: 0, left: 0, behavior: "auto" }]);
  assert.equal(resetPageScroll(windowRef, "user"), false);
  assert.equal(calls.length, 1);
});
