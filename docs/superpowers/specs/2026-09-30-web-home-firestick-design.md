# Movie Room Web Home for Firestick

## Goal

Make the existing Movie Room website the single user-facing Firestick
experience. The installed Android wrapper will be the selectable Movie Room
Home app and will present the same hero, shelves, profiles, library, genres,
settings, movie detail pages, and player that users see in the web app.

## Problem

The repository currently contains three different Fire TV-facing packages:

1. `com.movieroom.shell` owns the Android HOME role but contains a separate
   native launcher UI with placeholder shelves.
2. `com.movieroom.firetv` contains the native Jellyfin-backed library and
   player, but its screens do not match the website and it has its own pairing
   and navigation flow.
3. `com.movieroom.web` wraps the current website, but it is not the HOME app
   and contains a custom remote-command bridge that competes with WebView's
   normal focus behavior.

This split is the root cause of the user seeing different applications,
missing controls, and inconsistent navigation.

## Approved architecture

`com.movieroom.web` becomes the canonical Firestick package:

- Add `HOME` and `LEANBACK_LAUNCHER` to its existing launcher intent filter.
- Keep the website as the only rendered Movie Room UI.
- Open the deployed Movie Room web app directly at startup.
- Preserve the website's existing public library, hero, profile, genre,
  settings, details, playback, artwork, and update flows.
- Keep portrait behavior for phones and landscape behavior for Firestick;
  video fullscreen may still use the existing fullscreen orientation bridge.

The native shell and native player packages remain in the source tree as
fallback/technical packages during the first rollout, but neither advertises
itself as the Movie Room HOME app. Existing installed packages are not
uninstalled automatically.

## Remote-control behavior

The Firestick app will not display an on-screen remote bar or run a second
custom geometry-based remote controller.

- Remove Java directional interception from the WebView wrapper.
- Remove the website's custom arrow-key command dispatcher and duplicate
  select/menu/media interception.
- Let Android WebView and the browser's native focus model move between
  semantic buttons, links, inputs, and movie cards.
- Keep visible focus styling and a deterministic DOM order so the Fire TV
  remote can use its native Up, Down, Left, Right, Select, Back, Menu, and
  playback keys.
- Back must remain a page-level navigation action inside Movie Room before it
  can leave the app.

This design intentionally favors one standard focus path over several
competing remote abstractions. If focus needs refinement, the fix belongs in
HTML order, `tabindex`, focus styling, or accessible labels—not another remote
command protocol.

## Website-to-TV presentation

The website remains the visual source of truth:

- Startup opens on the trending hero rather than Search or a native shell.
- The hero backdrop/video remains visible until the viewer moves into the
  library.
- Movie shelves use compact, spaced poster cards with rounded corners.
- Profiles open the existing profile page and retain separate navigation state
  for Home, Mom, Morganne, and Kids.
- Library, Genres, and Settings remain page destinations rather than native
  dialogs owned by another APK.
- Selecting a movie opens the existing movie detail page and uses the selected
  title's backdrop/preview and player actions.

## Data and security boundaries

The wrapper continues to load the public Movie Room origin configured through
`BuildConfig.MOVIE_ROOM_BASE_URL`. It does not embed Jellyfin, OneDrive,
pairing, or Vercel credentials. Storage permissions, offline downloads,
network update checks, and the existing Android settings bridges remain
available to the website where already implemented.

## Rollout and safety

1. Add regression tests proving the web package is the only HOME package in
   source and that custom remote interception is absent.
2. Implement the manifest and WebView changes.
3. Run the Node suite and Android unit/build tasks.
4. Review the generated APK and only then offer installation on the Firestick.
5. Keep Amazon's launcher available as the recovery/default-home fallback.

This is an application-layer launcher change. It does not flash, replace, or
modify Fire OS firmware or the Firestick bootloader.
