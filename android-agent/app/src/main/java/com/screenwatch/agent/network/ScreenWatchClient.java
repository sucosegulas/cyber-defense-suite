package com.screenwatch.agent.network;

import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import com.google.gson.Gson;
import com.screenwatch.agent.data.NotificationData;

import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.TimeUnit;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;

/**
 * Cliente WebSocket que se conecta ao servidor ScreenWatch.
 * Gerencia conexão, reconexão e envio de dados.
 */
public class ScreenWatchClient {

    private static final String TAG = "ScreenWatch-Client";
    private static ScreenWatchClient instance;

    private String serverUrl = "http://localhost:3000";
    private String machineId;
    private OkHttpClient httpClient;
    private WebSocket webSocket;
    private Gson gson;
    private boolean connected = false;
    private boolean shouldReconnect = true;
    private int reconnectDelay = 3000; // ms
    private static final int MAX_RECONNECT_DELAY = 30000; // ms
    private Handler handler;

    // Listener para status de conexão
    private ConnectionListener connectionListener;

    public interface ConnectionListener {
        void onConnected();
        void onDisconnected();
        void onError(String message);
    }

    private ScreenWatchClient() {
        gson = new Gson();
        handler = new Handler(Looper.getMainLooper());

        // Gera ID único baseado no dispositivo
        machineId = Build.SERIAL + "_" + Build.MODEL.replaceAll("\\s", "_");
        if (machineId.startsWith("unknown")) {
            machineId = Build.BRAND + "_" + Build.MODEL.replaceAll("\\s", "_") + "_" + Build.ID;
        }

        httpClient = new OkHttpClient.Builder()
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(10, TimeUnit.SECONDS)
            .pingInterval(25, TimeUnit.SECONDS) // Keep-alive
            .build();
    }

    public static synchronized ScreenWatchClient getInstance() {
        if (instance == null) {
            instance = new ScreenWatchClient();
        }
        return instance;
    }

    public void setServerUrl(String url) {
        this.serverUrl = url;
    }

    public void setConnectionListener(ConnectionListener listener) {
        this.connectionListener = listener;
    }

    public boolean isConnected() {
        return connected;
    }

    public String getMachineId() {
        return machineId;
    }

    /**
     * Conecta ao servidor ScreenWatch via WebSocket.
     * Usa Socket.IO protocol v4 handshake simplificado.
     */
    public void connect() {
        if (connected && webSocket != null) {
            Log.d(TAG, "Já conectado");
            return;
        }

        shouldReconnect = true;

        // Socket.IO usa HTTP polling primeiro, depois upgrade para WebSocket
        // Simplificamos conectando direto via WebSocket com o protocolo do Socket.IO
        // O servidor Socket.IO envia o packet 0{...} (open) logo após o upgrade WebSocket
        // Só então devemos enviar 40/agent, (connect ao namespace)
        String wsUrl = serverUrl
            .replace("http://", "ws://")
            .replace("https://", "wss://")
            + "/socket.io/?EIO=4&transport=websocket&namespace=/agent";

        Log.i(TAG, "📡 Conectando a " + wsUrl);

        Request request = new Request.Builder()
            .url(wsUrl)
            .build();

        webSocket = httpClient.newWebSocket(request, new WebSocketListener() {
            @Override
            public void onOpen(WebSocket ws, Response response) {
                Log.i(TAG, "✅ WebSocket conectado! Aguardando open packet...");
                connected = true;
                reconnectDelay = 3000; // Reset delay

                if (connectionListener != null) {
                    handler.post(() -> connectionListener.onConnected());
                }
            }

            @Override
            public void onMessage(WebSocket ws, String text) {
                handleMessage(text);
            }

            @Override
            public void onClosing(WebSocket ws, int code, String reason) {
                Log.w(TAG, "WebSocket fechando: " + reason);
                connected = false;
            }

            @Override
            public void onClosed(WebSocket ws, int code, String reason) {
                Log.w(TAG, "WebSocket fechado: " + reason);
                connected = false;
                if (connectionListener != null) {
                    handler.post(() -> connectionListener.onDisconnected());
                }
                scheduleReconnect();
            }

            @Override
            public void onFailure(WebSocket ws, Throwable t, Response response) {
                Log.e(TAG, "❌ Erro WebSocket: " + t.getMessage());
                connected = false;
                if (connectionListener != null) {
                    handler.post(() -> connectionListener.onError(t.getMessage()));
                }
                scheduleReconnect();
            }
        });
    }

