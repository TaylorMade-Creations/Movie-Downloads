package com.movieroom.shell;

import android.app.Activity;
import android.Manifest;
import android.media.MediaPlayer;
import android.content.ComponentName;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.ColorDrawable;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.Bundle;
import android.os.Build;
import android.os.Environment;
import android.util.Log;
import android.provider.Settings;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.PopupWindow;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import android.widget.VideoView;

import java.util.ArrayList;
import java.io.File;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** Optional Movie Room OS shell; Fire OS remains available as the fallback HOME. */
public final class ShellActivity extends Activity {
    private static final int NAVY = Color.rgb(10, 4, 14);
    private static final int PANEL = Color.rgb(31, 20, 31);
    private static final int CRIMSON = Color.rgb(190, 24, 63);
    private static final int GOLD = Color.rgb(240, 196, 91);
    private static final int IVORY = Color.rgb(255, 247, 229);
    private static final int PURPLE = Color.rgb(111, 55, 132);
    private static final int TEAL = Color.rgb(214, 105, 174);
    private static final int TEXT = Color.rgb(255, 247, 229);
    private static final int STARTUP_PERMISSIONS_REQUEST = 410;
    private static final int PREVIEW_CLIP_LIMIT = 30;
    private static final String NETFLIX_PACKAGE = "com.netflix.ninja";
    private static final String PEACOCK_PACKAGE = "com.peacocktv.peacockandroid";
    private String activeProfile = "Home";
    private String selectedProfileId = "home";
    private TextView connectionStatus;
    private TextView homeDetailTitle;
    private TextView homeDetailDescription;
    private TextView homeDetailMeta;
    private ImageView homeDetailIcon;
    private VideoView homePreviewVideo;
    private View appDockFocusTarget;
    private boolean settingsScreen;
    private boolean profileChooserScreen;
    private String pendingProfileType = "Regular user";
    private int selectedAvatarIndex;
    private BootstrapStore bootstrapStore;
    private ProfileStore profileStore;
    private List<List<Button>> activeFocusRows = new ArrayList<>();
    private int focusedRowIndex;
    private int focusedColumnIndex;

    private static final class AppChoice {
        final String packageName;
        final String label;
        final ResolveInfo resolveInfo;

        AppChoice(String packageName, String label, ResolveInfo resolveInfo) {
            this.packageName = packageName;
            this.label = label;
            this.resolveInfo = resolveInfo;
        }

        boolean isInstalled() {
            return resolveInfo != null;
        }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(NAVY);
        bootstrapStore = new BootstrapStore(this);
        profileStore = new ProfileStore(this);
        activeProfile = profileStore.find(bootstrapStore.activeProfileId()).displayName;
        if (bootstrapStore.setupComplete() && !bootstrapStore.appPreferencesConfigured(bootstrapStore.activeProfileId())) {
            showPreferredAppsScreen(bootstrapStore.activeProfileId());
        } else if (bootstrapStore.setupComplete()) showHome();
        else showBootstrapScreen();
        getWindow().getDecorView().post(() -> {
            if (!bootstrapStore.remoteGuideSeen()) showRemoteGuide();
            else requestStartupPermissions();
        });
    }

    @Override
    protected void onResume() {
        super.onResume();
        updateConnectionStatus();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        // Fire OS may deliver the launcher intent to the existing singleTask
        // activity after Back/Home. Always restore the shell root instead of
        // leaving the old child screen or an empty view visible.
        if (bootstrapStore != null) {
            if (bootstrapStore.setupComplete()) showHome();
            else showBootstrapScreen();
        }
    }

    private void showHome() {
        // Keep the lastUsedLabel hook for profile/bootstrap continuity; the
        // Fire TV home keeps Movie Room as the primary catalog while also rendering
        // the selected-app hub and safe live-home rails. Legacy labels remain documented for compatibility: LAST USED, SUGGESTED NEXT,
        // Movie Room · Recently Added, HOME WIDGET, Continue Watching, and My List.
        String lastUsedLabel = bootstrapStore.lastUsedLabel();
        settingsScreen = false;
        LinearLayout root = column(NAVY);
        root.setBackground(cinematicBackground());
        root.setPadding(34, 24, 34, 24);
        List<List<Button>> focusRows = new ArrayList<>();

        LinearLayout topBar = row();
        topBar.setGravity(Gravity.CENTER_VERTICAL);
        ImageView avatar = profileImage(profileStore.find(bootstrapStore.activeProfileId()), 62);
        avatar.setContentDescription("Active profile artwork for " + activeProfile);
        topBar.addView(avatar, new LinearLayout.LayoutParams(62, 62));
        TextView profileTitle = text("  " + activeProfile + "\n  Home", 22, IVORY);
        profileTitle.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        topBar.addView(profileTitle, weight(2));
        List<Button> topControls = new ArrayList<>();
        topControls.add(addNavButton(topBar, "USERS", this::showProfilesScreen));
        topControls.add(addNavButton(topBar, "MOVIE ROOM", this::openMovieRoomApp));
        topControls.add(addNavButton(topBar, "DISCS & MEDIA", () -> showChoiceScreen("Discs & Media", "USB, SD card, and local media", new String[]{"USB drive", "SD card", "This device"}, value -> Toast.makeText(this, value, Toast.LENGTH_SHORT).show())));
        topControls.add(addNavButton(topBar, "NETWORK", () -> openDeviceSettings("General network")));
        Button profileMenu = button(activeProfile + " ▾", PANEL, IVORY);
        Drawable profileMenuArt = getResources().getDrawable(profileStore.find(bootstrapStore.activeProfileId()).avatarResource);
        profileMenuArt.setBounds(0, 0, 48, 48);
        profileMenu.setCompoundDrawables(profileMenuArt, null, null, null);
        profileMenu.setCompoundDrawablePadding(8);
        profileMenu.setContentDescription("Open " + activeProfile + " profile menu");
        profileMenu.setOnClickListener(view -> showProfileMenu(profileMenu));
        topBar.addView(profileMenu, wrap());
        topControls.add(profileMenu);
        focusRows.add(topControls);

        connectionStatus = text(connectionCornerLabel(), 12, connectionColor());
        connectionStatus.setGravity(Gravity.RIGHT | Gravity.CENTER_VERTICAL);
        connectionStatus.setContentDescription("Connection status: " + currentConnectionLabel());
        topBar.addView(connectionStatus, new LinearLayout.LayoutParams(118, 62));

        root.addView(topBar, new LinearLayout.LayoutParams(-1, 86));
        TextView divider = text("────────────────────────────────────────────────────────────────────────────────────────────────────────", 12, 0x88fff7e5);
        root.addView(divider, new LinearLayout.LayoutParams(-1, 24));

        LinearLayout body = column(0x66100711);
        body.setPadding(24, 8, 24, 8);
        FrameLayout detail = new FrameLayout(this);
        detail.addView(new CinematicWaveView(this), new FrameLayout.LayoutParams(-1, -1));
        LinearLayout scrim = column(0x66100711);
        scrim.setPadding(18, 12, 18, 12);
        homeDetailIcon = new ImageView(this);
        homeDetailIcon.setScaleType(ImageView.ScaleType.CENTER_INSIDE);
        scrim.addView(homeDetailIcon, new LinearLayout.LayoutParams(88, 88));
        TextView eyebrow = text("TAYLORMADE MOVIES · HOME", 15, GOLD);
        eyebrow.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        scrim.addView(eyebrow);
        TextView heading = text("TaylorMade Movies", 34, IVORY);
        heading.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        scrim.addView(heading);
        homeDetailTitle = heading;
        homeDetailDescription = text("Your Movie Room web home · " + activeProfile, 19, 0xfff5e6d1);
        scrim.addView(homeDetailDescription);
        homeDetailMeta = text("Web home preview · Continue watching · Recently added · Trending", 15, 0xffd9cfd9);
        scrim.addView(homeDetailMeta);

        ScrollView movieScroll = new ScrollView(this);
        movieScroll.setFillViewport(true);
        LinearLayout movieContent = column(Color.TRANSPARENT);
        focusRows.add(addFireTvTopTen(movieContent));
        focusRows.addAll(addSelectedAppHome(movieContent));
        focusRows.addAll(addServiceWidgetRails(movieContent));
        focusRows.add(addFireTvShelf(movieContent, "ALL MOVIES", new String[]{"All Movies", "Movies Index Catalog"}, true));
        focusRows.add(addFireTvShelf(movieContent, "NEWLY ADDED", new String[]{"New uploads", "Recently added", "Fresh family picks"}, true));
        focusRows.add(addFireTvShelf(movieContent, "MOST WATCHED", new String[]{"Continue watching", "Taylor-Made Picks", "Top viewing"}, true));
        focusRows.add(addFireTvShelf(movieContent, "FAMILY FAVORITES", new String[]{"Family Favorites", "Kids movies", "Animated Worlds"}, true));
        focusRows.add(addFireTvShelf(movieContent, "ACTION & ADVENTURE", new String[]{"Action", "Adventure", "Fantasy & Magic"}, true));
        focusRows.add(addFireTvShelf(movieContent, "COMEDY", new String[]{"Comedy", "Feel Good Movies", "Classics"}, true));
        focusRows.add(addFireTvShelf(movieContent, "DRAMA", new String[]{"Drama", "Romance", "Documentaries"}, true));
        focusRows.add(addFireTvShelf(movieContent, "SCI-FI & FANTASY", new String[]{"Sci-Fi & Beyond", "Fantasy", "Superheroes"}, true));
        focusRows.add(addFireTvShelf(movieContent, "SERIES & COLLECTIONS", new String[]{"Series", "Collections", "Recently watched"}, true));
        focusRows.add(addFireTvFolderButton(movieContent));
        movieScroll.addView(movieContent);
        scrim.addView(movieScroll, new LinearLayout.LayoutParams(-1, 0, 1));
        detail.addView(scrim, new FrameLayout.LayoutParams(-1, -1));
        body.addView(detail, new LinearLayout.LayoutParams(-1, -1));
        root.addView(body, new LinearLayout.LayoutParams(-1, 0, 1));

        connectFocusRows(focusRows);
        setContentView(root);
        topControls.get(0).requestFocus();
    }

