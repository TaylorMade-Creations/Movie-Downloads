package com.movieroom.web;

import android.Manifest;
import android.app.Activity;
import android.app.DownloadManager;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.Bundle;
import android.provider.Settings;
import android.view.KeyEvent;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/** Android wrapper for the current Movie Room website, preserving its web UI and playback flow. */
public final class MainActivity extends Activity {
    private static final int STORAGE_PERMISSION_REQUEST = 4101;
    private WebView webView;
    private String pendingDownloadUrl;
    private String pendingDownloadFileName;
    private boolean storagePromptRequested;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        applyDefaultOrientation();
        webView = new WebView(this);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setSupportZoom(false);
        configureWebViewViewport(settings);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                if (!storagePromptRequested) {
                    storagePromptRequested = true;
                    view.postDelayed(MainActivity.this::requestStorageAccessInternal, 250);
                }
            }
        });
        webView.addJavascriptInterface(new MovieRoomAndroidBridge(), "MovieRoomAndroid");
        webView.setBackgroundColor(0xff061523);
        webView.setFocusable(true);
        webView.setFocusableInTouchMode(true);
        setContentView(webView);
        webView.loadUrl(BuildConfig.MOVIE_ROOM_BASE_URL);
    }

    private final class MovieRoomAndroidBridge {
        @JavascriptInterface
        public void openSettings() {
            launchSettings(Settings.ACTION_SETTINGS);
        }

        @JavascriptInterface
        public void openNetworkSettings() {
            launchSettings(Settings.ACTION_WIFI_SETTINGS);
        }

        @JavascriptInterface
        public void openDisplaySettings() {
            launchSettings(Settings.ACTION_DISPLAY_SETTINGS);
        }

        @JavascriptInterface
        public void openBluetoothSettings() {
            launchSettings(Settings.ACTION_BLUETOOTH_SETTINGS);
        }

        @JavascriptInterface
        public void enterVideoFullscreen() {
            runOnUiThread(() -> setVideoFullscreenOrientation(true));
        }

        @JavascriptInterface
        public void exitVideoFullscreen() {
            runOnUiThread(() -> setVideoFullscreenOrientation(false));
        }

        @JavascriptInterface
        public boolean hasStorageAccess() {
            return MainActivity.this.hasStorageAccess();
        }

        @JavascriptInterface
        public void requestStorageAccess() {
            runOnUiThread(MainActivity.this::requestStorageAccessInternal);
        }

        @JavascriptInterface
        public boolean downloadForOffline(String url, String fileName) {
            if (!isSafeDownloadUrl(url)) {
                return false;
            }
            pendingDownloadUrl = url;
            pendingDownloadFileName = fileName;
            if (!hasStorageAccess()) {
                runOnUiThread(MainActivity.this::requestStorageAccessInternal);
                return false;
            }
            runOnUiThread(() -> {
                boolean started = enqueueOfflineDownload(pendingDownloadUrl, pendingDownloadFileName);
                pendingDownloadUrl = null;
                pendingDownloadFileName = null;
                notifyStoragePermission(started);
            });
            return true;
        }
    }

    private boolean hasStorageAccess() {
        if (Build.VERSION.SDK_INT >= 33) {
            return checkSelfPermission(Manifest.permission.READ_MEDIA_IMAGES) == PackageManager.PERMISSION_GRANTED
                && checkSelfPermission(Manifest.permission.READ_MEDIA_VIDEO) == PackageManager.PERMISSION_GRANTED
                && checkSelfPermission(Manifest.permission.READ_MEDIA_AUDIO) == PackageManager.PERMISSION_GRANTED;
        }
        return checkSelfPermission(Manifest.permission.READ_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED
            && checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED;
    }

    private String[] storagePermissions() {
        if (Build.VERSION.SDK_INT >= 33) {
            return new String[] {
                Manifest.permission.READ_MEDIA_IMAGES,
                Manifest.permission.READ_MEDIA_VIDEO,
                Manifest.permission.READ_MEDIA_AUDIO,
            };
        }
        return new String[] {
            Manifest.permission.READ_EXTERNAL_STORAGE,
            Manifest.permission.WRITE_EXTERNAL_STORAGE,
        };
    }

    private void requestStorageAccessInternal() {
        if (hasStorageAccess()) {
            notifyStoragePermission(true);
            return;
        }
        requestPermissions(storagePermissions(), STORAGE_PERMISSION_REQUEST);
    }

    private boolean isSafeDownloadUrl(String value) {
        if (value == null || value.trim().isEmpty()) {
            return false;
        }
        Uri uri = Uri.parse(value);
        String scheme = uri.getScheme();
        return ("https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme)) && uri.getHost() != null;
    }

    private String safeDownloadFileName(String value) {
        String source = value == null ? "movie.mp4" : value.trim();
        if (source.isEmpty()) {
            source = "movie.mp4";
        }
        String safe = source.replaceAll("[<>:\"/\\\\|?*]+", "_");
        return safe.length() > 120 ? safe.substring(0, 120) : safe;
    }

    private boolean enqueueOfflineDownload(String url, String fileName) {
        if (!isSafeDownloadUrl(url)) {
            return false;
        }
        DownloadManager manager = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
        if (manager == null) {
            return false;
        }
        try {
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
            String safeName = safeDownloadFileName(fileName);
            request.setTitle(safeName);
            request.setDescription("Movie Room offline video");
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            request.setAllowedOverMetered(true);
            request.setAllowedOverRoaming(false);
            request.setDestinationInExternalPublicDir(Environment.DIRECTORY_MOVIES, "Movie Room/" + safeName);
            manager.enqueue(request);
            return true;
        } catch (RuntimeException ignored) {
            return false;
        }
    }

    private void notifyStoragePermission(boolean granted) {
        if (webView == null) {
            return;
        }
        String script = "window.dispatchEvent(new CustomEvent('movieroom-storage-permission',{detail:{granted:"
            + (granted ? "true" : "false")
            + "}}));";
        webView.post(() -> webView.evaluateJavascript(script, null));
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != STORAGE_PERMISSION_REQUEST) {
            return;
        }
        boolean granted = hasStorageAccess();
        String url = pendingDownloadUrl;
        String fileName = pendingDownloadFileName;
        pendingDownloadUrl = null;
        pendingDownloadFileName = null;
        boolean started = granted && (url == null || enqueueOfflineDownload(url, fileName));
        notifyStoragePermission(started);
    }

    private void launchSettings(String action) {
        try {
            startActivity(new Intent(action));
        } catch (RuntimeException ignored) {
            startActivity(new Intent(Settings.ACTION_SETTINGS));
        }
    }

    private boolean isTelevisionDevice() {
        int uiMode = getResources().getConfiguration().uiMode & Configuration.UI_MODE_TYPE_MASK;
        return getPackageManager().hasSystemFeature(PackageManager.FEATURE_LEANBACK)
            || uiMode == Configuration.UI_MODE_TYPE_TELEVISION;
    }

    private void applyDefaultOrientation() {
        setRequestedOrientation(isTelevisionDevice()
            ? ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
            : ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
    }

    private void configureWebViewViewport(WebSettings settings) {
        boolean televisionDevice = isTelevisionDevice();
        // Chrome's installed PWA uses the device-width viewport on phones. Keep
        // the wide viewport only for Fire TV, where the TV layout is intentional.
        settings.setUseWideViewPort(televisionDevice);
        settings.setLoadWithOverviewMode(televisionDevice);
        if (!televisionDevice) {
            settings.setTextZoom(100);
            settings.setDefaultFontSize(16);
        }
    }

    private void setVideoFullscreenOrientation(boolean fullscreen) {
        if (isTelevisionDevice()) {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE);
            return;
        }
        setRequestedOrientation(fullscreen
            ? ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
            : ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
    }

    private String remoteCommandForKeyCode(int keyCode) {
        switch (keyCode) {
            case KeyEvent.KEYCODE_MENU:
                return "settings";
            case KeyEvent.KEYCODE_BACK:
                return "back";
            case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE:
            case KeyEvent.KEYCODE_MEDIA_PLAY:
            case KeyEvent.KEYCODE_MEDIA_PAUSE:
                return "playpause";
            case KeyEvent.KEYCODE_MEDIA_REWIND:
                return "rewind";
            case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD:
                return "fastforward";
            default:
                return null;
        }
    }

    private boolean dispatchRemoteCommand(String command) {
        if (webView == null || command == null) {
            return false;
        }
        webView.requestFocus();
        String script = "if(window.MovieRoomRemote){window.MovieRoomRemote('" + command + "');}";
        webView.evaluateJavascript(script, null);
        return true;
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (event != null
            && event.getAction() == KeyEvent.ACTION_DOWN
            && event.getRepeatCount() == 0) {
            String command = remoteCommandForKeyCode(event.getKeyCode());
            if (command != null) {
                return dispatchRemoteCommand(command);
            }
        }
        return super.dispatchKeyEvent(event);
    }

    @Override
    public void onBackPressed() {
        if (!dispatchRemoteCommand("back")) {
            super.onBackPressed();
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus && webView != null) {
            webView.requestFocus();
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.stopLoading();
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
