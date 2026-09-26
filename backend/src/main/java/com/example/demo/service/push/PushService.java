package com.example.demo.service.push;

import java.util.Map;
import java.util.UUID;

/** Sends push notifications to a user's registered devices. */
public interface PushService {

    /**
     * Sends a push notification to every device registered for {@code userId}.
     *
     * @return the number of devices the notification was successfully delivered to.
     */
    int sendToUser(UUID userId, String title, String body, Map<String, String> data);
}