    /**
     * Keeps the shell visible as the primary surface while exposing the apps
     * selected during first-run setup as a live, remote-friendly app hub.
     * The cards never auto-launch; selecting one hands control to that app.
     */
    private List<List<Button>> addSelectedAppHome(LinearLayout parent) {
        List<List<Button>> rows = new ArrayList<>();
        TextView heading = text("SELECTED APPS · LIVE HOME", 17, GOLD);
        heading.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        parent.addView(heading, new LinearLayout.LayoutParams(-1, 34));
        TextView status = text("Movie Room supplies the catalog; installed apps supply their own live home and continue-watching handoff.", 14, 0xffd9cfd9);
        parent.addView(status, new LinearLayout.LayoutParams(-1, 42));

        HorizontalScrollView scroll = new HorizontalScrollView(this);
        scroll.setHorizontalScrollBarEnabled(true);
        scroll.setScrollbarFadingEnabled(false);
        LinearLayout rail = row();
        List<Button> buttons = new ArrayList<>();
        for (ResolveInfo info : preferredHomeApps()) {
            String label = String.valueOf(info.loadLabel(getPackageManager()));
            Button app = button(label + "\nLIVE HOME", PANEL, IVORY);
            app.setGravity(Gravity.CENTER);
            app.setTextSize(15);
            app.setContentDescription(label + " live home app");
            Drawable icon = info.loadIcon(getPackageManager());
            if (icon != null) {
                icon.setBounds(0, 0, 60, 60);
                app.setCompoundDrawables(null, icon, null, null);
            }
            app.setOnClickListener(view -> {
                bootstrapStore.setLastUsedLabel(label);
                launchInstalledApp(info);
            });
            app.setOnFocusChangeListener((view, hasFocus) -> {
                view.setScaleX(hasFocus ? 1.06f : 1f);
                view.setScaleY(hasFocus ? 1.06f : 1f);
                if (hasFocus) previewInstalledApp(info);
            });
            LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(214, 112);
            params.setMargins(6, 0, 6, 10);
            rail.addView(app, params);
            buttons.add(app);
        }
        if (buttons.isEmpty()) {
            Button setup = button("＋  Add apps in Settings", PANEL, GOLD);
            setup.setGravity(Gravity.CENTER);
            setup.setContentDescription("Add apps in profile settings");
            setup.setOnClickListener(view -> showAppsScreen());
            rail.addView(setup, new LinearLayout.LayoutParams(320, 82));
            buttons.add(setup);
        }
        scroll.addView(rail);
        parent.addView(scroll, new LinearLayout.LayoutParams(-1, 126));
        rows.add(buttons);
        return rows;
    }

    /** Fire TV-only home layout: one vertical shelf per category and a circular top-ten row. */
    private List<Button> addFireTvTopTen(LinearLayout parent) {
        TextView heading = text("TOP 10 · CIRCULAR MENU", 17, GOLD);
        heading.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        parent.addView(heading, new LinearLayout.LayoutParams(-1, 34));
        HorizontalScrollView scroll = new HorizontalScrollView(this);
        scroll.setHorizontalScrollBarEnabled(false);
        LinearLayout row = row();
        List<Button> buttons = new ArrayList<>();
        String[] titles = {"1 Top Pick", "2 Family", "3 New", "4 Action", "5 Comedy", "6 Drama", "7 Kids", "8 Series", "9 Fantasy", "10 More"};
        for (String title : titles) {
            Button item = circleButton(title, PURPLE, 106);
            item.setTextSize(12);
            item.setContentDescription("Top ten " + title);
            item.setOnClickListener(view -> openMovieRoomApp());
            LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(106, 106);
            params.setMargins(6, 0, 6, 8);
            row.addView(item, params);
            buttons.add(item);
        }
        scroll.addView(row);
        parent.addView(scroll, new LinearLayout.LayoutParams(-1, 124));
        return buttons;
    }

    /** A single-column shelf. The 11th card is always the explicit View More action. */
    private List<Button> addFireTvShelf(LinearLayout parent, String title, String[] cards, boolean addViewMore) {
        TextView heading = text(title, 18, IVORY);
        heading.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        LinearLayout.LayoutParams headingParams = new LinearLayout.LayoutParams(-1, 34);
        headingParams.setMargins(0, 12, 0, 4);
        parent.addView(heading, headingParams);
        LinearLayout list = column(Color.TRANSPARENT);
        List<Button> buttons = new ArrayList<>();
        int limit = Math.min(cards.length, 10);
        for (int index = 0; index < limit; index++) {
            String cardTitle = cards[index];
            Button card = button("▸  " + cardTitle, PANEL, TEXT);
            card.setGravity(Gravity.CENTER_VERTICAL | Gravity.LEFT);
            card.setAllCaps(false);
            card.setContentDescription(title + " · " + cardTitle);
            card.setOnClickListener(view -> onCardSelected(cardTitle));
            list.addView(card, new LinearLayout.LayoutParams(-1, 58));
            buttons.add(card);
        }
        if (addViewMore) {
            Button more = button("▸  View More", 0xff3a1227, GOLD);
            more.setGravity(Gravity.CENTER_VERTICAL | Gravity.LEFT);
            more.setContentDescription(title + " · View More");
            more.setOnClickListener(view -> openMovieRoomApp());
            list.addView(more, new LinearLayout.LayoutParams(-1, 58));
            buttons.add(more);
        }
        parent.addView(list, new LinearLayout.LayoutParams(-1, -2));
        return buttons;
    }

