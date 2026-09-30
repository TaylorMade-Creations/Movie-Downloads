# Movie Room Shell OS and Web App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the native shell as Movie Room OS/Home and make it launch the website wrapper as the normal library app with a separate search row and tabbed menu.

**Architecture:** `com.movieroom.shell` remains the only HOME package and owns native Fire TV focus, OS menus, profiles, genres, settings, and launcher actions. `com.movieroom.web` remains a normal app that renders the existing website; it does not consume remote events with a custom bridge. `com.movieroom.firetv` remains non-HOME fallback/technical code.

**Tech Stack:** Android SDK 35, Java 17, Android Gradle Plugin 8.7.3, Android WebView, Node.js built-in test runner, existing Movie Room HTML/CSS/JavaScript.

**Spec:** `docs/superpowers/specs/2026-09-30-shell-home-web-app-design.md`

## Global Constraints

- `com.movieroom.shell` is the only Movie Room package that advertises `android.intent.category.HOME`.
- The native shell remains the OS/Home surface and keeps its native focus controls.
- `com.movieroom.web` is a normal library/player app, not the HOME app.
- Search occupies its own full-width web header row.
- Menu opens a dedicated semantic tabbed page with Browse, Profiles, and Settings groups.
- The web wrapper does not intercept DPAD, select, Menu, or media events with a duplicate command bridge.
- Back closes website pages first and returns to the native shell from website Home.
- Do not uninstall packages or flash/modify Fire OS firmware.

## Review Focus

- Shell ownership and launch target: tests must prove the shell remains HOME and Library/Search/Open Movie Room launch `com.movieroom.web`.
- Native shell controls: tests must preserve shell focus rows, Menu, Back, and settings actions.
- Web focus routing: tests must prove Java/WebView and JavaScript do not consume DPAD/select/media commands.
- Web layout: tests must prove the search field is outside the menu-button row and the Menu page has Browse/Profiles/Settings tab panels.
- Back handoff: tests must prove `MovieRoomBack` returns false at website Home and the Android wrapper finishes to reveal the shell.

---

### Task 1: Write failing architecture and layout tests

**Files:**
- Modify: `test/movie-room-shell.test.js`
- Modify: `test/movie-room-web-app.test.js`
- Modify: `test/remote-controls.test.js`

**Interfaces:**
- Consumes: current shell/web manifests, activities, public HTML, and public JavaScript.
- Produces: red tests for shell ownership, shell-to-web launch, standard WebView focus, Back handoff, standalone search, and tabbed menu semantics.

- [ ] **Step 1: Change HOME ownership assertions**

  Require `movieroom-shell/src/main/AndroidManifest.xml` to contain `HOME`; require the web and native player manifests not to contain `HOME`.

- [ ] **Step 2: Add shell-to-web launch assertions**

  Require `ShellActivity.java` to reference `com.movieroom.web` and `com.movieroom.web.MainActivity`, while preserving its native `setNextFocus*`, `KEYCODE_BACK`, `KEYCODE_MENU`, and playback handling.

- [ ] **Step 3: Add WebView standard-focus and Back assertions**

  Require the wrapper to keep a focusable WebView, descendant focusability, and `onBackPressed`/`MovieRoomBack`, but not contain `dispatchKeyEvent`, DPAD key constants, `dispatchNativeDirectional`, `dispatchNativeSelect`, `dispatchNativeMenu`, `dispatchNativePlaybackToggle`, or `MovieRoomMove`.

- [ ] **Step 4: Add website remote and layout assertions**

  Require no remote overlay or document keydown command interceptor. Require `id="library-search"` inside a `search-row`, outside the `primary-nav`, and require tablist/tab/tabpanel markers for Browse, Profiles, and Settings on `navigation-page`.

- [ ] **Step 5: Add Back handoff assertions**

  Require the public `handleNativeBack` function to return false on the website Home path and require the wrapper callback to call `finish()` when the website reports unhandled Back.

- [ ] **Step 6: Run the focused tests and verify expected failures**

  Run: `node --test test/movie-room-shell.test.js test/movie-room-web-app.test.js test/remote-controls.test.js`

  Expected: failures for the current shell-to-native-player target, missing layout tab markers, and existing Java/JavaScript remote interception.

### Task 2: Keep the native shell as OS and launch the web app

**Files:**
- Modify: `movieroom-shell/src/main/AndroidManifest.xml`
- Modify: `movieroom-shell/src/main/java/com/movieroom/shell/ShellActivity.java`
- Modify: `movieroom-shell/build.gradle`
- Modify: `test/movie-room-shell.test.js`

**Interfaces:**
- Consumes: Task 1's shell ownership and launch assertions.
- Produces: a native HOME shell whose library/search/hero actions open the web app.

- [ ] **Step 1: Declare the web package query**

  Add `com.movieroom.web` to the shell manifest's `<queries>` block while retaining the existing native shell HOME filter.

- [ ] **Step 2: Route shell content actions to WebView**

  Replace the native-player component in `openNativePlayer()` with `new ComponentName("com.movieroom.web", "com.movieroom.web.MainActivity")`, rename the method to `openMovieRoomApp()`, and update Library, Search, hero, media-key, and fallback shelf listeners to call it.

- [ ] **Step 3: Preserve OS controls**

  Keep the shell's explicit focus rows, high-contrast focus styling, native Settings actions, `KEYCODE_BACK`, `KEYCODE_MENU`, and media-key handling. Do not move those controls into the WebView app.

- [ ] **Step 4: Bump the shell build identity**

  Set the shell version to the next patch release (`versionCode 3`, `versionName "0.3.0"`) so the installed OS shell is distinguishable from the placeholder build.

