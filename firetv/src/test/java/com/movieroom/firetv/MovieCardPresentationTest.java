package com.movieroom.firetv;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class MovieCardPresentationTest {
    @Test
    public void compactMetadataKeepsOnlyYearAndRating() {
        assertEquals("2024  •  ★ 8.1", MovieCardPresentation.compactMetadata("2024", "8.1"));
        assertEquals("★ 8.1", MovieCardPresentation.compactMetadata("", "8.1"));
        assertEquals("2024", MovieCardPresentation.compactMetadata("2024", ""));
        assertEquals("", MovieCardPresentation.compactMetadata("", ""));
    }

    @Test
    public void televisionCardsUseCompactRemoteFriendlyDimensions() {
        assertTrue(MovieCardPresentation.TV_CARD_WIDTH_DP < 220);
        assertTrue(MovieCardPresentation.TV_CARD_HEIGHT_DP < 250);
        assertTrue(MovieCardPresentation.TV_CARD_GAP_DP >= 10);
        assertTrue(MovieCardPresentation.FOCUSED_SCALE > 1.0f);
        assertEquals(2, MovieCardPresentation.MAX_TITLE_LINES);
    }
}