    /**
     * Processa mensagens recebidas do servidor (protocolo Socket.IO).
     */
    private void handleMessage(String text) {
        Log.d(TAG, "📨 Recebido: " + text);

        // Socket.IO v4 protocol:
        // 0 = open
        // 40 = connect to namespace
        // 42 = event
        // 2 = ping
        // 3 = pong

        if (text.startsWith("0")) {
            // Open packet - servidor enviou info de handshake
            // Só agora podemos conectar ao namespace
            Log.i(TAG, "📩 Open packet recebido! Conectando ao namespace /agent");
            if (webSocket != null) {
                webSocket.send("40/agent,");
            }
        } else if (text.equals("2")) {
            // Ping - responde com pong
            if (webSocket != null) {
                webSocket.send("3");
            }
        } else if (text.startsWith("40/agent")) {
            // Conectado ao namespace /agent
            Log.i(TAG, "✅ Conectado ao namespace /agent");
            sendRegister();
        } else if (text.startsWith("42/agent,")) {
            // Evento do namespace /agent
            String payload = text.substring("42/agent,".length());
            handleEvent(payload);
        }
    }

    /**
     * Processa eventos Socket.IO.
     */
    private void handleEvent(String payload) {
        try {
            // Payload é um JSON array: ["eventName", {data}]
            // Exemplo: ["registered",{"message":"Registrado"}]
            if (payload.startsWith("[\"registered\"")) {
                Log.i(TAG, "✅ Registrado no servidor!");
            } else if (payload.startsWith("[\"blocked\"")) {
                Log.w(TAG, "🚫 Dispositivo bloqueado pelo admin!");
                shouldReconnect = false;
                disconnect();
            } else if (payload.startsWith("[\"update:config\"")) {
                Log.i(TAG, "⚙️ Configuração atualizada pelo servidor");
            }
        } catch (Exception e) {
            Log.e(TAG, "Erro ao processar evento: " + e.getMessage());
        }
    }

    /**
     * Envia evento de registro ao servidor.
     */
    private void sendRegister() {
        Map<String, String> info = new HashMap<>();
        info.put("machineId", machineId);
        info.put("hostname", Build.MODEL);
        info.put("platform", "android");
        info.put("arch", Build.SUPPORTED_ABIS[0]);
        info.put("username", Build.MANUFACTURER + " " + Build.MODEL);

        String json = gson.toJson(info);
        String packet = "42/agent,[\"register\"," + json + "]";
        sendRaw(packet);

        Log.i(TAG, "📤 Registro enviado: " + Build.MODEL);
    }

    /**
     * Envia notificação capturada ao servidor.
     */
    public void sendNotification(NotificationData data) {
        if (!connected || webSocket == null) {
            Log.w(TAG, "Não conectado - notificação descartada");
            return;
        }

        String json = gson.toJson(data);
        String packet = "42/agent,[\"notification\"," + json + "]";
        sendRaw(packet);

        Log.d(TAG, "📤 Notificação enviada: " + data.toString());
    }

    /**
     * Envia heartbeat ao servidor.
     */
    public void sendHeartbeat() {
        if (!connected || webSocket == null) return;
        sendRaw("42/agent,[\"heartbeat\"]");
    }

    /**
     * Envia dados raw pelo WebSocket.
     */
    private void sendRaw(String data) {
        try {
            if (webSocket != null && connected) {
                webSocket.send(data);
            }
        } catch (Exception e) {
            Log.e(TAG, "Erro ao enviar: " + e.getMessage());
        }
    }

    /**
     * Agenda reconexão com backoff exponencial.
     */
    private void scheduleReconnect() {
        if (!shouldReconnect) return;

        Log.i(TAG, "🔄 Reconectando em " + (reconnectDelay / 1000) + "s...");

        handler.postDelayed(() -> {
            if (shouldReconnect && !connected) {
                connect();
            }
        }, reconnectDelay);

        // Backoff exponencial
        reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
    }

    /**
     * Desconecta do servidor.
     */
    public void disconnect() {
        shouldReconnect = false;
        connected = false;
        if (webSocket != null) {
            webSocket.close(1000, "Client disconnect");
            webSocket = null;
        }
    }
}
