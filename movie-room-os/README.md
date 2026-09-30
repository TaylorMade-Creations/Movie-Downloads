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

## Android Studio development target

Android Studio's installed SDK can run the shell immediately without building all of AOSP. The local development AVD is named `MovieRoomOS2`, uses the installed Android 37 x86_64 Google APIs/Play Store image, and is suitable for testing the launcher, keyboard/remote-style focus, Media3 playback, and the Movie Room service connection. The current APK can be built with the repository's `firetv` Gradle module and installed with:

```powershell
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
..\gradlew.bat :firetv:assembleDebug
& "$env:ANDROID_HOME\platform-tools\adb.exe" -s emulator-5554 install -r .\firetv\build\outputs\apk\debug\firetv-debug.apk
& "$env:ANDROID_HOME\platform-tools\adb.exe" -s emulator-5554 shell am start -n com.movieroom.firetv/.MainActivity
```

This is an emulator-installed Android shell, not a replacement system image. The full AOSP product remains the path for generating boot/recovery/system images later.

## Current contract

- Product: `movieroom_x86_64`
- Default home: `com.movieroom.firetv/.MainActivity`
- Brand/model: `TaylorMade Movies` / `Movie Room OS Emulator`
- Development build: `userdebug`
- Hardware target: AOSP x86_64 emulator only

## Not included

This prototype contains no Amazon code, Amazon branding, proprietary Fire OS binaries, DRM keys, vendor blobs, OneDrive credentials, Jellyfin credentials, or Movie Room secrets.
