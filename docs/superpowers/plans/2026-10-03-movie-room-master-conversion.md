# Movie Room Master In-Place Conversion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing `Movie-Downloads` repository into the renamed `Movie-Room-Master` source of truth without deleting files or moving the external media library, while proving the live web app and all three Android packages still build, install, and operate.

**Architecture:** Preserve the current repository and history, extend its existing `movie-workflow-blueprint` control point, and add non-destructive inventory, configuration, release, and verification tooling around the current paths. Keep the website, Android wrapper, Fire TV client, and optional shell as separate consumers of the same production API; cut GitHub and Vercel over only after preview and device gates pass.

**Tech Stack:** Node.js 22.9+ and the Node test runner, vanilla HTML/CSS/JavaScript, Android Gradle Plugin 8.7.3, Java 17, Android compile/target SDK 35, Media3, PowerShell, Git/GitHub, Vercel, ADB.

**Spec:** `docs/superpowers/specs/2026-10-03-movie-room-master-monorepo-design.md`

## Global Constraints

- Convert the existing repository in place; do not create a second source repository or discard Git history.
- Rename GitHub from `taylormade02471/Movie-Downloads` to `taylormade02471/Movie-Room-Master` only after the migration branch passes all pre-cutover gates.
- Do not delete, move, rename, hash the contents of, or commit media under `C:\Users\kylet\OneDrive\Desktop\Movie downloads`.
- Keep application convenience copies under `C:\Users\kylet\OneDrive\Desktop\Movie downloads\Applications`; publish only versioned, verified copies and never overwrite a different hash.
- Keep production origin `https://movie-downloads-six.vercel.app` and the existing Vercel project; do not create a replacement production project.
- Preserve application IDs `com.movieroom.web`, `com.movieroom.firetv`, and `com.movieroom.shell`.
- Keep Fire OS underneath the optional shell; do not remove firmware, system settings, DRM, recovery, or the Amazon app store.
- Never commit `.env*`, OneDrive/Jellyfin/Vercel credentials, signing keys, passwords, private URLs, or `config/library.local.json`.
- Production signing is optional during the migration and must use external environment variables; debug builds must continue to work without signing secrets.
- Existing uncommitted source work must be reviewed and checkpointed or locally inventoried before master-conversion edits begin; generated APKs and runtime output are not swept into Git.
- Native execution is selected: implement each task in this session, then perform one whole-branch review before cutover.

## Review Focus

- A missing or offline local library must produce a clear configuration error and must not create a new `movies` directory; Task 3 owns this test.
- Dirty and untracked source, APKs, and runtime files must remain present while only reviewed source is committed; Tasks 1 and 2 own the before/after inventory tests.
- A GitHub rename must not silently detach the existing Vercel project or change the production origin; Tasks 7 and 8 own the pre/post-cutover checks.
- A versioned APK destination containing a different SHA-256 must be rejected instead of overwritten; Task 5 owns this test.
- An offline, unauthorized, or signature-incompatible Android/Fire TV device must stop installation without uninstalling the current app or clearing data; Task 9 owns this check.

## File Responsibility Map

### Existing control and build files

- `movie-workflow-blueprint/manifest.json`: canonical repository, deployment, module, library-config pointer, artifact, and verification metadata; no machine-specific absolute path.
- `movie-workflow-blueprint/control.mjs`: validated programmatic access to the canonical manifest.
- `package.json`: master-level commands and renamed repository metadata.
- `settings.gradle`, `build.gradle`, and the three module `build.gradle` files: stable Android modules and external release-signing hook.
- `server.js` and `lib/providers/local.js`: provider selection and non-destructive local-library behavior.
- `public/apk/*.json` and `public/downloads/*.apk`: public update contracts and verified versioned artifacts.

### New focused files

- `Movie-Room-Master.code-workspace`: one editor entry point for the existing source layout.
- `config/library.example.json`: commit-safe example; `config/library.local.json` remains ignored.
- `lib/library-config.js`: synchronous library-root resolution and validation used by the server.
- `scripts/master/create-preservation-inventory.mjs`: read-only repository/library inventory CLI.
- `scripts/master/release-artifacts.mjs`: version parsing, SHA-256 validation, atomic publication, and update-manifest generation.
- `scripts/master/verify-repository.mjs`: local cross-client invariants and artifact checks.
- `scripts/master/verify-deployment.mjs`: production/preview HTTP contract checks.
- `.github/workflows/verify.yml`: Node and Android continuous verification without secrets.
- `inventories/README.md` and `inventories/local/`: committed policy plus ignored machine-local reports.
- `docs/architecture/movie-room-master.md`, `docs/recovery/movie-room-master-rollback.md`, `docs/publishing/movie-room-apps.md`: operating, rollback, and store-preparation handoffs.

