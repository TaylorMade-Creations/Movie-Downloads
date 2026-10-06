const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const shellRoot = path.join(root, "movieroom-shell");
const playerRoot = path.join(root, "firetv");
const webRoot = path.join(root, "movieroom-web");

function read(relativePath) {
  return fs.readFileSync(path.join(shellRoot, relativePath), "utf8");
}

function readPlayer(relativePath) {
  return fs.readFileSync(path.join(playerRoot, relativePath), "utf8");
}

function readWeb(relativePath) {
  return fs.readFileSync(path.join(webRoot, relativePath), "utf8");
}

function readPublic(relativePath) {
  return fs.readFileSync(path.join(root, "public", relativePath), "utf8");
}

function claimsHomeRole(manifest) {
  return /<category\s+android:name="android\.intent\.category\.HOME"\s*\/>/.test(manifest);
}

test("Movie Room shell is selectable as an optional HOME candidate without forcing it", () => {
  const shellManifest = read("src/main/AndroidManifest.xml");
  const playerManifest = readPlayer("src/main/AndroidManifest.xml");
  const webManifest = readWeb("src/main/AndroidManifest.xml");

  assert.equal(claimsHomeRole(shellManifest), true);
  assert.match(shellManifest, /android\.intent\.category\.DEFAULT/);
  assert.equal(claimsHomeRole(playerManifest), false);
  assert.equal(claimsHomeRole(webManifest), false);
});

test("the shell declares the web app and TV presentation assets", () => {
  const manifest = read("src/main/AndroidManifest.xml");
  const activity = read("src/main/java/com/movieroom/shell/ShellActivity.java");

  assert.match(manifest, /<queries>[\s\S]*<package\s+android:name="com\.movieroom\.web"\s*\/>[\s\S]*<\/queries>/);
  assert.match(manifest, /android:banner="@drawable\/taylormade_movies_cover"/);
  assert.match(manifest, /android:icon="@mipmap\/ic_launcher"/);
  assert.match(activity, /com\.movieroom\.web/);
  assert.match(activity, /com\.movieroom\.web\.MainActivity/);
  assert.doesNotMatch(activity, /com\.movieroom\.firetv/);
});

test("Movie Room shell remains an optional LEANBACK APK", () => {
  const manifest = read("src/main/AndroidManifest.xml");
  const build = read("build.gradle");
  assert.match(manifest, /package="com\.movieroom\.shell"/);
  assert.match(manifest, /android\.intent\.category\.HOME/);
  assert.match(manifest, /android\.intent\.category\.LAUNCHER/);
  assert.match(manifest, /android\.intent\.category\.LEANBACK_LAUNCHER/);
  assert.match(build, /applicationId\s+"com\.movieroom\.shell"/);
});

