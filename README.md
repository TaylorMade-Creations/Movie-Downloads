# Movie-Downloads

A lightweight browser app for browsing and streaming a shared movie library behind one shared password.

## Project workflow source of truth

The project-owned repository control point is [`movie-workflow-blueprint/`](movie-workflow-blueprint/). Its [`manifest.json`](movie-workflow-blueprint/manifest.json) names the authoritative `main` branch, OneDrive Movie downloads root, provider boundary, watcher/sync commands, deployment, and verification gates; [`control.mjs`](movie-workflow-blueprint/control.mjs) exposes those values to project tooling. All Codex, GPT, plugin, and skill work for this app should reference the TaylorMade Movies repository rather than creating a parallel project. Secrets are intentionally excluded.

## What changed

- Password-protected catalog access with signed HttpOnly sessions
- Recursive movie discovery for local files and OneDrive-backed libraries
- Server-issued playback links so the browser can stream directly from the configured provider
- Multiple viewers can start the same title concurrently; only duplicate in-flight link lookups are coalesced, while each browser keeps its own media connection
- Google Cast device selection on Android and desktop Chrome using Google Home device names
- Opaque, time-limited Cast playback tickets so TVs never receive the browser session cookie
- Safari AirPlay support remains available for iPhone and iPad
- YouTube-style responsive thumbnails, compact cleaned titles, and local Home, Family, and Guest viewer profiles
- Poster cards prefer artwork synchronized from Jellyfin, then verified bundled artwork, and use a clean TaylorMade fallback instead of a OneDrive scene frame; video frames remain available only as wide hero/backdrop fallbacks
- A prominent Full Screen action that disappears after the video enters full-screen mode
- Fire TV playback sets the Android keep-screen-on flag until you return to the library, preventing the TV screensaver during a movie
- Vercel-compatible request handling with durable KV-backed sessions, throttling, and token persistence

## Supported providers

### Local provider

Use this for local development with sample files in `movies/`.

```bash
MOVIE_PROVIDER=local
MOVIE_PASSWORD=yourpassword
SESSION_SECRET=replace-with-a-long-random-secret
npm start
```

Supported movie files are discovered recursively inside `movies/`.

### OneDrive provider

Use this for Vercel hosting after you have:

1. A Microsoft app registration with delegated read access for the target OneDrive account
2. A refresh token for that app/account
3. The target `driveId` and root folder `itemId`
4. Vercel Marketplace Upstash Redis credentials so sessions, login throttling, and rotated refresh tokens persist across Vercel function instances

Copy `.env.example` to a local `.env` file or configure the same values in Vercel:

- `MOVIE_PROVIDER`
- `APP_ORIGIN`
- `TRUST_PROXY`
- `MOVIE_PASSWORD`
- `SESSION_SECRET`
- `SESSION_TTL_MS`
- `CAST_PLAYBACK_TTL_MS` (optional; defaults to six hours and is capped by the signed-in session)
- `AUTH_RATE_LIMIT_WINDOW_MS`
- `AUTH_RATE_LIMIT_MAX_ATTEMPTS`
- `ONEDRIVE_CLIENT_ID`
- `ONEDRIVE_CLIENT_SECRET`
- `ONEDRIVE_PUBLIC_CLIENT`
- `ONEDRIVE_REDIRECT_URI`
- `ONEDRIVE_REFRESH_TOKEN`
- `ONEDRIVE_DRIVE_ID`
- `ONEDRIVE_ROOT_ITEM_ID`
- `ONEDRIVE_LIBRARY_REFRESH_TIMEOUT_MS` (optional; defaults to 15 seconds and bounds a Graph catalog refresh)
- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`

Set `ONEDRIVE_PUBLIC_CLIENT=true` only when your Microsoft app registration is configured as a public client and does not require a client secret for refresh-token exchange. `ONEDRIVE_REDIRECT_URI` is used to match the Microsoft app registration during refresh-token exchange; this app does not implement an in-repo OAuth callback flow yet.

The app never exposes the shared password, session secret, or OneDrive credentials to the browser.
The first-run permissions button does not open a broad Bluetooth chooser. Google Cast and AirPlay discover TVs over the local Wi-Fi network. Cast playback tickets are stored in the configured durable KV store and contain no movie name or login cookie.

### Jellyfin backend with the Movie Room front end

Jellyfin can stay on the Windows computer as the library, metadata, artwork, and media backend while the Movie Room web app remains the only front end shown to viewers. The Fire TV APK is also the Movie Room front end; do not install the Jellyfin app on the TV for this setup.

1. In Jellyfin, open Dashboard → API Keys and create a server API key for Movie Room. Keep that key private.
2. Add these values to a local `.env` file (or export them only in the Movie Room server's process):

   ```text
   MOVIE_PROVIDER=jellyfin
   JELLYFIN_URL=http://127.0.0.1:8096
   JELLYFIN_API_KEY=your-local-jellyfin-api-key
   JELLYFIN_LIBRARY_ID=
   # optional: pin the Jellyfin user used for compatibility playback
   JELLYFIN_USER_ID=
   MOVIE_PASSWORD=yourpassword
   SESSION_SECRET=replace-with-a-long-random-secret
   APP_ORIGIN=http://192.168.1.169:3000
   ```

   `JELLYFIN_API_KEY` is server-only. Do not commit it, put it in the APK, or paste it into chat.
3. Start Movie Room with `npm start` and open it at `http://localhost:3000` on the Windows computer. The app's `/api/movies`, artwork, and playback routes will read through Jellyfin; the browser never receives the Jellyfin key.
4. To use the same Movie Room front end on a Fire TV over the home network, build the APK with the computer's LAN URL:

   ```powershell
   .\gradlew.bat :firetv:assembleDebug -PmovieRoomBaseUrl=http://192.168.1.169:3000
   ```

   Replace the address with the computer's current private LAN address. The Windows computer and Fire TV must remain on the same network, and Movie Room must be running while the TV is watching. The default APK URL remains the hosted OneDrive deployment.

