package com.screenwatch.agent.service;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import com.screenwatch.agent.network.ScreenWatchClient;

/**
 * Foreground Service para manter a conexão WebSocket ativa em background.
 * Mostra uma notificação permanente discreta.
 */
public class ConnectionService extends Service {

    private static final String TAG = "ScreenWatch-ConnSvc";
    private static final String CHANNEL_ID = "screenwatch_connection";
    private static final int NOTIFICATION_ID = 1001;

    private ScreenWatchClient client;
    private Handler heartbeatHandler;
    private Runnable heartbeatRunnable;
    private static final long HEARTBEAT_INTERVAL = 30000; // 30 segundos

    @Override
    public void onCreate() {
        super.onCreate();
        Log.i(TAG, "ConnectionService criado");

        createNotificationChannel();
        client = ScreenWatchClient.getInstance();

        // Heartbeat periódico
        heartbeatHandler = new Handler(Looper.getMainLooper());
        heartbeatRunnable = new Runnable() {
            @Override
            public void run() {
                if (client != null && client.isConnected()) {
                    client.sendHeartbeat();
                }
                heartbeatHandler.postDelayed(this, HEARTBEAT_INTERVAL);
            }
        };
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Log.i(TAG, "ConnectionService iniciado");

        // Inicia como foreground service
        Notification notification = buildNotification("Monitoramento ativo");
        startForeground(NOTIFICATION_ID, notification);

        // Conecta ao servidor
        String serverUrl = null;
        if (intent != null) {
            serverUrl = intent.getStringExtra("serverUrl");
        }
        if (serverUrl != null && !serverUrl.isEmpty()) {
            client.setServerUrl(serverUrl);
        }

        client.connect();

        // Inicia heartbeat
        heartbeatHandler.postDelayed(heartbeatRunnable, HEARTBEAT_INTERVAL);

        // Se o sistema matar o serviço, reinicia
        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        Log.i(TAG, "ConnectionService destruído");
        heartbeatHandler.removeCallbacks(heartbeatRunnable);
        // Não desconecta - o NotificationListenerService pode ainda estar ativo
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "ScreenWatch Conexão",
                NotificationManager.IMPORTANCE_LOW // Sem som, discreto
            );
            channel.setDescription("Mantém a conexão com o servidor de monitoramento");
            channel.setShowBadge(false);

            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    private Notification buildNotification(String text) {
        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("ScreenWatch")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_menu_manage)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .setSilent(true)
            .build();
    }
}
