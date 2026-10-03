package com.movieroom.shell;

import android.content.Context;
import android.content.SharedPreferences;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

/** Household profile metadata and one-way local PIN helpers for the shell. */
public final class ProfileStore {
    public static final class Profile {
        public final String id;
        public final String displayName;
        public final int avatarResource;
        public final int accentColor;

        public Profile(String id, String displayName, int avatarResource, int accentColor) {
            this.id = id;
            this.displayName = displayName;
            this.avatarResource = avatarResource;
            this.accentColor = accentColor;
        }
    }

    private final BootstrapStore bootstrap;
    private final SharedPreferences profiles;

    public ProfileStore(Context context) {
        bootstrap = new BootstrapStore(context);
        profiles = context.getSharedPreferences("movie_room_os_profiles", Context.MODE_PRIVATE);
    }

    public List<Profile> defaults() {
        return Collections.unmodifiableList(Arrays.asList(
                new Profile("home", "Home", R.drawable.profile_home, 0xfff0c45b),
                new Profile("mom", "Mom", R.drawable.profile_mom, 0xff28c48f),
                new Profile("morganne", "Morganne", R.drawable.profile_morganne, 0xffff74ad),
                new Profile("kids", "Kids", R.drawable.profile_kids, 0xfff59e0b)
        ));
    }

    public Profile find(String id) {
        if ("custom".equals(id)) {
            Profile custom = customProfile();
            if (custom != null) return custom;
        }
        for (Profile profile : defaults()) {
            if (profile.id.equals(id)) return profile;
        }
        return defaults().get(0);
    }

    public Profile createCustomProfile(String name, String type, int avatarIndex) {
        String cleanName = name == null ? "" : name.trim();
        if (cleanName.isEmpty()) throw new IllegalArgumentException("A name or screen name is required");
        int safeIndex = Math.max(0, Math.min(8, avatarIndex));
        profiles.edit()
                .putString("name", cleanName)
                .putString("type", type == null ? "Regular user" : type)
                .putInt("avatar", safeIndex)
                .apply();
        return customProfile();
    }

    public int customAvatarResource(int index) {
        int safeIndex = Math.max(0, Math.min(8, index));
        switch (safeIndex) {
            case 0: return R.drawable.profile_pp1;
            case 1: return R.drawable.profile_pp2;
            case 2: return R.drawable.profile_pp3;
            case 3: return R.drawable.profile_pp4;
            case 4: return R.drawable.profile_pp5;
            case 5: return R.drawable.profile_pp6;
            case 6: return R.drawable.profile_pp7;
            case 7: return R.drawable.profile_pp8;
            case 8: return R.drawable.profile_pp9;
            default: return R.drawable.profile_pp1;
        }
    }

    private Profile customProfile() {
        String name = profiles.getString("name", null);
        if (name == null || name.trim().isEmpty()) return null;
        int avatar = profiles.getInt("avatar", 0);
        int[] accents = {0xffff74ad, 0xffffcf52, 0xff79b7ff, 0xffff72bd, 0xfff08d54, 0xff83d8a4, 0xffa98cff, 0xffff9e62, 0xff9cd9ee};
        return new Profile("custom", name, customAvatarResource(avatar), accents[Math.max(0, Math.min(8, avatar))]);
    }

    public void remember(String profileId) {
        bootstrap.setActiveProfile(profileId);
    }

    public String activeProfileId() {
        return bootstrap.activeProfileId();
    }

    public static String hashPin(String pin, String salt) {
        if (pin == null || !pin.matches("[0-9]{4,8}")) {
            throw new IllegalArgumentException("PIN must be 4 to 8 digits");
        }
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] bytes = digest.digest((salt + ":" + pin).getBytes(StandardCharsets.UTF_8));
            StringBuilder result = new StringBuilder(bytes.length * 2);
            for (byte value : bytes) result.append(String.format("%02x", value));
            return result.toString();
        } catch (NoSuchAlgorithmException error) {
            throw new IllegalStateException("SHA-256 is unavailable", error);
        }
    }
}
