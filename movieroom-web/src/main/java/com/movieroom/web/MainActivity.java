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
        webView.setOnKeyListener((view, keyCode, event) -> {
            return handleRemoteKeyEvent(event, keyCode);
        });
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

    private String remoteActionForKeyCode(int keyCode) {
        switch (keyCode) {
            case KeyEvent.KEYCODE_DPAD_UP:
                return "up";
            case KeyEvent.KEYCODE_DPAD_DOWN:
                return "down";
            case KeyEvent.KEYCODE_DPAD_LEFT:
                return "left";
            case KeyEvent.KEYCODE_DPAD_RIGHT:
                return "right";
            case KeyEvent.KEYCODE_DPAD_CENTER:
            case KeyEvent.KEYCODE_ENTER:
                return "select";
            case KeyEvent.KEYCODE_BACK:
                return "back";
            case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE:
                return "playpause";
            case KeyEvent.KEYCODE_MENU:
                return "settings";
            default:
                return null;
        }
    }

    private boolean isRepeatableRemoteAction(String action) {
        return "up".equals(action)
            || "down".equals(action)
            || "left".equals(action)
            || "right".equals(action);
    }

    private boolean handleRemoteKeyEvent(KeyEvent event, int keyCode) {
        if (event == null) {
            return false;
        }
        String action = remoteActionForKeyCode(keyCode);
        if (action == null) {
            return false;
        }

        // Fire TV sends a KeyEvent for each remote press. Dispatch the first
        // ACTION_DOWN immediately so Select and navigation never wait for a
        // delayed ACTION_UP; allow only directional repeats while a button is
        // held, and consume ACTION_UP without firing a second action.
        if (event.getAction() == KeyEvent.ACTION_DOWN) {
            if (event.getRepeatCount() == 0 || isRepeatableRemoteAction(action)) {
                return dispatchRemoteAction(action);
            }
        }
        return true;
    }

    private String keyboardKeyForAction(String action) {
        switch (action) {
            case "up":
                return "ArrowUp";
            case "down":
                return "ArrowDown";
            case "left":
                return "ArrowLeft";
            case "right":
                return "ArrowRight";
            case "select":
                return "Enter";
            case "back":
                return "Backspace";
            case "playpause":
                return " ";
            case "settings":
                return "ContextMenu";
            default:
                return null;
        }
    }

    private String keyboardCodeForAction(String action) {
        if ("playpause".equals(action)) {
            return "Space";
        }
        return keyboardKeyForAction(action);
    }

    private String escapeJavascriptString(String value) {
        return value.replace("\\", "\\\\").replace("'", "\\'");
    }

    private boolean dispatchRemoteAction(String action) {
        if (webView == null || action == null) {
            return false;
        }
        String key = keyboardKeyForAction(action);
        String code = keyboardCodeForAction(action);
        if (key == null || code == null) {
            return false;
        }
        webView.requestFocus();
        String escapedKey = escapeJavascriptString(key);
        String escapedCode = escapeJavascriptString(code);
        String script = "(function(){var event = new KeyboardEvent('keydown',{key:'"
            + escapedKey
            + "',code:'"
            + escapedCode
            + "',bubbles:true,cancelable:true});document.dispatchEvent(event);return true;})()";
        webView.evaluateJavascript(script, null);
        return true;
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (handleRemoteKeyEvent(event, event.getKeyCode())) {
            return true;
        }
        return super.dispatchKeyEvent(event);
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