---

### Task 1: Preserve and checkpoint the current working state

**Files:**
- Review/commit if verified: `movieroom-shell/build.gradle`
- Review/commit if verified: `movieroom-shell/src/main/java/com/movieroom/shell/RemoteMap.java`
- Review/commit if verified: `movieroom-shell/src/main/java/com/movieroom/shell/ShellActivity.java`
- Review/commit if verified: `public/apk/os-update.json`, `public/app.js`, `public/index.html`, `public/sw.js`
- Review/commit if verified: `test/movie-room-shell.test.js`, `test/pwa.test.js`, `test/remote-controls.test.js`, `test/ui-styling.test.js`, `test/neon-home-menu.test.js`
- Review/commit if verified: `scripts/convert-firetv-audio.ps1`, `docs/superpowers/plans/2026-10-03-runway-movie-trailer.md`
- Preserve locally, do not bulk-stage: root/debug APKs, `test-results/`, `tmp-runtime/`

**Interfaces:**
- Consumes: current `main` commit `ea3ad26` and the existing dirty working tree.
- Produces: tag `pre-movie-room-master-2026-10-03`, safety refs under `codex/`, and branch `codex/movie-room-master-conversion` with reviewed current source checkpointed.

- [ ] **Step 1: Record the baseline without changing files.** Capture `git rev-parse HEAD`, `git remote -v`, `git status --porcelain=v2`, tracked paths, untracked paths, and SHA-256 for untracked APKs; do not read media contents.
- [ ] **Step 2: Create recoverable Git refs.** Tag the current commit as `pre-movie-room-master-2026-10-03`; use `git stash create` plus `git branch` to preserve tracked dirty content without cleaning the worktree; switch to `codex/movie-room-master-conversion` while retaining the working files.
- [ ] **Step 3: Review the existing diff and classify every changed/untracked path.** Reject secrets, `.env*`, runtime output, and arbitrary binaries; keep source, tests, and approved documentation in the checkpoint set.
- [ ] **Step 4: Run the current baseline suites.** Run `npm.cmd test`; set `JAVA_HOME=C:\Program Files\Android\Android Studio\jbr` and `ANDROID_HOME=C:\Users\kylet\AppData\Local\Android\Sdk`; run `./gradlew.bat :firetv:testDebugUnitTest :firetv:assembleDebug :movieroom-web:assembleDebug :movieroom-shell:assembleDebug --no-daemon`.
- [ ] **Step 5: If a baseline test fails, invoke `superpowers:systematic-debugging`.** Fix only the demonstrated failure, rerun the smallest failing test, then rerun the baseline suites; do not proceed on red.
- [ ] **Step 6: Commit only the reviewed current source checkpoint.** Verify `git diff --cached --name-only` excludes APKs, `.env*`, `test-results/`, `tmp-runtime/`, and media, then commit with `feat: checkpoint current Movie Room experience`.

### Task 2: Add a non-destructive preservation inventory

**Files:**
- Create: `scripts/master/create-preservation-inventory.mjs`
- Create: `test/master-inventory.test.js`
- Create: `inventories/README.md`
- Modify: `.gitignore`
- Modify: `.vercelignore`

**Interfaces:**
- Consumes: repository root and optional `MOVIE_LIBRARY_ROOT`/`config/library.local.json` values.
- Produces: `classifyPath(relativePath)`, `collectRepositoryInventory(options)`, `collectLibraryMetadata(options)`, and `writeInventory(options)`; reports go only to ignored `inventories/local/`.

