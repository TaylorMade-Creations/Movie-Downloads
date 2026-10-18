# Movie Room Profile-Gated Crossbar OS Design

## Goal

Turn Movie Room into a profile-first TV shell and matching library experience:
the native Fire OS shell performs first-run setup, profile selection, privacy
policy, app rotation, and device settings; the web, Android, and Fire TV
library clients use the same profile/account rules; and the existing full
library remains available to an unlocked Home profile while protected profiles
require their own PIN.

The shell is installed as an optional Fire OS HOME candidate. Amazon's
launcher remains available as the fallback and no Fire OS firmware is flashed
or replaced.

## Scope and vocabulary

- **Shell** means `com.movieroom.shell`, the native Fire TV/Android TV OS
  surface.
- **Library clients** mean the deployed web app, the Android website-wrapper
  APK, and the Fire TV APK/player surface.
- **Profile** means a named viewer record with an avatar, theme color, app
  selection, library preferences, watch state, and optional PIN protection.
- **Bootstrap** means the first-run device setup that must be completed before
  the shell leaves preview mode.
- **Preview mode** means the shell can show only a small server-provided set of
  most-watched and trending titles. It must not expose the full catalog.
- **Library mode** means a profile has been created or selected and the server
  has granted the profile's full catalog scope.

## Approved access behavior

### Native shell first run

On first launch, the shell shows a setup gate rather than the full home page.
The D-pad flow is:

1. Choose or create a profile.
2. Choose the profile name, avatar, and accent color.
3. Leave Home unlocked by default or assign optional PINs to Mom, Morganne,
   Kids, or additional profiles.
4. Choose which installed apps appear on that profile's home and their shelf
   rotation/order.
5. Confirm the setup.

Until confirmation, the shell exposes settings and the limited preview catalog
only. The user can restart the wizard from Settings > Reset Movie Room OS.

After confirmation, Home opens without a PIN and can show the complete Home
library. Selecting a protected profile presents a native numeric PIN screen
before showing that profile's full library and saved settings.

### Web, Android, and Fire TV clients

The library clients do not show preview tiles before their first online setup.
They show a setup/login gate instead. After the first successful online login,
the client creates or selects the Home profile, remembers the session safely,
and loads the full Home library. A protected profile must be unlocked before
its full catalog, app list, and watch state are shown.

The web client and both APKs use the same server access states:

- `needs_setup`: no profile/session exists; show setup/login only.
- `logged_out`: a prior session was cleared or expired; show login only.
- `home_unlocked`: the remembered Home profile may load the full Home catalog.
- `profile_locked`: a profile exists but requires its PIN.
- `profile_unlocked`: the selected profile may load its full catalog and state.

The UI must not treat a hidden full-library shelf as a security boundary. The
server/API enforces preview versus profile catalog scope, so direct requests
cannot bypass the gate.

### Profiles and account creation

Profile creation is intentionally simple and does not require a public-facing
username. A profile has a display name, avatar, color, optional PIN, selected
apps, shelf preferences, and viewer state. The online account/session layer
owns the profile records needed to sync the web and APK clients; the shell
keeps a device-local bootstrap record and a remembered active profile.

Users may edit their name, avatar, color, PIN, app visibility, and shelf order
from Profile Settings. Resetting the device removes the local bootstrap and
remembered session; it does not delete the online account or media library.

## Shell visual and navigation architecture

### Profile chooser

The first screen is an Xbox-like profile chooser:

- Large centered circular avatar for the focused profile.
- Smaller adjacent circular avatars arranged on a horizontal carousel.
- Gold/ivory focus ring and a scale increase for the focused avatar.
- Profile name and PIN status beside or below the focused avatar.
- Select opens the profile or PIN entry; Menu opens system settings; Back
  returns to the shell's safe root without exposing the full library.

The carousel is visually circular but uses a deterministic finite focus model:
Left and Right select adjacent profiles; Up and Down move between the carousel,
setup actions, and footer actions. No Android geometric focus search is relied
on for the primary path.

### Profile home

After selection, the home page shows one profile only. The layout is a
Roku-like landscape home with:

- A compact left navigation column for Home, Apps, Library, Genres, Downloads,
  and Profile Settings.
- A right content region with Continue Watching/Recently Watched at the top,
  Newly Added beneath it, and Trending/curated rows below.
- Small landscape movie cards suitable for 1080p television viewing.
- Poster/title fallback while artwork or a preview is loading.
- A focused title preview that autoplays only for the focused card and stops
  when focus leaves it.
- A full-page movie detail state rather than a modal dialog.

Home, phone, and desktop layouts share the same profile/library data but use
separate responsive layouts. Phone startup remains portrait; only fullscreen
video requests landscape.

### Settings carousel

System settings use a second circular category carousel. Categories include:

- Profile & privacy
- Apps & home layout
- Network & internet
- Storage & media
- Display & sound
- Remote & HDMI-CEC
- About & updates
- Reset Movie Room OS

