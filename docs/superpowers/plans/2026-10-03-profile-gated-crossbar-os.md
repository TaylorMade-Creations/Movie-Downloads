# Profile-Gated Crossbar Movie Room OS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement and verify a profile-gated Movie Room experience across the web app, Android wrapper, Fire TV client, and optional native Fire OS shell, with a polished Crossbar home screen, scoped libraries, profile artwork/settings, reliable remote navigation, and a staged APK sideload for the school experiment.

**Architecture:** Keep the existing web catalog/media pipeline, but add one shared access/profile contract. The server owns account/session/profile authorization and library scope; the web app, Android wrapper, Fire TV client, and native shell consume that contract. The shell owns first-run device bootstrap, the profile chooser, OS-level settings, and the normalized remote-action layer. The shell is an optional `HOME` candidate with Amazon’s launcher left intact as fallback; no firmware flashing, package removal, or forced launcher replacement is in scope.

**Tech Stack:** Vanilla Node HTTP server, browser JavaScript/CSS, existing PWA/service worker, Android Java/Gradle modules (`movieroom-shell`, `movieroom-web`, `firetv`), local JSON/session persistence already used by the repository, Node test suite, Gradle tests, ADB, `aapt`/APK inspection, and the connected Fire Stick at `192.168.1.114:5555`.

**Spec:** `docs/superpowers/specs/2026-10-03-profile-gated-crossbar-os-design.md`

## Global Constraints

- Preserve unrelated pre-existing working-tree changes. Stage only files belonging to the current task.
- Do not store plaintext profile PINs. Store a salted derived value and compare with a constant-time check.
- Before setup, the web app and Android/Fire TV APKs show a setup/login gate rather than preview tiles. The shell may show only the small, curated preview catalog plus setup controls.
- After online setup, the Home profile is unlocked without a PIN. Additional profiles may use optional PINs and receive independent settings, app visibility, shelf order, avatar, color, and watch state.
- Keep a future entitlement field (`free`, `paid`, `profile_only`, `unavailable`) in the access/catalog contract, but do not implement payments in this experiment.
- Reset must clear local bootstrap/remembered-profile/session/layout state and return to first-run setup without deleting server media or the online account.
- Home, profile chooser, shell settings, app lists, genre/library pages, movie detail pages, and playback overlays must be keyboard/D-pad reachable with visible focus.
- Use the shared logical remote actions `UP`, `DOWN`, `LEFT`, `RIGHT`, `SELECT`, `BACK`, `MENU`, `PLAY_PAUSE`, `REWIND`, `FAST_FORWARD`, `PAGE_UP`, `PAGE_DOWN`, `INFO`, and `RESET`; preserve system-owned Home/Alexa behavior.
- Validate actual Fire Stick behavior over ADB and UI dumps, not only source or unit tests. “Flash” means `adb install -r -d`/sideloading the APK, never firmware flashing.

## Review Focus

- Access cannot be bypassed by adding a client-side `scope=full` parameter.
- Profile changes are scoped to the selected profile and survive reload/restart.
- Home’s hero/rails remain readable at 1080p and responsive on phone/desktop; focused movie tiles can preview without stealing focus.
- Back from search, detail, player, and settings returns within the app before allowing the system/launcher to close it.
- The Fire Stick does not bounce focus from a movie rail back to the header when moving left/right.
- The shell remains selectable as an optional Home candidate while Amazon’s launcher remains available.

---

## Task 1: Establish the shared access, profile, and catalog contract

**Files:**
- Create `lib/profile-access.js`.
- Create `test/profile-access.test.js`.
- Update the nearest existing catalog/profile test fixtures only where the new contract requires it.

**Interfaces:**
- `normalizeAccessState(raw)` returns one of `needs_setup`, `logged_out`, `home_unlocked`, `profile_locked`, or `profile_unlocked`.
- `normalizeProfile(raw)` returns a profile with stable `id`, `displayName`, `avatarId`, `accentColor`, `pinRequired`, and per-profile settings/watch state.
- `createDefaultProfiles()` returns the Home/Mom/Morganne/Kids seed definitions without exposing secrets.
- `hashPin(pin, salt)` and `verifyPin(pin, salt, digest)` use a salted derived value and constant-time comparison.
- `scopeCatalog(items, accessState)` exposes only the curated preview scope before setup and the selected profile’s permitted full scope after unlock; every item carries an entitlement value for future free/paid separation.

**Steps:**

- [ ] Write failing tests for every access state, profile normalization, seeded profiles, malformed PINs, wrong PINs, and catalog scope boundaries.
- [ ] Write the pure contract implementation with deterministic normalization and no browser/server side effects.
- [ ] Add tests proving a client-provided full-library flag cannot expand a preview scope.
- [ ] Run `node --test test/profile-access.test.js` and the relevant existing profile/catalog tests.
- [ ] Commit only the contract and its tests: `feat: add profile access contract`.

