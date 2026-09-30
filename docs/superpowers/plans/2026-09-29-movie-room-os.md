# Movie Room OS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a safe, original Movie Room OS prototype that boots as an AOSP x86_64 emulator product before any hardware flashing is considered.

**Architecture:** AOSP supplies the Android base and emulator target. A Movie Room native TV shell is the default HOME component and uses the existing secure Movie Room service for catalog, profiles, pairing, and playback. Product overlays provide branding and home selection without embedding secrets or proprietary Fire TV components.

**Tech Stack:** AOSP/Soong, Android userdebug emulator image, existing AndroidX Media3 Movie Room shell, Node.js regression tests, PowerShell validation on Windows.

**Spec:** `docs/superpowers/specs/2026-09-29-movie-room-os-design.md`

## Global Constraints

- First hardware target is AOSP x86_64 emulator only.
- Do not flash or modify the Fire Stick bootloader or firmware.
- Do not include Amazon source, branding, proprietary binaries, DRM keys, or vendor blobs.
- Do not include OneDrive, Jellyfin, Vercel, pairing, or Movie Room credentials.
- Preserve Android Settings and recovery access through a development escape path.

## Review Focus

- Product names and lunch target must agree: covered by `movie-room-os.test.js` product assertions.
- Default home must be Movie Room and not Amazon-branded: covered by the home overlay test.
- Source scaffold must not leak credentials or proprietary package references: covered by the credential scan test.
- Windows checkout must remain usable without Linux/AOSP installed: covered by docs and Node-only validation.
- Fire Stick must remain untouched: covered by the absence of device-flashing commands and the explicit product target restriction.

---

### Task 1: AOSP product scaffold

**Files:**
- Create: `movie-room-os/device/movieroom/emulator/AndroidProducts.mk`
- Create: `movie-room-os/device/movieroom/emulator/movieroom_x86_64.mk`
- Create: `movie-room-os/device/movieroom/emulator/BoardConfig.mk`
- Create: `movie-room-os/device/movieroom/emulator/vendorsetup.sh`
- Create: `movie-room-os/device/movieroom/emulator/overlay/frameworks/base/core/res/res/values/config.xml`

**Interfaces:**
- Produces the `movieroom_x86_64-userdebug` AOSP product and the Movie Room default-home metadata.

- [x] Write the product files with x86_64 emulator values and no secrets.
- [x] Set the default home component to `com.movieroom.firetv/.MainActivity`.
- [ ] Validate the product inside a Linux AOSP checkout once WSL or another Linux host is available.

### Task 2: Windows-safe project documentation

**Files:**
- Create: `movie-room-os/README.md`
- Create: `docs/superpowers/specs/2026-09-29-movie-room-os-design.md`

**Interfaces:**
- Documents the Linux/AOSP prerequisite, product target, build commands, scope limits, and Fire Stick safety boundary.

- [x] Document the first target and AOSP build command.
- [x] State that the scaffold is not flashable Fire Stick firmware.
- [ ] Add emulator screenshots and boot evidence after the Linux build milestone.

### Task 3: Regression validation

**Files:**
- Create: `test/movie-room-os.test.js`

**Interfaces:**
- Node test suite reads the scaffold and rejects invalid product/home/security configuration.

- [x] Test product name, lunch target, and model.
- [x] Test Movie Room home selection.
- [x] Test no credentials or Amazon package references.
- [ ] Run a real AOSP `lunch`/image build when a Linux checkout exists.

### Task 4: Native AOSP launcher integration

**Files:**
- Future: `movie-room-os/packages/apps/MovieRoomShell/**`
- Future: `movie-room-os/device/movieroom/emulator/movieroom_x86_64.mk`

**Interfaces:**
- Supplies a dedicated AOSP launcher package rather than relying on the current Fire TV application package.

- [ ] Extract a minimal HOME/LEANBACK launcher module.
- [ ] Add it to `PRODUCT_PACKAGES`.
- [ ] Test boot-to-home, focus navigation, profile selection, and exit to Settings.

### Task 5: Emulator build and boot verification

**Files:**
- Future: AOSP checkout outside this repository, documented in `movie-room-os/README.md`.

**Interfaces:**
- Produces an emulator system image and boot evidence for `movieroom_x86_64-userdebug`.

- [ ] Set up supported Linux build host.
- [ ] Sync AOSP and import the scaffold.
- [ ] Build the userdebug image.
- [ ] Boot an x86_64 AVD and verify Movie Room is the default home.
- [ ] Run the existing Movie Room service integration tests against the emulator.
