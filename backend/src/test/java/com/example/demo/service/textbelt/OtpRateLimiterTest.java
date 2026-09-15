package com.example.demo.service.textbelt;

import com.example.demo.exception.BadRequestException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class OtpRateLimiterTest {

    private OtpRateLimiter rateLimiter;

    @BeforeEach
    void setUp() {
        rateLimiter = new OtpRateLimiter();
        rateLimiter.setMaxRequests(3);
        rateLimiter.setWindowSeconds(60);
    }

    @Test
    void tryAcquire_allowsUpToMaxRequestsThenRejects() {
        assertThat(rateLimiter.tryAcquire("test-key")).isTrue();
        assertThat(rateLimiter.tryAcquire("test-key")).isTrue();
        assertThat(rateLimiter.tryAcquire("test-key")).isTrue();

        // 4th request exceeds limit of 3
        assertThat(rateLimiter.tryAcquire("test-key")).isFalse();

        // Different key is independent
        assertThat(rateLimiter.tryAcquire("other-key")).isTrue();
    }

    @Test
    void checkRateLimit_throwsBadRequestExceptionWhenExceeded() {
        rateLimiter.checkRateLimit("10.0.0.1", "5551234567");
        rateLimiter.checkRateLimit("10.0.0.1", "5551234567");
        rateLimiter.checkRateLimit("10.0.0.1", "5551234567");

        assertThatThrownBy(() -> rateLimiter.checkRateLimit("10.0.0.1", "5551234567"))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("Too many OTP requests");
    }

    @Test
    void reset_clearsWindows() {
        rateLimiter.tryAcquire("key1");
        rateLimiter.tryAcquire("key1");
        rateLimiter.tryAcquire("key1");
        assertThat(rateLimiter.tryAcquire("key1")).isFalse();

        rateLimiter.reset();

        assertThat(rateLimiter.tryAcquire("key1")).isTrue();
    }
}