Each category opens an Android-style settings page with a left list and a
right detail panel. OS-only options such as app rotation, app visibility, home
shelf order, startup behavior, and installed-app discovery stay in the native
shell. Library/profile preferences are also exposed in the web and APK clients
where they make sense.

## Data and security boundaries

The system separates device state, account state, and catalog entitlement:

### Device bootstrap state

The shell stores a local record containing:

- bootstrap completion;
- device/profile identifier;
- active profile identifier;
- selected app package names and shelf order;
- shell appearance and accessibility preferences;
- a non-secret server device/session reference when online.

The shell must not store server API keys, Jellyfin credentials, OneDrive
tokens, or plaintext PINs. PIN verification uses a salted one-way hash and a
bounded retry policy. A reset removes the local record and returns to setup.

### Server account/profile state

The server stores profile identity, PIN verification material, theme/app
preferences that need cross-device sync, viewer state, and future catalog
entitlements. The server returns only the catalog scope granted to the current
session/profile.

The existing public preview surface may remain small and anonymous for the
native shell. Full-library endpoints require a valid profile session. The
Android and Fire TV clients receive no full catalog before their setup/login
state is complete.

### Future free and paid catalog

Titles gain an entitlement classification without changing the profile UI:

- `free`
- `paid`
- `profile_only`
- `unavailable`

For the initial implementation, current library titles remain available to an
unlocked Home profile. Paid access, purchase/subscription handling, and payment
providers are explicitly out of scope for this phase.

## Cross-platform synchronization

The shell is the authority for first-run OS configuration on Fire TV. The
native shell communicates bootstrap completion and the active profile to the
same-device APK through a protected native handoff or equivalent signed local
state. The APK must refuse to display the library when that handoff is absent
and must fall back to the online setup flow when the device is not yet paired.

The browser/PWA cannot read Android private storage, so it maintains its own
online profile session. It follows the same server access states and profile
rules rather than pretending to share native storage.

Profile changes are written locally first and synchronized online when
connected. If the network is unavailable, the shell may show the configured
Home profile and cached metadata but must not broaden catalog scope beyond the
last granted profile session.

## Remote contract

All native remote inputs normalize to logical actions in one mapper:

`UP`, `DOWN`, `LEFT`, `RIGHT`, `SELECT`, `BACK`, `MENU`, `PLAY_PAUSE`,
`REWIND`, `FAST_FORWARD`, `PAGE_UP`, `PAGE_DOWN`, `INFO`, and `RESET` where
the device supplies them.

Select aliases include DPAD_CENTER, ENTER, NUMPAD_ENTER, and BUTTON_A. Back
aliases include BACK, ESCAPE, and BUTTON_B. HDMI-CEC, Fire voice remotes, and
ordinary Android remotes are verified through the same logical action layer.

Back unwinds PIN/setup/settings/profile/movie states before leaving the shell
root. Home and voice/Alexa buttons remain system-owned. Long-press and repeat
events are throttled so slow Fire TV sticks do not skip profiles or shelves.

## Reset and failure behavior

- Reset Movie Room OS clears only local bootstrap/session/profile layout state;
  it does not delete online profiles or media.
- A forgotten profile PIN can be reset by the Home/admin profile after online
  verification; the implementation must not provide a universal bypass PIN.
- If the server is unavailable during first setup, the shell remains in setup
  or preview mode and does not unlock the full catalog.
- If an installed app is removed, the profile's app slot is marked unavailable
  and can be repaired from Apps & home layout.
- If artwork or preview video fails, the title card remains usable and the
  focus model continues without blocking on media loading.

## Non-goals

- Flashing or replacing Fire OS firmware.
- Uninstalling Amazon, Netflix, Prime Video, or other installed packages.
- Building payments or paid entitlements in this phase.
- Storing passwords or media-provider credentials in APKs.
- Making the web app depend on Android-only local storage.

## Acceptance criteria

- A fresh shell install opens the profile/bootstrap chooser and exposes only
  the curated preview catalog until setup is complete.
- Home can be completed without a PIN and then opens the full Home library.
- Mom, Morganne, Kids, and user-created profiles can each have an optional PIN.
- The Android APK, Fire TV APK, and web app show a setup/login gate rather than
  previews before their first online setup; after Home login they show the full
  Home library.
- Profile name, avatar, color, selected apps, shelf order, and watch state are
  profile-scoped and persist according to the online/offline rules.
- The shell settings carousel exposes Android-style device categories and a
  working Reset Movie Room OS action.
- The profile carousel, settings carousel, left menu, shelves, PIN entry, Back,
  Select, Menu, Play/Pause, and common HDMI-CEC aliases work with a real Fire
  Stick remote path.
- Full-library API responses are unavailable without a valid granted profile
  session; hiding cards in the client alone is not accepted.
- The updated shell APK is built, installed on the Fire Stick, and verified as
  an optional HOME candidate without forcibly replacing Amazon's launcher.
