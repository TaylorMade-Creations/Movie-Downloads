package com.movieroom.web;

import android.app.Activity;
import android.content.pm.ActivityInfo;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.ui.AspectRatioFrameLayout;
import androidx.media3.ui.PlayerView;

/** Full-screen Fire TV player used when the WebView cannot decode the source audio. */
public final class NativePlayerActivity extends Activity {
    public static final String EXTRA_URL = "playback_url";
    public static final String EXTRA_TITLE = "playback_title";
    public static final String EXTRA_FILE_NAME = "playback_file_name";
    public static final String EXTRA_CONTENT_TYPE = "playback_content_type";

    private ExoPlayer player;
    private PlayerView playerView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN, WindowManager.LayoutParams.FLAG_FULLSCREEN);

        String url = getIntent().getStringExtra(EXTRA_URL);
        String title = getIntent().getStringExtra(EXTRA_TITLE);
        String fileName = getIntent().getStringExtra(EXTRA_FILE_NAME);
        String contentType = getIntent().getStringExtra(EXTRA_CONTENT_TYPE);
        if (!isSafePlaybackUrl(url)) {
            Toast.makeText(this, "The movie link is not available.", Toast.LENGTH_LONG).show();
            finish();
            return;
        }

        playerView = new PlayerView(this);
        playerView.setKeepScreenOn(true);
        playerView.setResizeMode(AspectRatioFrameLayout.RESIZE_MODE_FIT);
        playerView.setUseController(true);
        playerView.setBackgroundColor(0xff000000);
        playerView.setFocusable(true);
        playerView.setFocusableInTouchMode(true);
        FrameLayout playerRoot = new FrameLayout(this);
        playerRoot.setBackgroundColor(Color.BLACK);
        playerRoot.addView(playerView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT));

        LinearLayout heroInfo = new LinearLayout(this);
        heroInfo.setOrientation(LinearLayout.VERTICAL);
        heroInfo.setPadding(dp(26), dp(18), dp(26), dp(18));
        GradientDrawable heroBackground = new GradientDrawable(
                GradientDrawable.Orientation.TOP_BOTTOM,
                new int[] { 0xee061523, 0xaa061523, 0x00061523 });
        heroInfo.setBackground(heroBackground);
        TextView eyebrow = text("NOW PLAYING", 12, 0xffa6f1e7);
        TextView titleView = text(title == null || title.trim().isEmpty() ? "Movie Room" : title, 30, Color.WHITE);
        titleView.setMaxLines(2);
        titleView.setEllipsize(TextUtils.TruncateAt.END);
        TextView hint = text("Select for play/pause • Left/Right to seek • Back to return", 14, 0xffd7edf5);
        heroInfo.addView(eyebrow);
        heroInfo.addView(titleView, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        heroInfo.addView(hint);
        FrameLayout.LayoutParams heroParams = new FrameLayout.LayoutParams(
                dp(680), FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM | Gravity.START);
        heroParams.setMargins(dp(24), 0, 0, dp(20));
        playerRoot.addView(heroInfo, heroParams);
        setContentView(playerRoot);

        player = new ExoPlayer.Builder(this).build();
        player.setAudioAttributes(
                new AudioAttributes.Builder()
                        .setUsage(C.USAGE_MEDIA)
                        .setContentType(C.AUDIO_CONTENT_TYPE_MOVIE)
                        .build(),
                true);
        player.setHandleAudioBecomingNoisy(true);
        playerView.setPlayer(player);

        MediaMetadata metadata = new MediaMetadata.Builder()
                .setTitle(title == null || title.trim().isEmpty() ? "Movie Room" : title)
                .build();
        MediaItem item = new MediaItem.Builder()
                .setUri(Uri.parse(url))
                .setMimeType(mediaMimeType(fileName, contentType))
                .setMediaMetadata(metadata)
                .build();
        player.setMediaItem(item);
        player.addListener(new Player.Listener() {
            @Override
            public void onPlayerError(androidx.media3.common.PlaybackException error) {
                Toast.makeText(
                        NativePlayerActivity.this,
                        "This Fire TV could not decode this title's audio or video.",
                        Toast.LENGTH_LONG).show();
                if (playerView != null) playerView.showController();
            }
        });
        player.prepare();
        player.play();
        playerView.requestFocus();
        playerView.showController();
    }

    private static boolean isSafePlaybackUrl(String value) {
        if (value == null || value.trim().isEmpty()) return false;
        Uri uri = Uri.parse(value);
        return "https".equalsIgnoreCase(uri.getScheme()) && uri.getHost() != null;
    }

    private TextView text(String value, int size, int color) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(size);
        view.setTextColor(color);
        return view;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private static String mediaMimeType(String fileName, String contentType) {
        String supplied = contentType == null ? "" : contentType.trim().toLowerCase();
        if (supplied.startsWith("video/")) return supplied;
        String name = fileName == null ? "" : fileName.trim().toLowerCase();
        if (name.endsWith(".mkv")) return "video/x-matroska";
        if (name.endsWith(".webm")) return "video/webm";
        if (name.endsWith(".mov")) return "video/quicktime";
        if (name.endsWith(".avi")) return "video/x-msvideo";
        if (name.endsWith(".ts")) return "video/mp2t";
        return "video/mp4";
    }

    private void togglePlayback() {
        if (player == null) return;
        if (player.isPlaying()) player.pause();
        else player.play();
        if (playerView != null) playerView.showController();
    }

    private void seekBy(long offsetMs) {
        if (player == null || !player.isCurrentMediaItemSeekable()) return;
        long duration = player.getDuration();
        long target = Math.max(0L, player.getCurrentPosition() + offsetMs);
        if (duration != C.TIME_UNSET && duration > 0L) target = Math.min(target, duration);
        player.seekTo(target);
        if (playerView != null) playerView.showController();
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        switch (keyCode) {
            case KeyEvent.KEYCODE_BACK:
                finish();
                return true;
            case KeyEvent.KEYCODE_DPAD_CENTER:
            case KeyEvent.KEYCODE_ENTER:
            case KeyEvent.KEYCODE_NUMPAD_ENTER:
            case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE:
            case KeyEvent.KEYCODE_MEDIA_PLAY:
            case KeyEvent.KEYCODE_MEDIA_PAUSE:
                togglePlayback();
                return true;
            case KeyEvent.KEYCODE_DPAD_LEFT:
            case KeyEvent.KEYCODE_MEDIA_REWIND:
                seekBy(-10_000L);
                return true;
            case KeyEvent.KEYCODE_DPAD_RIGHT:
            case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD:
                seekBy(30_000L);
                return true;
            case KeyEvent.KEYCODE_DPAD_UP:
            case KeyEvent.KEYCODE_DPAD_DOWN:
            case KeyEvent.KEYCODE_MENU:
                if (playerView != null) playerView.showController();
                return true;
            default:
                return super.onKeyDown(keyCode, event);
        }
    }

    @Override
    protected void onDestroy() {
        if (player != null) {
            player.release();
            player = null;
        }
        playerView = null;
        super.onDestroy();
    }
}
