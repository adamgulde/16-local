package com.example.demo.service.push;

import com.example.demo.repository.UserDeviceTokenRepository;
import com.google.auth.oauth2.GoogleCredentials;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.messaging.AndroidConfig;
import com.google.firebase.messaging.AndroidNotification;
import com.google.firebase.messaging.ApnsConfig;
import com.google.firebase.messaging.Aps;
import com.google.firebase.messaging.BatchResponse;
import com.google.firebase.messaging.FirebaseMessaging;
import com.google.firebase.messaging.FirebaseMessagingException;
import com.google.firebase.messaging.Message;
import com.google.firebase.messaging.MessagingErrorCode;
import com.google.firebase.messaging.Notification;
import com.google.firebase.messaging.SendResponse;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Firebase Cloud Messaging implementation of {@link PushService}.
 * Degrades gracefully: with no configured credentials, sends are no-ops.
 */
@Service
public class FcmPushService implements PushService {

    private static final Logger log = LoggerFactory.getLogger(FcmPushService.class);

    private static final String APP_NAME = "fcm-push";

    private final UserDeviceTokenRepository userDeviceTokenRepository;

    @Value("${firebase.credentials-base64:}")
    private String credentialsBase64;

    private boolean configured = false;
    private FirebaseMessaging firebaseMessaging;

    @Autowired
    public FcmPushService(UserDeviceTokenRepository userDeviceTokenRepository) {
        this.userDeviceTokenRepository = userDeviceTokenRepository;
    }

    /** Test seam: inject a mocked {@link FirebaseMessaging} and bypass credential loading. */
    FcmPushService(UserDeviceTokenRepository userDeviceTokenRepository, FirebaseMessaging firebaseMessaging, boolean configured) {
        this.userDeviceTokenRepository = userDeviceTokenRepository;
        this.firebaseMessaging = firebaseMessaging;
        this.configured = configured;
    }

    @PostConstruct
    public void init() {
        if (credentialsBase64 == null || credentialsBase64.isBlank()) {
            configured = false;
            log.info("Push disabled: no Firebase credentials");
            return;
        }
        try {
            byte[] decoded = Base64.getDecoder().decode(credentialsBase64.trim());
            GoogleCredentials credentials = GoogleCredentials.fromStream(new ByteArrayInputStream(decoded));
            FirebaseOptions options = FirebaseOptions.builder()
                    .setCredentials(credentials)
                    .build();

            FirebaseApp app = FirebaseApp.getApps().stream()
                    .filter(a -> a.getName().equals(APP_NAME))
                    .findFirst()
                    .orElseGet(() -> FirebaseApp.initializeApp(options, APP_NAME));

            firebaseMessaging = FirebaseMessaging.getInstance(app);
            configured = true;
            log.info("Firebase push messaging initialized");
        } catch (Exception e) {
            configured = false;
            log.error("Failed to initialize Firebase push messaging: {}", e.getMessage());
        }
    }

    @Override
    public int sendToUser(UUID userId, String title, String body, Map<String, String> data) {
        if (!configured) {
            log.debug("Push not configured; skipping send to user {}", userId);
            return 0;
        }

        List<com.example.demo.model.UserDeviceToken> deviceTokens = userDeviceTokenRepository.findByUser_Id(userId);
        if (deviceTokens.isEmpty()) {
            return 0;
        }

        List<Message> messages = new ArrayList<>();
        for (com.example.demo.model.UserDeviceToken deviceToken : deviceTokens) {
            messages.add(Message.builder()
                    .setToken(deviceToken.getDeviceToken())
                    .setNotification(Notification.builder().setTitle(title).setBody(body).build())
                    .putAllData(data == null ? Map.of() : data)
                    .setAndroidConfig(AndroidConfig.builder()
                            .setNotification(AndroidNotification.builder().setChannelId("default").build())
                            .build())
                    .setApnsConfig(ApnsConfig.builder()
                            .setAps(Aps.builder().setSound("default").build())
                            .build())
                    .build());
        }

        try {
            BatchResponse response = firebaseMessaging.sendEach(messages);
            List<String> tokensToPurge = new ArrayList<>();
            List<SendResponse> responses = response.getResponses();
            for (int i = 0; i < responses.size(); i++) {
                SendResponse sendResponse = responses.get(i);
                if (!sendResponse.isSuccessful()) {
                    FirebaseMessagingException exception = sendResponse.getException();
                    MessagingErrorCode errorCode = exception != null ? exception.getMessagingErrorCode() : null;
                    if (errorCode == MessagingErrorCode.UNREGISTERED || errorCode == MessagingErrorCode.SENDER_ID_MISMATCH) {
                        tokensToPurge.add(deviceTokens.get(i).getDeviceToken());
                    }
                }
            }
            if (!tokensToPurge.isEmpty()) {
                log.info("Purging {} stale device token(s)", tokensToPurge.size());
                userDeviceTokenRepository.deleteByDeviceTokenIn(tokensToPurge);
            }
            return response.getSuccessCount();
        } catch (FirebaseMessagingException e) {
            log.warn("Firebase push batch send failed: {}", e.getMessage());
            return 0;
        }
    }
}