test("the shell contains the profile bootstrap, Crossbar focus model, and dynamic installed apps", () => {
  const manifest = read("src/main/AndroidManifest.xml");
  const activity = read("src/main/java/com/movieroom/shell/ShellActivity.java");
  const bootstrapStore = read("src/main/java/com/movieroom/shell/BootstrapStore.java");
  const profileStore = read("src/main/java/com/movieroom/shell/ProfileStore.java");

  assert.match(activity, /showBootstrapScreen/);
  assert.match(activity, /showProfilesScreen/);
  assert.match(activity, /showProfileTypeScreen/);
  assert.match(activity, /showProfileCreationScreen/);
  assert.match(activity, /Choose your avatar/);
  assert.match(activity, /Naming is temporarily skipped/);
  assert.match(activity, /Regular user/);
  assert.match(activity, /Kid profile/);
  assert.match(activity, /appDockBackground/);
  assert.match(activity, /GradientDrawable\.OVAL/);
  assert.match(activity, /appDockFocusTarget/);
  assert.match(activity, /TAYLORMADE MOVIES · HOME/);
  assert.match(activity, /onNewIntent/);
  assert.match(activity, /homeDetailMeta/);
  assert.match(activity, /lastUsedLabel/);
  assert.match(activity, /CinematicWaveView/);
  assert.match(activity, /RetroPreviewWall/);
  assert.match(activity, /setAlpha\(0\.62f\)/);
  assert.match(activity, /backdrop_home_alone/);
  assert.match(activity, /backdrop_paddington_2/);
  assert.match(activity, /backdrop_snoopy/);
  assert.match(activity, /backdrop_fifty_shades/);
  assert.match(activity, /PREVIEW_CLIP_LIMIT/);
  assert.match(activity, /discoverPreviewClips/);
  assert.match(activity, /Movies\/MovieRoom\/Previews/);
  assert.match(activity, /VideoView/);
  assert.match(activity, /clips\.isEmpty\(\)/);
  assert.match(activity, /setOnCompletionListener/);
  assert.match(activity, /retroTelevisionBackground/);
  assert.match(activity, /VIDEO_SCALING_MODE_SCALE_TO_FIT_WITH_CROPPING/);
  assert.match(activity, /centerCarousel/);
  assert.match(activity, /setOnFocusChangeListener/);
  assert.match(activity, /previewInstalledApp/);
  assert.match(activity, /preferredHomeApps/);
  assert.match(activity, /discoverMediaApps/);
  assert.match(activity, /app store/);
  assert.doesNotMatch(activity, /setCornerRadius\(26f\)/);
  assert.match(activity, /appArtworkButton/);
  assert.match(activity, /app picture button/);
  assert.match(activity, /AppIconButton/);
  assert.match(activity, /drawOval/);
  assert.match(activity, /drawFocusRing/);
  assert.match(activity, /setClipToOutline\(true\)/);
  assert.doesNotMatch(activity, /app\.setCompoundDrawables\(null, icon, null, null\)/);
  assert.doesNotMatch(activity, /app\.setBackground\(appDockBackground\(false\)\)/);
  assert.match(activity, /Choose your Home apps/);
  assert.match(activity, /homePreviewVideo/);
  assert.match(activity, /VideoView thumbnail/);
  assert.match(activity, /Autoplay preview/);
  assert.match(activity, /Recently watched · Top viewing/);
  assert.match(activity, /video-preview:/);
  assert.match(activity, /openPreviewTarget/);
  assert.match(activity, /performClick/);
  assert.match(activity, /KEYCODE_HOME/);
  assert.match(activity, /homeDetailIcon/);
  assert.match(activity, /LAST USED/);
  assert.match(activity, /SUGGESTED NEXT/);
  assert.match(activity, /Movie Room · Recently Added/);
  assert.match(activity, /addPreviewRail/);
  assert.match(activity, /addServiceWidgetRails/);
  assert.match(activity, /Full-bleed video thumbnail/);
  assert.match(activity, /setScaleX/);
  assert.match(activity, /smoothScrollTo/);
  assert.match(activity, /6500L/);
  assert.match(activity, /HOME WIDGET/);
  assert.match(activity, /Continue Watching/);
  assert.match(activity, /Promo Spotlight/);
  assert.match(activity, /Featured Today/);
  assert.match(activity, /Top Trending/);
  assert.match(activity, /streamingFallbackPreviewTitles/);
  assert.match(activity, /thumbnail fallback for protected app promos/);
  assert.match(activity, /renderSelectedAppPreviewPanel/);
  assert.match(activity, /selectedAppPreviewContent/);
  assert.match(activity, /APP PREVIEW/);
  assert.match(activity, /MOVIE_APP_FOLDER_LEFT_THIRD/);
  assert.match(activity, /leftMenuWidth = Math\.max\(360, getResources\(\)\.getDisplayMetrics\(\)\.widthPixels \/ 3\)/);
  assert.match(activity, /CENTERED_PROFILE_APP_PICKER/);
  assert.match(activity, /onlyMovieAndStoreApps/);
  assert.match(activity, /isMovieAppCandidate/);
  assert.match(activity, /isSystemSettingsCandidate/);
  assert.match(activity, /Only TV\/movie apps and the app store/);
  assert.match(activity, /showOnlySelectedAppRails/);
  assert.match(activity, /appDockIconSize = 132/);
  assert.doesNotMatch(activity, /rows\.add\(addPreviewRail\(parent, label \+ " · HOME WIDGET", items\)\)/);
  assert.match(activity, /LIVE TV/);
  assert.match(activity, /APP PREVIEW/);
  assert.match(activity, /appWidgetCircle/);
  assert.match(activity, /Installed app · Select to add or remove/);
  assert.doesNotMatch(activity, /addNavButton\(topBar, "APPS"/);
  assert.match(activity, /PopupWindow/);
  assert.match(activity, /showProfileMenu/);
  assert.doesNotMatch(activity, /addNavButton\(topBar, "SETTINGS"/);
  assert.match(activity, /showAppsScreen/);
  assert.match(activity, /queryIntentActivities/);
  assert.match(activity, /Profile artwork/);
  assert.match(activity, /Continue Watching/);
  assert.match(activity, /Recently Added/);
  assert.match(activity, /Taylor-Made Picks/);
  assert.match(activity, /TOP 5 · RECENTLY ADDED ROTATION/);
  assert.match(activity, /"1 Recently Added", "2 New This Week", "3 Fresh Pick", "4 Latest Family", "5 Latest Magic"/);
  assert.doesNotMatch(activity, /TOP 10 · CIRCULAR MENU/);
  assert.doesNotMatch(activity, /"1 Top Pick", "2 Family", "3 New", "4 Action", "5 Comedy"/);
  assert.match(activity, /Movie Room OS/);
  assert.match(activity, /HOME/);
  assert.doesNotMatch(activity, /RemoteMap/);
  assert.doesNotMatch(activity, /FocusGrid/);
  assert.match(bootstrapStore, /setupComplete/);
  assert.match(bootstrapStore, /setLastUsedLabel/);
  assert.match(bootstrapStore, /reset/);
  assert.match(profileStore, /hashPin/);
  assert.match(profileStore, /createCustomProfile/);
  assert.match(profileStore, /profile_pp1/);
  assert.match(profileStore, /profile_pp9/);
  assert.match(profileStore, /Math\.min\(8, avatarIndex\)/);
  assert.match(activity, /setIncludeFontPadding/);
  assert.match(activity, /setLineSpacing/);
  assert.match(activity, /showRemoteGuide/);
  assert.match(activity, /Network settings/);
  assert.match(activity, /Bluetooth settings/);
  assert.match(activity, /App Locker/);
  assert.match(activity, /Storage and media settings/);
  assert.match(activity, /Developer settings/);
  assert.match(activity, /requestStartupPermissions/);
  assert.match(activity, /connectionCornerLabel/);
  assert.match(activity, /No Wi-Fi/);
  assert.doesNotMatch(activity, /OK  Select        Back  Return        Menu  Settings/);
  assert.match(manifest, /<action android:name="android.intent.action.MAIN"\s*\/>/);
  assert.match(manifest, /<category android:name="android.intent.category.HOME"\s*\/>/);
  assert.match(manifest, /ACCESS_FINE_LOCATION/);
  assert.match(manifest, /READ_MEDIA_VIDEO/);
  assert.match(manifest, /READ_EXTERNAL_STORAGE/);
  assert.match(manifest, /WAKE_LOCK/);
});

test("Movie Room shell renders a native home screen with profiles and controls", () => {
  const activity = read("src/main/java/com/movieroom/shell/ShellActivity.java");
  assert.match(activity, /LinearLayout/);
  assert.match(activity, /Movie Room OS/);
  assert.match(activity, /Home/);
  assert.match(activity, /Mom/);
  assert.match(activity, /Morganne/);
  assert.match(activity, /Kids/);
  assert.match(activity, /setContentView\(root\)/);
  assert.match(activity, /openMovieRoomApp/);
  assert.match(activity, /Settings/);
  assert.match(activity, /ACTION_SETTINGS/);
  assert.match(activity, /ACTION_WIFI_SETTINGS/);
  assert.match(activity, /ACTION_BLUETOOTH_SETTINGS/);
  assert.match(activity, /ACTION_DISPLAY_SETTINGS/);
  assert.doesNotMatch(activity, /WebView/);
  assert.doesNotMatch(activity, /ACTION_VIEW|MOVIE_ROOM_BASE_URL/);
  assert.doesNotMatch(activity, /ONEDRIVE|JELLYFIN_API_KEY|VERCEL_|MOVIE_ROOM_PASSWORD/i);
});

test("Movie Room shell explains the active network and exposes Wi-Fi and mobile settings", () => {
  const activity = read("src/main/java/com/movieroom/shell/ShellActivity.java");

  assert.match(activity, /ConnectivityManager/);
  assert.match(activity, /NetworkCapabilities/);
  assert.match(activity, /TRANSPORT_WIFI/);
  assert.match(activity, /TRANSPORT_CELLULAR/);
  assert.match(activity, /ACTION_WIFI_SETTINGS/);
  assert.match(activity, /ACTION_WIRELESS_SETTINGS/);
  assert.match(activity, /connectionCornerLabel/);
  assert.match(activity, /Mobile data/);
});

test("Movie Room shell provides an explicit Fire TV focus path across library shelves", () => {
  const activity = read("src/main/java/com/movieroom/shell/ShellActivity.java");

  assert.match(activity, /setNextFocusLeftId/);
  assert.match(activity, /setNextFocusRightId/);
  assert.match(activity, /setNextFocusUpId/);
  assert.match(activity, /setNextFocusDownId/);
  assert.match(activity, /KEYCODE_BACK/);
  assert.match(activity, /KEYCODE_MENU/);
  assert.match(activity, /KEYCODE_MEDIA_PLAY_PAUSE/);
  assert.doesNotMatch(activity, /dispatchKeyEvent/);
  assert.doesNotMatch(activity, /moveShellFocus/);
  assert.doesNotMatch(activity, /REMOTE_REPEAT_THROTTLE_MS/);
  assert.doesNotMatch(activity, /shouldDropRemoteRepeat|isRemoteMove/);
  assert.match(activity, /performClick/);
  assert.match(activity, /requestFocus/);
  assert.match(activity, /ImageView/);
  assert.match(activity, /taylormade_movies_cover/);
  assert.match(activity, /showSettingsScreen/);
  assert.match(activity, /Developer options/);
  assert.match(activity, /Open Fire OS settings/);
  assert.match(activity, /showProfilesScreen/);
  assert.match(activity, /showGenresScreen/);
  assert.match(activity, /Genres/);
  assert.match(activity, /Comedy/);
  assert.match(activity, /Soap/);
});

test("the published OS launcher artifact matches the shell version", () => {
  const build = read("build.gradle");
  const update = JSON.parse(readPublic("apk/os-update.json"));
  assert.match(build, /versionCode\s+10/);
  assert.match(build, /versionName\s+"0\.8\.1"/);
  assert.equal(update.packageName, "com.movieroom.shell");
  assert.equal(update.versionCode, 10);
  assert.equal(update.versionName, "0.8.1");
  assert.match(update.downloadUrl, /MovieRoom-Optional-TV-v0\.8\.1\.apk$/);
});