- [ ] **Step 1: Write failing inventory tests.** Assert a temporary fixture has identical paths and SHA-256 values before and after inventory; `.env.local` and token-shaped values are reported only as redacted/excluded; media inventory contains relative path, byte size, and timestamp but never opens file contents.
- [ ] **Step 2: Run RED.** Run `node --test test/master-inventory.test.js`; expect failure because the module does not exist.
- [ ] **Step 3: Implement the four exported inventory functions and CLI.** Use read-only Git commands plus `readdir`/`stat`; write only the requested JSON report with a temporary file followed by rename.
- [ ] **Step 4: Ignore machine-local reports and build/runtime output.** Add `inventories/local/`, `release/master-build-report.json`, `config/library.local.json`, root debug APKs, `test-results/`, and `tmp-runtime/` without untracking already published versioned artifacts.
- [ ] **Step 5: Run GREEN and create the pre-conversion report.** Run `node --test test/master-inventory.test.js`, then `node scripts/master/create-preservation-inventory.mjs --output inventories/local/pre-conversion.json`; verify `git status` shows no media changes.
- [ ] **Step 6: Commit.** Commit only inventory source, policy, test, and ignore changes with `feat: add non-destructive master inventory`.

### Task 3: Promote the existing blueprint to the master control point

**Files:**
- Modify: `movie-workflow-blueprint/manifest.json`
- Modify: `movie-workflow-blueprint/control.mjs`
- Modify: `package.json`
- Modify: `settings.gradle`
- Modify: `README.md`
- Create: `Movie-Room-Master.code-workspace`
- Create: `test/master-repository.test.js`

**Interfaces:**
- Consumes: the existing blueprint schema and current module/package identities.
- Produces: `validateManifest(value)`, `applications`, `artifactManifests`, `buildCommands`, `productionUrl`, and `libraryConfigPath` from `control.mjs`.

- [ ] **Step 1: Write failing master-control tests.** Assert manifest version `2`, repository `https://github.com/taylormade02471/Movie-Room-Master`, branch `main`, production origin, `config/library.local.json` pointer, all three package IDs, the `movie-room-os` AOSP prototype entry, build tasks, update-manifest paths, no `C:\Users\...` runtime path, and no credential values; assert `validateManifest` rejects a missing module or changed production origin.
- [ ] **Step 2: Run RED.** Run `node --test test/master-repository.test.js`; expect schema/export failures.
- [ ] **Step 3: Extend the blueprint and control module.** Keep existing provider and workflow data, add explicit web/Android/Fire TV/shell modules, record `movie-room-os` as a non-release AOSP prototype, add artifact contracts, replace hardcoded local paths with the ignored-config pointer, and validate required fields on import.
- [ ] **Step 4: Rename repository metadata without moving source.** Set package name to `movie-room-master`, repository URL to the future GitHub URL, Gradle root project name to `MovieRoomMaster`, add `master:*` script entries, and create the workspace file with current folders.
- [ ] **Step 5: Update the README source-of-truth wording.** State that APKs are built from the master repository and load the stable Vercel origin; GitHub is source control, not a media host.
- [ ] **Step 6: Run GREEN.** Run `node --test test/master-repository.test.js` and `npm.cmd test`.
- [ ] **Step 7: Commit.** Commit with `feat: promote repository to Movie Room master control`.

### Task 4: Require an explicit, existing local media library

**Files:**
- Create: `config/library.example.json`
- Create locally/ignored: `config/library.local.json`
- Create: `lib/library-config.js`
- Create: `test/library-config.test.js`
- Modify: `.env.example`
- Modify: `.gitignore`
- Modify: `server.js:1248-1287`
- Modify: `server.js:2087-2096`
- Modify: `lib/providers/local.js:84-94`
- Modify: `movie-workflow-blueprint/manifest.json`
- Modify: `movie-workflow-blueprint/control.mjs`
- Modify: `scripts/normalize-movie-library.ps1`
- Modify: `scripts/install-movie-library-watcher.ps1`
- Modify: `scripts/run-movie-library-sync.ps1`
- Modify: `scripts/sync-jellyfin-artwork.mjs`
- Modify: `scripts/export-movie-metadata-to-onedrive.mjs`

**Interfaces:**
- Consumes: explicit `moviesDir`, `MOVIE_LIBRARY_ROOT`, or ignored `config/library.local.json`, in that order.
- Produces: `loadLibraryConfiguration({ repoRoot, env, explicitRoot, fsImpl }) -> { libraryRoot, applicationsRoot, source }` and `requireExistingLibraryRoot(configuration, fsImpl) -> string`.