## Task 2: Add server-owned setup, profile sessions, and scoped catalog APIs

**Files:**
- Modify `server.js` around the existing session/login, library, and viewer-state routes.
- Add focused server tests under `test/` (use the repository’s existing server-test pattern).
- Update existing tests whose old public-full-library assumptions are intentionally replaced.

**Interfaces:**
- `GET /api/access-state` returns the current setup/session/profile state and capability flags.
- `POST /api/account/setup` accepts a display name plus optional avatar/color/PIN and creates the first Home profile/session without requiring an email or username.
- `GET /api/profiles` returns only profiles visible to the current device/account session.
- `POST /api/profiles` creates an additional profile with optional PIN and profile preferences.
- `PATCH /api/profiles/:id` updates only that profile’s display name, avatar, color, app visibility/order, and shelf settings.
- `POST /api/profiles/:id/unlock` verifies the optional PIN and switches the session to that profile.
- `POST /api/account/reset` clears the server session for the current device/account handoff; it does not delete media or the account.
- `GET /api/preview` is the intentionally limited pre-setup catalog endpoint.
- `GET /api/library` derives its scope from the authenticated/unlocked session rather than trusting a query parameter.

**Steps:**

- [ ] Add failing route tests for first-run setup, Home auto-unlock, optional profile PIN lock/unlock, profile isolation, reset, preview scope, and full-library authorization.
- [ ] Implement the account/profile session records using the existing server persistence conventions and secure cookie/session behavior.
- [ ] Keep legacy route behavior only where it does not expose the full catalog or bypass the new state machine; explicitly document any compatibility response.
- [ ] Ensure catalog responses carry the entitlement field and profile-scoped watch state.
- [ ] Run all focused server tests plus the existing API/auth/library tests.
- [ ] Commit: `feat: enforce profile-gated catalog sessions`.

## Task 3: Build the responsive web setup gate, profile carousel, and profile home

**Files:**
- Modify `public/index.html`.
- Modify `public/app.js` and the existing viewer/profile state helpers.
- Modify `public/sw.js` only if cache invalidation is needed for the new access contract.
- Add/update browser-facing tests in `test/profile-pages.test.js`, `test/pwa.test.js`, and focused UI tests.

**Steps:**

- [ ] Add failing UI assertions for the pre-setup gate, Home unlocked state, profile chooser, optional PIN screen, reset action, and mobile/TV responsive landmarks.
- [ ] Implement first-run setup without a password prompt for Home; show Mom/Morganne/Kids and add-profile controls with the supplied profile artwork when available.
- [ ] Implement the Xbox-style circular profile chooser: adjacent avatars, selected avatar growth, clear focus ring, D-pad/keyboard operation, and Enter/Select activation.
- [ ] Implement the profile home after selection: small left navigation, Continue/Recently Watched, Newly Added, Trending, and category rails with compact movie cards and auto-preview on focused titles.
- [ ] Keep the Home profile full-library behavior after setup while additional profile pages remain locked until their optional PIN is verified.
- [ ] Add profile settings for avatar, display name, accent color, app visibility/order, shelf preferences, and reset; keep account/device settings separate from profile settings.
- [ ] Make Back unwind player → detail → library/search → profile home → profile chooser before browser/app exit.
- [ ] Run focused browser tests and a real local render check at phone and 1080p viewport sizes.
- [ ] Commit: `feat: add responsive profile-gated movie home`.

## Task 4: Add the native Crossbar shell and profile artwork

**Files:**
- Refactor `movieroom-shell/src/main/java/com/movieroom/shell/ShellActivity.java` into focused components as needed.
- Add `BootstrapStore`, `ProfileStore`, `RemoteMap`, and `FocusGrid` under `movieroom-shell/src/main/java/com/movieroom/shell/`.
- Add Android resources/drawables for Home, Mom, Morganne, and Kids profile art; use the user-provided images only after checking their dimensions/crop and keeping them local to the APK.
- Modify `movieroom-shell/src/main/AndroidManifest.xml` to add `HOME`/`DEFAULT` as an optional candidate while retaining `LEANBACK_LAUNCHER` and Amazon fallback behavior.
- Update/add shell tests, including `test/movie-room-shell.test.js` and any Gradle unit tests supported by the module.

**Steps:**

- [ ] Write failing tests/static assertions for first-run state, preview-only shell, Home/profile chooser transitions, reset, manifest Home candidate, supplied avatar assets, and no forced launcher replacement.
- [ ] Implement the Crossbar visual structure: top category carousel, large circular profile carousel, profile-specific home, right-side detail/hero area, compact movie rails, settings carousel, and Android-like OS settings pages.
- [ ] Add shell bootstrap persistence so the initial setup choice is remembered across restart, but reset returns to the setup screen.
- [ ] Add profile-specific shell settings for app rotation/visibility/order, display/audio, network, storage/media, HDMI-CEC/remote mapping, and reset.
- [ ] Add a safe handoff into Movie Room and installed apps without assuming a package is installed; unresolved apps should show a useful unavailable state.
- [ ] Run shell unit/static tests and a Gradle debug build before any device install.
- [ ] Commit: `feat: build profile-gated Crossbar shell`.

