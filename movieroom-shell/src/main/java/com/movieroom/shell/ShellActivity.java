package com.movieroom.shell;

import android.app.Activity;
import android.content.ComponentName;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.os.Bundle;
import android.provider.Settings;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.widget.Button;
import android.widget.HorizontalScrollView;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import java.util.ArrayList;
import java.util.List;

/** Native Movie Room HOME/LEANBACK launcher with Android TV-style controls. */
public final class ShellActivity extends Activity {
    private static final int NAVY = Color.rgb(6, 21, 35);
    private static final int PANEL = Color.rgb(14, 36, 53);
    private static final int TEAL = Color.rgb(64, 216, 192);
    private static final int TEXT = Color.rgb(239, 250, 255);
    private String activeProfile = "Home";
    private TextView connectionStatus;
    private boolean settingsScreen;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(NAVY);
        showHome();
    }

    @Override
    protected void onResume() {
        super.onResume();
        updateConnectionStatus();
    }

    private void showHome() {
        settingsScreen = false;
        LinearLayout root = column(NAVY);
        root.setPadding(28, 22, 28, 24);
        root.setFocusable(true);
        root.setFocusableInTouchMode(true);
        List<List<Button>> focusRows = new ArrayList<>();

        LinearLayout topBar = row();
        topBar.setGravity(Gravity.CENTER_VERTICAL);
        TextView brand = text("TaylorMade Movies\nMovie Room OS", 20, TEAL);
        brand.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        topBar.addView(brand, weight(2));
        List<Button> topControls = new ArrayList<>();
        topControls.add(addNavButton(topBar, "HOME", this::showHome));
        topControls.add(addNavButton(topBar, "LIBRARY", this::openMovieRoomApp));
        topControls.add(addNavButton(topBar, "SEARCH", this::openMovieRoomApp));
        Button profile = button(activeProfile, PANEL, TEXT);
        profile.setOnClickListener(view -> showProfilesScreen());
        topBar.addView(profile, wrap());
        topControls.add(profile);
        topControls.add(addNavButton(topBar, "GENRES", this::showGenresScreen));
        topControls.add(addNavButton(topBar, "SETTINGS", this::showSettingsScreen));
        focusRows.add(topControls);
        root.addView(topBar, new LinearLayout.LayoutParams(-1, 72));

        ScrollView scroll = new ScrollView(this);
        LinearLayout content = column(Color.TRANSPARENT);
        content.setPadding(0, 24, 0, 12);

        LinearLayout hero = column(PANEL);
        hero.setPadding(30, 26, 30, 28);
        TextView eyebrow = text("WELCOME TO YOUR MOVIE ROOM", 13, TEAL);
        eyebrow.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        hero.addView(eyebrow);
        TextView heading = text("Your home for every story.", 38, TEXT);
        heading.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        hero.addView(heading);
        hero.addView(text("Browse your private library, continue watching, or choose a family profile.", 18, Color.rgb(185, 215, 228)));
        ImageView cover = new ImageView(this);
        cover.setImageResource(R.drawable.taylormade_movies_cover);
        cover.setContentDescription("TaylorMade Movies cover artwork");
        cover.setScaleType(ImageView.ScaleType.CENTER_CROP);
        hero.addView(cover, new LinearLayout.LayoutParams(360, 150));
        LinearLayout heroActions = row();
        List<Button> heroControls = new ArrayList<>();
        Button play = button("▶  Open Movie Room", TEAL, NAVY);
        play.setOnClickListener(view -> openMovieRoomApp());
        heroActions.addView(play, wrap());
        Button settings = button("System settings", Color.rgb(21, 54, 76), TEXT);
        settings.setOnClickListener(view -> showSettingsScreen());
        heroActions.addView(settings, wrap());
        heroControls.add(play);
        heroControls.add(settings);
        focusRows.add(heroControls);
        hero.addView(heroActions);
        connectionStatus = text("Current connection: " + currentConnectionLabel(), 16, Color.rgb(185, 215, 228));
        hero.addView(connectionStatus);
        content.addView(hero, new LinearLayout.LayoutParams(-1, -2));

        focusRows.add(addShelf(content, "Continue Watching", new String[]{"Resume your last movie", "Up next", "Keep watching"}));
        focusRows.add(addShelf(content, "Recently Added", new String[]{"Latest uploads", "New in Movie Room", "Fresh artwork"}));
        focusRows.add(addShelf(content, "Taylor-Made Picks", new String[]{"Family night", "Action favorites", "Comedy picks", "Kids corner"}));
        focusRows.add(addShelf(content, "Profiles", new String[]{"Home", "Mom", "Morganne", "Kids"}));
        focusRows.add(addShelf(content, "Device controls", new String[]{"Android Settings", "Wi-Fi settings", "Mobile data", "General network", "Bluetooth", "Display"}));

        scroll.addView(content);
        root.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));
        connectFocusRows(focusRows);
        setContentView(root);
        focusRows.get(0).get(0).requestFocus();
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

    private void connectFocusRows(List<List<Button>> rows) {
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
        showChoiceScreen("Profiles", "Choose a saved viewer profile", new String[]{
            "Home", "Mom", "Morganne", "Kids"
        }, value -> {
            activeProfile = value;
            showHome();
        });
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
        home.setOnClickListener(view -> showHome());
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
        root.setPadding(28, 22, 28, 24);
        List<List<Button>> focusRows = new ArrayList<>();

        LinearLayout header = row();
        TextView title = text("System settings", 30, TEXT);
        title.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        header.addView(title, weight(2));
        Button home = button("← Home", PANEL, TEXT);
        home.setOnClickListener(view -> showHome());
        header.addView(home, wrap());
        focusRows.add(singleton(home));
        root.addView(header, new LinearLayout.LayoutParams(-1, 72));

        ScrollView scroll = new ScrollView(this);
        LinearLayout content = column(Color.TRANSPARENT);
        content.setPadding(0, 24, 0, 12);
        TextView intro = text("Android-style device controls for Movie Room OS", 22, TEAL);
        intro.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        content.addView(intro);
        content.addView(text("Use the Fire TV remote to move between settings. Select opens the control. Back returns home.", 17, Color.rgb(185, 215, 228)));

        focusRows.add(addSettingsOption(content, "Developer options", "Build number, USB debugging, animation scale", this::openDeveloperSettings));
        focusRows.add(addSettingsOption(content, "Network & internet", "Wi-Fi, Ethernet, VPN, and connection status", () -> openDeviceSettings("General network")));
        focusRows.add(addSettingsOption(content, "Storage & media", "Files, media access, and offline downloads", () -> openDeviceSettings("Android Settings")));
        focusRows.add(addSettingsOption(content, "Keep screen awake", "Prevent the display from sleeping while watching", () -> Toast.makeText(this, "Playback keep-awake is enabled by the player.", Toast.LENGTH_LONG).show()));
        focusRows.add(addSettingsOption(content, "Startup behavior", "Movie Room OS launcher and player startup", () -> Toast.makeText(this, "Movie Room OS is registered as a TV launcher.", Toast.LENGTH_LONG).show()));
        focusRows.add(addSettingsOption(content, "App info", "Movie Room OS version 0.2.0", () -> Toast.makeText(this, "Movie Room OS 0.2.0", Toast.LENGTH_LONG).show()));
        focusRows.add(addSettingsOption(content, "Open Fire OS settings", "Open the device's native Android settings app", () -> openDeviceSettings("Android Settings")));

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
            connectionStatus.setText("Current connection: " + currentConnectionLabel());
        }
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
        view.setPadding(8, 8, 8, 8);
        return view;
    }

    private Button button(String label, int background, int color) {
        Button view = new Button(this);
        view.setId(View.generateViewId());
        view.setText(label);
        view.setTextColor(color);
        view.setTextSize(14);
        view.setAllCaps(false);
        view.setFocusable(true);
        view.setFocusableInTouchMode(true);
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(background);
        drawable.setCornerRadius(10);
        drawable.setStroke(1, Color.rgb(40, 83, 107));
        view.setBackground(drawable);
        view.setOnFocusChangeListener((focusedView, hasFocus) -> {
            GradientDrawable focusedDrawable = new GradientDrawable();
            focusedDrawable.setColor(hasFocus ? TEAL : background);
            focusedDrawable.setCornerRadius(10);
            focusedDrawable.setStroke(hasFocus ? 4 : 1, hasFocus ? Color.WHITE : Color.rgb(40, 83, 107));
            focusedView.setBackground(focusedDrawable);
            ((Button) focusedView).setTextColor(hasFocus ? NAVY : color);
        });
        return view;
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