- [ ] **Step 1: Write failing configuration tests.** Cover explicit-root precedence, environment precedence, local JSON fallback, missing configuration, configured nonexistent directory, unreadable JSON, a remote `onedrive` provider that does not require local media, and absence of the personal absolute path from committed runtime manifests/scripts.
- [ ] **Step 2: Add the missing-library regression to `test/library.test.js`.** Call `listLibrary()` on a nonexistent root and assert rejection includes the resolved path while the directory remains absent.
- [ ] **Step 3: Run RED.** Run `node --test test/library-config.test.js test/library.test.js`; expect missing module and current auto-create behavior failures.
- [ ] **Step 4: Implement config resolution and server integration.** Validate local/hybrid roots before constructing the local provider; leave OneDrive/Jellyfin-only startup independent of the Windows path; export `createProvider` for focused tests; have automation consume `MOVIE_LIBRARY_ROOT` or the same ignored JSON instead of a committed user path.
- [ ] **Step 5: Remove automatic directory creation.** Change local provider `ENOENT` handling to a clear configuration error; do not call `mkdir`.
- [ ] **Step 6: Add both configurations.** Commit the placeholder example, create ignored `config/library.local.json` with the current exact library and Applications roots, and verify Git ignores the local file.
- [ ] **Step 7: Run GREEN.** Run focused tests, then `npm.cmd test`.
- [ ] **Step 8: Commit.** Commit with `fix: require the configured Movie Room library`.

### Task 5: Add external Android signing and atomic artifact publication

**Files:**
- Create: `gradle/movie-room-signing.gradle`
- Modify: `movieroom-web/build.gradle`
- Modify: `firetv/build.gradle`
- Modify: `movieroom-shell/build.gradle`
- Create: `scripts/master/release-artifacts.mjs`
- Create: `test/release-artifacts.test.js`
- Create: `public/apk/firetv-update.json`
- Modify: `public/apk/update.json`
- Modify: `public/apk/os-update.json`
- Modify: `.vercelignore`
- Create: `release/README.md`

**Interfaces:**
- Consumes: Gradle version data, build outputs, stable production origin, optional four-variable signing environment, and optional Applications root.
- Produces: `parseAndroidModule(buildText)`, `sha256(filePath)`, `readApkSignerDigest(apkPath, runner)`, `buildArtifactPlan(options)`, `publishArtifact(item)`, and `writeUpdateManifest(item)`.

- [ ] **Step 1: Write failing release tests.** Assert exact package/version extraction for all modules, three distinct artifact names/manifests, stable HTTPS download URLs, APK signer digest capture, same-hash idempotence, different-hash or signer refusal, missing-build refusal, and no Applications-root write during `--dry-run`.
- [ ] **Step 2: Run RED.** Run `node --test test/release-artifacts.test.js`; expect missing module failures.
- [ ] **Step 3: Add the shared signing hook.** Read `MOVIEROOM_KEYSTORE_PATH`, `MOVIEROOM_KEYSTORE_PASSWORD`, `MOVIEROOM_KEY_ALIAS`, and `MOVIEROOM_KEY_PASSWORD`; configure release signing only when all four exist, fail on a partial set, and leave debug builds unchanged when none exist.
- [ ] **Step 4: Implement artifact planning and atomic publication.** Use Android SDK `apksigner` to record the certificate digest; publish versioned files only after size/SHA-256/signature validation; copy to a temporary destination then rename; refuse to replace a different hash or signer under the same package/version.
- [ ] **Step 5: Generate independent update manifests.** Keep Android at `/apk/update.json`, add Fire TV at `/apk/firetv-update.json`, and keep shell at `/apk/os-update.json`; include package name, version, URL, SHA-256, and byte size.
- [ ] **Step 6: Permit only verified public download artifacts in Vercel output.** Continue excluding module build folders, root debug APKs, secrets, and external media.
- [ ] **Step 7: Run GREEN and build candidates.** Run the focused test, the three debug assemble tasks, `:movieroom-web:bundleRelease`, and release assemble tasks. Without external signing variables, record release outputs as unsigned candidates and publish only signature-verified APKs compatible with the existing installs.
- [ ] **Step 8: Commit.** Commit source/manifests/docs only with `feat: add verified Movie Room release artifacts`; do not commit a newly built APK until Task 7 verifies it.

### Task 6: Add unified repository, deployment, and CI verification

