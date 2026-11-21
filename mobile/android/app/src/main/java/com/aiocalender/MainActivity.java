package com.aiocalender;

import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;
import com.codetrixstudio.capacitor.GoogleAuth.GoogleAuth;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(GoogleAuth.class);
        registerPlugin(AIOAlarmPlugin.class);
        super.onCreate(savedInstanceState);

        // Turn screen on and display over lock screen when triggered by lecture/task alarm
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            try {
                setShowWhenLocked(true);
                setTurnScreenOn(true);
            } catch (Throwable ignored) {
            }
        } else {
            try {
                getWindow().addFlags(
                    WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED |
                    WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON |
                    WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD |
                    WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                );
            } catch (Throwable ignored) {
            }
        }
    }
}