- [ ] **Step 5: Run shell unit/build checks**

  Run: `./gradlew.bat :movieroom-shell:testDebugUnitTest :movieroom-shell:assembleDebug --no-daemon`

  Expected: `BUILD SUCCESSFUL`; the shell APK is produced with the native HOME role.

### Task 3: Remove only the app's duplicate remote interception and hand Back to shell

**Files:**
- Modify: `movieroom-web/src/main/java/com/movieroom/web/MainActivity.java`
- Modify: `public/app.js`
- Modify: `test/movie-room-web-app.test.js`
- Modify: `test/remote-controls.test.js`

**Interfaces:**
- Consumes: Task 2's shell launch target.
- Produces: a normal WebView app that receives native focus events and exits to the shell only at its website Home.

- [ ] **Step 1: Remove Java event interception**

  Delete the WebView wrapper's directional/select/menu/media dispatch methods and `dispatchKeyEvent` override. Keep `setFocusable(true)`, `setFocusableInTouchMode(true)`, add `setDescendantFocusability(ViewGroup.FOCUS_AFTER_DESCENDANTS)`, and retain the settings/storage/update/fullscreen bridges.

- [ ] **Step 2: Make Android Back finish only when the website is at Home**

  Keep `MovieRoomBack` evaluation. When its callback reports `false`, call `finish()` instead of scrolling the page; that reveals the shell activity underneath.

- [ ] **Step 3: Remove JavaScript command routing**

  Remove `moveRemoteFocus`, `handleRemoteCommand`, `togglePlaybackFromRemote`, the `MovieRoomMove`/`MovieRoomMenu`/`MovieRoomTogglePlayback` registrations, and only the document `keydown` command listener. Keep normal click handlers, fullscreen, pagehide, and the page-level `handleNativeBack` function.

- [ ] **Step 4: Return false from web Home Back**

  Update the final Home branch of `handleNativeBack` to focus the hero and return `false`; retain `true` for inner pages, details, player, search, menu, and settings.

- [ ] **Step 5: Run focused web/control tests**

  Run: `node --test test/movie-room-web-app.test.js test/remote-controls.test.js`

  Expected: all duplicate-interception absence tests and the Back handoff tests pass.

### Task 4: Separate search and add remote-friendly Menu tabs

**Files:**
- Modify: `public/index.html`
- Modify: `public/app.js`
- Modify: `test/remote-controls.test.js`

**Interfaces:**
- Consumes: Task 3's standard focus behavior and existing browse destination handlers.
- Produces: a web header whose search field has its own row and a Menu page with Browse, Profiles, and Settings tab panels.

- [ ] **Step 1: Split the header into two rows**

  Wrap branding/context/navigation/profile actions in `.topbar-main`; move the existing `#library-search` into a separate `.search-row` containing `.search-wrap`. Keep the search input id and behavior unchanged. Remove the duplicate `search-page-close` id if present.

- [ ] **Step 2: Add the Menu tab structure**

  Add a `role="tablist"` with `data-menu-tab` buttons for Browse, Profiles, and Settings. Place the existing browse/profile/settings destination buttons into matching `role="tabpanel"` sections with `aria-labelledby`, preserving their `data-browse-destination` and `data-profile-navigation` hooks.

- [ ] **Step 3: Style the layout for TV and mobile**

  Add grid/flex rules for `.topbar-main`, `.search-row`, `.menu-tabs`, and `.menu-tabpanel`. Keep search full-width and focus-visible; keep menu buttons at their existing readable size; use the existing dark/gold/teal theme and responsive breakpoints.

- [ ] **Step 4: Wire tab selection through normal buttons**

  Add `setMenuTab(tabId)` in `public/app.js`, update `aria-selected`, toggle only the matching tabpanel, and focus the first enabled button in that panel. Initialize Browse as selected whenever the Menu page opens. Do not add keyboard or remote event interception.

- [ ] **Step 5: Run the interface tests**

  Run: `node --test test/remote-controls.test.js test/profile-pages.test.js test/movie-room-web-app.test.js`

  Expected: standalone search, tab semantics, existing page destinations, profiles, and focus-visible assertions pass.

### Task 5: Build and verify the shell/web pair

**Files:**
- Verify: `movieroom-shell/**`, `movieroom-web/**`, `public/**`, and the updated tests.

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces: verified shell and web APKs ready for review; no automatic device installation.

- [ ] **Step 1: Run the full Node suite**

  Run: `npm.cmd test`

  Expected: zero failures; report any existing Windows-only skip without hiding it.

- [ ] **Step 2: Build both Android packages**

  Run: `./gradlew.bat :movieroom-shell:testDebugUnitTest :movieroom-shell:assembleDebug :movieroom-web:testDebugUnitTest :movieroom-web:assembleDebug --no-daemon`

  Expected: `BUILD SUCCESSFUL` with `movieroom-shell/build/outputs/apk/debug/movieroom-shell-debug.apk` and `movieroom-web/build/outputs/apk/debug/movieroom-web-debug.apk`.

- [ ] **Step 3: Inspect the final source and artifacts**

  Run: `git diff --check` and `git status --short --branch`. Confirm the shell manifest is the only HOME manifest, the web APK is not HOME, and no unrelated APKs/temp files are staged.

- [ ] **Step 4: Hand off before Firestick installation**

  Report both APK paths, the shell/web roles, test/build results, and the fact that Fire OS firmware was not modified. Install or uninstall packages only after the user explicitly requests the device step.
