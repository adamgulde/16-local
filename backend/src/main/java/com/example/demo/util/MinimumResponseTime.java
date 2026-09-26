package com.example.demo.util;

import java.security.SecureRandom;

/**
 * Pads a response to a constant floor (plus a little jitter) so response timing can't be used to
 * tell "did work" apart from "did nothing" — originally {@code AuthController}'s
 * {@code enforceMinimumResponseTime} for the OTP-enumeration case (S2), extracted so other
 * discovery-shaped endpoints (e.g. {@code ShareRequestService#create}, plan §4 P3/P4 fix-up) apply
 * the exact same floor instead of duplicating or drifting from it. A plain sleep is fine at this
 * request volume; a real async delay queue would be overkill here.
 */
public final class MinimumResponseTime {

    public static final long DEFAULT_FLOOR_MILLIS = 400;
    public static final long DEFAULT_JITTER_MILLIS = 100;

    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    private MinimumResponseTime() {
    }

    /** Same floor/jitter every caller of the default overload uses (400ms +/- up to 100ms). */
    public static void enforce(long startNanos) {
        enforce(startNanos, DEFAULT_FLOOR_MILLIS, DEFAULT_JITTER_MILLIS);
    }

    public static void enforce(long startNanos, long floorMillis, long jitterMillis) {
        long elapsedMillis = (System.nanoTime() - startNanos) / 1_000_000;
        long targetMillis = floorMillis + SECURE_RANDOM.nextInt((int) jitterMillis);
        long remainingMillis = targetMillis - elapsedMillis;
        if (remainingMillis > 0) {
            try {
                Thread.sleep(remainingMillis);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
    }
}
