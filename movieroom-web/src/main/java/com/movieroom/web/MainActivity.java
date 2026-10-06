package com.movieroom.web;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.Bundle;
import android.provider.Settings;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Toast;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;

/** Android wrapper for the current Movie Room website, preserving its web UI and playback flow. */
public final class MainActivity extends Activity {
    private static final int STORAGE_PERMISSION_REQUEST = 4101;
    private static final String NETWORK_UPDATE_PROMPT_KEY = "network_update_prompt_v1";
    private static final String NETWORK_UPDATE_ALLOWED_KEY = "network_update_allowed";
    private static final String UPDATE_MANIFEST_URL = "https://movie-downloads-six.vercel.app/apk/update.json";
    private WebView webView;
    private String pendingDownloadUrl;
    private String pendingDownloadFileName;
    private boolean storagePromptRequested;
    private boolean networkPromptScheduled;
    private boolean updateCheckInFlight;
    private boolean nativePlayerStarted;

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
                view.postDelayed(() -> view.evaluateJavascript(
                    "window.MovieRoomFocusInitialHero && window.MovieRoomFocusInitialHero();",
                    null
                ), 1500);
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
        webView.setDescendantFocusability(ViewGroup.FOCUS_AFTER_DESCENDANTS);
        webView.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_YES);
        setContentView(webView);
        webView.requestFocus(View.FOCUS_DOWN);
        webView.loadUrl(BuildConfig.MOVIE_ROOM_BASE_URL);
    }

    private final class MovieRoomAndroidBridge {
        @JavascriptInterface
        public void openSettings() {
            launchSettings(Settings.ACTION_SETTINGS);
        }

        @JavascriptInterface
        public void openAppStorageSettings() {
            try {
                Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                intent.setData(Uri.parse("package:" + getPackageName()));
                startActivity(intent);
            } catch (RuntimeException ignored) {
                launchSettings(Settings.ACTION_SETTINGS);
            }
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
        public boolean isTelevisionDevice() {
            return MainActivity.this.isTelevisionDevice();
        }

        @JavascriptInterface
        public boolean playInNativePlayer(String url, String title, String fileName, String contentType) {
            if (!isSafePlaybackUrl(url)) {
                return false;
            }
            try {
                Intent intent = new Intent(MainActivity.this, NativePlayerActivity.class);
                intent.putExtra(NativePlayerActivity.EXTRA_URL, url);
                intent.putExtra(NativePlayerActivity.EXTRA_TITLE, title == null ? "Movie Room" : title);
                intent.putExtra(NativePlayerActivity.EXTRA_FILE_NAME, fileName == null ? "" : fileName);
                intent.putExtra(NativePlayerActivity.EXTRA_CONTENT_TYPE, contentType == null ? "" : contentType);
                startActivity(intent);
                nativePlayerStarted = true;
                return true;
            } catch (RuntimeException ignored) {
                return false;
            }
        }

        @JavascriptInterface
        public void checkForUpdates() {
            runOnUiThread(MainActivity.this::checkForAppUpdate);
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
            scheduleNetworkUpdatePrompt();
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

    private boolean isSafePlaybackUrl(String value) {
        if (!isSafeDownloadUrl(value)) {
            return false;
        }
        return "https".equalsIgnoreCase(Uri.parse(value).getScheme());
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
        scheduleNetworkUpdatePrompt();
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
        boolean televisionUiMode = uiMode == Configuration.UI_MODE_TYPE_TELEVISION;
        boolean leanbackWithoutTouch = getPackageManager().hasSystemFeature(PackageManager.FEATURE_LEANBACK)
            && !getPackageManager().hasSystemFeature(PackageManager.FEATURE_TOUCHSCREEN);
        return televisionUiMode || leanbackWithoutTouch;
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

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
            return;
        }
        super.onBackPressed();
    }

    private void scheduleNetworkUpdatePrompt() {
        if (networkPromptScheduled || webView == null) {
            return;
        }
        networkPromptScheduled = true;
        webView.postDelayed(this::maybePromptForNetworkUpdates, 700);
    }

    private void maybePromptForNetworkUpdates() {
        SharedPreferences preferences = getSharedPreferences("movie_room_preferences", MODE_PRIVATE);
        if (preferences.getBoolean(NETWORK_UPDATE_PROMPT_KEY, false)) {
            if (preferences.getBoolean(NETWORK_UPDATE_ALLOWED_KEY, false)) {
                checkForAppUpdate();
            }
            return;
        }

        new AlertDialog.Builder(this)
            .setTitle("Use network for updates?")
            .setMessage("Movie Room uses its normal internet access to load your library and check for app updates. Android grants Internet access at install; this choice controls whether Movie Room checks for updates.")
            .setPositiveButton("Allow & check", (dialog, which) -> {
                preferences.edit()
                    .putBoolean(NETWORK_UPDATE_PROMPT_KEY, true)
                    .putBoolean(NETWORK_UPDATE_ALLOWED_KEY, true)
                    .apply();
                checkForAppUpdate();
            })
            .setNegativeButton("Not now", (dialog, which) -> preferences.edit()
                .putBoolean(NETWORK_UPDATE_PROMPT_KEY, true)
                .putBoolean(NETWORK_UPDATE_ALLOWED_KEY, false)
                .apply())
            .setOnCancelListener(dialog -> preferences.edit()
                .putBoolean(NETWORK_UPDATE_PROMPT_KEY, true)
                .putBoolean(NETWORK_UPDATE_ALLOWED_KEY, false)
                .apply())
            .show();
    }

    private boolean hasNetworkConnection() {
        ConnectivityManager manager = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
        if (manager == null) {
            return false;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            Network network = manager.getActiveNetwork();
            NetworkCapabilities capabilities = network == null ? null : manager.getNetworkCapabilities(network);
            return capabilities != null && capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
        }
        NetworkInfo info = manager.getActiveNetworkInfo();
        return info != null && info.isConnected();
    }

    private boolean isSafeUpdateUrl(String value) {
        return isSafeDownloadUrl(value) && "https".equalsIgnoreCase(Uri.parse(value).getScheme());
    }

    private UpdateInfo fetchUpdateInfo() throws Exception {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(UPDATE_MANIFEST_URL).openConnection();
            connection.setConnectTimeout(6000);
            connection.setReadTimeout(6000);
            connection.setRequestMethod("GET");
            connection.setRequestProperty("Accept", "application/json");
            int responseCode = connection.getResponseCode();
            if (responseCode != HttpURLConnection.HTTP_OK) {
                throw new IllegalStateException("Update manifest returned HTTP " + responseCode);
            }
            StringBuilder body = new StringBuilder();
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(connection.getInputStream(), "UTF-8"))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    body.append(line);
                }
            }
            JSONObject payload = new JSONObject(body.toString());
            int versionCode = payload.optInt("versionCode", 0);
            String versionName = payload.optString("versionName", "");
            String downloadUrl = payload.optString("downloadUrl", "");
            String releaseNotes = payload.optString("releaseNotes", "");
            if (versionCode <= 0 || versionName.isEmpty() || !isSafeUpdateUrl(downloadUrl)) {
                throw new IllegalStateException("Update manifest is incomplete");
            }
            return new UpdateInfo(versionCode, versionName, downloadUrl, releaseNotes);
        } finally {
            if (connection != null) {
                connection.disconnect();
            }
        }
    }

    private void checkForAppUpdate() {
        if (updateCheckInFlight) {
            return;
        }
        if (!hasNetworkConnection()) {
            Toast.makeText(this, "No network connection is available for update checks.", Toast.LENGTH_LONG).show();
            return;
        }
        updateCheckInFlight = true;
        new Thread(() -> {
            UpdateInfo result = null;
            Exception error = null;
            try {
                result = fetchUpdateInfo();
            } catch (Exception exception) {
                error = exception;
            }
            UpdateInfo finalResult = result;
            Exception finalError = error;
            runOnUiThread(() -> {
                updateCheckInFlight = false;
                showUpdateResult(finalResult, finalError);
            });
        }, "MovieRoomUpdateCheck").start();
    }

    private void showUpdateResult(UpdateInfo info, Exception error) {
        if (error != null || info == null) {
            Toast.makeText(this, "Unable to check for updates. Check the network and try again.", Toast.LENGTH_LONG).show();
            return;
        }
        if (info.versionCode > BuildConfig.VERSION_CODE && isSafeUpdateUrl(info.downloadUrl)) {
            String message = "Version " + info.versionName + " is ready to download.";
            if (!info.releaseNotes.isEmpty()) {
                message += "\n\n" + info.releaseNotes;
            }
            new AlertDialog.Builder(this)
                .setTitle("Update available")
                .setMessage(message)
                .setNegativeButton("Later", null)
                .setPositiveButton("Open download", (dialog, which) -> {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(info.downloadUrl)));
                    } catch (RuntimeException ignored) {
                        Toast.makeText(this, "The update download could not be opened.", Toast.LENGTH_LONG).show();
                    }
                })
                .show();
            return;
        }
        Toast.makeText(this, "Movie Room is up to date.", Toast.LENGTH_SHORT).show();
    }

    private static final class UpdateInfo {
        private final int versionCode;
        private final String versionName;
        private final String downloadUrl;
        private final String releaseNotes;

        private UpdateInfo(int versionCode, String versionName, String downloadUrl, String releaseNotes) {
            this.versionCode = versionCode;
            this.versionName = versionName;
            this.downloadUrl = downloadUrl;
            this.releaseNotes = releaseNotes;
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (!nativePlayerStarted || webView == null) {
            return;
        }
        nativePlayerStarted = false;
        webView.postDelayed(() -> webView.evaluateJavascript(
            "(function(){return window.MovieRoomNativePlayerClosed && window.MovieRoomNativePlayerClosed() === true;})()",
            null), 120);
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
