package com.movieroom.firetv;

import static org.junit.Assert.assertEquals;

import java.util.Arrays;
import java.util.List;

import org.junit.Test;

public class MovieRoomApiTest {
    @Test
    public void buildsBearerHeaderForProtectedArtworkRequests() {
        assertEquals("Bearer device-token", MovieRoomApi.bearerValue("device-token"));
    }

    @Test
    public void providesDeviceAuthorizedArtworkFallbackWhenPrimaryPosterIsProtected() {
        MovieRoomApi api = new MovieRoomApi("https://movie.example/");

        List<String> urls = api.artworkUrls(
                "/api/onedrive/image/cover-123",
                "Northern Exposure",
                "1990");

        assertEquals(Arrays.asList(
                "/api/onedrive/image/cover-123",
                "https://movie.example/api/artwork?title=Northern+Exposure&year=1990"), urls);
    }
}
