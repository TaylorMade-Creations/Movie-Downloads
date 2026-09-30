# Movie Room OS Design

## Goal

Create an original, bootable Android-based Movie Room OS prototype that makes Movie Room the TV-style home experience while preserving Android recovery and system controls underneath it.

## Scope

The first milestone targets an AOSP x86_64 emulator. It will provide a reproducible product configuration, a Movie Room home component contract, and a safe path to boot and test the shell. It will not flash the Fire Stick, replace Fire OS firmware, include Amazon proprietary components, or claim Fire TV hardware compatibility.

## Architecture

The system is layered:

1. AOSP supplies the Android framework, emulator target, system services, recovery, and verified-boot development environment.
2. The Movie Room shell is the default HOME/LEANBACK launcher. The existing Movie Room Android client supplies remote-first navigation, pairing, library browsing, and Media3 playback.
3. The existing Movie Room web application remains the service-facing experience for search, profiles, favorites, watch history, and PWA installation. The native shell and web app communicate through the existing authenticated TV APIs rather than embedding provider secrets in the image.
4. A product overlay sets Movie Room metadata and the default home component. Recovery and Android Settings remain reachable through an explicit development escape path.

## First milestone acceptance criteria

- An AOSP product scaffold exists under `movie-room-os/device/movieroom/emulator`.
- The scaffold declares an x86_64 emulator product named `movieroom_x86_64`.
- The product identifies itself as Movie Room OS and selects the Movie Room home component.
- A validation test catches missing product files, incorrect home metadata, and accidental Amazon package/branding references.
- Build instructions state the Linux/AOSP prerequisites and clearly label the Fire Stick as unsupported until its bootloader and vendor support are independently verified.

## Security and safety

- No OneDrive, Jellyfin, Movie Room password, pairing secret, or Vercel secret is stored in an image or source overlay.
- The Fire Stick remains untouched by this milestone.
- Development images may use AOSP emulator signing; production hardware images require a separately documented key-management and recovery plan.
- The product must not present itself as Amazon Fire OS or use Amazon assets.

## Later milestones

- Add a dedicated Movie Room launcher module to the AOSP source tree.
- Boot the product in the Android Emulator and verify HOME, remote/keyboard focus, audio, video, and network pairing.
- Port to an unlockable, documented ARM64 development board.
- Only then audit whether any Fire TV model can support a custom image without bypassing security controls or losing vendor drivers/DRM.
