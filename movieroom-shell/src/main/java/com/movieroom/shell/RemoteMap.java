package com.movieroom.shell;

import android.view.KeyEvent;

/** Converts common Android, Fire TV, and HDMI-CEC key codes into shell actions. */
public final class RemoteMap {
    public enum Action {
        NONE,
        UP,
        DOWN,
        LEFT,
        RIGHT,
        SELECT,
        BACK,
        MENU,
        PLAY_PAUSE,
        REWIND,
        FAST_FORWARD,
        PAGE_UP,
        PAGE_DOWN,
        INFO,
        RESET
    }

    private RemoteMap() {}

    public static Action actionFor(KeyEvent event) {
        if (event == null) return Action.NONE;
        switch (event.getKeyCode()) {
            case KeyEvent.KEYCODE_DPAD_UP: return Action.UP;
            case KeyEvent.KEYCODE_DPAD_DOWN: return Action.DOWN;
            case KeyEvent.KEYCODE_DPAD_LEFT: return Action.LEFT;
            case KeyEvent.KEYCODE_DPAD_RIGHT: return Action.RIGHT;
            case KeyEvent.KEYCODE_DPAD_CENTER:
            case KeyEvent.KEYCODE_ENTER:
            case KeyEvent.KEYCODE_NUMPAD_ENTER:
            case KeyEvent.KEYCODE_BUTTON_A: return Action.SELECT;
            case KeyEvent.KEYCODE_BACK:
            case KeyEvent.KEYCODE_ESCAPE:
            case KeyEvent.KEYCODE_BUTTON_B: return Action.BACK;
            case KeyEvent.KEYCODE_MENU: return Action.MENU;
            case KeyEvent.KEYCODE_MEDIA_PLAY:
            case KeyEvent.KEYCODE_MEDIA_PAUSE:
            case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE: return Action.PLAY_PAUSE;
            case KeyEvent.KEYCODE_MEDIA_REWIND: return Action.REWIND;
            case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD: return Action.FAST_FORWARD;
            case KeyEvent.KEYCODE_PAGE_UP: return Action.PAGE_UP;
            case KeyEvent.KEYCODE_PAGE_DOWN: return Action.PAGE_DOWN;
            case KeyEvent.KEYCODE_INFO: return Action.INFO;
            default: return Action.NONE;
        }
    }
}
