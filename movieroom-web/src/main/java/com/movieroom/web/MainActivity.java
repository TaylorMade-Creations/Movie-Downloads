package com.movieroom.web;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
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
    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        webView = new WebView(this);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setSupportZoom(false);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);
        webView.setWebViewClient(new WebViewClient());
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
    }

    private void launchSettings(String action) {
        try {
            startActivity(new Intent(action));
        } catch (RuntimeException ignored) {
            startActivity(new Intent(Settings.ACTION_SETTINGS));
        }
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (event.getAction() == KeyEvent.ACTION_UP && event.getKeyCode() == KeyEvent.KEYCODE_BACK && webView != null && webView.canGoBack()) {
            webView.goBack();
            return true;
        }
        return super.dispatchKeyEvent(event);
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
