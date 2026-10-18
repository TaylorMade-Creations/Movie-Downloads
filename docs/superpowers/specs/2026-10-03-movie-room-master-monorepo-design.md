# Movie Room Master Monorepo Design

## Objective

Convert the existing GitHub-backed `Movie-Downloads` repository into the `Movie-Room-Master` repository in place. The same repository, commit history, working source, deployment relationship, and rollback history remain intact while it becomes the canonical source for the TaylorMade Movie Room website, Android app, Fire TV app, Movie Room OS shell, media automation, deployment configuration, documentation, and recovery procedures.

The existing movie and television library must remain in place at:

`C:\Users\kylet\OneDrive\Desktop\Movie downloads`

The migration must not copy, relocate, rename, delete, or commit the large video library. It must not delete current repository files either. Every application continues to build its catalog and playback references from that external library and its existing OneDrive/Jellyfin metadata.

## Success Criteria

The migration is complete only when all of the following are true:

1. The renamed master repository can install dependencies and run its automated tests from a fresh checkout.
2. The live Vercel website deploys from the renamed repository and the production URL loads successfully.
3. The Android phone/tablet application builds from the renamed repository, installs, opens, and reaches the production website and player.
4. The Fire TV application builds from the renamed repository, installs, opens, and supports D-pad navigation and playback.
5. The Movie Room OS shell builds from the renamed repository, installs, opens, and discovers installed media apps dynamically.
6. APK download and update manifests point to artifacts produced from the renamed repository.
7. The external Movie downloads library remains unchanged and is rediscovered through local configuration.
8. Secrets, signing keys, tokens, personal paths, and video files are excluded from Git.
9. A pre-conversion Git tag and safety branch preserve the exact starting commit, and the current production deployment remains available until the renamed master passes production and device verification.

## In-Place Rename and Preservation Rules

The existing repository is the master; no second source repository is created. The GitHub repository will be renamed from `Movie-Downloads` to `Movie-Room-Master` only after the migration branch passes its build and preview checks. The local checkout may be renamed to match, but it is never deleted and recloned as part of this work.

Before any structural work, the process records the current commit, remotes, branches, tags, tracked-file inventory, untracked-file inventory, and status. It then creates a pre-conversion tag and a safety branch. Existing local files, including untracked APKs and work in progress, stay in place unless the user later approves a specific move. Secrets and large media remain uncommitted; preservation does not mean publishing private material to GitHub.

The first master milestone adds orchestration, inventories, examples, and documentation around the current working layout. It does not require moving application folders. Later path cleanup is optional and must use history-preserving Git moves on a dedicated branch, with compatibility shims and passing tests before merge.

## Long-Term Logical Layout

```text
Movie-Room-Master/
├─ apps/
│  ├─ web-pwa/              Browser UI and service worker
│  ├─ android/              Phone/tablet Android wrapper and native player
│  ├─ fire-tv/              Fire TV movie application
│  └─ movie-room-shell/     Optional launcher-style Fire TV shell
├─ services/
│  ├─ server/               HTTP/API server and provider orchestration
│  ├─ catalog/              Library scanning and catalog normalization
│  ├─ jellyfin/             Jellyfin metadata, artwork, and playback provider
│  ├─ onedrive/             OneDrive catalog and streaming provider
│  └─ ai/                   Future Gemini/Azure provider boundary; no keys in clients
├─ automation/
│  ├─ media-conversion/     Safe H.264/AAC conversion and validation
│  ├─ metadata-sync/        Jellyfin sidecar synchronization
│  ├─ artwork/              Poster and backdrop synchronization
│  └─ device-install/       ADB discovery, install, launch, and verification
├─ config/
│  ├─ environment.example
│  └─ library.example.json
├─ docs/
│  ├─ architecture/
│  ├─ publishing/
│  ├─ recovery/
│  └─ device-setup/
├─ inventories/             Generated, non-secret library and artifact reports
├─ tests/
├─ build.gradle
├─ settings.gradle
├─ package.json
└─ Movie-Room-Master.code-workspace
```

This is a logical ownership map, not a requirement to relocate working files during the first milestone. Existing paths remain valid. Any later reorganization is additive or performed with history-preserving Git moves, and no compatibility path is removed until every consumer has been verified and the user approves the cleanup.

## External Media Library

The repository stores no full movies or television episodes. A local ignored file, `config/library.local.json`, provides the canonical library path. Environment variables remain supported for servers and automation:

```json
{
  "libraryRoot": "C:/Users/kylet/OneDrive/Desktop/Movie downloads",
  "applicationsRoot": "C:/Users/kylet/OneDrive/Desktop/Movie downloads/Applications"
}
```

`config/library.example.json` uses placeholders and is safe to commit. Startup validation reports a clear error when the configured library is unavailable. It never silently creates a second empty movie library in another location.

Generated inventories may contain relative media paths, titles, file sizes, codecs, conversion state, and metadata readiness. They must not contain refresh tokens, API keys, session secrets, or private share URLs.

## Master Conversion

The existing Movie Downloads repository is already the source of truth. There is no bulk copy or destructive transfer. The work happens on a dedicated migration branch inside this repository so tracked source, tests, documentation, automation, commit history, and deployment history remain together.