Vercel cannot reach `127.0.0.1` on the Windows computer. Keep the hosted deployment on OneDrive, or use a deliberately secured VPN/reverse proxy if Jellyfin must be reached remotely; never expose Jellyfin's admin/API port directly to the public Internet.

### Jellyfin metadata with OneDrive cloud playback

Set `MOVIE_PROVIDER=hybrid` to use Jellyfin for titles, seasons, posters, descriptions, ratings, and organization while resolving playback from the matching OneDrive file. Configure both the `JELLYFIN_*` and `ONEDRIVE_*` values shown above. Movie Room keeps Jellyfin item IDs for viewer history and UI state, matches them to OneDrive by the underlying filename, proxies artwork from Jellyfin, and returns a fresh OneDrive playback URL when a movie is selected. For AVI, MKV, MOV, WMV, and TS entries, the local hybrid app automatically routes playback through Jellyfin's H.264/AAC compatibility stream so browsers and Fire TV can decode the audio and video; direct MP4 playback remains cloud-backed. Set `JELLYFIN_REQUEST_TIMEOUT_MS` (1,000–120,000 ms, default 30,000) if a large Jellyfin library needs more time to answer its catalog request.

The six-hour watcher also bounds its background work: `SYNC_JELLYFIN_TIMEOUT_MS` controls the Jellyfin metadata request (5,000–120,000 ms, default 60,000), and `MOVIE_ARTWORK_FETCH_TIMEOUT_MS` controls each remote artwork lookup (3,000–60,000 ms, default 15,000). A timeout preserves existing sidecars/artwork and lets the scheduled run finish instead of waiting indefinitely on an online-only OneDrive placeholder or an unavailable metadata service. The unattended path creates missing sidecars/artwork without opening existing cloud-only files; use `--force` on `scripts/sync-jellyfin-metadata.mjs` or `scripts/sync-jellyfin-artwork.mjs` for an intentional full refresh when the source files are available locally.

The player also includes a shared accessible timeline (`#timeline`) tied to the media element's metadata, time updates, and seek events. It supplements device-specific native controls, so desktop Chrome, mobile browsers, Safari, and Fire TV have the same seek surface when the selected source exposes a duration.

To keep matching metadata beside the locally synced OneDrive files, run `npm run metadata:sync` after a Jellyfin scan. It writes generated `*.jellyfin.json` sidecars next to matching video files, so OneDrive can sync the metadata without copying media into Jellyfin. Run `npm run artwork:sync` to place validated portrait posters and landscape backdrops beside each movie and in the deployable web bundle. The installed Windows library task runs every six hours. Metadata refresh requires a current local `JELLYFIN_API_KEY`; a 401 means the key needs to be refreshed in the private local environment file. Artwork sync can still reuse existing sidecars and retry locally accessible Jellyfin artwork without the stale key.

For a one-time cloud export of the already-synchronized library, run `npm run metadata:export:onedrive`. This uploads each Jellyfin sidecar and the matching poster, folder, thumb, and backdrop files from the configured `Movie downloads` root into the corresponding OneDrive folders. The export is idempotent and only replaces files with the same name; it does not upload or delete video media. The Microsoft app registration must have delegated `Files.ReadWrite` consent. The six-hour Windows library task also marks only `Movies` and `TV Shows` online-only after each sync, so new sidecars and artwork remain cloud-backed without pinning the application or recovery folders.

When those sidecars are synchronized into OneDrive, the hosted OneDrive provider reads them as Jellyfin metadata. This lets the live Movie Room show Jellyfin titles, dates, descriptions, ratings, genres, and series fields without requiring Vercel to reach the Windows Jellyfin server.

