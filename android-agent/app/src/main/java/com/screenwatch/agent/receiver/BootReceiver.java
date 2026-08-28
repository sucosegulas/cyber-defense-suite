package com.screenwatch.agent.receiver;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

import com.screenwatch.agent.service.ConnectionService;

/**
 * Receiver que inicia o serviço quando o dispositivo liga (boot).
 */
public class BootReceiver extends BroadcastReceiver {

    private static final String TAG = "ScreenWatch-Boot";

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();

        if (Intent.ACTION_BOOT_COMPLETED.equals(action) ||
            "android.intent.action.QUICKBOOT_POWERON".equals(action)) {

            Log.i(TAG, "📱 Boot detectado - iniciando ScreenWatch Agent");

            Intent serviceIntent = new Intent(context, ConnectionService.class);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent);
            } else {
                context.startService(serviceIntent);
            }
        }
    }
}
