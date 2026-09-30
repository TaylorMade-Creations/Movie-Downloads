package com.movieroom.firetv;

import java.util.ArrayList;
import java.util.List;

/** Pure presentation rules shared by the remote-first movie card UI and tests. */
public final class MovieCardPresentation {
    public static final int TV_CARD_WIDTH_DP = 176;
    public static final int TV_CARD_HEIGHT_DP = 224;
    public static final float FOCUSED_SCALE = 1.05f;
    public static final int MAX_TITLE_LINES = 2;

    private MovieCardPresentation() {
    }

    public static String compactMetadata(String year, String rating) {
        List<String> parts = new ArrayList<>();
        if (year != null && !year.trim().isEmpty() && !"0".equals(year.trim())) {
            parts.add(year.trim());
        }
        if (rating != null && !rating.trim().isEmpty()) {
            parts.add("★ " + rating.trim());
        }
        return String.join("  •  ", parts);
    }
}
