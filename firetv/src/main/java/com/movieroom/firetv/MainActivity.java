package com.movieroom.firetv;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.res.Configuration;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.TextUtils;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.ViewParent;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.GridLayout;
import android.widget.HorizontalScrollView;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import android.webkit.WebView;
import android.webkit.WebSettings;

import androidx.media3.common.MediaItem;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.DefaultLoadControl;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.ui.PlayerView;
import androidx.media3.ui.AspectRatioFrameLayout;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.WriterException;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;

import java.security.SecureRandom;
import java.util.Locale;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.json.JSONObject;

public class MainActivity extends Activity {
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final SecureRandom random = new SecureRandom();
    private DeviceTokenStore tokenStore;
    private MovieRoomApi api;
    private LinearLayout root;
    private ExoPlayer player;
    private View playerOverlay;
    private boolean playerFullscreen = false;
    private int pairingGeneration = 0;
    private final PlaybackProgressStore progressStore = new PlaybackProgressStore();
    private final Map<String, Bitmap> posterCache = new LinkedHashMap<String, Bitmap>(64, 0.75f, true) {
        @Override protected boolean removeEldestEntry(Map.Entry<String, Bitmap> eldest) {
            return size() > 80;
        }
    };
    private ViewerState viewerState;
    private MovieRoomModels.Movie activeMovie;
    private String activeProfile = "Home";
    private TextView shellProfileLabel;
    private WebView webSearchView;
    private boolean shellSettingsOpen = false;
    private final List<List<View>> tvFocusRows = new ArrayList<>();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        tokenStore = new DeviceTokenStore(this);
        api = new MovieRoomApi(BuildConfig.MOVIE_ROOM_BASE_URL);
        if (!isTelevision()) {
            showMobileWebApp();
            return;
        }
        if (tokenStore.getDeviceToken().isEmpty()) {
            showPairingScreen();
        } else {
            showLibraryScreen();
        }
    }

    @Override
    protected void onDestroy() {
        flushProgress(activeMovie, false);
        stopKeepScreenOn();
        if (player != null) {
            player.release();
        }
        super.onDestroy();
    }

    @Override
    protected void onPause() {
        flushProgress(activeMovie, false);
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (player != null) startKeepScreenOn();
    }

    private void setScreen() {
        stopKeepScreenOn();
        leavePlayerFullscreen();
        shellSettingsOpen = false;
        tvFocusRows.clear();
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        int pagePadding = isTelevision() ? 42 : 18;
        root.setPadding(dp(pagePadding), dp(isTelevision() ? 30 : 18), dp(pagePadding), dp(isTelevision() ? 30 : 18));
        root.setGravity(Gravity.CENTER_HORIZONTAL);
        root.setBackgroundColor(0xff090a0b);
        setContentView(root);
    }

    private void startKeepScreenOn() {
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }

    private void stopKeepScreenOn() {
        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }

    private void enterPlayerFullscreen() {
        playerFullscreen = true;
        if (playerOverlay != null) {
            playerOverlay.setVisibility(View.GONE);
        }
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
    }

    private void leavePlayerFullscreen() {
        playerFullscreen = false;
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_VISIBLE);
        if (playerOverlay != null) {
            playerOverlay.setVisibility(View.VISIBLE);
        }
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private boolean isTelevision() {
        return (getResources().getConfiguration().uiMode & Configuration.UI_MODE_TYPE_MASK)
                == Configuration.UI_MODE_TYPE_TELEVISION;
    }

    private GradientDrawable roundedBackground(int color, int strokeColor, int strokeWidthDp) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(color);
        drawable.setCornerRadius(dp(12));
        drawable.setStroke(dp(strokeWidthDp), strokeColor);
        return drawable;
    }

    private TextView text(String value, int sizeSp) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextColor(0xfff5f5f5);
        view.setTextSize(sizeSp);
        view.setPadding(0, 12, 0, 12);
        return view;
    }

    private Button button(String label) {
        Button button = new Button(this);
        button.setId(View.generateViewId());
        button.setText(label);
        button.setTextSize(22);
        button.setAllCaps(false);
        button.setPadding(28, 18, 28, 18);
        return button;
    }

    private String initials(String title) {
        String[] words = title.trim().split("\\s+");
        StringBuilder builder = new StringBuilder();
        for (String word : words) {
            if (!word.isEmpty()) {
                builder.append(word.substring(0, 1).toUpperCase(Locale.US));
            }
            if (builder.length() >= 2) {
                break;
            }
        }
        return builder.length() == 0 ? "M" : builder.toString();
    }

    private String formatSize(long size) {
        if (size >= 1024L * 1024L * 1024L) {
            return String.format(Locale.US, "%.2f GB", size / (1024d * 1024d * 1024d));
        }
        if (size >= 1024L * 1024L) {
            return String.format(Locale.US, "%.0f MB", size / (1024d * 1024d));
        }
        return size > 0L ? String.format(Locale.US, "%.0f KB", size / 1024d) : "Still uploading";
    }

    private String displayMetadata(MovieRoomModels.Movie movie) {
        List<String> parts = new ArrayList<>();
        if (movie.year != null && !movie.year.isEmpty() && !movie.year.equals("0")) parts.add(movie.year);
        if (movie.rating != null && !movie.rating.isEmpty()) parts.add("★ " + movie.rating);
        if (movie.runtime != null && !movie.runtime.isEmpty()) parts.add(movie.runtime);
        if (movie.genres != null && !movie.genres.isEmpty()) parts.add(movie.genres);
        if (!parts.isEmpty()) return String.join("  •  ", parts);
        return displayFolder(movie);
    }

    private String displayFolder(MovieRoomModels.Movie movie) {
        String folder = movie.folder == null ? "" : movie.folder;
        if (folder.isEmpty()) {
            return "Main Folder";
        }
        String[] parts = folder.split("[/\\\\]");
        String cleaned = parts.length == 0 ? folder : parts[parts.length - 1];
        cleaned = cleaned
                .replaceAll("\\[[^\\]]*\\]", " ")
                .replaceAll("\\([^)]*(?:19|20)\\d{2}[^)]*\\)", " ")
                .replaceAll("[._-]+", " ")
                .replaceAll("\\s*[\\[(]?\\b(?:19|20)\\d{2}\\b.*$", " ")
                .replaceAll("\\s+", " ")
                .trim();
        if (cleaned.matches("(?i)^home alone 1,?\\s*2,?\\s*3,?\\s*4,?\\s*5.*")) {
            cleaned = "Home Alone Collection";
        }
        if (cleaned.isEmpty() || cleaned.equalsIgnoreCase(movie.title)) {
            return "Movie Room";
        }
        return cleaned.length() > 36 ? cleaned.substring(0, 33).trim() + "…" : cleaned;
    }

    private String randomSecret() {
        byte[] bytes = new byte[24];
        random.nextBytes(bytes);
        StringBuilder builder = new StringBuilder();
        for (byte value : bytes) {
            builder.append(String.format(Locale.US, "%02x", value));
        }
        return builder.toString();
    }

    private void centerFocusedCard(View view) {
        ViewParent parent = view.getParent();
        while (parent instanceof View) {
            if (parent instanceof HorizontalScrollView) {
                HorizontalScrollView shelf = (HorizontalScrollView) parent;
                int target = view.getLeft() - Math.max(0, (shelf.getWidth() - view.getWidth()) / 2);
                shelf.smoothScrollTo(Math.max(0, target), 0);
                return;
            }
            parent = parent.getParent();
        }
        view.requestRectangleOnScreen(new android.graphics.Rect(0, 0, view.getWidth(), view.getHeight()), true);
    }

    private void connectTvFocusRows() {
        for (int rowIndex = 0; rowIndex < tvFocusRows.size(); rowIndex++) {
            List<View> row = tvFocusRows.get(rowIndex);
            if (row == null || row.isEmpty()) continue;
            for (int column = 0; column < row.size(); column++) {
                View current = row.get(column);
                if (current.getId() == View.NO_ID) current.setId(View.generateViewId());
            }
        }
    }

    private Bitmap createPairingQrBitmap(String pairingUrl, int size) throws WriterException {
        BitMatrix matrix = new QRCodeWriter().encode(pairingUrl, BarcodeFormat.QR_CODE, size, size);
        int[] pixels = new int[size * size];
        for (int y = 0; y < size; y++) {
            for (int x = 0; x < size; x++) {
                pixels[y * size + x] = matrix.get(x, y) ? Color.BLACK : Color.WHITE;
            }
        }
        return Bitmap.createBitmap(pixels, size, size, Bitmap.Config.ARGB_8888);
    }

    private void showPairingScreen() {
        final int generation = ++pairingGeneration;
        setScreen();
        root.addView(text("Movie Room Fire TV", 34));
        TextView status = text("Creating a pairing code...", 24);
        root.addView(status);
        ProgressBar progress = new ProgressBar(this);
        root.addView(progress);
        ImageView qrCode = new ImageView(this);
        qrCode.setBackgroundColor(Color.WHITE);
        qrCode.setPadding(dp(12), dp(12), dp(12), dp(12));
        LinearLayout.LayoutParams qrParams = new LinearLayout.LayoutParams(dp(300), dp(300));
        qrParams.setMargins(0, dp(16), 0, dp(8));
        root.addView(qrCode, qrParams);
        TextView qrInstructions = text("Scan with your phone or open the link on Windows. No Mac is required.", 18);
        qrInstructions.setGravity(Gravity.CENTER);
        root.addView(qrInstructions);
        Button retry = button("New Code");
        retry.setOnClickListener(view -> showPairingScreen());
        root.addView(retry);
        Button online = button("Open online Movie Room");
        online.setOnClickListener(view -> showMobileWebApp());
        root.addView(online);
        retry.requestFocus();
        retry.post(retry::requestFocus);

        new Thread(() -> {
            try {
                String pollSecret = randomSecret();
                MovieRoomModels.Pairing pairing = api.createPairing("Fire TV", pollSecret);
                String pairingUrl = PairingQrUrl.build(BuildConfig.MOVIE_ROOM_BASE_URL, pairing.code);
                Bitmap pairingQr = createPairingQrBitmap(pairingUrl, 600);
                if (generation != pairingGeneration) {
                    return;
                }
                handler.post(() -> {
                    if (generation == pairingGeneration) {
                        progress.setVisibility(View.GONE);
                        qrCode.setImageBitmap(pairingQr);
                        status.setText("Scan the QR code with your phone, or enter code: " + pairing.code);
                    }
                });
                pollPairing(pairing.pairingId, pollSecret, status, generation);
            } catch (Exception error) {
                handler.post(() -> {
                    if (generation == pairingGeneration) {
                        status.setText("Could not create a code. Check Wi-Fi and try New Code.");
                    }
                });
            }
        }).start();
    }

    private void showPasswordScreen() {
        pairingGeneration += 1;
        setScreen();
        TextView brand = text("TAYLOR-MADE MOVIES", 30);
        brand.setTextColor(0xffffd166);
        brand.setGravity(Gravity.CENTER);
        root.addView(brand);
        TextView subtitle = text("MOVIE ROOM  •  ANDROID", 18);
        subtitle.setGravity(Gravity.CENTER);
        root.addView(subtitle);
        TextView prompt = text("Enter your Movie Room password to sign in.", 20);
        prompt.setGravity(Gravity.CENTER);
        root.addView(prompt);
        EditText password = new EditText(this);
        password.setHint("Movie Room password");
        password.setTextColor(0xffffffff);
        password.setHintTextColor(0xffaaa39a);
        password.setSingleLine(true);
        password.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        root.addView(password, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dp(58)));
        TextView status = text("", 17);
        status.setGravity(Gravity.CENTER);
        root.addView(status);
        Button signIn = button("Enter Movie Room");
        signIn.setTextColor(0xff17120a);
        signIn.setBackground(roundedBackground(0xffffd166, 0xffffd166, 1));
        signIn.setOnClickListener(view -> {
            String value = password.getText().toString();
            if (value.isEmpty()) { status.setText("Enter the password first."); return; }
            signIn.setEnabled(false);
            status.setText("Signing in...");
            new Thread(() -> {
                try {
                    String deviceToken = api.passwordLogin(value, "Android");
                    tokenStore.saveDeviceToken(deviceToken);
                    handler.post(this::showLibraryScreen);
                } catch (Exception error) {
                    handler.post(() -> { signIn.setEnabled(true); status.setText("Password not accepted or service unavailable."); });
                }
            }).start();
        });
        root.addView(signIn);
    }

    private void showMobileWebApp() {
        stopKeepScreenOn();
        WebView webView = new WebView(this);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        webView.setBackgroundColor(0xff090a0b);
        webView.loadUrl(BuildConfig.MOVIE_ROOM_BASE_URL);
        setContentView(webView);
    }

    private void pollPairing(String pairingId, String pollSecret, TextView status, int generation) {
        if (generation != pairingGeneration) {
            return;
        }
        handler.postDelayed(() -> new Thread(() -> {
            if (generation != pairingGeneration) {
                return;
            }
            try {
                MovieRoomModels.PairingStatus pairingStatus = api.pollPairing(pairingId, pollSecret);
                if (generation != pairingGeneration) {
                    return;
                }
                if ("approved".equals(pairingStatus.status) && !pairingStatus.deviceToken.isEmpty()) {
                    tokenStore.saveDeviceToken(pairingStatus.deviceToken);
                    handler.post(() -> {
                        if (generation == pairingGeneration) {
                            showLibraryScreen();
                        }
                    });
                    return;
                }
                handler.post(() -> pollPairing(pairingId, pollSecret, status, generation));
            } catch (MovieRoomApi.MovieRoomApiException error) {
                handler.post(() -> {
                    if (generation != pairingGeneration) {
                        return;
                    }
                    if (error.statusCode == 410 || error.statusCode == 401) {
                        status.setText("Code expired. Choose New Code.");
                        return;
                    }
                    status.setText("Waiting for approval. Keep this screen open.");
                    pollPairing(pairingId, pollSecret, status, generation);
                });
            } catch (Exception error) {
                handler.post(() -> {
                    if (generation == pairingGeneration) {
                        status.setText("Network problem. Check Wi-Fi and keep this screen open.");
                        pollPairing(pairingId, pollSecret, status, generation);
                    }
                });
            }
        }).start(), 2500);
    }

    private void showLibraryScreen() {
        pairingGeneration += 1;
        tvFocusRows.clear();
        setScreen();
        LinearLayout shellBar = new LinearLayout(this);
        shellBar.setGravity(Gravity.CENTER_VERTICAL);
        shellBar.setPadding(0, 0, 0, dp(10));
        TextView brand = text("TAYLOR-MADE MOVIES", 26);
        brand.setTextColor(0xffffd166);
        brand.setTypeface(null, android.graphics.Typeface.BOLD);
        shellBar.addView(brand, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        List<View> topControls = new ArrayList<>();
        topControls.add(shellNavButton("HOME", view -> showLibraryScreen()));
        shellBar.addView(topControls.get(topControls.size() - 1));
        topControls.add(shellNavButton("SEARCH", view -> showSearchDialog()));
        shellBar.addView(topControls.get(topControls.size() - 1));
        topControls.add(shellNavButton("ALEXA", view -> launchAlexa()));
        shellBar.addView(topControls.get(topControls.size() - 1));
        topControls.add(shellNavButton("WEB SEARCH", view -> showWebSearchScreen()));
        shellBar.addView(topControls.get(topControls.size() - 1));
        shellProfileLabel = text(activeProfile.toUpperCase(Locale.US), 15);
        shellProfileLabel.setTextColor(0xffffd166);
        shellProfileLabel.setGravity(Gravity.CENTER);
        shellProfileLabel.setFocusable(true);
        shellProfileLabel.setClickable(true);
        shellProfileLabel.setPadding(dp(16), dp(8), dp(16), dp(8));
        shellProfileLabel.setOnClickListener(view -> cycleShellProfile());
        shellBar.addView(shellProfileLabel);
        topControls.add(shellProfileLabel);
        topControls.add(shellNavButton("SETTINGS", view -> showShellSettings()));
        shellBar.addView(topControls.get(topControls.size() - 1));
        tvFocusRows.add(topControls);
        root.addView(shellBar);
        TextView subtitle = text("MOVIE ROOM  •  YOUR PRIVATE CINEMA", 16);
        subtitle.setTextColor(0xffbdb5a2);
        root.addView(subtitle);
        TextView hero = text("NEWEST FROM JELLYFIN\nThe five most recently added titles in Movie Room.", 24);
        hero.setTextColor(0xfff5f5f5);
        hero.setPadding(0, dp(16), 0, dp(14));
        root.addView(hero);
        TextView status = text("Loading library...", 22);
        root.addView(status);
        LinearLayout actions = new LinearLayout(this);
        actions.setGravity(Gravity.CENTER);
        actions.setOrientation(LinearLayout.HORIZONTAL);
        Button refresh = button("Refresh Library");
        refresh.setTextColor(0xff17120a);
        refresh.setBackground(roundedBackground(0xffffd166, 0xffffd166, 1));
        refresh.setOnClickListener(view -> showLibraryScreen());
        Button unpair = button("Unpair");
        unpair.setOnClickListener(view -> {
            tokenStore.clearDeviceToken();
            showPairingScreen();
        });
        actions.addView(refresh);
        actions.addView(unpair);
        List<View> actionControls = new ArrayList<>();
        actionControls.add(refresh);
        actionControls.add(unpair);
        tvFocusRows.add(actionControls);
        root.addView(actions);

        ScrollView scrollView = new ScrollView(this);
        scrollView.setFocusable(false);
        scrollView.setDescendantFocusability(ViewGroup.FOCUS_AFTER_DESCENDANTS);
        LinearLayout shelfColumn = new LinearLayout(this);
        shelfColumn.setOrientation(LinearLayout.VERTICAL);
        TextView allHeading = text("ALL MOVIES  •  BROWSE BY GENRE", 22);
        scrollView.addView(shelfColumn);
        root.addView(scrollView, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                0,
                1f));

        new Thread(() -> {
            try {
                MovieRoomModels.Library library = api.loadLibrary(tokenStore.getDeviceToken());
                ViewerState state = null;
                try {
                    state = api.getViewerState(tokenStore.getDeviceToken());
                    viewerState = state;
                } catch (Exception ignored) {
                    // A viewer-state outage should not hide the movie library.
                }
                final ViewerState loadedState = state;
                handler.post(() -> {
                    int inProgress = 0;
                    if (loadedState != null) {
                        for (ViewerState.MovieRecord record : loadedState.movies.values()) {
                            if (record.positionSeconds > 0 && !record.completed) inProgress++;
                        }
                    }
                    status.setText(library.movies.size() + " movies found" + (inProgress > 0 ? "  •  " + inProgress + " continue watching" : ""));
                    List<MovieRoomModels.Movie> newest = new ArrayList<>(library.movies);
                    newest.sort(Comparator.comparing((MovieRoomModels.Movie movie) -> movie.dateAdded == null ? "" : movie.dateAdded).reversed()
                            .thenComparing(movie -> movie.title == null ? "" : movie.title));
                    shelfColumn.removeAllViews();
                    List<MovieRoomModels.Movie> continueWatching = new ArrayList<>();
                    if (loadedState != null) {
                        for (MovieRoomModels.Movie movie : library.movies) {
                            ViewerState.MovieRecord record = loadedState.movies.get(movie.id);
                            if (record != null && record.positionSeconds > 0 && !record.completed) continueWatching.add(movie);
                        }
                    }
                    continueWatching.sort(Comparator.comparing((MovieRoomModels.Movie movie) -> movie.title == null ? "" : movie.title));
                    addMovieShelf(shelfColumn, "CONTINUE WATCHING", continueWatching, status);
                    addMovieShelf(shelfColumn, "FEATURED - NEWEST FROM JELLYFIN", newest.subList(0, Math.min(5, newest.size())), status);
                    Map<String, List<MovieRoomModels.Movie>> groups = new LinkedHashMap<>();
                    for (MovieRoomModels.Movie movie : newest) {
                        String groupKey = collectionGroupKey(movie);
                        if (groupKey != null) {
                            groups.computeIfAbsent(groupKey, key -> new ArrayList<>()).add(movie);
                        }
                    }
                    Set<String> groupedIds = new HashSet<>();
                    for (Map.Entry<String, List<MovieRoomModels.Movie>> entry : groups.entrySet()) {
                        for (MovieRoomModels.Movie movie : entry.getValue()) groupedIds.add(movie.id);
                        addCollectionShelf(shelfColumn, collectionGroupTitle(entry.getKey()), entry.getValue(), status);
                    }
                    Map<String, List<MovieRoomModels.Movie>> genreGroups = new LinkedHashMap<>();
                    for (MovieRoomModels.Movie movie : newest) {
                        if (!groupedIds.contains(movie.id)) {
                            genreGroups.computeIfAbsent(nativeGenre(movie), key -> new ArrayList<>()).add(movie);
                        }
                    }
                    for (Map.Entry<String, List<MovieRoomModels.Movie>> entry : genreGroups.entrySet()) {
                        addMovieShelf(shelfColumn, entry.getKey(), entry.getValue(), status);
                    }
                    connectTvFocusRows();
                    shelfColumn.post(() -> {
                        View firstCard = findFirstFocusableCard(shelfColumn);
                        if (firstCard != null) firstCard.requestFocus();
                    });
                });
            } catch (MovieRoomApi.MovieRoomApiException error) {
                handler.post(() -> {
                    if (error.statusCode == 401) {
                        tokenStore.clearDeviceToken();
                        showPairingScreen();
                    } else {
                        status.setText("Could not load library. Try again.");
                    }
                });
            } catch (Exception error) {
                handler.post(() -> status.setText("Network problem. Check Wi-Fi and try again."));
            }
        }).start();
    }

    /**
     * Opens the Alexa assistant exposed by Fire OS. The assistant is a system
     * feature and remains installed independently of Movie Room.
     */
    private void launchAlexa() {
        Intent[] assistantIntents = new Intent[] {
                new Intent(Intent.ACTION_ASSIST),
                new Intent("android.intent.action.VOICE_COMMAND"),
                new Intent("com.amazon.intent.action.ALEXA")
        };
        for (Intent intent : assistantIntents) {
            try {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(intent);
                return;
            } catch (ActivityNotFoundException ignored) {
                // Try the next Fire OS assistant entry point.
            }
        }
        Toast.makeText(this, "Alexa is available from the Fire TV remote or Home screen.", Toast.LENGTH_LONG).show();
    }

    private void showWebSearchScreen() {
        webSearchView = null;
        setScreen();
        TextView brand = text("TAYLOR-MADE MOVIES", 30);
        brand.setTextColor(0xffffd166);
        brand.setTypeface(null, android.graphics.Typeface.BOLD);
        root.addView(brand);
        TextView heading = text("SEARCH THE WEB FOR MOVIES", 24);
        heading.setTextColor(0xfff5f5f5);
        root.addView(heading);
        TextView explanation = text("Search opens in the Fire TV web browser. Alexa and the rest of Fire OS stay installed.", 17);
        explanation.setTextColor(0xffbdb5a2);
        root.addView(explanation);

        EditText query = new EditText(this);
        query.setSingleLine(true);
        query.setHint("Movie title, trailer, or actor");
        query.setTextColor(0xffffffff);
        query.setHintTextColor(0xffaaa39a);
        query.setTextSize(21);
        query.setSelectAllOnFocus(false);
        root.addView(query, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dp(64)));

        Button search = button("Search on the Web");
        search.setTextColor(0xff17120a);
        search.setBackground(roundedBackground(0xffffd166, 0xffffd166, 1));
        search.setOnClickListener(view -> openWebMovieSearch(query.getText().toString()));
        root.addView(search);

        Button back = button("Back to Movie Room");
        back.setOnClickListener(view -> showLibraryScreen());
        root.addView(back);
        query.requestFocus();
    }

    private void openWebMovieSearch(String rawQuery) {
        String query = rawQuery == null ? "" : rawQuery.trim();
        if (query.isEmpty()) {
            Toast.makeText(this, "Enter a movie search first.", Toast.LENGTH_SHORT).show();
            return;
        }
        Uri searchUri = Uri.parse("https://www.google.com/search?q=" + Uri.encode(query + " movie"));
        Intent browser = new Intent(Intent.ACTION_VIEW, searchUri);
        browser.addCategory(Intent.CATEGORY_BROWSABLE);
        try {
            startActivity(browser);
        } catch (ActivityNotFoundException error) {
            showWebSearchFallback(searchUri.toString());
        }
    }

    private void showWebSearchFallback(String url) {
        WebView webView = new WebView(this);
        webSearchView = webView;
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        webView.setBackgroundColor(0xff090a0b);
        webView.loadUrl(url);
        setContentView(webView);
    }

    private Button shellNavButton(String label, View.OnClickListener listener) {
        Button nav = button(label);
        nav.setTextSize(14);
        nav.setMinHeight(0);
        nav.setMinWidth(0);
        nav.setPadding(dp(12), dp(7), dp(12), dp(7));
        nav.setBackground(roundedBackground(0xff151a20, 0xff3b3424, 1));
        nav.setOnClickListener(listener);
        return nav;
    }

    private void cycleShellProfile() {
        String[] profiles = {"Home", "Mom", "Morganne", "Kids"};
        int current = 0;
        for (int index = 0; index < profiles.length; index++) {
            if (profiles[index].equals(activeProfile)) {
                current = index;
                break;
            }
        }
        activeProfile = profiles[(current + 1) % profiles.length];
        if (shellProfileLabel != null) shellProfileLabel.setText(activeProfile.toUpperCase(Locale.US));
        Toast.makeText(this, activeProfile + " profile selected", Toast.LENGTH_SHORT).show();
    }

    private void showShellSettings() {
        setScreen();
        shellSettingsOpen = true;
        root.setGravity(Gravity.NO_GRAVITY);
        root.setPadding(dp(56), dp(38), dp(56), dp(38));
        TextView brand = text("MOVIE ROOM TV SHELL", 30);
        brand.setTextColor(0xffffd166);
        brand.setTypeface(null, android.graphics.Typeface.BOLD);
        root.addView(brand);
        TextView heading = text("Remote & display settings", 24);
        heading.setTextColor(0xfff5f5f5);
        root.addView(heading);
        TextView summary = text("Profile: " + activeProfile + "\nRemote-first navigation is active. This settings page is drawn inside the TV safe area so it will not hang half off the screen.", 16);
        summary.setTextColor(0xffd7d0c0);
        root.addView(summary);

        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(false);
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(0, dp(18), 0, dp(18));
        List<View> settingsRows = new ArrayList<>();
        settingsRows.add(settingsButton("Back to Movie Room", view -> showLibraryScreen()));
        settingsRows.add(settingsButton("Switch profile", view -> cycleShellProfile()));
        settingsRows.add(settingsButton("Open web search", view -> showWebSearchScreen()));
        settingsRows.add(settingsButton("Refresh library", view -> showLibraryScreen()));
        settingsRows.add(settingsButton("Remote help", view -> Toast.makeText(this, "Use ▲ ▼ ◀ ▶, Select, Back, Menu, Play/Pause, Rewind, Fast-forward, Channel/Page Up/Down.", Toast.LENGTH_LONG).show()));
        for (View row : settingsRows) {
            content.addView(row, new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    dp(62)));
        }
        scroll.addView(content);
        root.addView(scroll, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                0,
                1f));
        tvFocusRows.add(settingsRows);
        connectTvFocusRows();
        if (!settingsRows.isEmpty()) settingsRows.get(0).requestFocus();
    }

    private Button settingsButton(String label, View.OnClickListener listener) {
        Button button = new Button(this);
        button.setAllCaps(false);
        button.setText(label);
        button.setTextColor(0xfff7efe0);
        button.setTextSize(18);
        button.setGravity(Gravity.CENTER_VERTICAL | Gravity.LEFT);
        button.setPadding(dp(18), 0, dp(18), 0);
        button.setFocusable(true);
        button.setFocusableInTouchMode(false);
        button.setBackground(roundedBackground(0xff17120a, 0xffffd166, 1));
        button.setOnFocusChangeListener((view, hasFocus) -> {
            view.setScaleX(hasFocus ? 1.02f : 1.0f);
            view.setScaleY(hasFocus ? 1.02f : 1.0f);
            view.setBackground(roundedBackground(hasFocus ? 0xff282218 : 0xff17120a, 0xffffd166, hasFocus ? 3 : 1));
        });
        button.setOnClickListener(listener);
        return button;
    }

    private void showSearchDialog() {
        final EditText input = new EditText(this);
        input.setSingleLine(true);
        input.setHint("Search Movie Room");
        input.setTextColor(Color.WHITE);
        input.setHintTextColor(0xffaaa39a);
        input.setPadding(dp(18), dp(12), dp(18), dp(12));
        new AlertDialog.Builder(this)
                .setTitle("Search Movie Room")
                .setView(input)
                .setMessage("Use the remote keyboard to search titles, folders, or genres. The full browse/search experience remains available in the web app.")
                .setPositiveButton("Done", null)
                .show();
    }

    private View movieCard(MovieRoomModels.Movie movie, TextView status) {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setFocusable(true);
        card.setFocusableInTouchMode(false);
        card.setClickable(true);
        card.setEnabled(true);
        card.setPadding(dp(4), dp(4), dp(4), dp(4));
        card.setBackground(roundedBackground(0xff141414, 0xff3b3424, 1));

        FrameLayout posterFrame = new FrameLayout(this);
        posterFrame.setClipToOutline(true);
        posterFrame.setBackground(roundedBackground(0xff352b16, 0xffffd166, 1));
        TextView fallback = text(initials(movie.title), 42);
        fallback.setGravity(Gravity.CENTER);
        fallback.setTextColor(0xffffd166);
        posterFrame.addView(fallback, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT));

        TextView title = text(movie.title, 16);
        title.setTextColor(0xffffffff);
        title.setGravity(Gravity.BOTTOM | Gravity.LEFT);
        title.setMaxLines(MovieCardPresentation.MAX_TITLE_LINES);
        title.setEllipsize(TextUtils.TruncateAt.END);
        title.setPadding(dp(10), dp(28), dp(10), dp(8));
        title.setBackgroundColor(0xcc090a0b);
        FrameLayout.LayoutParams titleParams = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, dp(58), Gravity.BOTTOM);
        posterFrame.addView(title, titleParams);

        card.addView(posterFrame, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                dp(isTelevision() ? MovieCardPresentation.TV_CARD_HEIGHT_DP : 180)));

        card.setOnFocusChangeListener((view, hasFocus) -> {
            view.setScaleX(hasFocus ? MovieCardPresentation.FOCUSED_SCALE : 1.0f);
            view.setScaleY(hasFocus ? MovieCardPresentation.FOCUSED_SCALE : 1.0f);
            view.setBackground(roundedBackground(hasFocus ? 0xff282218 : 0xff141414, hasFocus ? 0xffffd166 : 0xff3b3424, 2));
            if (hasFocus) view.post(() -> centerFocusedCard(view));
        });
        card.setOnClickListener(view -> {
            if (movie.isPlayable()) {
                startMovie(movie, status);
            } else {
                status.setText("This movie is still uploading.");
            }
        });

        loadPosterIntoCard(movie, posterFrame, fallback);
        return card;
    }

    private View viewMoreCard(String title, List<MovieRoomModels.Movie> movies) {
        Button card = new Button(this);
        card.setAllCaps(false);
        card.setText("View more\n" + title);
        card.setTextColor(0xffffffff);
        card.setTextSize(16);
        card.setGravity(Gravity.CENTER);
        card.setFocusable(true);
        card.setFocusableInTouchMode(false);
        card.setBackground(roundedBackground(0xff18110a, 0xffffd166, 2));
        card.setOnClickListener(view -> showGroupedMovies(title, movies));
        return card;
    }

    private View findFirstFocusableCard(ViewGroup parent) {
        for (int index = 0; index < parent.getChildCount(); index++) {
            View child = parent.getChildAt(index);
            if (child.isFocusable() && child.isClickable() && child.isEnabled()) {
                return child;
            }
            if (child instanceof ViewGroup) {
                View nested = findFirstFocusableCard((ViewGroup) child);
                if (nested != null) return nested;
            }
        }
        return null;
    }

    private void addMovieShelf(LinearLayout shelfColumn, String title, List<MovieRoomModels.Movie> movies, TextView status) {
        if (movies == null || movies.isEmpty()) return;
        TextView heading = text(title, 19);
        heading.setTextColor(0xffffd166);
        heading.setTypeface(null, android.graphics.Typeface.BOLD);
        heading.setPadding(dp(8), dp(12), dp(8), dp(2));
        shelfColumn.addView(heading);

        HorizontalScrollView scroll = new HorizontalScrollView(this);
        scroll.setFocusable(false);
        scroll.setDescendantFocusability(ViewGroup.FOCUS_AFTER_DESCENDANTS);
        scroll.setHorizontalScrollBarEnabled(false);
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setFocusable(false);
        row.setPadding(dp(8), dp(4), dp(12), dp(12));
        List<View> shelfCards = new ArrayList<>();
        int visibleCount = Math.min(10, movies.size());
        for (MovieRoomModels.Movie movie : movies.subList(0, visibleCount)) {
            View card = movieCard(movie, status);
            LinearLayout.LayoutParams cardParams = new LinearLayout.LayoutParams(
                    dp(isTelevision() ? MovieCardPresentation.TV_CARD_WIDTH_DP : 150),
                    LinearLayout.LayoutParams.WRAP_CONTENT);
            cardParams.setMargins(0, 0, dp(isTelevision() ? MovieCardPresentation.TV_CARD_GAP_DP : 10), 0);
            row.addView(card, cardParams);
            shelfCards.add(card);
        }
        if (movies.size() > 10) {
            View more = viewMoreCard(title, movies);
            LinearLayout.LayoutParams cardParams = new LinearLayout.LayoutParams(
                    dp(isTelevision() ? MovieCardPresentation.TV_CARD_WIDTH_DP : 150),
                    LinearLayout.LayoutParams.WRAP_CONTENT);
            cardParams.setMargins(0, 0, dp(isTelevision() ? MovieCardPresentation.TV_CARD_GAP_DP : 10), 0);
            row.addView(more, cardParams);
            shelfCards.add(more);
        }
        tvFocusRows.add(shelfCards);
        scroll.addView(row);
        shelfColumn.addView(scroll, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT));
    }

    private void addCollectionShelf(LinearLayout shelfColumn, String title, List<MovieRoomModels.Movie> members, TextView status) {
        if (members == null || members.isEmpty()) return;
        TextView heading = text(title, 22);
        heading.setTextColor(0xffffd166);
        heading.setTypeface(null, android.graphics.Typeface.BOLD);
        heading.setPadding(dp(8), dp(18), dp(8), dp(4));
        shelfColumn.addView(heading);
        HorizontalScrollView scroll = new HorizontalScrollView(this);
        scroll.setFocusable(false);
        scroll.setDescendantFocusability(ViewGroup.FOCUS_AFTER_DESCENDANTS);
        scroll.setHorizontalScrollBarEnabled(false);
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setFocusable(false);
        row.setPadding(dp(8), dp(4), dp(12), dp(12));
        View card = groupCard(title, members, status);
        LinearLayout.LayoutParams cardParams = new LinearLayout.LayoutParams(
                dp(isTelevision() ? MovieCardPresentation.TV_CARD_WIDTH_DP : 150), LinearLayout.LayoutParams.WRAP_CONTENT);
        cardParams.setMargins(0, 0, dp(isTelevision() ? MovieCardPresentation.TV_CARD_GAP_DP : 10), 0);
        row.addView(card, cardParams);
        List<View> shelfCards = new ArrayList<>();
        shelfCards.add(card);
        tvFocusRows.add(shelfCards);
        scroll.addView(row);
        shelfColumn.addView(scroll, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT));
    }

    private String collectionGroupKey(MovieRoomModels.Movie movie) {
        if (movie == null) return null;
        if (movie.seriesName != null && !movie.seriesName.isEmpty() && movie.seriesPath != null && !movie.seriesPath.isEmpty()) {
            return "SERIES|" + movie.seriesPath + "|" + movie.seriesName;
        }
        String folder = movie.folder == null ? "" : movie.folder;
        String[] parts = folder.split("[/\\\\]");
        for (int index = 0; index < parts.length; index++) {
            if (parts[index].toLowerCase(Locale.US).contains("collection")) {
                return "COLLECTION|" + String.join("/", java.util.Arrays.copyOfRange(parts, 0, index + 1));
            }
        }
        return null;
    }

    private String collectionGroupTitle(String key) {
        String[] parts = key.split("\\|", 3);
        if (parts.length == 3 && "SERIES".equals(parts[0])) return parts[2];
        if (parts.length >= 2) {
            String[] pathParts = parts[1].split("[/\\\\]");
            return pathParts.length == 0 ? parts[1] : pathParts[pathParts.length - 1];
        }
        return "Collection";
    }

    private TextView gridSectionHeading(String value, int columns) {
        TextView heading = text(value, 20);
        heading.setTextColor(0xffffd166);
        heading.setTypeface(null, android.graphics.Typeface.BOLD);
        GridLayout.LayoutParams params = new GridLayout.LayoutParams();
        params.width = LinearLayout.LayoutParams.MATCH_PARENT;
        params.columnSpec = GridLayout.spec(0, columns);
        params.setMargins(dp(8), dp(16), dp(8), dp(4));
        heading.setLayoutParams(params);
        return heading;
    }

    private String nativeGenre(MovieRoomModels.Movie movie) {
        String genres = movie == null ? "" : movie.genres;
        if (genres != null && !genres.trim().isEmpty()) {
            return genres.split(",")[0].trim();
        }
        String searchable = ((movie == null ? "" : movie.title) + " " + (movie == null ? "" : movie.fileName)).toLowerCase(Locale.US);
        if (searchable.matches(".*(home alone|toy story|paw patrol|magic faraway tree|frozen).*")) return "Kids / Family";
        if (searchable.matches(".*(horror|scary|backrooms|haunt|obsession).*")) return "Horror";
        if (searchable.matches(".*(jurassic|superman|spider|mutiny|jackass|masters of the universe|the fix).*")) return "Action";
        if (searchable.matches(".*(fifty shades|mamma mia|northern exposure|bomb girls|love hypothesis).*")) return "Drama";
        if (searchable.matches(".*(comedy|jackass).*")) return "Comedy";
        return "Other";
    }

    private View groupCard(String key, List<MovieRoomModels.Movie> members, TextView status) {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setFocusable(true);
        card.setFocusableInTouchMode(false);
        card.setClickable(true);
        card.setPadding(dp(4), dp(4), dp(4), dp(4));
        card.setBackground(roundedBackground(0xff171717, 0xff6d5420, 1));
        FrameLayout posterFrame = new FrameLayout(this);
        posterFrame.setClipToOutline(true);
        posterFrame.setBackground(roundedBackground(0xff352b16, 0xffffd166, 1));
        TextView cover = text(initials(collectionGroupTitle(key)), 42);
        cover.setGravity(Gravity.CENTER);
        cover.setTextColor(0xffffd166);
        posterFrame.addView(cover, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT));
        TextView title = text(collectionGroupTitle(key), 18);
        title.setMaxLines(2);
        title.setEllipsize(TextUtils.TruncateAt.END);
        title.setGravity(Gravity.BOTTOM | Gravity.LEFT);
        title.setPadding(dp(10), dp(28), dp(10), dp(8));
        title.setBackgroundColor(0xcc090a0b);
        posterFrame.addView(title, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, dp(58), Gravity.BOTTOM));
        TextView meta = text(members.size() + (key.startsWith("SERIES|") ? " episodes" : " movies"), 12);
        meta.setGravity(Gravity.CENTER);
        meta.setPadding(dp(8), dp(4), dp(8), dp(4));
        meta.setTextColor(0xffffd166);
        meta.setBackground(roundedBackground(0xcc17120a, 0x99ffd166, 1));
        FrameLayout.LayoutParams metaParams = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT, dp(30), Gravity.TOP | Gravity.RIGHT);
        metaParams.setMargins(0, dp(8), dp(8), 0);
        posterFrame.addView(meta, metaParams);
        card.addView(posterFrame, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                dp(isTelevision() ? MovieCardPresentation.TV_CARD_HEIGHT_DP : 180)));
        loadPosterIntoCard(members.get(0), posterFrame, cover);
        card.setOnFocusChangeListener((view, hasFocus) -> {
            view.setScaleX(hasFocus ? MovieCardPresentation.FOCUSED_SCALE : 1.0f);
            view.setScaleY(hasFocus ? MovieCardPresentation.FOCUSED_SCALE : 1.0f);
            view.setBackground(roundedBackground(hasFocus ? 0xff282218 : 0xff171717, hasFocus ? 0xffffd166 : 0xff6d5420, 2));
            if (hasFocus) view.post(() -> centerFocusedCard(view));
        });
        card.setOnClickListener(view -> showGroupedMovies(collectionGroupTitle(key), members));
        return card;
    }

    private void showGroupedMovies(String titleText, List<MovieRoomModels.Movie> members) {
        setScreen();
        TextView brand = text("TAYLOR-MADE MOVIES", 30);
        brand.setTextColor(0xffffd166);
        brand.setTypeface(null, android.graphics.Typeface.BOLD);
        root.addView(brand);
        TextView heading = text(titleText, 24);
        heading.setTextColor(0xfff5f5f5);
        root.addView(heading);
        Button back = button("Back to All Movies");
        back.setOnClickListener(view -> showLibraryScreen());
        root.addView(back);
        TextView status = text(members.size() + " titles in this folder", 18);
        root.addView(status);
        ScrollView scrollView = new ScrollView(this);
        GridLayout grid = new GridLayout(this);
        grid.setColumnCount(isTelevision() ? 3 : 2);
        grid.setPadding(0, dp(12), 0, dp(24));
        List<MovieRoomModels.Movie> sorted = new ArrayList<>(members);
        sorted.sort(Comparator.comparingInt((MovieRoomModels.Movie movie) -> movie.seasonNumber)
                .thenComparingInt(movie -> movie.episodeNumber)
                .thenComparing(movie -> movie.title == null ? "" : movie.title));
        for (MovieRoomModels.Movie movie : sorted) grid.addView(movieCard(movie, status));
        scrollView.addView(grid);
        root.addView(scrollView, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f));
    }

    private void loadPosterIntoCard(MovieRoomModels.Movie movie, FrameLayout posterFrame, TextView fallback) {
        List<String> artworkUrls = api.artworkUrls(movie.posterUrl, movie.title, movie.year);
        if (artworkUrls.isEmpty()) {
            return;
        }

        Bitmap cached;
        synchronized (posterCache) {
            cached = posterCache.get(artworkUrls.get(0));
        }
        if (cached != null) {
            applyPoster(posterFrame, fallback, cached);
            return;
        }

        new Thread(() -> {
            try {
                Bitmap bitmap = null;
                for (String artworkUrl : artworkUrls) {
                    byte[] bytes = api.downloadPoster(artworkUrl, tokenStore.getDeviceToken());
                    if (bytes.length == 0) {
                        continue;
                    }
                    bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
                    if (bitmap != null) {
                        break;
                    }
                }
                if (bitmap == null) return;
                synchronized (posterCache) {
                    posterCache.put(artworkUrls.get(0), bitmap);
                }
                Bitmap loadedBitmap = bitmap;
                handler.post(() -> applyPoster(posterFrame, fallback, loadedBitmap));
            } catch (Exception ignored) {
                // Keep the clean initials fallback when no poster is available yet.
            }
        }).start();
    }

    private void applyPoster(FrameLayout posterFrame, TextView fallback, Bitmap bitmap) {
        int index = posterFrame.indexOfChild(fallback);
        if (index < 0) return;
        ImageView poster = new ImageView(this);
        poster.setImageBitmap(bitmap);
        poster.setBackgroundColor(0xff050505);
        poster.setScaleType(ImageView.ScaleType.CENTER_CROP);
        posterFrame.removeView(fallback);
        posterFrame.addView(poster, index, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT));
    }

    private void startMovie(MovieRoomModels.Movie movie, TextView status) {
        status.setText("Starting " + movie.title + "...");
        new Thread(() -> {
            try {
                MovieRoomModels.Playback playback = api.startPlayback(tokenStore.getDeviceToken(), movie.id);
                try {
                    ViewerState state = api.getViewerState(tokenStore.getDeviceToken());
                    handler.post(() -> showPlayer(playback, movie, state));
                } catch (Exception ignored) {
                    handler.post(() -> showPlayer(playback, movie, null));
                }
            } catch (MovieRoomApi.MovieRoomApiException error) {
                handler.post(() -> status.setText(error.statusCode == 409
                        ? "Movie is still uploading."
                        : "This movie could not be played."));
            } catch (Exception error) {
                handler.post(() -> status.setText("Network problem. Try again."));
            }
        }).start();
    }

    private void showPlayer(MovieRoomModels.Playback playback, MovieRoomModels.Movie movie, ViewerState state) {
        if (player != null) {
            player.release();
        }

        playerFullscreen = false;
        activeMovie = movie;
        viewerState = state;
        FrameLayout playerScreen = new FrameLayout(this);
        playerScreen.setBackgroundColor(0xff000000);
        PlayerView playerView = new PlayerView(this);
        playerView.setKeepScreenOn(true);
        playerView.setResizeMode(AspectRatioFrameLayout.RESIZE_MODE_FIT);
        playerView.setUseController(true);
        playerView.setBackgroundColor(Color.BLACK);
        startKeepScreenOn();
        DefaultLoadControl loadControl = new DefaultLoadControl.Builder()
                .setBufferDurationsMs(60_000, 300_000, 5_000, 10_000)
                .setPrioritizeTimeOverSizeThresholds(true)
                .build();
        player = new ExoPlayer.Builder(this)
                .setLoadControl(loadControl)
                .build();
        playerView.setShowRewindButton(true);
        playerView.setShowFastForwardButton(true);
        playerView.setPlayer(player);
        playerScreen.addView(playerView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT));

        LinearLayout overlay = new LinearLayout(this);
        overlay.setOrientation(LinearLayout.HORIZONTAL);
        overlay.setGravity(Gravity.CENTER_VERTICAL);
        overlay.setPadding(dp(18), dp(10), dp(18), dp(10));
        overlay.setBackgroundColor(0xcc111111);

        LinearLayout details = new LinearLayout(this);
        details.setOrientation(LinearLayout.VERTICAL);
        TextView title = text(playback.title, 24);
        title.setMaxLines(1);
        title.setEllipsize(TextUtils.TruncateAt.END);
        details.addView(title);
        TextView meta = text(displayFolder(movie) + "  •  " + formatSize(movie.size) + "  •  " + playback.contentType, 15);
        meta.setTextColor(0xffc8c8c8);
        details.addView(meta);
        overlay.addView(details, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));

        Button fullScreen = button("Full Screen");
        fullScreen.setTextSize(18);
        fullScreen.setOnClickListener(view -> enterPlayerFullscreen());
        overlay.addView(fullScreen);

        Button back = button("Library");
        back.setTextSize(18);
        back.setOnClickListener(view -> {
            if (player != null) {
                player.release();
                player = null;
            }
            playerOverlay = null;
            showLibraryScreen();
        });
        overlay.addView(back);

        FrameLayout.LayoutParams overlayParams = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.WRAP_CONTENT,
                Gravity.TOP);
        playerScreen.addView(overlay, overlayParams);
        playerOverlay = overlay;
        setContentView(playerScreen);

        player.setMediaItem(MediaItem.fromUri(Uri.parse(playback.url)));
        player.prepare();
        if (state != null && state.movies.containsKey(movie.id) && state.settings.resumeEnabled) {
            ViewerState.MovieRecord record = state.movies.get(movie.id);
            player.addListener(new Player.Listener() {
                private boolean restored;
                @Override public void onPlaybackStateChanged(int playbackState) {
                    if (!restored && playbackState == Player.STATE_READY && record.positionSeconds > 0) {
                        player.seekTo(record.positionSeconds * 1000L);
                        restored = true;
                    }
                    if (playbackState == Player.STATE_ENDED) flushProgress(movie, true);
                }
            });
        }
        player.addListener(new Player.Listener() {
            @Override public void onIsPlayingChanged(boolean isPlaying) {
                if (!isPlaying) flushProgress(movie, false);
            }

            @Override public void onPlayerError(androidx.media3.common.PlaybackException error) {
                Toast.makeText(MainActivity.this, "This movie could not play. Try again or choose an MP4 copy.", Toast.LENGTH_LONG).show();
            }
        });
        player.play();
    }

    private void flushProgress(MovieRoomModels.Movie movie, boolean completed) {
        if (player == null || movie == null) return;
        long position = Math.max(0L, player.getCurrentPosition());
        long duration = Math.max(0L, player.getDuration());
        if (duration <= 0L) return;
        progressStore.checkpoint(movie.id, position, duration);
        new Thread(() -> {
            try {
                JSONObject progress = new JSONObject();
                progress.put("type", "progress");
                progress.put("movieId", movie.id);
                progress.put("positionSeconds", position / 1000d);
                progress.put("durationSeconds", duration / 1000d);
                List<JSONObject> operations = new ArrayList<>();
                operations.add(progress);
                if (completed || position >= duration * 0.9d) {
                    JSONObject done = new JSONObject();
                    done.put("type", "setCompleted");
                    done.put("movieId", movie.id);
                    done.put("value", true);
                    operations.add(done);
                }
                viewerState = api.applyViewerOperations(tokenStore.getDeviceToken(), operations);
            } catch (Exception ignored) {
                // Keep the local checkpoint for the next lifecycle flush.
            }
        }).start();
    }

}
