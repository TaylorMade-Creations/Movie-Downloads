package com.movieroom.shell;

import android.content.Context;
import android.content.SharedPreferences;

import java.util.Collections;
import java.util.HashSet;
import java.util.Set;

/** Device-local, non-secret shell bootstrap state. */
public final class BootstrapStore {
    private static final String PREFS = "movie_room_os_bootstrap";
    private static final String SETUP_COMPLETE = "setup_complete";
    private static final String ACTIVE_PROFILE = "active_profile";
    private static final String LAST_USED = "last_used";
    private static final String REMOTE_GUIDE_SEEN = "remote_guide_seen";
    private static final String APPS_PREFIX = "preferred_apps_";

    private final SharedPreferences preferences;

    public BootstrapStore(Context context) {
        preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    public boolean setupComplete() {
        return preferences.getBoolean(SETUP_COMPLETE, false);
    }

    public String activeProfileId() {
        return preferences.getString(ACTIVE_PROFILE, "home");
    }

    public void completeSetup(String profileId) {
        preferences.edit()
                .putBoolean(SETUP_COMPLETE, true)
                .putString(ACTIVE_PROFILE, profileId == null ? "home" : profileId)
                .apply();
    }

    public void setActiveProfile(String profileId) {
        preferences.edit().putString(ACTIVE_PROFILE, profileId == null ? "home" : profileId).apply();
    }

    public String lastUsedLabel() {
        return preferences.getString(LAST_USED, "Movie Room · Continue Watching");
    }

    public void setLastUsedLabel(String label) {
        preferences.edit().putString(LAST_USED, label == null ? "Movie Room · Continue Watching" : label).apply();
    }

    public boolean remoteGuideSeen() {
        return preferences.getBoolean(REMOTE_GUIDE_SEEN, false);
    }

    public void markRemoteGuideSeen() {
        preferences.edit().putBoolean(REMOTE_GUIDE_SEEN, true).apply();
    }

    public boolean appPreferencesConfigured(String profileId) {
        return preferences.getBoolean(APPS_PREFIX + safeProfileId(profileId) + "_configured", false);
    }

    public Set<String> preferredAppPackages(String profileId) {
        return Collections.unmodifiableSet(new HashSet<>(preferences.getStringSet(
                APPS_PREFIX + safeProfileId(profileId), Collections.emptySet())));
    }

    public void setPreferredAppPackages(String profileId, Set<String> packages) {
        Set<String> safePackages = packages == null ? Collections.emptySet() : new HashSet<>(packages);
        preferences.edit()
                .putStringSet(APPS_PREFIX + safeProfileId(profileId), safePackages)
                .putBoolean(APPS_PREFIX + safeProfileId(profileId) + "_configured", true)
                .apply();
    }

    private String safeProfileId(String profileId) {
        return profileId == null || profileId.trim().isEmpty() ? "home" : profileId.trim();
    }

    public void reset() {
        preferences.edit().clear().apply();
    }
}
