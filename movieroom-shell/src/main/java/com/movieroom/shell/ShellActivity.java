package com.movieroom.shell;

import android.app.Activity;
import android.content.ComponentName;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.provider.Settings;
import android.view.Gravity;
import android.view.KeyEvent;
import android.widget.Button;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

/** Native Movie Room HOME/LEANBACK launcher with Android TV-style controls. */
public final class ShellActivity extends Activity {
    private static final int NAVY = Color.rgb(6, 21, 35);
    private static final int PANEL = Color.rgb(14, 36, 53);
    private static final int TEAL = Color.rgb(64, 216, 192);
    private static final int TEXT = Color.rgb(239, 250, 255);
    private String activeProfile = "Home";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(NAVY);
        showHome();
    }

    private void showHome() {
        LinearLayout root = column(NAVY);
        root.setPadding(28, 22, 28, 24);
        root.setFocusable(true);
        root.setFocusableInTouchMode(true);

        LinearLayout topBar = row();
        topBar.setGravity(Gravity.CENTER_VERTICAL);
        TextView brand = text("TaylorMade Movies\nMovie Room OS", 20, TEAL);
        brand.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        topBar.addView(brand, weight(2));
        addNavButton(topBar, "HOME", this::showHome);
        addNavButton(topBar, "LIBRARY", this::openNativePlayer);
        addNavButton(topBar, "SEARCH", this::openNativePlayer);
        Button profile = button(activeProfile, PANEL, TEXT);
        profile.setOnClickListener(view -> cycleProfile(profile));
        topBar.addView(profile, wrap());
        addNavButton(topBar, "SETTINGS", this::openSettings);
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
        LinearLayout heroActions = row();
        Button play = button("▶  Open Movie Room", TEAL, NAVY);
        play.setOnClickListener(view -> openNativePlayer());
        heroActions.addView(play, wrap());
        Button settings = button("System settings", Color.rgb(21, 54, 76), TEXT);
        settings.setOnClickListener(view -> openSettings());
        heroActions.addView(settings, wrap());
        hero.addView(heroActions);
        content.addView(hero, new LinearLayout.LayoutParams(-1, -2));

        addShelf(content, "Continue Watching", new String[]{"Resume your last movie", "Up next", "Keep watching"});
        addShelf(content, "Recently Added", new String[]{"Latest uploads", "New in Movie Room", "Fresh artwork"});
        addShelf(content, "Taylor-Made Picks", new String[]{"Family night", "Action favorites", "Comedy picks", "Kids corner"});
        addShelf(content, "Profiles", new String[]{"Home", "Mom", "Morganne", "Kids"});
        addShelf(content, "Device controls", new String[]{"Android Settings", "Wi-Fi & network", "Bluetooth", "Display"});

        scroll.addView(content);
        root.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));
        setContentView(root);
        root.requestFocus();
    }

    private void addShelf(LinearLayout parent, String title, String[] cards) {
        TextView heading = text(title, 24, TEXT);
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
            LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(250, 106);
            params.setMargins(0, 0, 14, 0);
            cardsRow.addView(card, params);
        }
        rail.addView(cardsRow);
        parent.addView(rail, new LinearLayout.LayoutParams(-1, 118));
    }

    private void onCardSelected(String title) {
        if (title.equals("Home") || title.equals("Mom") || title.equals("Morganne") || title.equals("Kids")) {
            activeProfile = title;
            showHome();
        } else if (title.contains("Settings") || title.contains("network") || title.equals("Bluetooth") || title.equals("Display")) {
            openDeviceSettings(title);
        } else {
            openNativePlayer();
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

    private void openNativePlayer() {
        Intent intent = new Intent();
        intent.setComponent(new ComponentName("com.movieroom.firetv", "com.movieroom.firetv.MainActivity"));
        try {
            startActivity(intent);
        } catch (RuntimeException error) {
            Toast.makeText(this, "Install the Movie Room player to play titles.", Toast.LENGTH_LONG).show();
        }
    }

    private void openSettings() {
        openDeviceSettings("Android Settings");
    }

    private void openDeviceSettings(String title) {
        String action = Settings.ACTION_SETTINGS;
        if (title.contains("network")) action = Settings.ACTION_WIFI_SETTINGS;
        else if (title.equals("Bluetooth")) action = Settings.ACTION_BLUETOOTH_SETTINGS;
        else if (title.equals("Display")) action = Settings.ACTION_DISPLAY_SETTINGS;
        try {
            startActivity(new Intent(action));
        } catch (RuntimeException error) {
            Toast.makeText(this, "Android settings are unavailable on this target.", Toast.LENGTH_LONG).show();
        }
    }

    private void addNavButton(LinearLayout bar, String label, Runnable action) {
        Button nav = button(label, Color.TRANSPARENT, TEXT);
        nav.setOnClickListener(view -> action.run());
        bar.addView(nav, wrap());
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
        return view;
    }

    private LinearLayout.LayoutParams wrap() {
        return new LinearLayout.LayoutParams(-2, -2);
    }

    private LinearLayout.LayoutParams weight(float value) {
        return new LinearLayout.LayoutParams(0, -2, value);
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        return super.dispatchKeyEvent(event);
    }
}