    private List<Button> addFireTvFolderButton(LinearLayout parent) {
        Button folder = button("▣  OPEN MOVIE FOLDER", CRIMSON, IVORY);
        folder.setGravity(Gravity.CENTER);
        folder.setContentDescription("Open movie folder");
        folder.setOnClickListener(view -> openMovieRoomApp());
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, 70);
        params.setMargins(0, 18, 0, 22);
        parent.addView(folder, params);
        List<Button> row = new ArrayList<>();
        row.add(folder);
        return row;
    }

    private void showRemoteGuide() {
        LinearLayout content = column(PANEL);
        content.setPadding(28, 22, 28, 22);
        TextView title = text("Remote controls", 28, IVORY);
        title.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        content.addView(title);
        content.addView(text("Use the Fire TV remote or compatible TV remote to move around Movie Room OS.", 17, IVORY));
        content.addView(text("↑ ↓ ← →   Move focus\nOK / Select   Open the highlighted item\nBack   Return to the previous screen\nMenu   Open settings\nPlay/Pause   Open Movie Room\nRewind / Fast-forward   Move through playback", 17, 0xfff5e6d1));
        Button close = button("Got it", CRIMSON, IVORY);
        close.setContentDescription("Dismiss remote controls guide");
        content.addView(close, new LinearLayout.LayoutParams(-1, 64));

        PopupWindow popup = new PopupWindow(content, 690, 700, true);
        popup.setBackgroundDrawable(new ColorDrawable(PANEL));
        popup.setOutsideTouchable(false);
        popup.setElevation(20);
        close.setOnClickListener(view -> {
            bootstrapStore.markRemoteGuideSeen();
            popup.dismiss();
            requestStartupPermissions();
        });
        popup.showAtLocation(getWindow().getDecorView(), Gravity.CENTER, 0, 0);
        close.requestFocus();
    }

    private void requestStartupPermissions() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return;
        List<String> permissions = new ArrayList<>();
        addPermissionIfNeeded(permissions, Manifest.permission.ACCESS_FINE_LOCATION);
        addPermissionIfNeeded(permissions, Manifest.permission.ACCESS_COARSE_LOCATION);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            addPermissionIfNeeded(permissions, Manifest.permission.READ_MEDIA_VIDEO);
            addPermissionIfNeeded(permissions, Manifest.permission.READ_MEDIA_IMAGES);
            addPermissionIfNeeded(permissions, Manifest.permission.READ_MEDIA_AUDIO);
        } else {
            addPermissionIfNeeded(permissions, Manifest.permission.READ_EXTERNAL_STORAGE);
            if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.P) {
                addPermissionIfNeeded(permissions, Manifest.permission.WRITE_EXTERNAL_STORAGE);
            }
        }
        if (!permissions.isEmpty()) requestPermissions(permissions.toArray(new String[0]), STARTUP_PERMISSIONS_REQUEST);
    }

    private void addPermissionIfNeeded(List<String> permissions, String permission) {
        if (checkSelfPermission(permission) != PackageManager.PERMISSION_GRANTED) permissions.add(permission);
    }

    private View createPreviewWall() {
        List<File> clips = discoverPreviewClips();
        Log.i("MovieRoomShell", "Preview clips discovered: " + clips.size());
        return clips.isEmpty() ? new RetroPreviewWall(this) : new LocalVideoPreviewWall(this, clips);
    }

    /** Only reads a user-created preview folder; it never uploads or copies library movies. */
    private List<File> discoverPreviewClips() {
        File storage = Environment.getExternalStorageDirectory();
        File[] directories = {
                new File(storage, "Movies/MovieRoom/Previews"),
                new File(storage, "Movies/TaylorMade Movies/Previews"),
                new File(storage, "Download/MovieRoom/Previews")
        };
        List<File> clips = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (File directory : directories) {
            File[] files = directory.listFiles((file, name) -> {
                String lower = name.toLowerCase();
                return lower.endsWith(".mp4") || lower.endsWith(".webm") || lower.endsWith(".m4v") || lower.endsWith(".mov");
            });
            if (files == null) continue;
            for (File file : files) {
                try {
                    if (file.isFile() && seen.add(file.getCanonicalPath())) clips.add(file);
                } catch (java.io.IOException ignored) {
                    if (file.isFile() && seen.add(file.getAbsolutePath())) clips.add(file);
                }
            }
        }
        Collections.sort(clips, Comparator.comparingLong(File::lastModified).reversed());
        return clips.subList(0, Math.min(PREVIEW_CLIP_LIMIT, clips.size()));
    }

    private static final class LocalVideoPreviewWall extends FrameLayout {
        private final List<File> clips;
        private final List<VideoView> players = new ArrayList<>();
        private final List<FrameLayout> frames = new ArrayList<>();
        private final int[] clipIndexes = {0, 1, 2, 3};
        private float phase;

        LocalVideoPreviewWall(android.content.Context context, List<File> clips) {
            super(context);
            this.clips = new ArrayList<>(clips);
            setWillNotDraw(false);
            setClipChildren(false);
            setClickable(false);
            addView(new RetroPreviewWall(context), new LayoutParams(-1, -1));
        }

        @Override
        protected void onSizeChanged(int width, int height, int oldWidth, int oldHeight) {
            super.onSizeChanged(width, height, oldWidth, oldHeight);
            if (width <= 0 || height <= 0 || !players.isEmpty()) return;
            int screenWidth = Math.max(1, width / 4);
            int screenHeight = Math.max(1, (int) (height * 0.43f));
            int top = (int) (height * 0.57f);
            for (int index = 0; index < 4; index++) {
                VideoView player = new VideoView(getContext());
                player.setZOrderMediaOverlay(false);
                player.setAlpha(0.62f);
                player.setBackgroundColor(Color.TRANSPARENT);
                final int playerIndex = index;
                clipIndexes[index] = index % clips.size();
                player.setOnPreparedListener(mediaPlayer -> {
                    mediaPlayer.setLooping(false);
                    mediaPlayer.setVolume(0f, 0f);
                    mediaPlayer.setVideoScalingMode(MediaPlayer.VIDEO_SCALING_MODE_SCALE_TO_FIT_WITH_CROPPING);
                    player.start();
                });
                player.setOnCompletionListener(mediaPlayer -> {
                    clipIndexes[playerIndex] = (clipIndexes[playerIndex] + 1) % clips.size();
                    player.setVideoURI(Uri.fromFile(clips.get(clipIndexes[playerIndex])));
                });
                player.setOnErrorListener((mediaPlayer, what, extra) -> true);
                player.setVideoURI(Uri.fromFile(clips.get(clipIndexes[index])));
                FrameLayout television = new FrameLayout(getContext());
                television.setBackground(retroTelevisionBackground(index));
                television.setKeepScreenOn(true);
                int frameWidth = screenWidth + (index == 3 ? width - (screenWidth * 4) : 0);
                LayoutParams frameParams = new LayoutParams(frameWidth, screenHeight);
                frameParams.leftMargin = index * screenWidth;
                frameParams.topMargin = top;
                LayoutParams playerParams = new LayoutParams(Math.max(1, frameWidth - 18), Math.max(1, screenHeight - 18));
                playerParams.leftMargin = 9;
                playerParams.topMargin = 9;
                television.addView(player, playerParams);
                addView(television, frameParams);
                frames.add(television);
                players.add(player);
            }
            postInvalidateDelayed(42L);
        }

        @Override
        protected void onDraw(Canvas canvas) {
            super.onDraw(canvas);
            phase += 0.035f;
            for (int index = 0; index < players.size(); index++) {
                FrameLayout television = frames.get(index);
                television.setTranslationX((float) Math.sin(phase + index * 1.2f) * 8f);
                television.setTranslationY((float) Math.cos(phase + index * 0.8f) * 5f);
            }
            postInvalidateDelayed(42L);
        }

        @Override
        protected void onDetachedFromWindow() {
            for (VideoView player : players) player.stopPlayback();
            super.onDetachedFromWindow();
        }

        private GradientDrawable retroTelevisionBackground(int index) {
            GradientDrawable frame = new GradientDrawable();
            frame.setColor(0xee130d18);
            frame.setCornerRadius(24f);
            frame.setStroke(4, index % 2 == 0 ? GOLD : CRIMSON);
            return frame;
        }
    }

    private List<List<Button>> addAppFolder(LinearLayout parent) {
        ScrollView dockScroll = new ScrollView(this);
        dockScroll.setVerticalScrollBarEnabled(false);
        LinearLayout dock = column(Color.TRANSPARENT);
        List<List<Button>> dockRows = new ArrayList<>();
        for (ResolveInfo info : preferredHomeApps()) {
            String label = String.valueOf(info.loadLabel(getPackageManager()));
            Button app = button("", Color.TRANSPARENT, IVORY);
            app.setGravity(Gravity.CENTER);
            app.setContentDescription(label + " app widget");
            app.setTextSize(1);
            Drawable icon = info.loadIcon(getPackageManager());
            if (icon != null) {
                icon.setBounds(0, 0, 76, 76);
                app.setCompoundDrawables(null, icon, null, null);
            }
            app.setBackground(appDockBackground(false));
            if (appDockFocusTarget == null) appDockFocusTarget = app;
            app.setOnClickListener(view -> {
                bootstrapStore.setLastUsedLabel(label);
                launchInstalledApp(info);
            });
            app.setOnFocusChangeListener((view, hasFocus) -> {
                app.setBackground(appDockBackground(hasFocus));
                app.setTextColor(hasFocus ? GOLD : IVORY);
                if (hasFocus) previewInstalledApp(info);
            });
            LinearLayout.LayoutParams appParams = new LinearLayout.LayoutParams(112, 112);
            appParams.gravity = Gravity.CENTER_HORIZONTAL;
            appParams.setMargins(0, 0, 0, 14);
            dock.addView(app, appParams);
            dockRows.add(singleton(app));
        }
        dockScroll.addView(dock);
        parent.addView(dockScroll, new LinearLayout.LayoutParams(-1, 0, 1));
        return dockRows;
    }

    private List<Button> addPreviewRail(LinearLayout parent, String title, String[] items) {
        TextView heading = text(title, 15, GOLD);
        heading.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        parent.addView(heading, new LinearLayout.LayoutParams(-1, 38));
        HorizontalScrollView rail = new HorizontalScrollView(this);
        rail.setHorizontalScrollBarEnabled(false);
        rail.setOverScrollMode(View.OVER_SCROLL_NEVER);
        LinearLayout railRow = row();
        List<Button> buttons = new ArrayList<>();
        List<File> clips = discoverPreviewClips();
        for (int itemIndex = 0; itemIndex < items.length; itemIndex++) {
            String item = items[itemIndex];
            FrameLayout cardFrame = new FrameLayout(this);
            VideoView thumbnail = null;
            if (!clips.isEmpty()) {
                VideoView playerView = new VideoView(this);
                thumbnail = playerView;
                thumbnail.setFocusable(false);
                thumbnail.setClickable(false);
                thumbnail.setKeepScreenOn(false);
                thumbnail.setAlpha(0.98f);
                thumbnail.setOnPreparedListener(player -> {
                    player.setLooping(true);
                    player.setVolume(0f, 0f);
                    player.setVideoScalingMode(MediaPlayer.VIDEO_SCALING_MODE_SCALE_TO_FIT_WITH_CROPPING);
                    playerView.start();
                });
                thumbnail.setOnErrorListener((player, what, extra) -> true);
                playerView.setVideoURI(Uri.fromFile(clips.get(itemIndex % clips.size())));
                cardFrame.addView(playerView, new FrameLayout.LayoutParams(-1, -1));
            } else {
                ImageView artwork = new ImageView(this);
                artwork.setImageResource(previewArtwork(item));
                artwork.setScaleType(ImageView.ScaleType.CENTER_CROP);
                cardFrame.addView(artwork, new FrameLayout.LayoutParams(-1, -1));
            }
            // Full-bleed video thumbnail: the image/video is the card, while
            // the title is a readable overlay rather than a bordered tile.
            Button card = button(item, Color.TRANSPARENT, IVORY);
            card.setGravity(Gravity.BOTTOM | Gravity.LEFT);
            card.setTextSize(15);
            card.setPadding(12, 8, 12, 10);
            card.setAllCaps(false);
            card.setTag("video-preview:" + item);
            card.setOnClickListener(view -> openPreviewTarget(item));
            card.setOnKeyListener((view, keyCode, event) -> {
                if (event.getAction() == KeyEvent.ACTION_DOWN
                        && (keyCode == KeyEvent.KEYCODE_DPAD_LEFT || keyCode == KeyEvent.KEYCODE_DPAD_RIGHT)
                        && appDockFocusTarget != null) {
                    appDockFocusTarget.requestFocus();
                    return true;
                }
                return false;
            });
            final String focusedTitle = item;
            card.setOnFocusChangeListener((view, hasFocus) -> {
                if (hasFocus) previewMovieCard(focusedTitle);
                view.setBackgroundColor(Color.TRANSPARENT);
                view.setScaleX(hasFocus ? 1.04f : 1f);
                view.setScaleY(hasFocus ? 1.04f : 1f);
                ((Button) view).setTextColor(hasFocus ? GOLD : IVORY);
            });
            cardFrame.addView(card, new FrameLayout.LayoutParams(-1, -1));
            LinearLayout.LayoutParams cardParams = new LinearLayout.LayoutParams(258, 154);
            cardParams.setMargins(0, 0, 16, 12);
            railRow.addView(cardFrame, cardParams);
            buttons.add(card);
        }
        rail.addView(railRow);
        parent.addView(rail, new LinearLayout.LayoutParams(-1, 170));
        if (items.length > 1) {
            final int[] rotationIndex = {0};
            rail.postDelayed(new Runnable() {
                @Override
                public void run() {
                    if (rail.getWindowToken() == null) return;
                    rotationIndex[0] = (rotationIndex[0] + 1) % items.length;
                    rail.smoothScrollTo(rotationIndex[0] * 274, 0);
                    rail.postDelayed(this, 6500L);
                }
            }, 6500L);
        }
        return buttons;
    }

    /**
     * Profile-specific service widgets. Movie Room can supply local preview
     * clips; protected streaming services expose only safe launch handoffs
     * until their own signed-in app is opened.
     */
    private List<List<Button>> addServiceWidgetRails(LinearLayout parent) {
        List<List<Button>> rows = new ArrayList<>();
        for (ResolveInfo info : preferredHomeApps()) {
            String label = String.valueOf(info.loadLabel(getPackageManager()));
            String lower = label.toLowerCase();
            String[] items;
            if (lower.contains("movie room") || lower.contains("movie")) {
                items = new String[]{
                        "Movie Room · Continue Watching",
                        "Movie Room · Favorites",
                        "Movie Room · Trending Now",
                        "Movie Room · Recently Added"
                };
            } else {
                items = new String[]{
                        label + " · Continue Watching",
                        label + " · My List",
                        label + " · Top Trending",
                        "Open " + label + " for your personal catalog"
                };
            }
            rows.add(addPreviewRail(parent, label + " · HOME WIDGET", items));
        }

        for (ResolveInfo info : discoverInstalledApps()) {
            String label = String.valueOf(info.loadLabel(getPackageManager()));
            String lower = label.toLowerCase();
            if (lower.contains("live tv") || lower.equals("pluto tv") || lower.contains("sling")
                    || lower.contains("youtube tv") || lower.contains("tubi")) {
                rows.add(addPreviewRail(parent, "LIVE TV · " + label,
                        new String[]{label + " · Live now", label + " · Channels", label + " · Guide"}));
            }
        }
        return rows;
    }

    private int previewArtwork(String title) {
        String lower = title == null ? "" : title.toLowerCase();
        if (lower.contains("snoopy")) return R.drawable.backdrop_snoopy;
        if (lower.contains("paddington")) return R.drawable.backdrop_paddington_2;
        if (lower.contains("fifty")) return R.drawable.backdrop_fifty_shades;
        if (lower.contains("home")) return R.drawable.backdrop_home_alone;
        return R.drawable.taylormade_movies_cover;
    }

    private void previewMovieCard(String title) {
        if (homeDetailTitle == null) return;
        homeDetailTitle.setText(title);
        homeDetailDescription.setText("Autoplay preview · Hover with the remote to watch");
        homeDetailMeta.setText("Movie Room · Select to open this title");
        if (homeDetailIcon != null) homeDetailIcon.setImageResource(previewArtwork(title));
    }

    private void openPreviewTarget(String title) {
        for (ResolveInfo info : discoverInstalledApps()) {
            String label = String.valueOf(info.loadLabel(getPackageManager()));
            if (label.equalsIgnoreCase(title) || title.toLowerCase().startsWith(label.toLowerCase() + " ·")) {
                launchInstalledApp(info);
                return;
            }
        }
        openMovieRoomApp();
    }

    private List<ResolveInfo> preferredHomeApps() {
        List<ResolveInfo> installed = discoverMediaApps();
        String profileId = bootstrapStore.activeProfileId();
        if (!bootstrapStore.appPreferencesConfigured(profileId)) return installed;
        Set<String> preferred = bootstrapStore.preferredAppPackages(profileId);
        if (preferred.isEmpty()) return installed;
        List<ResolveInfo> filtered = new ArrayList<>();
        for (ResolveInfo info : installed) {
            if (info.activityInfo != null && preferred.contains(info.activityInfo.packageName)) filtered.add(info);
        }
        return filtered.isEmpty() ? installed : filtered;
    }

    private List<ResolveInfo> discoverMediaApps() {
        List<ResolveInfo> media = new ArrayList<>();
        for (ResolveInfo info : discoverInstalledApps()) {
            String label = String.valueOf(info.loadLabel(getPackageManager())).toLowerCase();
            String packageName = info.activityInfo == null ? "" : info.activityInfo.packageName.toLowerCase();
            if (label.contains("netflix") || label.contains("prime") || label.contains("youtube")
                    || label.contains("disney") || label.contains("hulu") || label.contains("paramount")
                    || label.contains("peacock") || label.contains("apple tv") || label.contains("silk")
                    || label.contains("appstore") || label.contains("app store") || label.contains("movie")
                    || label.contains("jellyfin") || label.contains("plex") || label.contains("kodi")
                    || label.contains("vlc") || packageName.contains("netflix") || packageName.contains("youtube")) {
                media.add(info);
            }
        }
        return media;
    }

    private void showProfileMenu(View anchor) {
        LinearLayout menu = column(PANEL);
        menu.setPadding(18, 14, 18, 14);
        List<Button> menuButtons = new ArrayList<>();
        String[] actions = {"Continue Watching", "Recently Added", "Trending Now", "Movies & Series", "Genres", "My Apps", "Settings", "Switch profile", "Reset Movie Room OS"};
        for (String action : actions) {
            Button item = button(action, Color.TRANSPARENT, action.startsWith("Reset") ? GOLD : IVORY);
            item.setGravity(Gravity.LEFT | Gravity.CENTER_VERTICAL);
            item.setOnClickListener(view -> {
                PopupWindow popupWindow = (PopupWindow) view.getTag();
                popupWindow.dismiss();
                if (action.equals("Genres")) showGenresScreen();
                else if (action.equals("My Apps")) showAppsScreen();
                else if (action.equals("Settings")) showSettingsScreen();
                else if (action.equals("Switch profile")) showProfilesScreen();
                else if (action.startsWith("Reset")) {
                    bootstrapStore.reset();
                    showBootstrapScreen();
                } else openMovieRoomApp();
            });
            menu.addView(item, new LinearLayout.LayoutParams(420, 58));
            menuButtons.add(item);
        }

        PopupWindow popup = new PopupWindow(menu, 460, 590, true);
        popup.setBackgroundDrawable(new ColorDrawable(PANEL));
        popup.setOutsideTouchable(true);
        popup.setElevation(16);
        for (Button item : menuButtons) item.setTag(popup);
        popup.showAsDropDown(anchor, -400, -610);
        menuButtons.get(0).requestFocus();
    }

    private GradientDrawable cinematicBackground() {
        GradientDrawable gradient = new GradientDrawable(
                GradientDrawable.Orientation.TL_BR,
                new int[]{0xff09040f, 0xff3d0d25, 0xffb31f45, 0xff7e5145});
        gradient.setCornerRadius(0);
        return gradient;
    }

    private GradientDrawable appDockBackground(boolean focused) {
        GradientDrawable circle = new GradientDrawable();
        circle.setShape(GradientDrawable.OVAL);
        circle.setColor(focused ? 0xcc5d1833 : 0x66241829);
        circle.setStroke(focused ? 4 : 2, focused ? GOLD : 0x99f0c45b);
        return circle;
    }

    /** Decorative low-contrast wave lines that keep the dock cinematic without blocking text. */
    private static final class CinematicWaveView extends View {
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);

        CinematicWaveView(android.content.Context context) {
            super(context);
            setWillNotDraw(false);
            paint.setStyle(Paint.Style.STROKE);
            paint.setStrokeWidth(2.5f);
        }

        @Override
        protected void onDraw(Canvas canvas) {
            super.onDraw(canvas);
            float width = getWidth();
            float height = getHeight();
            for (int index = 0; index < 3; index++) {
                Path wave = new Path();
                float y = height * (0.52f + index * 0.12f);
                wave.moveTo(0, y);
                wave.cubicTo(width * 0.22f, y - 52, width * 0.36f, y + 48, width * 0.58f, y);
                wave.cubicTo(width * 0.76f, y - 44, width * 0.88f, y + 42, width, y - 8);
                paint.setColor(index == 1 ? 0x55f0c45b : 0x338e6a88);
                canvas.drawPath(wave, paint);
            }
        }
    }

    /** Four subdued movie backdrops for the first-start profile chooser. */
    private static final class RetroPreviewWall extends View {
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final int[] artwork = {
                R.drawable.backdrop_home_alone,
                R.drawable.backdrop_paddington_2,
                R.drawable.backdrop_snoopy,
                R.drawable.backdrop_fifty_shades
        };
        private float phase;

        RetroPreviewWall(android.content.Context context) {
            super(context);
            setWillNotDraw(false);
            setAlpha(0.72f);
        }

        @Override
        protected void onDraw(Canvas canvas) {
            super.onDraw(canvas);
            float width = getWidth();
            float height = getHeight();
            paint.setStyle(Paint.Style.FILL);
            for (int index = 0; index < artwork.length; index++) {
                float panelWidth = width / 4f;
                float wobbleX = (float) Math.sin(phase + index * 1.17f) * 8f;
                float wobbleY = (float) Math.cos(phase * 1.2f + index * 0.83f) * 5f;
                float runnerTop = height * 0.57f;
                RectF screen = new RectF(index * panelWidth + wobbleX + 5f, runnerTop + wobbleY + 5f,
                        (index + 1) * panelWidth + wobbleX + 10f, height + wobbleY + 8f);
                RectF television = new RectF(screen.left - 10f, screen.top - 10f, screen.right + 10f, screen.bottom + 10f);
                paint.setColor(0xee130d18);
                canvas.drawRoundRect(television, 24f, 24f, paint);
                paint.setStyle(Paint.Style.STROKE);
                paint.setStrokeWidth(4f);
                paint.setColor(index % 2 == 0 ? GOLD : CRIMSON);
                canvas.drawRoundRect(television, 24f, 24f, paint);
                paint.setStyle(Paint.Style.FILL);
                canvas.save();
                canvas.clipRect(screen);
                Drawable drawable = getResources().getDrawable(artwork[index]);
                drawable.setAlpha(230);
                drawable.setBounds((int) screen.left, (int) screen.top, (int) screen.right, (int) screen.bottom);
                drawable.draw(canvas);
                paint.setColor(0x18100711);
                canvas.drawRect(screen, paint);
                canvas.restore();
                paint.setColor(0x335ff4ff);
                for (float scanY = screen.top + 4f; scanY < screen.bottom; scanY += 8f) {
                    canvas.drawRect(screen.left, scanY, screen.right, scanY + 1f, paint);
                }
            }
            paint.setColor(0x30100711);
            canvas.drawRect(0, height * 0.57f, width, height, paint);
            paint.setColor(0x243f293b);
            for (float scanY = height * 0.57f; scanY < height; scanY += 8f) canvas.drawRect(0, scanY, width, scanY + 1f, paint);
            phase += 0.035f;
            postInvalidateDelayed(42L);
        }
    }

    private GradientDrawable cinematicPanel() {
        GradientDrawable gradient = new GradientDrawable(
                GradientDrawable.Orientation.TL_BR,
                new int[]{0xee160914, 0xcc3a1227});
        gradient.setCornerRadius(28);
        gradient.setStroke(2, 0x88f0c45b);
        return gradient;
    }

    private ImageView profileImage(ProfileStore.Profile profile, int size) {
        ImageView image = new ImageView(this);
        image.setImageResource(profile.avatarResource);
        image.setScaleType(ImageView.ScaleType.CENTER_CROP);
        GradientDrawable ring = new GradientDrawable();
        ring.setShape(GradientDrawable.OVAL);
        ring.setColor(profile.accentColor);
        ring.setStroke(5, GOLD);
        image.setBackground(ring);
        image.setPadding(6, 6, 6, 6);
        image.setContentDescription("Profile artwork");
        return image;
    }

    private List<Button> addShelf(LinearLayout parent, String title, String[] cards) {
        List<Button> shelfButtons = new ArrayList<>();
        TextView heading = text(title, 20, TEXT);
        heading.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        LinearLayout.LayoutParams headingParams = new LinearLayout.LayoutParams(-1, -2);
        headingParams.setMargins(0, 24, 0, 10);
        parent.addView(heading, headingParams);

        HorizontalScrollView rail = new HorizontalScrollView(this);
        rail.setHorizontalScrollBarEnabled(false);
        LinearLayout cardsRow = row();
        for (String cardTitle : cards) {
            Button card = button(cardTitle, PANEL, TEXT);
            card.setGravity(Gravity.CENTER);
            card.setOnClickListener(view -> onCardSelected(cardTitle));
            LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(220, 82);
            params.setMargins(0, 0, 14, 0);
            cardsRow.addView(card, params);
            shelfButtons.add(card);
        }
        rail.addView(cardsRow);
        parent.addView(rail, new LinearLayout.LayoutParams(-1, 94));
        return shelfButtons;
    }

    private void showBootstrapScreen() {
        profileChooserScreen = false;
        LinearLayout root = column(NAVY);
        root.setBackgroundColor(Color.TRANSPARENT);
        root.setPadding(54, 38, 54, 38);
        List<List<Button>> focusRows = new ArrayList<>();

        TextView eyebrow = text("MOVIE ROOM OS · FIRST START", 14, GOLD);
        eyebrow.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        root.addView(eyebrow);
        TextView heading = text("Make this TV yours", 42, IVORY);
        heading.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        root.addView(heading);
        root.addView(text("Choose a starting point. Your full library stays behind setup until you create a profile.", 19, IVORY));

        LinearLayout carousel = row();
        carousel.setGravity(Gravity.CENTER);
        List<Button> carouselButtons = new ArrayList<>();
        Button create = circleButton("＋\nCreate Profile", CRIMSON, 270);
        Drawable createArt = getResources().getDrawable(R.drawable.avatar_bunny);
        createArt.setBounds(0, 0, 112, 112);
        create.setCompoundDrawables(null, createArt, null, null);
        create.setCompoundDrawablePadding(2);
        create.setContentDescription("Create a profile");
        create.setOnClickListener(view -> showProfileTypeScreen());
        carousel.addView(create, new LinearLayout.LayoutParams(270, 270));
        carouselButtons.add(create);

        Button settings = circleButton("⚙\nSettings", PURPLE, 210);
        settings.setContentDescription("Movie Room OS settings");
        settings.setOnClickListener(view -> showSettingsScreen());
        LinearLayout.LayoutParams settingsParams = new LinearLayout.LayoutParams(210, 210);
        settingsParams.setMargins(42, 30, 42, 30);
        carousel.addView(settings, settingsParams);
        carouselButtons.add(settings);

        Button close = circleButton("×\nClose OS", PANEL, 210);
        close.setContentDescription("Close Movie Room OS");
        close.setOnClickListener(view -> finishAndRemoveTask());
        carousel.addView(close, new LinearLayout.LayoutParams(210, 210));
        carouselButtons.add(close);

        Button network = circleButton("⌁\nNetwork", PANEL, 180);
        network.setContentDescription("Network settings");
        network.setOnClickListener(view -> openDeviceSettings("General network"));
        carousel.addView(network, new LinearLayout.LayoutParams(180, 180));
        carouselButtons.add(network);

        Button bluetooth = circleButton("ᛒ\nBluetooth", PANEL, 180);
        bluetooth.setContentDescription("Bluetooth settings");
        bluetooth.setOnClickListener(view -> openDeviceSettings("Bluetooth"));
        carousel.addView(bluetooth, new LinearLayout.LayoutParams(180, 180));
        carouselButtons.add(bluetooth);

        Button appLocker = circleButton("▣\nApp Locker", PANEL, 180);
        appLocker.setContentDescription("App locker and installed apps");
        appLocker.setOnClickListener(view -> showAppsScreen());
        carousel.addView(appLocker, new LinearLayout.LayoutParams(180, 180));
        carouselButtons.add(appLocker);

        Button storage = circleButton("▤\nStorage", PANEL, 180);
        storage.setContentDescription("Storage and media settings");
        storage.setOnClickListener(view -> openDeviceSettings("Android Settings"));
        carousel.addView(storage, new LinearLayout.LayoutParams(180, 180));
        carouselButtons.add(storage);

        Button developer = circleButton("⌘\nDeveloper", PANEL, 180);
        developer.setContentDescription("Developer settings");
        developer.setOnClickListener(view -> openDeveloperSettings());
        carousel.addView(developer, new LinearLayout.LayoutParams(180, 180));
        carouselButtons.add(developer);

        root.addView(carousel, new LinearLayout.LayoutParams(-1, 330));
        for (Button item : carouselButtons) item.setTag(carousel);
        focusRows.add(carouselButtons);
        connectFocusRows(focusRows);
        FrameLayout stage = new FrameLayout(this);
        stage.setBackground(cinematicBackground());
        stage.addView(createPreviewWall(), new FrameLayout.LayoutParams(-1, -1));
        stage.addView(root, new FrameLayout.LayoutParams(-1, -1));
        setContentView(stage);
        focusRows.get(0).get(0).requestFocus();
    }

    private void showProfileTypeScreen() {
        profileChooserScreen = false;
        LinearLayout root = column(NAVY);
        root.setBackground(cinematicBackground());
        root.setPadding(54, 38, 54, 38);
        List<List<Button>> focusRows = new ArrayList<>();
        TextView eyebrow = text("CREATE PROFILE", 15, GOLD);
        eyebrow.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        root.addView(eyebrow);
        TextView heading = text("Choose a profile type", 40, IVORY);
        heading.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        root.addView(heading);
        root.addView(text("Parental controls can be added to Kid profiles later. For now, both types use the same profile carousel.", 19, IVORY));

        LinearLayout choices = row();
        choices.setGravity(Gravity.CENTER);
        List<Button> choiceButtons = new ArrayList<>();
        Button regular = circleButton("●\nRegular user", CRIMSON, 260);
        regular.setContentDescription("Create a regular user profile");
        regular.setOnClickListener(view -> {
            pendingProfileType = "Regular user";
            showProfileCreationScreen();
        });
        choices.addView(regular, new LinearLayout.LayoutParams(260, 260));
        choiceButtons.add(regular);
        Button kid = circleButton("★\nKid profile", PURPLE, 220);
        kid.setContentDescription("Create a kid profile");
        kid.setOnClickListener(view -> {
            pendingProfileType = "Kid profile";
            showProfileCreationScreen();
        });
        LinearLayout.LayoutParams kidParams = new LinearLayout.LayoutParams(220, 220);
        kidParams.setMargins(70, 22, 70, 22);
        choices.addView(kid, kidParams);
        choiceButtons.add(kid);
        root.addView(choices, new LinearLayout.LayoutParams(-1, 320));
        for (Button item : choiceButtons) item.setTag(choices);
        focusRows.add(choiceButtons);

        Button back = button("Back to first start", Color.TRANSPARENT, GOLD);
        back.setOnClickListener(view -> showBootstrapScreen());
        root.addView(back, new LinearLayout.LayoutParams(-1, 70));
        focusRows.add(singleton(back));
        connectFocusRows(focusRows);
        setContentView(root);
        regular.requestFocus();
    }

    private void showProfileCreationScreen() {
        profileChooserScreen = false;
        LinearLayout root = column(NAVY);
        root.setBackground(cinematicBackground());
        root.setPadding(48, 28, 48, 28);
        root.setGravity(Gravity.CENTER_HORIZONTAL);
        List<List<Button>> focusRows = new ArrayList<>();
        TextView eyebrow = text("CREATE " + pendingProfileType.toUpperCase(), 15, GOLD);
        eyebrow.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        eyebrow.setGravity(Gravity.CENTER);
        root.addView(eyebrow);
        TextView heading = text("Choose your avatar", 38, IVORY);
        heading.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        heading.setGravity(Gravity.CENTER);
        root.addView(heading);
        TextView instructions = text("Choose an avatar to create a local profile and open Home. Naming is temporarily skipped so the TV flow cannot get stuck on the keyboard.", 18, IVORY);
        instructions.setGravity(Gravity.CENTER);
        root.addView(instructions);

        LinearLayout avatarGrid = column(Color.TRANSPARENT);
        List<Button> avatarRow = new ArrayList<>();
        for (int index = 0; index < 9; index++) {
            final int avatarIndex = index;
            Button avatar = avatarButton("Avatar " + (index + 1), profileStore.customAvatarResource(index));
            avatar.setContentDescription("Cartoon avatar " + (index + 1));
            String defaultName = pendingProfileType.equals("Kid profile") ? "Kid Profile" : "Profile";
            avatar.setOnClickListener(view -> completeCustomProfile(defaultName, avatarIndex));
            avatarRow.add(avatar);
            if (avatarRow.size() == 3) {
                LinearLayout row = row();
                row.setGravity(Gravity.CENTER);
                for (Button item : avatarRow) row.addView(item, new LinearLayout.LayoutParams(190, 190));
                avatarGrid.addView(row, new LinearLayout.LayoutParams(-1, 198));
                focusRows.add(new ArrayList<>(avatarRow));
                avatarRow.clear();
            }
        }
        root.addView(avatarGrid, new LinearLayout.LayoutParams(-1, 610));

        Button back = button("Back to first start", Color.TRANSPARENT, GOLD);
        back.setOnClickListener(view -> showBootstrapScreen());
        root.addView(back, new LinearLayout.LayoutParams(-1, 62));
        connectFocusRows(focusRows);
        setContentView(root);
        focusRows.get(0).get(0).requestFocus();
    }

    private void completeCustomProfile(String name, int avatarIndex) {
        if (name == null || name.trim().isEmpty()) {
            Toast.makeText(this, "Enter a name or screen name first.", Toast.LENGTH_LONG).show();
            return;
        }
        ProfileStore.Profile profile = profileStore.createCustomProfile(name, pendingProfileType, avatarIndex);
        selectedProfileId = profile.id;
        activeProfile = profile.displayName;
        bootstrapStore.completeSetup(profile.id);
        profileStore.remember(profile.id);
        showPreferredAppsScreen(profile.id);
    }

    private void showPreferredAppsScreen(String profileId) {
        LinearLayout root = column(NAVY);
        root.setBackground(cinematicBackground());
        root.setPadding(44, 28, 44, 28);
        List<List<Button>> focusRows = new ArrayList<>();
        TextView eyebrow = text("FIRST HOME SETUP · " + activeProfile.toUpperCase(), 15, GOLD);
        eyebrow.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        eyebrow.setGravity(Gravity.CENTER);
        root.addView(eyebrow);
        TextView title = text("Choose your Home apps", 38, IVORY);
        title.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        title.setGravity(Gravity.CENTER);
        root.addView(title);
        boolean kidProfile = profileStore.isKidProfile(profileId);
        TextView intro = text(kidProfile
                ? "Choose the apps for the Kids Home folder. Netflix and Peacock are included as choices; unavailable apps can be installed later from the Amazon Appstore."
                : "Select the apps that stay in your left-side Home folder. Hover an app to preview its categories on the right.", 18, IVORY);
        intro.setGravity(Gravity.CENTER);
        root.addView(intro);

        TextView controls = text("REMOTE: ↑ ↓ ← → MOVE   •   OK / ENTER SELECT   •   PAGE UP / DOWN SCROLL   •   GOLD RING = SELECTED", 14, GOLD);
        controls.setGravity(Gravity.CENTER);
        controls.setContentDescription("Remote controls: move with the directional pad, select with OK or Enter, and use Page Up or Page Down to scroll.");
        root.addView(controls);

        TextView appPreviewTitle = text("Select an app", 30, IVORY);
        appPreviewTitle.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        TextView appPreviewDescription = text("The focused round icon will show its available metadata here.", 18, IVORY);
        TextView appPreviewMeta = text("Continue watching · Favorites · Trending · Recently added", 16, GOLD);
        LinearLayout appPreview = column(0x55241829);
        appPreview.setPadding(28, 24, 28, 24);
        appPreview.addView(text("APP PREVIEW", 15, GOLD));
        appPreview.addView(appPreviewTitle);
        appPreview.addView(appPreviewDescription);
        appPreview.addView(appPreviewMeta);

        Set<String> selected = new HashSet<>();
        List<ResolveInfo> installed = discoverInstalledApps();
        if (!installed.isEmpty()) selected.add(installed.get(0).activityInfo.packageName);
        List<AppChoice> choices = new ArrayList<>();
        Set<String> choicePackages = new HashSet<>();
        for (ResolveInfo info : installed) {
            if (info.activityInfo == null) continue;
            String packageName = info.activityInfo.packageName;
            if (choicePackages.add(packageName)) {
                choices.add(new AppChoice(packageName, String.valueOf(info.loadLabel(getPackageManager())), info));
            }
        }
        if (kidProfile) {
            addRequiredAppChoice(choices, choicePackages, NETFLIX_PACKAGE, "Netflix");
            addRequiredAppChoice(choices, choicePackages, PEACOCK_PACKAGE, "Peacock");
        }
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setVerticalScrollBarEnabled(true);
        scroll.setScrollbarFadingEnabled(false);
        LinearLayout grid = column(Color.TRANSPARENT);
        List<Button> row = new ArrayList<>();
        for (AppChoice choice : choices) {
            String packageName = choice.packageName;
            String label = choice.label;
            boolean installedChoice = choice.isInstalled();
            Button app = button(appChoiceLabel(label, installedChoice, selected.contains(packageName)), PANEL, IVORY);
            app.setGravity(Gravity.CENTER);
            app.setTextSize(15);
            app.setContentDescription("Choose " + label + " for the Home app folder" + (installedChoice ? "" : "; app is not installed"));
            Drawable icon = installedChoice ? choice.resolveInfo.loadIcon(getPackageManager()) : getDrawable(android.R.drawable.ic_menu_help);
            if (icon != null) {
                icon.setBounds(0, 0, 64, 64);
                app.setCompoundDrawables(null, icon, null, null);
            }
            app.setBackground(appWidgetCircle(false));
            app.setOnClickListener(view -> {
                if (selected.contains(packageName)) selected.remove(packageName);
                else selected.add(packageName);
                app.setBackground(appWidgetCircle(selected.contains(packageName) || app.hasFocus()));
                app.setText(appChoiceLabel(label, installedChoice, selected.contains(packageName)));
            });
            app.setOnFocusChangeListener((view, hasFocus) -> {
                app.setBackground(appWidgetCircle(hasFocus || selected.contains(packageName)));
                view.setScaleX(hasFocus ? 1.08f : 1f);
                view.setScaleY(hasFocus ? 1.08f : 1f);
                if (hasFocus) {
                    appPreviewTitle.setText(label);
                    if (installedChoice) {
                        appPreviewDescription.setText("Installed app · Select to add or remove from this profile's Home folder.");
                        appPreviewMeta.setText(label + " · Continue watching · Favorites/My List · Trending");
                        previewInstalledApp(choice.resolveInfo);
                    } else {
                        appPreviewDescription.setText("Available choice · Install this app from the Amazon Appstore, then it can appear here.");
                        appPreviewMeta.setText("Netflix and Peacock are optional Kids profile apps");
                    }
                }
            });
            row.add(app);
            if (row.size() == 3) {
                LinearLayout itemRow = row();
                itemRow.setGravity(Gravity.CENTER);
                for (Button item : row) itemRow.addView(item, new LinearLayout.LayoutParams(190, 148));
                grid.addView(itemRow, new LinearLayout.LayoutParams(-1, 162));
                focusRows.add(new ArrayList<>(row));
                row.clear();
            }
        }
        if (!row.isEmpty()) {
            LinearLayout itemRow = row();
            itemRow.setGravity(Gravity.CENTER);
            for (Button item : row) itemRow.addView(item, new LinearLayout.LayoutParams(190, 148));
            grid.addView(itemRow, new LinearLayout.LayoutParams(-1, 162));
            focusRows.add(new ArrayList<>(row));
        }
        scroll.addView(grid);
        LinearLayout body = row();
        body.addView(scroll, new LinearLayout.LayoutParams(0, 0, 0.46f));
        body.addView(appPreview, new LinearLayout.LayoutParams(0, -1, 0.54f));
        root.addView(body, new LinearLayout.LayoutParams(-1, 0, 1));

        TextView scrollHint = text("APP LIST  ·  Use ↑ ↓ or PAGE UP / PAGE DOWN to reveal more choices", 14, GOLD);
        scrollHint.setGravity(Gravity.CENTER);
        root.addView(scrollHint, new LinearLayout.LayoutParams(-1, 42));
        Button done = button("Save Home folder and open Home", CRIMSON, IVORY);
        done.setContentDescription("Save preferred Home apps");
        done.setOnClickListener(view -> {
            bootstrapStore.setPreferredAppPackages(profileId, selected);
            showHome();
        });
        root.addView(done, new LinearLayout.LayoutParams(-1, 72));
        focusRows.add(singleton(done));
        connectFocusRows(focusRows);
        setContentView(root);
        if (!focusRows.isEmpty()) focusRows.get(0).get(0).requestFocus();
    }

    private void addRequiredAppChoice(List<AppChoice> choices, Set<String> packages, String packageName, String label) {
        if (packages.contains(packageName)) return;
        ResolveInfo installed = null;
        for (ResolveInfo info : discoverInstalledApps()) {
            if (info.activityInfo != null && packageName.equals(info.activityInfo.packageName)) {
                installed = info;
                break;
            }
        }
        choices.add(new AppChoice(packageName, label, installed));
        packages.add(packageName);
    }

    private String appChoiceLabel(String label, boolean installed, boolean selected) {
        if (selected) return label + "\nSELECTED";
        return label + (installed ? "\nSELECT APP" : "\nSAVE FOR INSTALL");
    }

    private Button circleButton(String label, int color, int size) {
        Button result = button(label, color, IVORY);
        result.setGravity(Gravity.CENTER);
        result.setTextSize(size >= 260 ? 21 : 18);
        result.setOnFocusChangeListener((focusedView, hasFocus) -> {
            GradientDrawable circle = new GradientDrawable();
            circle.setShape(GradientDrawable.OVAL);
            circle.setColor(hasFocus && color != PANEL ? 0xcc6b1737 : color);
            circle.setStroke(hasFocus ? 6 : (size >= 260 ? 6 : 3), hasFocus ? GOLD : (size >= 260 ? GOLD : 0x99fff7e5));
            focusedView.setBackground(circle);
            ((Button) focusedView).setTextColor(hasFocus ? GOLD : IVORY);
            focusedView.animate().scaleX(hasFocus ? 1.12f : 0.82f).scaleY(hasFocus ? 1.12f : 0.82f)
                    .setDuration(220L).start();
            if (focusedView.getTag() instanceof LinearLayout && hasFocus) {
                LinearLayout carousel = (LinearLayout) focusedView.getTag();
                centerCarousel(carousel, focusedView);
            }
        });
        result.setBackground(circleBackground(color, size >= 260 ? GOLD : 0x99fff7e5, size >= 260 ? 6 : 3));
        return result;
    }

    private GradientDrawable appWidgetCircle(boolean focused) {
        GradientDrawable circle = new GradientDrawable();
        circle.setShape(GradientDrawable.OVAL);
        circle.setColor(focused ? 0xcc5d1833 : 0x66241829);
        circle.setStroke(focused ? 5 : 2, focused ? GOLD : 0x99f0c45b);
        return circle;
    }

    private void centerCarousel(LinearLayout carousel, View focusedView) {
        carousel.post(() -> {
            float target = carousel.getWidth() / 2f;
            float focusedCenter = focusedView.getLeft() + focusedView.getWidth() / 2f;
            int focusedIndex = carousel.indexOfChild(focusedView);
            float spacing = Math.max(150f, Math.min(270f, carousel.getWidth() * 0.19f));
            for (int index = 0; index < carousel.getChildCount(); index++) {
                View item = carousel.getChildAt(index);
                int distance = index - focusedIndex;
                float originalCenter = item.getLeft() + item.getWidth() / 2f;
                float desiredCenter = target + distance * spacing;
                float scale = distance == 0 ? 1.16f : (Math.abs(distance) == 1 ? 0.98f : 0.82f);
                float arcY = Math.min(44f, Math.abs(distance) * 22f);
                float rotation = Math.max(-9f, Math.min(9f, distance * -4f));
                float alpha = distance == 0 ? 1f : (Math.abs(distance) == 1 ? 0.9f : 0.7f);
                item.animate()
                        .translationX(desiredCenter - originalCenter)
                        .translationY(arcY)
                        .scaleX(scale)
                        .scaleY(scale)
                        .rotation(rotation)
                        .alpha(alpha)
                        .setDuration(280L)
                        .start();
            }
        });
    }

    private Button avatarButton(String label, int resourceId) {
        return new CircularAvatarButton(this, resourceId, label);
    }

    /** The supplied artwork is the circle; there is no colored button plate behind it. */
    private static final class CircularAvatarButton extends Button {
        private final Bitmap bitmap;
        private final String label;
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);

        CircularAvatarButton(android.content.Context context, int resourceId, String label) {
            super(context);
            bitmap = BitmapFactory.decodeResource(context.getResources(), resourceId);
            this.label = label;
            paint.setFilterBitmap(true);
            paint.setDither(true);
            setId(View.generateViewId());
            setBackgroundColor(Color.TRANSPARENT);
            setFocusable(true);
            setFocusableInTouchMode(true);
            setContentDescription(label + " avatar");
            setOnFocusChangeListener((view, hasFocus) -> invalidate());
        }

        @Override
        protected void onDraw(Canvas canvas) {
            float radius = Math.min(getWidth() * 0.38f, (getHeight() - 42f) * 0.38f);
            float cx = getWidth() / 2f;
            float cy = radius + 12f;
            RectF bounds = new RectF(cx - radius, cy - radius, cx + radius, cy + radius);
            Path circle = new Path();
            circle.addCircle(cx, cy, radius, Path.Direction.CW);
            canvas.save();
            canvas.clipPath(circle);
            canvas.drawBitmap(bitmap, null, bounds, paint);
            canvas.restore();
            paint.setStyle(Paint.Style.STROKE);
            paint.setStrokeWidth(hasFocus() ? 5f : 2f);
            paint.setColor(hasFocus() ? GOLD : 0xaafff7e5);
            canvas.drawCircle(cx, cy, radius + (hasFocus() ? 5f : 2f), paint);
            paint.setStyle(Paint.Style.FILL);
            paint.setTextAlign(Paint.Align.CENTER);
            paint.setTextSize(Math.max(14f, Math.min(21f, getWidth() * 0.085f)));
            paint.setColor(hasFocus() ? GOLD : IVORY);
            canvas.drawText(label, cx, getHeight() - 12f, paint);
        }
    }

    private GradientDrawable circleBackground(int color, int strokeColor, int strokeWidth) {
        GradientDrawable circle = new GradientDrawable();
        circle.setShape(GradientDrawable.OVAL);
        circle.setColor(color);
        circle.setStroke(strokeWidth, strokeColor);
        return circle;
    }

    private void showAppsScreen() {
        LinearLayout root = column(NAVY);
        root.setBackground(cinematicBackground());
        root.setPadding(42, 30, 42, 32);
        List<List<Button>> focusRows = new ArrayList<>();
        LinearLayout header = row();
        TextView title = text("Installed apps", 34, IVORY);
        title.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        header.addView(title, weight(1));
        Button back = button("Back", PANEL, IVORY);
        back.setOnClickListener(view -> returnToShellHome());
        header.addView(back, wrap());
        root.addView(header, new LinearLayout.LayoutParams(-1, 74));
        root.addView(text("Apps are discovered from the installed Android/Fire TV launchers. Missing apps stay out of the profile shelf.", 18, IVORY));

        List<ResolveInfo> installedApps = discoverInstalledApps();
        LinearLayout list = column(Color.TRANSPARENT);
        List<Button> row = new ArrayList<>();
        for (ResolveInfo info : installedApps) {
            String label = String.valueOf(info.loadLabel(getPackageManager()));
            Button app = button(label, PANEL, IVORY);
            app.setGravity(Gravity.CENTER_VERTICAL | Gravity.LEFT);
            Drawable icon = info.loadIcon(getPackageManager());
            if (icon != null) app.setCompoundDrawablesWithIntrinsicBounds(icon, null, null, null);
            app.setOnClickListener(view -> launchInstalledApp(info));
            row.add(app);
            list.addView(app, new LinearLayout.LayoutParams(-1, 72));
            if (row.size() == 2) {
                focusRows.add(row);
                row = new ArrayList<>();
            }
        }
        if (!row.isEmpty()) focusRows.add(row);
        ScrollView scroll = new ScrollView(this);
        scroll.addView(list);
        root.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));
        focusRows.add(0, singleton(back));
        connectFocusRows(focusRows);
        setContentView(root);
        focusRows.get(0).get(0).requestFocus();
    }

    private List<ResolveInfo> discoverInstalledApps() {
        Intent leanback = new Intent(Intent.ACTION_MAIN);
        leanback.addCategory(Intent.CATEGORY_LEANBACK_LAUNCHER);
        Intent launcher = new Intent(Intent.ACTION_MAIN);
        launcher.addCategory(Intent.CATEGORY_LAUNCHER);
        List<ResolveInfo> results = new ArrayList<>();
        results.addAll(getPackageManager().queryIntentActivities(leanback, PackageManager.MATCH_ALL));
        results.addAll(getPackageManager().queryIntentActivities(launcher, PackageManager.MATCH_ALL));
        Set<String> seen = new HashSet<>();
        List<ResolveInfo> unique = new ArrayList<>();
        for (ResolveInfo info : results) {
            String packageName = info.activityInfo == null ? "" : info.activityInfo.packageName;
            if (packageName.isEmpty() || packageName.equals(getPackageName()) || !seen.add(packageName)) continue;
            unique.add(info);
        }
        return unique;
    }

    private void launchInstalledApp(ResolveInfo info) {
        if (info == null || info.activityInfo == null) return;
        Intent launch = new Intent(Intent.ACTION_MAIN);
        launch.addCategory(Intent.CATEGORY_LAUNCHER);
        launch.setPackage(info.activityInfo.packageName);
        try {
            startActivity(launch);
        } catch (RuntimeException error) {
            Toast.makeText(this, "That installed app is unavailable.", Toast.LENGTH_LONG).show();
        }
    }

    private void previewInstalledApp(ResolveInfo info) {
        if (info == null || info.activityInfo == null || homeDetailTitle == null) return;
        String label = String.valueOf(info.loadLabel(getPackageManager()));
        homeDetailTitle.setText(label);
        homeDetailDescription.setText("App preview · Hover to browse categories and select to open " + label);
        if (homeDetailMeta != null) {
            homeDetailMeta.setText("Recently watched · Top viewing · Movies · Series · Recommended");
        }
        bootstrapStore.setLastUsedLabel(label);
        Drawable icon = info.loadIcon(getPackageManager());
        if (icon != null) homeDetailIcon.setImageDrawable(icon);
    }

    private void connectFocusRows(List<List<Button>> rows) {
        activeFocusRows = rows;
        focusedRowIndex = 0;
        focusedColumnIndex = 0;
        for (int rowIndex = 0; rowIndex < rows.size(); rowIndex++) {
            List<Button> row = rows.get(rowIndex);
            for (int column = 0; column < row.size(); column++) {
                Button current = row.get(column);
                current.setNextFocusLeftId(row.get(Math.max(0, column - 1)).getId());
                current.setNextFocusRightId(row.get(Math.min(row.size() - 1, column + 1)).getId());
                if (rowIndex > 0) {
                    List<Button> above = rows.get(rowIndex - 1);
                    current.setNextFocusUpId(above.get(Math.min(column, above.size() - 1)).getId());
                }
                if (rowIndex + 1 < rows.size()) {
                    List<Button> below = rows.get(rowIndex + 1);
                    current.setNextFocusDownId(below.get(Math.min(column, below.size() - 1)).getId());
                }
            }
        }
    }

    /**
     * Fire TV sends DPAD events to the foreground TV activity. Keep navigation
     * inside this optional app's known button rows instead
     * of depending on Android's view-tree heuristics, which can stop at a
     * ScrollView or jump to an unexpected control.
     */
    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        RemoteMap.Action action = RemoteMap.actionFor(event);
        if (action == RemoteMap.Action.NONE) {
            return super.dispatchKeyEvent(event);
        }
        if (event.getAction() != KeyEvent.ACTION_DOWN) {
            return true;
        }

        switch (action) {
            case HOME:
                if (bootstrapStore.setupComplete()) showHome();
                else showBootstrapScreen();
                return true;
            case UP:
            case DOWN:
            case LEFT:
            case RIGHT:
                if (!bootstrapStore.setupComplete() && profileChooserScreen
                        && (action == RemoteMap.Action.LEFT || action == RemoteMap.Action.RIGHT)) {
                    rotateBootstrapProfile(action == RemoteMap.Action.LEFT ? -1 : 1);
                    return true;
                }
                return moveShellFocus(action);
            case PAGE_UP:
                return moveShellFocus(RemoteMap.Action.UP, 3);
            case PAGE_DOWN:
                return moveShellFocus(RemoteMap.Action.DOWN, 3);
            case SELECT:
                return performFocusedShellAction();
            case BACK:
                if (!bootstrapStore.setupComplete()) {
                    showBootstrapScreen();
                    return true;
                }
                showHome();
                return true;
            case MENU:
                if (!bootstrapStore.setupComplete()) {
                    showBootstrapScreen();
                    return true;
                }
                showSettingsScreen();
                return true;
            case PLAY_PAUSE:
                if (!bootstrapStore.setupComplete()) {
                    showBootstrapScreen();
                    return true;
                }
                View focused = getCurrentFocus();
                if (focused != null && focused.getTag() instanceof String
                        && ((String) focused.getTag()).startsWith("video-preview:")) {
                    focused.performClick();
                    return true;
                }
                openMovieRoomApp();
                return true;
            case REWIND:
            case FAST_FORWARD:
                Toast.makeText(this, action == RemoteMap.Action.REWIND ? "Rewind" : "Fast forward", Toast.LENGTH_SHORT).show();
                return true;
            case INFO:
                Toast.makeText(this, "Movie Room OS · " + activeProfile, Toast.LENGTH_SHORT).show();
                return true;
            case RESET:
                bootstrapStore.reset();
                showBootstrapScreen();
                return true;
            default:
                return true;
        }
    }

    private boolean moveShellFocus(RemoteMap.Action action) {
        return moveShellFocus(action, 1);
    }

    private boolean moveShellFocus(RemoteMap.Action action, int distance) {
        if (activeFocusRows.isEmpty()) {
            return true;
        }

        int[] position = findFocusedShellPosition();
        FocusGrid.Position next = new FocusGrid.Position(position[0], position[1]);
        for (int step = 0; step < distance; step++) {
            next = FocusGrid.nextPosition(activeFocusRows, next.row, next.column, action);
        }
        int nextRow = next.row;
        int nextColumn = next.column;

        Button target = activeFocusRows.get(nextRow).get(nextColumn);
        focusedRowIndex = nextRow;
        focusedColumnIndex = nextColumn;
        target.requestFocus();
        target.post(() -> target.requestRectangleOnScreen(
                new android.graphics.Rect(0, 0, target.getWidth(), target.getHeight()), true));
        return true;
    }

    private int[] findFocusedShellPosition() {
        View current = getCurrentFocus();
        for (int row = 0; row < activeFocusRows.size(); row++) {
            List<Button> buttons = activeFocusRows.get(row);
            for (int column = 0; column < buttons.size(); column++) {
                if (buttons.get(column) == current) {
                    focusedRowIndex = row;
                    focusedColumnIndex = column;
                    return new int[]{row, column};
                }
            }
        }
        int row = Math.min(focusedRowIndex, activeFocusRows.size() - 1);
        int column = Math.min(focusedColumnIndex, activeFocusRows.get(row).size() - 1);
        return new int[]{row, column};
    }

    private boolean performFocusedShellAction() {
        View current = getCurrentFocus();
        if (current instanceof Button) {
            ((Button) current).performClick();
        }
        return true;
    }

    private void onCardSelected(String title) {
        if (title.equals("Home") || title.equals("Mom") || title.equals("Morganne") || title.equals("Kids")) {
            activeProfile = title;
            showHome();
        } else if (title.contains("Settings") || title.toLowerCase().contains("network") || title.equals("Bluetooth") || title.equals("Display")) {
            openDeviceSettings(title);
        } else if (title.equals("Mobile data")) {
            openMobileNetworkSettings();
        } else if (title.equals("Wi-Fi settings")) {
            openDeviceSettings(title);
        } else {
            openMovieRoomApp();
        }
    }

    private void showProfilesScreen() {
        profileChooserScreen = false;
        LinearLayout root = column(NAVY);
        root.setBackground(cinematicBackground());
        root.setPadding(48, 30, 48, 34);
        List<List<Button>> focusRows = new ArrayList<>();
        TextView eyebrow = text("SWITCH PROFILE", 15, GOLD);
        eyebrow.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        root.addView(eyebrow);
        TextView heading = text("Choose who is watching", 38, IVORY);
        heading.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        root.addView(heading);
        root.addView(text("Your local profile is selected here with the same circular focus treatment as Home.", 18, IVORY));

        LinearLayout carousel = row();
        carousel.setGravity(Gravity.CENTER);
        List<Button> choices = new ArrayList<>();
        ProfileStore.Profile active = profileStore.find(bootstrapStore.activeProfileId());
        Button current = avatarButton(active.displayName, active.avatarResource);
        current.setContentDescription("Current profile artwork for " + active.displayName);
        current.setOnClickListener(view -> showHome());
        carousel.addView(current, new LinearLayout.LayoutParams(300, 344));
        choices.add(current);

        Button create = circleButton("＋\nCreate Profile", CRIMSON, 220);
        create.setContentDescription("Create another local profile");
        create.setOnClickListener(view -> showProfileTypeScreen());
        LinearLayout.LayoutParams createParams = new LinearLayout.LayoutParams(220, 220);
        createParams.setMargins(72, 48, 72, 48);
        carousel.addView(create, createParams);
        choices.add(create);
        root.addView(carousel, new LinearLayout.LayoutParams(-1, 390));
        for (Button item : choices) item.setTag(carousel);
        focusRows.add(choices);

        Button back = button("Back to Home", Color.TRANSPARENT, GOLD);
        back.setOnClickListener(view -> showHome());
        root.addView(back, new LinearLayout.LayoutParams(-1, 68));
        focusRows.add(singleton(back));
        connectFocusRows(focusRows);
        setContentView(root);
        current.requestFocus();
    }

    private void rotateBootstrapProfile(int direction) {
        List<ProfileStore.Profile> profiles = profileStore.defaults();
        int current = 0;
        for (int index = 0; index < profiles.size(); index++) {
            if (profiles.get(index).id.equals(selectedProfileId)) current = index;
        }
        int next = (current + direction + profiles.size()) % profiles.size();
        selectedProfileId = profiles.get(next).id;
        activeProfile = profiles.get(next).displayName;
        showProfileCreationScreen();
    }

    private void showGenresScreen() {
        showChoiceScreen("Genres", "Choose a library category", new String[]{
            "All movies", "Action", "Comedy", "Drama", "Family", "Kids",
            "Horror", "Romance", "Soap", "Animation", "Reality", "Saved"
        }, value -> {
            Toast.makeText(this, "Genre: " + value, Toast.LENGTH_SHORT).show();
            showHome();
        });
    }

    private void showChoiceScreen(String titleText, String subtitle, String[] choices, ChoiceAction action) {
        settingsScreen = false;
        LinearLayout root = column(NAVY);
        root.setPadding(28, 22, 28, 24);
        List<List<Button>> focusRows = new ArrayList<>();

        LinearLayout header = row();
        TextView title = text(titleText, 30, TEXT);
        title.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        header.addView(title, weight(2));
        Button home = button("← Home", PANEL, TEXT);
        home.setOnClickListener(view -> returnToShellHome());
        header.addView(home, wrap());
        focusRows.add(singleton(home));
        root.addView(header, new LinearLayout.LayoutParams(-1, 64));

        ScrollView scroll = new ScrollView(this);
        LinearLayout content = column(Color.TRANSPARENT);
        content.setPadding(0, 18, 0, 12);
        TextView intro = text(subtitle, 19, Color.rgb(185, 215, 228));
        content.addView(intro);
        for (int index = 0; index < choices.length; index += 2) {
            LinearLayout optionRow = row();
            List<Button> rowButtons = new ArrayList<>();
            for (int offset = 0; offset < 2 && index + offset < choices.length; offset++) {
                String choice = choices[index + offset];
                Button option = button(choice, PANEL, TEXT);
                if (titleText.equals("Profiles")) {
                    ProfileStore.Profile profile = profileStore.find(choice.toLowerCase());
                    option.setCompoundDrawablesWithIntrinsicBounds(0, profile.avatarResource, 0, 0);
                    option.setContentDescription("Profile artwork for " + choice);
                }
                option.setOnClickListener(view -> action.select(choice));
                optionRow.addView(option, new LinearLayout.LayoutParams(250, 72));
                rowButtons.add(option);
            }
            content.addView(optionRow, new LinearLayout.LayoutParams(-1, 82));
            focusRows.add(rowButtons);
        }
        scroll.addView(content);
        root.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));
        connectFocusRows(focusRows);
        setContentView(root);
        focusRows.get(0).get(0).requestFocus();
    }

    private interface ChoiceAction {
        void select(String value);
    }

    private void showSettingsScreen() {
        settingsScreen = true;
        LinearLayout root = column(NAVY);
        root.setBackground(cinematicBackground());
        root.setPadding(28, 22, 28, 24);
        List<List<Button>> focusRows = new ArrayList<>();

        LinearLayout header = row();
        TextView title = text("System settings", 30, TEXT);
        title.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        header.addView(title, weight(2));
        Button home = button("← Home", PANEL, TEXT);
        home.setOnClickListener(view -> returnToShellHome());
        header.addView(home, wrap());
        focusRows.add(singleton(home));
        root.addView(header, new LinearLayout.LayoutParams(-1, 72));

        ScrollView scroll = new ScrollView(this);
        LinearLayout content = column(Color.TRANSPARENT);
        content.setPadding(0, 24, 0, 12);
        TextView intro = text("Android-style device controls for Movie Room OS", 22, GOLD);
        intro.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        content.addView(intro);
        content.addView(text("Use the Fire TV remote to move between settings. Select opens the control. Back returns home.", 17, Color.rgb(185, 215, 228)));

        focusRows.add(addSettingsOption(content, "Remote controls & help", "Show the OK, Back, Menu, playback, and D-pad guide again", this::showRemoteGuide));
        focusRows.add(addSettingsOption(content, "Developer options", "Build number, USB debugging, animation scale", this::openDeveloperSettings));
        focusRows.add(addSettingsOption(content, "Network & internet", "Wi-Fi, Ethernet, VPN, and connection status", () -> openDeviceSettings("General network")));
        focusRows.add(addSettingsOption(content, "Storage & media", "Files, media access, and offline downloads", () -> openDeviceSettings("Android Settings")));
        focusRows.add(addSettingsOption(content, "Keep screen awake", "Prevent the display from sleeping while watching", () -> Toast.makeText(this, "Playback keep-awake is enabled by the player.", Toast.LENGTH_LONG).show()));
        focusRows.add(addSettingsOption(content, "Startup behavior", "Fire OS controls Home and startup for this optional APK", () -> Toast.makeText(this, "Fire OS remains the Home and startup controller.", Toast.LENGTH_LONG).show()));
        focusRows.add(addSettingsOption(content, "App rotation & visibility", "Choose which installed apps appear on this profile", this::showAppsScreen));
        focusRows.add(addSettingsOption(content, "App info", "Movie Room OS version 0.6.0", () -> Toast.makeText(this, "Movie Room OS 0.6.0", Toast.LENGTH_LONG).show()));
        focusRows.add(addSettingsOption(content, "Open Fire OS settings", "Open the device's native Android settings app", () -> openDeviceSettings("Android Settings")));
        focusRows.add(addSettingsOption(content, "Reset Movie Room OS", "Clear remembered profile and return to first-run setup", () -> {
            bootstrapStore.reset();
            showBootstrapScreen();
        }));

        scroll.addView(content);
        root.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));
        connectFocusRows(focusRows);
        setContentView(root);
        focusRows.get(0).get(0).requestFocus();
    }

    private List<Button> singleton(Button button) {
        List<Button> row = new ArrayList<>();
        row.add(button);
        return row;
    }

    private List<Button> addSettingsOption(LinearLayout parent, String title, String summary, Runnable action) {
        Button option = button(title + "\n" + summary, PANEL, TEXT);
        option.setGravity(Gravity.CENTER_VERTICAL | Gravity.LEFT);
        option.setOnClickListener(view -> action.run());
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(-1, 104);
        params.setMargins(0, 12, 0, 0);
        parent.addView(option, params);
        return singleton(option);
    }

    private void openDeveloperSettings() {
        try {
            startActivity(new Intent(Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS));
        } catch (RuntimeException error) {
            Toast.makeText(this, "Developer options are unavailable on this Fire TV build.", Toast.LENGTH_LONG).show();
        }
    }

    private void cycleProfile(Button button) {
        String[] profiles = {"Home", "Mom", "Morganne", "Kids"};
        for (int i = 0; i < profiles.length; i++) {
            if (profiles[i].equals(activeProfile)) {
                activeProfile = profiles[(i + 1) % profiles.length];
                button.setText(activeProfile);
                Toast.makeText(this, "Profile: " + activeProfile, Toast.LENGTH_SHORT).show();
                return;
            }
        }
    }

    private void openMovieRoomApp() {
        Intent intent = new Intent();
        intent.setComponent(new ComponentName("com.movieroom.web", "com.movieroom.web.MainActivity"));
        try {
            startActivity(intent);
        } catch (RuntimeException error) {
            Toast.makeText(this, "Install the TaylorMade Movies app to open the library.", Toast.LENGTH_LONG).show();
        }
    }

    private void openSettings() {
        showSettingsScreen();
    }

    private void returnToShellHome() {
        if (bootstrapStore.setupComplete()) showHome();
        else showBootstrapScreen();
    }

    private void openDeviceSettings(String title) {
        String action = Settings.ACTION_SETTINGS;
        if (title.equals("Wi-Fi settings")) action = Settings.ACTION_WIFI_SETTINGS;
        else if (title.toLowerCase().contains("network")) action = Settings.ACTION_WIRELESS_SETTINGS;
        else if (title.equals("Bluetooth")) action = Settings.ACTION_BLUETOOTH_SETTINGS;
        else if (title.equals("Display")) action = Settings.ACTION_DISPLAY_SETTINGS;
        try {
            startActivity(new Intent(action));
        } catch (RuntimeException error) {
            Toast.makeText(this, "Android settings are unavailable on this target.", Toast.LENGTH_LONG).show();
        }
    }

    private void openMobileNetworkSettings() {
        if (!getPackageManager().hasSystemFeature(PackageManager.FEATURE_TELEPHONY)) {
            Toast.makeText(this, "This device has no cellular modem. Use Wi-Fi or Ethernet.", Toast.LENGTH_LONG).show();
            return;
        }
        openDeviceSettings("Mobile network");
    }

    private String currentConnectionLabel() {
        ConnectivityManager manager = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
        if (manager == null) return "Unavailable";
        Network network = manager.getActiveNetwork();
        NetworkCapabilities capabilities = network == null ? null : manager.getNetworkCapabilities(network);
        if (capabilities == null) return "Offline";
        if (capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) return "Wi-Fi connected";
        if (capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)) return "Ethernet connected";
        if (capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)) return "Mobile data connected";
        if (capabilities.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) return "VPN connected";
        return "Network connected";
    }

    private void updateConnectionStatus() {
        if (connectionStatus != null) {
            connectionStatus.setText(connectionCornerLabel());
            connectionStatus.setTextColor(connectionColor());
            connectionStatus.setContentDescription("Connection status: " + currentConnectionLabel());
        }
    }

    private String connectionCornerLabel() {
        String label = currentConnectionLabel();
        if (label.contains("Offline")) return "× No Wi-Fi";
        if (label.contains("Wi-Fi")) return "⌁ Wi-Fi";
        if (label.contains("Ethernet")) return "⌁ Ethernet";
        if (label.contains("Mobile")) return "⌁ Mobile";
        return "⌁ Online";
    }

    private int connectionColor() {
        return currentConnectionLabel().contains("Offline") ? 0xffd9cfd9 : GOLD;
    }

    private Button addNavButton(LinearLayout bar, String label, Runnable action) {
        Button nav = button(label, Color.TRANSPARENT, TEXT);
        nav.setOnClickListener(view -> action.run());
        bar.addView(nav, wrap());
        return nav;
    }

    private LinearLayout column(int background) {
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        if (background != Color.TRANSPARENT) layout.setBackgroundColor(background);
        return layout;
    }

    private LinearLayout row() {
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.HORIZONTAL);
        layout.setGravity(Gravity.CENTER_VERTICAL);
        return layout;
    }

    private TextView text(String value, int size, int color) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(size);
        view.setTextColor(color);
        view.setIncludeFontPadding(true);
        view.setLineSpacing(3, 1.08f);
        view.setGravity(Gravity.CENTER_VERTICAL);
        view.setPadding(10, 10, 10, 10);
        return view;
    }

    private Button button(String label, int background, int color) {
        Button view = new Button(this);
        view.setId(View.generateViewId());
        view.setText(label);
        view.setTextColor(color);
        view.setTextSize(13);
        view.setAllCaps(false);
        view.setIncludeFontPadding(true);
        view.setLineSpacing(2, 1.08f);
        view.setGravity(Gravity.CENTER_VERTICAL);
        view.setPadding(16, 14, 16, 14);
        view.setMaxLines(3);
        view.setFocusable(true);
        view.setFocusableInTouchMode(true);
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(background);
        drawable.setCornerRadius(10);
        drawable.setStroke(background == Color.TRANSPARENT ? 0 : 1, Color.rgb(40, 83, 107));
        view.setBackground(drawable);
        view.setOnFocusChangeListener((focusedView, hasFocus) -> {
            GradientDrawable focusedDrawable = new GradientDrawable();
            focusedDrawable.setColor(hasFocus
                    ? (background == Color.TRANSPARENT ? 0x3324d9f0 : 0x885d1833)
                    : background);
            focusedDrawable.setCornerRadius(10);
            focusedDrawable.setStroke(hasFocus ? 3 : (background == Color.TRANSPARENT ? 0 : 1), hasFocus ? GOLD : Color.rgb(40, 83, 107));
            focusedView.setBackground(focusedDrawable);
            ((Button) focusedView).setTextColor(hasFocus ? GOLD : color);
        });
        return view;
    }

    private GradientDrawable focusedBackground(int color) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(color);
        drawable.setCornerRadius(18);
        drawable.setStroke(4, IVORY);
        return drawable;
    }

    private LinearLayout.LayoutParams wrap() {
        return new LinearLayout.LayoutParams(-2, -2);
    }

    private LinearLayout.LayoutParams weight(float value) {
        return new LinearLayout.LayoutParams(0, -2, value);
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            showHome();
            return true;
        }
        if (keyCode == KeyEvent.KEYCODE_HOME) {
            if (bootstrapStore.setupComplete()) showHome();
            else showBootstrapScreen();
            return true;
        }
        if (keyCode == KeyEvent.KEYCODE_MENU) {
            showSettingsScreen();
            return true;
        }
        if (keyCode == KeyEvent.KEYCODE_MEDIA_PLAY || keyCode == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE) {
            openMovieRoomApp();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }
}
