# Movie Room Web Home for Firestick Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the website-wrapping Android package the single selectable Movie Room Home app on Firestick while removing the competing custom remote-control layer.

**Architecture:** `com.movieroom.web` remains a thin WebView wrapper around the deployed Movie Room website and becomes the only Movie Room package advertising the Android HOME role. The website remains the visual and navigation source of truth; WebView and Android receive ordinary Fire TV DPAD/select events without JavaScript geometry routing or duplicate native command interception. The native shell and native player remain available in the repository but are no longer Home candidates.

**Tech Stack:** Android SDK 35, Java 17, Android Gradle Plugin 8.7.3, Android WebView, Node.js built-in test runner, existing Movie Room HTML/CSS/JavaScript, Vercel static deployment.

**Spec:** `docs/superpowers/specs/2026-09-30-web-home-firestick-design.md`

## Global Constraints

- `com.movieroom.web` is the only Movie Room package that advertises `android.intent.category.HOME`.
- The website remains the only rendered Movie Room UI for the Firestick wrapper.
- Do not display an on-screen remote bar or add another custom geometry-based remote controller.
- Let Android WebView and the browser's native focus model move between semantic controls.
- Preserve page-level Back navigation inside Movie Room before leaving the app.
- Preserve public library, hero, profiles, genres, settings, movie details, playback, artwork, storage, and update flows.
- Do not embed Jellyfin, OneDrive, pairing, Vercel, or Movie Room credentials.
- Do not flash or modify Fire OS firmware or the Firestick bootloader.
- Do not uninstall existing device packages automatically.

## Review Focus

- Home-role ownership: an Android resolver must see the WebView package as the only Movie Room Home candidate; test this in `test/movie-room-web-app.test.js` and `test/movie-room-shell.test.js`.
- DPAD event routing: Fire TV arrows and select must reach WebView descendants instead of being consumed by Java or JavaScript command bridges; test this in `test/remote-controls.test.js`.
- Page navigation: Back must still return from search, menu, settings, details, and player to the website's prior page; test the retained `MovieRoomBack` bridge in `test/movie-room-web-app.test.js`.
- Focus visibility: a focused hero action, navigation button, and movie card must have an obvious focus style without a remote overlay; test the existing CSS/HTML contracts in `test/remote-controls.test.js`.
- Release discoverability: the APK version, website download link, and update manifest must point to the same artifact; test the release metadata in `test/movie-room-web-app.test.js`.

---

### Task 1: Replace stale control and package contracts with failing tests

**Files:**
- Modify: `test/movie-room-web-app.test.js`
- Modify: `test/movie-room-shell.test.js`
- Modify: `test/remote-controls.test.js`

**Interfaces:**
- Consumes: the existing manifest, Java wrapper, shell manifest, public HTML, and public JavaScript.
- Produces: regression assertions for one HOME package, native WebView focus routing, retained Back navigation, and absence of custom remote interception.

- [ ] **Step 1: Write the failing ownership tests**

  Change the HOME assertions so `movieroom-web/src/main/AndroidManifest.xml` must contain `HOME` and `DEFAULT`, while `movieroom-shell/src/main/AndroidManifest.xml` and `firetv/src/main/AndroidManifest.xml` must not contain `HOME`.

- [ ] **Step 2: Write the failing native focus tests**

  Assert that `movieroom-web/src/main/java/com/movieroom/web/MainActivity.java` keeps a focusable WebView with descendant focusability, keeps `onBackPressed`/`MovieRoomBack`, and does not contain `dispatchKeyEvent`, `dispatchNativeDirectional`, `dispatchNativeSelect`, `dispatchNativeMenu`, `dispatchNativePlaybackToggle`, `KEYCODE_DPAD_*`, or `MovieRoomMove`.

- [ ] **Step 3: Write the failing website control tests**

  Assert that `public/index.html` has no remote-control elements and still has semantic hero, navigation, profile, library, details, and `:focus-visible` controls. Assert that `public/app.js` keeps `MovieRoomBack` but does not define/register `moveRemoteFocus`, `handleRemoteCommand`, `MovieRoomMove`, `MovieRoomMenu`, or `MovieRoomTogglePlayback`, and does not attach a document `keydown` command interceptor.

