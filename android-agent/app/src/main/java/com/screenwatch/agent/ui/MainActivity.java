package com.screenwatch.agent.ui;

import android.content.ComponentName;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.provider.Settings;
import android.service.notification.NotificationListenerService;
import android.util.Log;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;

import com.screenwatch.agent.R;
import com.screenwatch.agent.network.ScreenWatchClient;
import com.screenwatch.agent.service.ConnectionService;
import com.screenwatch.agent.service.NotificationMonitorService;

/**
 * Activity principal do app.
 * Mostra tela de configuração com:
 * - Campo para URL do servidor
 * - Botão para ativar permissão de notificações
 * - Status da conexão
 */
public class MainActivity extends AppCompatActivity {

    private static final String TAG = "ScreenWatch-Main";
    private static final String PREFS_NAME = "screenwatch_prefs";
    private static final String KEY_SERVER_URL = "server_url";

    private EditText serverUrlInput;
    private Button connectButton;
    private Button permissionButton;
    private Button batteryButton;
    private TextView statusText;
    private ImageView statusIcon;
    private View statusDot;

    private ScreenWatchClient client;
    private SharedPreferences prefs;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        client = ScreenWatchClient.getInstance();

        // Bind views
        serverUrlInput = findViewById(R.id.serverUrlInput);
        connectButton = findViewById(R.id.connectButton);
        permissionButton = findViewById(R.id.permissionButton);
        batteryButton = findViewById(R.id.batteryButton);
        statusText = findViewById(R.id.statusText);
        statusDot = findViewById(R.id.statusDot);

        // Carrega URL salva
        String savedUrl = prefs.getString(KEY_SERVER_URL, "https://screenwatch-server.fly.dev");
        serverUrlInput.setText(savedUrl);

        // Listener de conexão
        client.setConnectionListener(new ScreenWatchClient.ConnectionListener() {
            @Override
            public void onConnected() {
                updateStatus(true, "Conectado ao servidor");
            }

            @Override
            public void onDisconnected() {
                updateStatus(false, "Desconectado");
            }

            @Override
            public void onError(String message) {
                updateStatus(false, "Erro: " + message);
            }
        });

        // Botão Conectar
        connectButton.setOnClickListener(v -> {
            String url = serverUrlInput.getText().toString().trim();
            if (url.isEmpty()) {
                serverUrlInput.setError("Informe o endereço do servidor");
                return;
            }

            // Salva URL
            prefs.edit().putString(KEY_SERVER_URL, url).apply();

            // Inicia o serviço de conexão
            Intent serviceIntent = new Intent(this, ConnectionService.class);
            serviceIntent.putExtra("serverUrl", url);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(serviceIntent);
            } else {
                startService(serviceIntent);
            }

            updateStatus(false, "Conectando...");
        });

        // Botão Permissão de Notificações
        permissionButton.setOnClickListener(v -> {
            openNotificationListenerSettings();
        });

        // Botão Otimização de Bateria
        batteryButton.setOnClickListener(v -> {
            requestIgnoreBatteryOptimization();
        });

        updatePermissionStatus();
    }

    @Override
    protected void onResume() {
        super.onResume();

        // Detecta transição de permissão (desativada → ativada)
        boolean wasPreviouslyEnabled = prefs.getBoolean("notif_permission", false);
        boolean isNowEnabled = isNotificationListenerEnabled();

        if (!wasPreviouslyEnabled && isNowEnabled) {
            Log.i(TAG, "Permissão de notificações concedida! Forçando rebind do NotificationListenerService...");
            ComponentName cn = new ComponentName(this, NotificationMonitorService.class);
            NotificationListenerService.requestRebind(cn);
            prefs.edit().putBoolean("notif_permission", true).apply();
        } else if (wasPreviouslyEnabled && !isNowEnabled) {
            prefs.edit().putBoolean("notif_permission", false).apply();
        }

        updatePermissionStatus();
        updateStatus(client.isConnected(),
            client.isConnected() ? "Conectado ao servidor" : "Desconectado");
    }

    /**
     * Verifica se a permissão de notificações está ativa.
     */
    private boolean isNotificationListenerEnabled() {
        ComponentName cn = new ComponentName(this, NotificationMonitorService.class);
        String flat = Settings.Secure.getString(getContentResolver(), "enabled_notification_listeners");
        return flat != null && flat.contains(cn.flattenToString());
    }

    /**
     * Abre as configurações de acesso a notificações.
     */
    private void openNotificationListenerSettings() {
        Intent intent = new Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS");
        startActivity(intent);
    }

    /**
     * Solicita ignorar otimização de bateria.
     */
    private void requestIgnoreBatteryOptimization() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            if (pm != null && !pm.isIgnoringBatteryOptimizations(getPackageName())) {
                Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                intent.setData(Uri.parse("package:" + getPackageName()));
                startActivity(intent);
            }
        }
    }

    /**
     * Atualiza o status visual dos botões de permissão.
     */
    private void updatePermissionStatus() {
        boolean notifEnabled = isNotificationListenerEnabled();

        if (notifEnabled) {
            permissionButton.setText("✅ Acesso a Notificações: ATIVO");
            permissionButton.setEnabled(false);
            permissionButton.setAlpha(0.7f);
        } else {
            permissionButton.setText("🔔 Ativar Acesso a Notificações");
            permissionButton.setEnabled(true);
            permissionButton.setAlpha(1f);
        }

        // Bateria
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            if (pm != null && pm.isIgnoringBatteryOptimizations(getPackageName())) {
                batteryButton.setText("✅ Otimização de Bateria: DESATIVADA");
                batteryButton.setEnabled(false);
                batteryButton.setAlpha(0.7f);
            }
        }
    }

    /**
     * Atualiza o indicador de status na UI.
     */
    private void updateStatus(boolean connected, String text) {
        runOnUiThread(() -> {
            statusText.setText(text);
            if (statusDot != null) {
                statusDot.setBackgroundResource(connected ?
                    R.drawable.dot_online : R.drawable.dot_offline);
            }
        });
    }
}
