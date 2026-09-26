package com.example.demo.ratelimit;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

/** Hashes rate-limit keys (IPs, phone numbers) for logging — never log them raw. */
public final class RateLimitKeys {

    private RateLimitKeys() {
    }

    /** First 12 hex chars of SHA-256 — enough to correlate log lines, not enough to reverse. */
    public static String hash(String value) {
        if (value == null) {
            return "null";
        }
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] bytes = digest.digest(value.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(bytes, 0, 6);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 not available", e);
        }
    }
}
