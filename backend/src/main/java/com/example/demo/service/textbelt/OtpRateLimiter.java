package com.example.demo.service.textbelt;

import com.example.demo.exception.BadRequestException;
import lombok.Getter;
import lombok.Setter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Sliding-window in-memory rate limiter to prevent SMS pumping and credit exhaustion
 * per IP and per target (phone or userId).
 */
@Component
public class OtpRateLimiter {

    @Getter
    @Setter
    @Value("${textbelt.rate-limit.max-requests:5}")
    private int maxRequests = 5;

    @Getter
    @Setter
    @Value("${textbelt.rate-limit.window-seconds:600}")
    private long windowSeconds = 600;

    private final ConcurrentHashMap<String, Deque<Long>> requestWindows = new ConcurrentHashMap<>();

    /**
     * Checks rate limits for a given client IP and phone/user identifier.
     * Throws BadRequestException if rate limit is exceeded.
     */
    public void checkRateLimit(String clientIp, String targetId) {
        if (clientIp != null && !clientIp.isBlank()) {
            if (!tryAcquire("ip:" + clientIp.trim())) {
                throw new BadRequestException("Too many OTP requests. Please wait a few minutes before requesting another code.");
            }
        }
        if (targetId != null && !targetId.isBlank()) {
            if (!tryAcquire("target:" + targetId.trim().toLowerCase())) {
                throw new BadRequestException("Too many OTP requests for this phone number. Please wait a few minutes before requesting another code.");
            }
        }
    }

    /**
     * Attempts to record a request under the specified key.
     * Returns true if allowed, false if limit exceeded.
     */
    public synchronized boolean tryAcquire(String key) {
        long now = Instant.now().toEpochMilli();
        long windowMillis = windowSeconds * 1000L;
        long cutoff = now - windowMillis;

        Deque<Long> timestamps = requestWindows.computeIfAbsent(key, k -> new ArrayDeque<>());

        // Evict timestamps outside the sliding window
        while (!timestamps.isEmpty() && timestamps.peekFirst() < cutoff) {
            timestamps.pollFirst();
        }

        if (timestamps.size() >= maxRequests) {
            return false;
        }

        timestamps.addLast(now);
        return true;
    }

    /**
     * Clears all recorded rate limit windows (useful for testing).
     */
    public synchronized void reset() {
        requestWindows.clear();
    }
}
