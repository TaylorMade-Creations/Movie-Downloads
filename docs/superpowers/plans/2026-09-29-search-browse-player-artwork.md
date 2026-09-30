# Movie Room Search, Browse, Player, and Artwork Implementation Plan

**Spec:** `docs/superpowers/specs/2026-09-29-search-browse-player-artwork-design.md`

## Task 1: Establish testable client boundaries

Inspect the existing `createApp` wiring and extract only the pure search/browse transformations needed for tests: normalized search text, genre/category options, filtered results, and selected-result handoff. Preserve the existing vanilla HTML/JavaScript architecture and public API behavior.

Tests:

- Search matches title, filename, folder, metadata genres, and tags.
- Genre filters combine with search text.
- Empty results and selected movie IDs are deterministic.

## Task 2: Repair remaining missing artwork safely

Run a dry audit over the configured OneDrive Movie downloads root, identify supported video folders without poster/folder artwork, and use the existing artwork sync path. Add a small focused helper only if the current sync cannot report missing-artwork outcomes. Preserve all existing files and do not add movie media to Git.

Tests/checks:

- Bomb Girls remains in its own folder with its existing bundled poster.
- Each repaired title has a valid image or an explicit fallback outcome.
- No existing artwork is overwritten.

## Task 3: Build the search browse overlay

Modify `public/index.html` to add an accessible dialog/drawer with a close button, search summary, genre/category chips, scrollable movie results, and empty/loading states. Add focused styling for desktop, mobile, keyboard focus, and reduced-width layouts.

Modify `public/app.js` to open the overlay on search focus/text, render filtered results, switch genre filters, close on Escape/close action, support keyboard selection, and route the selected movie into the existing details/player path.

Tests/checks:

- Search focus opens the overlay.
- Results scroll independently of the page.
- Genre chips change results and preserve search text.
- Escape and close restore the prior page focus/state.

## Task 4: Connect selection to the existing player

Use the existing authenticated selection and playback-link functions. Ensure overlay selection opens the movie details/player view without creating a second playback implementation. Verify resume, play/pause, seeking, skip controls, fullscreen, theater/miniplayer, native controls, playback errors, and Up Next remain connected.

Tests/checks:

- Bomb Girls can be selected from search and reaches the player.
- Player errors remain actionable and do not expose raw secrets or URLs.
- Browser-native media state updates the visible timeline and labels.

## Task 4a: Preserve audio for newly uploaded MKV/AVI media

Add a Jellyfin library-refresh hook to the hybrid provider. When the local library contains a browser-hostile new file and Jellyfin has not indexed it yet, refresh and poll the Jellyfin catalog within a bounded window before building the visible catalog. Only mark a title for Jellyfin compatibility playback when a real Jellyfin metadata item exists; then use the existing H.264/AAC transcoded stream.

Tests:

- A stale Jellyfin index with a new Bomb Girls MKV refreshes and returns a Jellyfin transcode URL.
- The returned compatibility response is `video/mp4` and the stream endpoint responds successfully.
- Existing OneDrive playback and offline-Jellyfin fallbacks remain unchanged.

## Task 5: Run automated and rendered verification

Run `npm test`, then start the app through the repository script with both a local test environment and the real local hybrid/Jellyfin configuration. Since no Browser plugin is available in the current tool list, use the repository's Playwright/runtime fallback and record that limitation. Exercise desktop and mobile-sized flows: app load, search overlay, scrolling, genre filtering, profile switching, movie selection, Bomb Girls playback controls, and console health.

Fix any regressions found by the rendered checks, then rerun the same checks and the full Node suite.

## Task 6: Review and hand off

Inspect `git diff --check`, confirm generated APKs/test reports/runtime logs remain untracked, stage only source/spec/plan and intended web artwork, commit the implementation, and push `main`. Report the repaired artwork outcomes, automated test result, rendered verification method, and any remaining platform limitations.
