# Movie Room OS prototype

This directory is the first bootable-system milestone for Movie Room. It contains an original AOSP product scaffold for an x86_64 Android Emulator target. It is not a Fire Stick firmware image and must not be flashed to the Fire Stick.

## Required build environment

Build AOSP on a supported 64-bit Linux environment. The current Windows machine does not have WSL installed, so the source checkout and image build have not been run here yet. Install/configure Linux first, then obtain AOSP using the official Android source instructions.

From the root of an AOSP checkout, copy or link this product directory into `device/movieroom/emulator`, add the Movie Room launcher module, then run:

```bash
source build/envsetup.sh
lunch movieroom_x86_64-userdebug
m -j$(nproc)                   # full development image
emulator -avd movieroom-os    # after creating an x86_64 AVD
```

The scaffold deliberately does not download AOSP automatically: that checkout is many gigabytes, Linux-specific, and should be placed where the owner wants it. The existing `firetv/` Android client remains the first launcher implementation until it is split into a dedicated AOSP-integrated module.

## Current contract

- Product: `movieroom_x86_64`
- Default home: `com.movieroom.firetv/.MainActivity`
- Brand/model: `TaylorMade Movies` / `Movie Room OS Emulator`
- Development build: `userdebug`
- Hardware target: AOSP x86_64 emulator only

## Not included

This prototype contains no Amazon code, Amazon branding, proprietary Fire OS binaries, DRM keys, vendor blobs, OneDrive credentials, Jellyfin credentials, or Movie Room secrets.
