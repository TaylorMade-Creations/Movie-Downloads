# Movie Room Search, Browse, Playback, and Artwork Completion

**Date:** 2026-09-29  
**Status:** Approved in chat; written-spec review pending  
**Scope:** Web Movie Room experience and the configured OneDrive movie library

## Goal

Make Movie Room behave like a personal Netflix/Amazon-style library: typing in search opens a dedicated browse surface containing all matching movies and genres; choosing a title opens the existing secure player with familiar controls; and movies without artwork receive safe, non-destructive artwork or a clear fallback.

## Product understanding

The user wants:

- Bomb Girls and the rest of the library to be playable through the existing Movie Room flow.
- Remaining movies without pictures handled without destroying existing artwork or media.
- Search to open a separate scrollable menu rather than only filtering the current page.
- Browsing by all movies and genres from that menu.
- Selecting a movie to open a player with website and browser media controls.
- A polished private streaming experience modeled on familiar commercial streaming services, within normal browser and device media limitations.

## In scope

### Artwork and catalog readiness

- Audit `C:\Users\kylet\OneDrive\Desktop\Movie downloads\Movies` and configured TV folders for supported video files with missing artwork.
- Preserve existing `poster.jpg`, `folder.jpg`, `backdrop.jpg`, NFO, Jellyfin sidecars, and media files.
- Prefer existing Jellyfin/provider artwork, then approved remote artwork lookup, then a representative video frame only when no valid artwork exists.
- Add or retain bundled web posters needed for catalog display.
- Verify Bomb Girls is discoverable, has a usable poster, and can produce a playback URL.

### Search and browse surface

- Add a modal/drawer overlay opened by search input focus or non-empty search text.
- Render matching movie cards in a vertically scrollable result region.
- Render genre/category chips for All Movies, audience categories, inferred genres, and alphabetical groups.
- Keep search and genre filters combinable.
- Support Escape/close, keyboard focus, Enter-to-open, visible result counts, and an empty state.
- Selecting a result closes the overlay and opens the existing title/player flow.

### Playback experience

- Reuse the existing authenticated playback route, ticket/link refresh, stall recovery, and Cast/AirPlay integration.
- Show title details before or alongside playback when metadata is available.
- Preserve play/pause, seek timeline, skip backward/forward, volume/mute, fullscreen, theater mode, miniplayer, native browser controls, resume position, and Up Next behavior.
- Keep unsupported formats and unavailable cloud files as explicit, actionable states.
- Keep the experience responsive for desktop, phone-sized, and TV-sized browser layouts.

## Explicit limits

The app will provide a private streaming experience using browser media APIs. It cannot guarantee commercial DRM, identical controls across every browser, or every casting protocol. It will not add credential capture, DRM bypassing, public catalog exposure, or unsafe direct media URLs.

## Design and data flow

1. The existing `/api/library` response remains the catalog source.
2. Client-side indexing derives searchable text and normalized genre/category labels from title, filename, folder, metadata genres, and existing inference rules.
3. Search state controls the overlay only; the underlying home/library page remains intact.
4. A selected movie calls the existing playback-selection function, so authentication, secure playback tickets, OneDrive redirects, Jellyfin compatibility playback, and range requests remain centralized.
5. Artwork repair operates on the configured OneDrive library and deployable `public/posters`/`public/backdrops` assets without copying movie media into Git.

## Files and boundaries

- `public/index.html`: overlay, browse controls, result viewport, and responsive styling.
- `public/app.js`: search-overlay state, genre filtering, result selection, player handoff, and keyboard behavior.
- `lib/providers/local.js`, `lib/providers/onedrive.js`, or shared library helpers only if catalog fields needed by the UI are missing.
- `scripts/sync-jellyfin-artwork.mjs` and/or a focused artwork helper for safe missing-artwork completion.
- `test/library.test.js`, `test/server.test.js`, and a focused client test/helper path for search, genre selection, and playback handoff.
- No React migration or new bundler; preserve the existing vanilla HTML/CSS/JavaScript deployment model.

## Error and accessibility behavior

- Overlay has an accessible dialog label, focus target, close button, and Escape handling.
- Cards have clear accessible names and one primary activation path.
- Search loading, no results, missing artwork, unavailable playback, and expired session states are visible in plain language.
- Existing poster fallback remains an image, never a video frame unless explicitly generated as safe artwork.
- Focus rings remain visible and controls retain touch-sized targets.

## Verification gates

- Artwork audit reports every remaining missing-picture title and whether it was repaired, intentionally left as fallback, or blocked by unavailable source media.
- Local catalog includes Bomb Girls and the repaired titles.
- Node tests pass with only the documented Windows permission skip.
- Rendered browser verification covers app load, search overlay open, scrolling results, genre selection, movie selection, Bomb Girls playback start/pause, seek/control state, and an appropriate mobile viewport.
- No console errors or framework error overlays appear in the tested flow.
- Git diff excludes generated debug APKs, test reports, runtime logs, and movie media.