**Files:**
- Create: `scripts/master/verify-repository.mjs`
- Create: `scripts/master/verify-deployment.mjs`
- Create: `test/master-verification.test.js`
- Create: `test/deployment-verifier.test.js`
- Create: `.github/workflows/verify.yml`
- Modify: `package.json`

**Interfaces:**
- Consumes: blueprint exports, Gradle/module files, update manifests, optional artifact files, and an HTTP origin.
- Produces: `verifyRepository({ repoRoot }) -> Promise<CheckResult[]>`, `verifyUrl(origin, fetchImpl) -> Promise<CheckResult[]>`, and CLIs that exit nonzero on any required failure.

- [ ] **Step 1: Write failing repository checks.** Assert preserved package IDs, one HOME claimant (`com.movieroom.shell`), stable production base URL, update metadata/version agreement, ignored secrets/local config, and no tracked files under the external library.
- [ ] **Step 2: Write failing deployment checks using a temporary HTTP server.** Cover successful HTML/app/manifest/session/update/APK responses, redirect handling, non-200 failure, wrong content type, wrong artifact size/hash, and a connection timeout.
- [ ] **Step 3: Run RED.** Run both new tests; expect missing verifier modules.
- [ ] **Step 4: Implement repository and HTTP verifiers.** Keep network timeout bounded, never print response bodies containing tokens, and report each URL/check separately.
- [ ] **Step 5: Add CI.** On pushes and pull requests, use Node 22, Java 17, Android SDK 35, and the Gradle cache; run `npm ci`, `npm test`, repository verification, Fire TV unit tests, all three debug APK builds, and the unsigned Android release bundle; upload build outputs as workflow artifacts without embedding secrets.
- [ ] **Step 6: Wire package commands.** Add `master:inventory`, `master:verify`, `release:prepare`, and `deploy:verify` with the stable production origin as the default only for verification.
- [ ] **Step 7: Run GREEN.** Run the focused tests, `npm.cmd test`, `npm.cmd run master:verify`, and all Android tests/builds.
- [ ] **Step 8: Commit.** Commit with `ci: verify Movie Room master clients`.

### Task 7: Write operations, recovery, and publishing handoffs

**Files:**
- Create: `docs/architecture/movie-room-master.md`
- Create: `docs/recovery/movie-room-master-rollback.md`
- Create: `docs/publishing/movie-room-apps.md`
- Create: `docs/device-setup/movie-room-devices.md`
- Create: `test/master-documentation.test.js`
- Modify: `README.md`

**Interfaces:**
- Consumes: commands and invariants from Tasks 2-6.
- Produces: exact fresh-checkout, local-config, preview, production, rollback, Android, Fire TV, shell, Google Play, and Amazon Appstore procedures.

- [ ] **Step 1: Write failing documentation tests.** Assert every required build/verify command, the exact external library and Applications paths, all package IDs, production origin, rollback refs, and explicit user-controlled store submission steps are documented; assert no secret value from local `.env*` files appears.
- [ ] **Step 2: Run RED.** Run `node --test test/master-documentation.test.js`; expect missing documents.
- [ ] **Step 3: Write the four handoffs.** Explain that GitHub stores source, Vercel serves the web/API/APKs, OneDrive/Jellyfin supply media metadata/playback, Fire OS remains the underlying device platform, and any future Gemini/Azure integration stays server-side with no client key.
- [ ] **Step 4: Document rollback.** Include restoring the old GitHub name, resetting Vercel's Git connection to the same project, restoring the pre-conversion tag, and reinstalling the last verified same-signature APK without clearing app data.
- [ ] **Step 5: Run GREEN and secret scan.** Run the focused test and `rg` for key/token/password patterns across newly staged files; inspect matches rather than printing local values.
- [ ] **Step 6: Commit.** Commit with `docs: add Movie Room master operations guide`.

### Task 8: Verify preview, publish artifacts, and cut production over

**Files:**
- Generate locally/ignored: `inventories/local/post-conversion.json`
- Generate locally/ignored: `release/master-build-report.json`
- Publish after verification: three versioned files under `public/downloads/`
- Update after artifact validation: `public/apk/update.json`, `public/apk/firetv-update.json`, `public/apk/os-update.json`

**Interfaces:**
- Consumes: all tests/builds/verifiers and the existing linked Vercel project.
- Produces: reviewed migration branch, verified preview URL, verified versioned artifacts, and a production-ready commit.

