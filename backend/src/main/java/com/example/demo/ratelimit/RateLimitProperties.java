package com.example.demo.ratelimit;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.List;

/**
 * Configurable in-memory rate limits (S1). Defaults match the security audit's plan; every
 * number can be overridden via application.properties / env without a redeploy of code.
 */
@Getter
@Setter
@ConfigurationProperties(prefix = "app.rate-limit")
public class RateLimitProperties {

    /** Per client-IP limits on specific public auth endpoints. */
    private final Ip ip = new Ip();

    /** Per (normalized, hashed) phone number limits on OTP sending. */
    private final Phone phone = new Phone();

    /** Per authenticated user limits. */
    private final User user = new User();

    /**
     * CIDR ranges (or bare addresses) whose requests we trust to set X-Real-IP — i.e. our own
     * reverse proxy's network. Anything else's X-Real-IP header is ignored in favor of remoteAddr.
     * Defaults: loopback (IPv4 + IPv6) and the private range docker networks commonly use.
     */
    private List<String> trustedProxyCidrs = List.of("127.0.0.0/8", "::1", "172.16.0.0/12");

    /** Upper bound on distinct rate-limit keys held in memory at once, per bucket cache. */
    private long maxTrackedKeys = 100_000;

    @Getter
    @Setter
    public static class Ip {
        private int initiateOtpPerHour = 5;
        private int initiateOtpPerDay = 20;
        private int verifyOtpPerWindow = 10;
        private int verifyOtpWindowMinutes = 15;
        private int registerPerHour = 5;
        private int validateInvitePerHour = 30;
    }

    @Getter
    @Setter
    public static class Phone {
        private int otpSendPerHour = 3;
        private int otpSendPerDay = 10;
    }

    @Getter
    @Setter
    public static class User {
        private int requestsPerMinute = 120;
        /** Share requests a single user may send per day (plan §2 S1 / §4 P3). */
        private int shareRequestsPerDay = 20;
    }
}
