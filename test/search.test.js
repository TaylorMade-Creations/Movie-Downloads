const assert = require("node:assert/strict");
const test = require("node:test");

const { browseGenreOptions, searchMovies } = require("../public/app.js");

const movies = [
  { id: "bomb", title: "Bomb Girls Facing the Enemy", folder: "Movies/Bomb Girls", genres: ["Drama"], size: 10 },
  { id: "paddington", title: "Paddington in Peru", folder: "Movies/Paddington", genres: ["Family", "Comedy"], size: 10 },
  { id: "sample", title: "Paddington sample", folder: "Movies/Paddington/Sample", size: 10 },
];

test("search browse matches title, folder, and metadata genre while excluding samples", () => {
  assert.deepEqual(searchMovies(movies, { term: "bomb" }).map((movie) => movie.id), ["bomb"]);
  assert.deepEqual(searchMovies(movies, { term: "comedy" }).map((movie) => movie.id), ["paddington"]);
  assert.deepEqual(searchMovies(movies, { genre: "family" }).map((movie) => movie.id), ["paddington"]);
  assert.deepEqual(searchMovies(movies, { genre: "all" }).map((movie) => movie.id), ["bomb", "paddington"]);
});

test("browse genre options include audience groups and discovered genres with counts", () => {
  assert.deepEqual(
    browseGenreOptions(movies).filter((option) => ["all", "family", "drama", "comedy"].includes(option.id)),
    [
      { id: "all", label: "All Movies", count: 2 },
      { id: "family", label: "Family", count: 1 },
      { id: "drama", label: "Drama", count: 1 },
      { id: "comedy", label: "Comedy", count: 1 },
    ],
  );
});