## Task 5: Align Android wrapper and Fire TV APK startup/access behavior

**Files:**
- Modify `movieroom-web/src/main/java/com/movieroom/web/MainActivity.java` and its manifest/resources.
- Modify `firetv/src/main/java/com/movieroom/firetv/MainActivity.java` and its manifest/resources.
- Add or update shared device bootstrap/session storage classes where the modules support them.
- Add focused APK contract tests under `test/` and module tests where available.

**Steps:**

- [ ] Write failing checks proving the Android and Fire TV APKs open in portrait by default on phones, adapt to landscape for full-screen playback, and show the setup gate before online setup.
- [ ] Remove any stale “preview tiles before login” behavior from the APK clients; they may show setup and connection status only until the online session is established.
- [ ] Implement online setup handoff and session refresh so a successfully configured Home profile opens unlocked with the full Home library.
- [ ] Keep storage/network/media permissions limited to the user-approved offline-playback needs and provide clear in-app permission recovery if denied.
- [ ] Verify app icons/profile artwork are packaged and resolve without broken image links.
- [ ] Run Android/Fire TV Gradle tests and assemble debug APKs.
- [ ] Commit: `feat: align Android and Fire TV profile startup`.

## Task 6: Implement the normalized remote-navigation layer and test the real Fire Stick

**Files:**
- Modify/add `RemoteMap.java` and `FocusGrid.java` in the shell.
- Modify web key handling in `public/app.js` for the same logical action names.
- Update remote/navigation tests and add a device smoke checklist under `docs/`.

**Steps:**

- [ ] Write failing tests for one-step D-pad movement, row/column boundary behavior, rail focus retention, Select/Back/Menu/Play-Pause, long-press/repeat throttling, and no header bounce while moving inside movie rows.
- [ ] Implement key aliases for DPAD arrows, center/Enter variants, Back/Escape, Menu, media play/pause, rewind/fast-forward, page movement, and Info.
- [ ] Make focus ownership explicit: top carousel, left list, right rail, detail actions, player controls, and modal/settings layers each get a remembered focus target.
- [ ] Ensure player/detail pages consume Back internally before the OS receives it.
- [ ] Build the shell APK and install it to the connected Fire Stick with `adb -s 192.168.1.114:5555 install -r -d <apk>`; do not run firmware or factory-reset commands.
- [ ] Verify package version, `HOME` candidate query, first-run setup, profile selection, reset, visual focus, and common remote keys using `adb shell input keyevent`, UI hierarchy dumps, screenshots, and logcat.
- [ ] Commit: `fix: make Crossbar navigation remote-safe`.

## Task 7: Full verification, release artifacts, and staged handoff

**Files:**
- Update `movieroom-shell/build.gradle` versionCode/versionName.
- Update `public/apk/os-update.json` and any release manifests.
- Copy only the verified APKs to `public/downloads/` and the repository’s release location; do not overwrite unrelated APKs.
- Add a release verification note under `docs/` with checksums and the exact device test result.

**Steps:**

- [ ] Run `npm test` and every relevant Gradle test/build for shell, Android wrapper, and Fire TV modules.
- [ ] Run `git diff --check`, APK/aapt package inspection, and SHA-256 generation for each shipped APK.
- [ ] Verify local web startup and production/static asset paths, including profile artwork, poster artwork, and service-worker versioning.
- [ ] Verify the connected Fire Stick still has Amazon’s launcher available and that Movie Room appears as an optional Home candidate, not a forced replacement.
- [ ] Capture a final 1080p shell screenshot/UI dump and confirm profile chooser, home rails, settings, player entry, and Back behavior.
- [ ] Commit release metadata/artifacts only after all checks pass: `chore: verify Crossbar experiment release`.
- [ ] Stop before GitHub/Vercel publishing unless separately authorized in the implementation turn; report exact build/install paths and any remaining blockers.

## Execution Order and Checkpoints

1. Tasks 1–2 establish and test the contract/server boundary.
2. Task 3 implements the web experience against those APIs.
3. Tasks 4–5 implement the native/shell clients against the same contract.
4. Task 6 verifies remote behavior on the actual Fire Stick.
5. Task 7 performs full verification and produces the staged APK handoff.

At the end of each task, report the tests run, commit hash, and any deliberate compatibility change before proceeding. A failed test or device check is a stop-and-diagnose point; do not paper over it by claiming the APK is ready.
