# Movie Room Shell OS and Web App Design

## Goal

Keep the native Movie Room shell as the Firestick OS/Home layer, while using
the existing website-wrapping APK as the normal Movie Room library and player
app. The shell owns OS-level remote controls; the app owns the web interface.

## Approved architecture

The Firestick experience has two deliberately separate layers:

1. `com.movieroom.shell` remains the Android `HOME`/`LEANBACK_LAUNCHER`
   package. Its native focus graph, profiles, genres, system settings, network
   pages, Menu handling, Back handling, and launcher controls are the Movie
   Room OS.
2. `com.movieroom.web` remains a normal `LAUNCHER`/`LEANBACK_LAUNCHER` app. It
   loads the deployed Movie Room website and is opened by the shell when the
   user selects Library, Search, or Open Movie Room.
3. `com.movieroom.firetv` remains a separate native player/fallback package.
   It does not advertise the `HOME` role and is not used as the OS surface.

The shell does not inject remote commands into the web app. Once the web app is
foregrounded, Android/WebView receives ordinary remote input and the website
uses its normal semantic focus order. Pressing Back inside the website returns
through its page stack; pressing Back from the website Home returns to the
native shell.

## Shell OS behavior

- Keep the shell's native focus rows and high-contrast focused controls.
- Keep native Home, Profiles, Genres, Settings, Wi-Fi, storage, display,
  developer, and network destinations.
- Route Library, Search, and the hero's Open Movie Room action to
  `com.movieroom.web`, not the native player package.
- Keep the shell's Menu, Back, and media-key behavior limited to the shell
  activity itself.
- Keep Amazon's launcher as a fallback. Do not uninstall packages or flash Fire
  OS firmware.

## Web app interface

The website remains the visual source of truth for the library app:

- The hero/trending page remains the startup page.
- The search field gets its own full-width header row, separate from navigation
  buttons so the menu controls do not shrink.
- Menu opens a dedicated page/panel with semantic tabs for Browse, Profiles,
  and Settings. Each tab exposes its own selectable dropdown-style group of
  destinations.
- Home, Library, Collections, Genres, profiles, Settings, movie details, and
  playback remain page-level destinations.
- Existing focus-visible styles remain prominent for a TV remote.
- No remote-control bar, custom geometry focus algorithm, JavaScript arrow-key
  dispatcher, or duplicate Java command bridge is added to the app.

## Back and focus contract

- `MovieRoomBack` returns `true` while the website has an inner page, details
  screen, search panel, settings page, or player page to close.
- It returns `false` on the website Home page so the Android wrapper can finish
  and reveal the native shell.
- The WebView is focusable and allows descendant focus. The wrapper does not
  consume DPAD, select, Menu, or media events before WebView receives them.

## Data and security boundaries

The wrapper continues to load `BuildConfig.MOVIE_ROOM_BASE_URL` and preserves
the existing storage, offline-download, network-update, fullscreen, and Android
settings bridges. No Jellyfin, OneDrive, pairing, Vercel, or Movie Room secret
is embedded in the shell or wrapper.

## Acceptance criteria

- Only `com.movieroom.shell` advertises the Android HOME role.
- Selecting Library/Search/Open Movie Room from the shell launches
  `com.movieroom.web`.
- The web app renders a full-width search row and a tabbed Menu page.
- WebView receives ordinary remote focus events without custom interception.
- Back closes web pages first and returns to the shell from web Home.
- Node tests and both shell/web Android builds pass.
