package com.movieroom.firetv;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public class MovieRoomApiTest {
    @Test
    public void buildsBearerHeaderForProtectedArtworkRequests() {
        assertEquals("Bearer device-token", MovieRoomApi.bearerValue("device-token"));
    }
}