- [ ] **Step 1: Run the complete local gate from a clean index.** Run `npm ci`, `npm test`, `npm run master:verify`, Fire TV unit tests, and all three debug builds; capture versions, hashes, and command results in the local build report.
- [ ] **Step 2: Compare preservation inventories.** Generate the post-conversion report and assert no pre-existing repository or external-library path was deleted; expected new source/build files may be added.
- [ ] **Step 3: Publish release candidates atomically.** Compare each candidate's signer certificate with the currently published/installable artifact for that package, run the publisher first with `--dry-run`, then without it, and copy versioned convenience files to the Applications folder only when the destination is absent or has the same hash.
- [ ] **Step 4: Commit the verified public artifacts and manifests.** Stage only the three current versioned APKs and their manifests; verify Git/Vercel size limits and commit with `release: prepare Movie Room master clients`.
- [ ] **Step 5: Push the migration branch and create a Vercel preview.** Use the current linked project, not a new Vercel project; record the preview URL.
- [ ] **Step 6: Verify the preview end to end.** Run the deployment verifier, visually inspect desktop/mobile PWA, verify `/api/session`, catalog/artwork, byte-range playback, service worker, and all three APK downloads; do not merge on any required failure.
- [ ] **Step 7: Perform whole-branch review.** Invoke `superpowers:requesting-code-review`; fix findings with focused tests, rerun the full gate, and confirm the diff contains no secrets or media.
- [ ] **Step 8: Merge and push `main`.** Preserve the safety refs and verify remote `main` resolves to the reviewed commit before renaming GitHub.

### Task 9: Rename GitHub, verify Vercel continuity, and test devices

**Files/External state:**
- Rename existing GitHub repository only: `Movie-Downloads` -> `Movie-Room-Master`
- Update local `origin`: `https://github.com/taylormade02471/Movie-Room-Master.git`
- Preserve existing Vercel project and `https://movie-downloads-six.vercel.app`
- Install with replacement only: `com.movieroom.web`, `com.movieroom.firetv`, `com.movieroom.shell`

**Interfaces:**
- Consumes: reviewed `main`, verified artifacts, logged-in GitHub/Vercel sessions, and ADB-authorized devices.
- Produces: renamed master repository, working production deployment, working Android/Fire TV/shell installs, and final tag `movie-room-master-v1-baseline`.

- [ ] **Step 1: Recheck cutover preconditions.** Require clean intended Git status, matching local/remote `main`, successful production checks, preserved Vercel project identity, and reachable safety refs.
- [ ] **Step 2: Rename the existing GitHub repository.** Use the authenticated GitHub repository settings; do not create/import/fork a repository. Update `origin`, run `git fetch`, `git ls-remote`, and verify both history and branches remain.
- [ ] **Step 3: Verify Vercel's Git connection.** Confirm it still points to the renamed repository and same project; if detached, reconnect that existing project. Trigger/inspect production deployment and rerun `npm run deploy:verify` against the unchanged origin.
- [ ] **Step 4: Discover devices without assuming an old IP.** Run `adb devices -l`; require status `device`. Use a connected Android phone or an Android emulator for the mobile package and the authorized Fire Stick for TV packages. If offline/unauthorized, stop for device approval without changing installed packages.
- [ ] **Step 5: Install with data-preserving replacement.** Use `adb install -r` for each applicable package. If Android reports a signing mismatch, stop and report it; do not uninstall or clear data without new explicit approval.
- [ ] **Step 6: Launch and verify Android.** Confirm portrait startup, production URL, profile/library pages, playback, update manifest, storage/download flow, Back, and fullscreen-landscape transition.
- [ ] **Step 7: Launch and verify Fire TV.** Confirm landscape catalog, D-pad Up/Down/Left/Right, Select, Back, Menu, Play/Pause, artwork, audio, details, and fullscreen playback.
- [ ] **Step 8: Launch and verify the optional shell.** Confirm it is a selectable HOME candidate, dynamically discovers installed media apps, returns Home to the signed-in profile surface, and still exposes a safe route back to Fire OS settings/recovery.
- [ ] **Step 9: Finalize.** Create tag `movie-room-master-v1-baseline`, compare deployed APK hashes with local/public/Applications copies, verify production one final time, and report any store-publishing actions that still require the user's own accounts or attestations.