Generated outputs, caches, temporary runtime files, downloaded APK history, test screenshots, local environment files, secrets, and video media remain on disk where needed but are not newly committed. A generated preservation inventory records their locations and roles without exposing credentials or private share URLs.

The current default branch and production deployment stay usable throughout conversion. The migration branch becomes the default only after the full verification gate passes. The GitHub repository name and local remote are then updated without replacing the repository identity or discarding history.

## Application Boundaries

### Web and PWA

The web application retains the existing production behavior and Vercel-compatible server entry points. Static assets, API routes, authentication, provider selection, artwork, playback resolution, casting, and PWA installation continue to be built from one deployment.

### Android

The Android phone/tablet application keeps its package identity unless a store publication requirement forces a deliberate change. It loads the production Movie Room origin, supports portrait startup, uses the native player for playback, and consumes update metadata produced by the master repository.

### Fire TV

The Fire TV application keeps its independent package identity, landscape layout, remote focus model, and native player. It consumes the same production catalog API while preserving Fire TV-specific navigation and device token behavior.

### Movie Room OS Shell

The shell remains a separate optional APK. It discovers installed media applications dynamically, displays profile-aware widgets, and launches Movie Room and third-party services. Fire OS remains installed underneath for boot, Wi-Fi, storage, DRM, settings, recovery, and app management.

## Backend and Provider Design

One server API serves all clients. Provider adapters supply catalog, metadata, artwork, and playback data without exposing provider credentials to browsers or APKs.

Existing OneDrive and Jellyfin integrations move into explicit provider modules. A future `services/ai` boundary supports Gemini or Azure through server-side routes only. No AI key is embedded in the web bundle or Android packages.

The client contract remains stable during migration. Provider modules may be reorganized internally only after compatibility tests prove identical API responses.

## Secrets and Signing

The master repository commits only environment-variable names and setup instructions. The following remain external and ignored:

- OneDrive client credentials and refresh tokens
- Jellyfin API keys
- Session and rate-limit secrets
- Vercel project tokens and linked environment files
- Gemini and Azure credentials
- Android upload keystores and passwords
- Amazon developer credentials
- Local absolute library configuration

Release signing is added through environment-backed Gradle configuration. Debug builds continue to work without production signing material. Existing sideloaded APKs are not replaced by a differently signed release until the update path has been tested.

## Deployment Continuity

The current production deployment remains active while the master conversion branch is prepared. Deployment proceeds without moving to a second source repository:

1. Create and verify a Vercel preview from the migration branch in the current repository.
2. Merge only after preview, API, PWA, and device checks pass.
3. Rename the GitHub repository to `Movie-Room-Master`, update the local `origin` URL, and verify the Vercel Git connection still points to the same repository identity.
4. If Vercel does not follow the rename automatically, relink the existing Vercel project rather than creating a replacement production project.

The production domain, Vercel project, deployment history, and public APK URLs remain stable. The conversion must not require users to change bookmarks or reinstall the PWA solely because the GitHub repository was renamed.

## APK and Update Artifacts

The repository produces three independent Android artifacts:

- Android phone/tablet application
- Fire TV movie application
- Movie Room OS shell

Each artifact has its own application ID, version code, version name, changelog, and update manifest. Published files are generated by release tasks rather than copied manually from arbitrary debug folders. The Applications folder may receive a verified convenience copy after each release.

## Error Handling and Rollback

- Missing local media produces a clear configuration error and does not mutate the library.
- Missing provider credentials disable that provider without exposing secret values.
- Failed Android builds leave the previous verified APK untouched.
- Failed Vercel preview verification prevents merging or renaming the repository.
- Failed device installation does not uninstall the previous package unless a signing mismatch requires an explicit user-approved migration.
- The pre-conversion tag, safety branch, and production deployment remain available until all acceptance checks pass.

## Verification

Verification covers the complete system rather than isolated builds:

1. Run Node and Android test suites.
2. Build production web output.
3. Build debug and release-candidate APK/AAB artifacts.
4. Compare pre-conversion and post-conversion file inventories, and verify no repository or media-library file was deleted.
5. Verify external-library catalog discovery without modifying media.
6. Deploy and inspect a Vercel preview.
7. Test production API health, artwork, range streaming, and PWA assets.
8. Install and launch Android on a phone or emulator.
9. Install and launch Fire TV and shell packages on the verified Fire Stick.
10. Verify D-pad, Select, Back, Menu, and Play/Pause behavior.
11. Confirm APK update manifests and download URLs return the expected signed files.
12. Rename GitHub and verify Git, Vercel, production, APK updates, and device installs again before declaring the master conversion complete.

## Publishing Scope

The master repository prepares release artifacts and documentation for Google Play and Amazon Appstore. Actual account enrollment, legal attestations, payment-profile setup, signing-key acceptance, store declarations, and final submission remain user-controlled actions.

The first migration milestone is operational parity, not public store release. Store publication follows after the combined repository is stable and the user confirms the final application names, package identities, privacy policy, and media-rights disclosures.