- [ ] **Step 4: Write the failing release metadata test**

  Assert that the Android version is `versionCode 15` / `versionName "1.0.14"`, that `public/index.html` links to `/downloads/TaylorMade-Movies-Android-v1.0.14.apk`, and that `public/apk/update.json` carries the same version and download path.

- [ ] **Step 5: Run the focused tests and confirm the failures are expected**

  Run: `node --test test/movie-room-web-app.test.js test/movie-room-shell.test.js test/remote-controls.test.js`

  Expected: failures for the current shell-owned HOME role, Java/JavaScript remote interception, and old release metadata—not syntax or test-runner errors.

### Task 2: Make the WebView wrapper the only Movie Room Home app

**Files:**
- Modify: `movieroom-web/src/main/AndroidManifest.xml`
- Modify: `movieroom-shell/src/main/AndroidManifest.xml`
- Modify: `movieroom-web/build.gradle`

**Interfaces:**
- Consumes: Task 1's manifest contracts.
- Produces: a package that Android can offer as the Movie Room Home app while the old native shell remains launchable only as an ordinary app.

- [ ] **Step 1: Add the WebView Home intent filter**

  Keep the existing `MAIN`/`LAUNCHER`/`LEANBACK_LAUNCHER` filter in the WebView manifest and add a second `MAIN`/`HOME`/`DEFAULT` filter for the same `MainActivity`.

- [ ] **Step 2: Remove the shell Home intent filter**

  Leave the shell's ordinary `MAIN`/`LAUNCHER`/`LEANBACK_LAUNCHER` filter intact, but remove only its `MAIN`/`HOME`/`DEFAULT` filter.

- [ ] **Step 3: Bump the canonical wrapper release**

  Set `versionCode 15` and `versionName "1.0.14"` in `movieroom-web/build.gradle` so the Firestick build is distinguishable from the older package.

- [ ] **Step 4: Run the ownership tests**

  Run: `node --test test/movie-room-web-app.test.js test/movie-room-shell.test.js`

  Expected: HOME ownership assertions pass; control and release assertions remain red until their tasks are complete.

- [ ] **Step 5: Commit the package-role change**

  ```powershell
  git add -- movieroom-web/src/main/AndroidManifest.xml movieroom-shell/src/main/AndroidManifest.xml movieroom-web/build.gradle test/movie-room-web-app.test.js test/movie-room-shell.test.js
  git commit -m "feat: make web wrapper the Movie Room home app"
  ```

### Task 3: Return remote input to Android WebView focus handling

**Files:**
- Modify: `movieroom-web/src/main/java/com/movieroom/web/MainActivity.java`
- Modify: `public/app.js`
- Modify: `test/remote-controls.test.js`

**Interfaces:**
- Consumes: Task 2's canonical WebView Home package and Task 1's control contracts.
- Produces: a standard focus path where Android/WebView receives DPAD/select events and the website retains semantic page Back behavior.

- [ ] **Step 1: Remove Java command interception**

  Remove the `KeyEvent`, `SystemClock`, and `JSONObject` command-bridge imports and delete `dispatchNativeSelect`, `dispatchNativeDirectional`, `dispatchNativeMenu`, `dispatchNativePlaybackToggle`, and the overriding `dispatchKeyEvent` method. Keep `webView.setFocusable(true)`, `setFocusableInTouchMode(true)`, and set descendant focusability to `ViewGroup.FOCUS_AFTER_DESCENDANTS` so WebView descendants can receive focus. Keep the existing `onBackPressed` call to `window.MovieRoomBack`.

- [ ] **Step 2: Remove JavaScript remote command interception**

  Delete `moveRemoteFocus`, `handleRemoteCommand`, and `togglePlaybackFromRemote` from `public/app.js`. Remove the `MovieRoomMove`, `MovieRoomMenu`, and `MovieRoomTogglePlayback` registrations from `initialize()`. Remove only the document `keydown` listener that translates arrows/Enter/Escape into commands; retain fullscreen and pagehide listeners in that same initialization block.