The hosted provider is cache-first: when a complete persisted catalog exists, `/api/library` returns it immediately and coalesces a bounded background refresh. New uploads appear after that refresh updates the durable cache; a failed or timed-out refresh keeps the last complete catalog available instead of holding the page in `Loading library`.

## Canonical home library

The supported local library root is the user's OneDrive Desktop folder:

`C:\Users\kylet\OneDrive\Desktop\Movie downloads`

Set `MOVIE_LIBRARY_ROOT` to that folder for local or hybrid startup. The scanner recursively reads every supported video below it, including `Movies`, `TV Shows`, `Northern Exposure`, and `Jackass`, while ignoring non-video application files. Series are returned as grouped entries with season and episode counts; the individual episode files remain in their existing folders and are not copied into the repository.

Installable application artifacts belong in the root's `Applications` folder. The movie folders remain the only media source of truth.

This mode does not copy media into Jellyfin. Jellyfin must be reachable by the Movie Room server for catalog and artwork requests. A Vercel deployment cannot use a Jellyfin URL on `127.0.0.1`; use hybrid mode on the Windows-hosted Movie Room server unless Jellyfin is available through a deliberately secured private network path.

## Private Fire TV app

The private Fire TV app lives in `firetv/`. It is for sideloading onto the owner's Fire TV devices and is not an Amazon Appstore submission. Its launcher banner is the black-and-gold `TaylorMade Movies` cover artwork.

Build a debug APK:

```powershell
.\gradlew.bat :firetv:assembleDebug
```

The APK is created under `firetv/build/outputs/apk/debug/`.

The TV stores its approved device token in encrypted private app storage, so normal app restarts and Fire TV reboots do not require another password or pairing code. The server accepts that device registration for up to one year. Choosing Unpair, clearing app data, uninstalling the app, or letting the registration expire requires pairing again.

Pairing flow:

1. Open the Fire TV app.
2. Keep the pairing code visible on the TV.
3. Open Movie Room in the browser and sign in.
4. Choose Pair Fire TV.
5. Enter the code shown on the TV.
6. Return to the Fire TV app and choose a movie.

Private install requires Fire TV developer options and ADB approval on the TV. Do not put Movie Room passwords, OneDrive secrets, or Vercel secrets into the APK.

To install or update the APK over the same Wi-Fi network, enable ADB debugging on the Fire TV, find its IP address under Network settings, approve the TV's ADB prompt, and run:

```powershell
.\scripts\install-firetv.ps1 -DeviceIp 192.168.1.50
```

This sideloads the private app; it does not replace or "flash" Fire OS firmware. The same APK can be installed on another Fire Stick by running the command with that device's IP address and pairing that installation once.

## Getting started

Use Node.js 22.9 or newer. `npm start` loads `.env` and then the ignored `.env.local` override when either exists, and otherwise uses the current process environment.

1. Put movie files such as `.mp4`, `.m4v`, `.mov`, `.webm`, `.ogg`, or `.mkv` into the project’s `movies/` folder for local development.
2. Configure the required environment variables.
3. Start the app:

   ```bash
   npm start
   ```

4. Open `http://localhost:3000`

## Vercel deployment

- Vercel serves the static UI from `public/`
- The catch-all Node handler lives at `api/[...path].js`
- No custom `vercel.json` routing is required for this layout: static assets stay at the site root and API requests go through `/api/*`
- Set `APP_ORIGIN` to the exact deployed site origin for CSRF checks
- `TRUST_PROXY=true` is an optional override for non-Vercel trusted-proxy deployments; Vercel is auto-detected
- Configure both `KV_REST_API_URL` and `KV_REST_API_TOKEN`; Vercel Marketplace Upstash supplies them automatically. Standalone Upstash `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` aliases also remain supported. Vercel authentication fails closed without durable shared storage
- Protected API responses use `Cache-Control: private, no-store`
- For production, configure the environment variables in Vercel before testing

## Commands

- `npm run artwork:sync` - synchronize Jellyfin-first poster and backdrop artwork into movie folders and the web bundle

- `npm start` — start the app locally
- `npm test` — run the test suite

The `npm run posters -- --site` command downloads artwork for titles currently listed by the live site when `APP_ORIGIN` and `MOVIE_PASSWORD` are available in the environment.

## Remaining owner setup

This repository now includes the app-side OneDrive integration points, but the deployment still needs private setup values that are intentionally not stored in Git:

- The real shared password in `MOVIE_PASSWORD`
- A randomly generated `SESSION_SECRET` of at least 32 UTF-8 bytes
- A Microsoft app registration and refresh token
- The correct `ONEDRIVE_DRIVE_ID` and `ONEDRIVE_ROOT_ITEM_ID`
- Vercel Marketplace Upstash Redis REST credentials for required Vercel session/throttle/token storage

If those values are missing, protected routes fail closed instead of allowing anonymous access.