- [ ] **Step 3: Preserve standard focus affordances**

  Keep the existing semantic `<button>`, `<input>`, `<select>`, and movie-card controls in DOM order. Keep the existing global `:focus-visible` and `.movie-card:focus-visible` rules. If a focus target is missing, add only the smallest HTML `tabindex`/accessible-label correction needed; do not add a replacement remote dispatcher.

- [ ] **Step 4: Run the focused control tests**

  Run: `node --test test/remote-controls.test.js test/movie-room-web-app.test.js`

  Expected: all custom-interception absence assertions pass, the retained Back bridge passes, and no remote-control overlay or double-activation code is present.

- [ ] **Step 5: Commit the control-path change**

  ```powershell
  git add -- movieroom-web/src/main/java/com/movieroom/web/MainActivity.java public/app.js test/remote-controls.test.js
  git commit -m "fix: use native WebView focus for Fire TV remote"
  ```

### Task 4: Publish the matching Android artifact metadata

**Files:**
- Modify: `public/index.html`
- Modify: `public/apk/update.json`
- Create: `public/downloads/TaylorMade-Movies-Android-v1.0.14.apk`

**Interfaces:**
- Consumes: the versioned APK produced by Task 2 and the existing website download/update contracts.
- Produces: a website download and update manifest that resolve to the same WebView Home APK.

- [ ] **Step 1: Build the wrapper APK**

  Run: `./gradlew.bat :movieroom-web:testDebugUnitTest :movieroom-web:assembleDebug --no-daemon`

  Expected: `BUILD SUCCESSFUL` and `movieroom-web/build/outputs/apk/debug/movieroom-web-debug.apk` exists.

- [ ] **Step 2: Copy the verified APK into the public download directory**

  Copy the built debug artifact to `public/downloads/TaylorMade-Movies-Android-v1.0.14.apk` without staging unrelated old APKs or temporary files.

- [ ] **Step 3: Update website release metadata**

  Change the Android download link in `public/index.html` and the `versionCode`, `versionName`, `downloadUrl`, and release notes in `public/apk/update.json` to the new `1.0.14` artifact.

- [ ] **Step 4: Run the release metadata tests**

  Run: `node --test test/movie-room-web-app.test.js`

  Expected: the download link, update manifest, and Android version assertions pass.

- [ ] **Step 5: Commit the artifact metadata**

  ```powershell
  git add -- public/index.html public/apk/update.json public/downloads/TaylorMade-Movies-Android-v1.0.14.apk
  git commit -m "release: publish Movie Room web home APK"
  ```

### Task 5: Run the full verification suite and hand off the APK

**Files:**
- Verify: all tracked source/tests changed by Tasks 1–4.

**Interfaces:**
- Consumes: the canonical Home package, standard WebView focus path, and versioned public APK.
- Produces: evidence that the repository tests and Android build pass before any Firestick installation or deployment.

- [ ] **Step 1: Run the complete Node suite**

  Run: `npm.cmd test`

  Expected: zero failures; an existing Windows-only permission skip is acceptable if reported by the suite.

- [ ] **Step 2: Run the Android wrapper build again from the final tree**

  Run: `./gradlew.bat :movieroom-web:testDebugUnitTest :movieroom-web:assembleDebug --no-daemon`

  Expected: `BUILD SUCCESSFUL` and the final artifact checksum matches the copied public APK.

- [ ] **Step 3: Inspect repository state**

  Run: `git status --short --branch` and `git diff --check HEAD~5..HEAD`.

  Expected: only the planned commits/files are part of this change; unrelated existing work and temporary artifacts remain unstaged.

- [ ] **Step 4: Hand off before device installation**

  Report the APK path, version, Home-package behavior, test/build results, and the fact that no Fire OS firmware was modified. Do not connect to or uninstall packages from the Firestick until installation is explicitly requested after review.
