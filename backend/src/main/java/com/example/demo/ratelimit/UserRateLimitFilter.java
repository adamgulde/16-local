package com.example.demo.ratelimit;

import io.github.bucket4j.ConsumptionProbe;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.lang.NonNull;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.Duration;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

/**
 * Per-authenticated-user overall throughput limit (S1: 120 req/min). Registered after
 * {@link com.example.demo.security.TokenAuthenticationFilter} so the principal (a UUID) is
 * already resolved; requests with no authenticated principal (public endpoints) pass through
 * untouched — they're covered by {@link IpRateLimitFilter} instead.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class UserRateLimitFilter extends OncePerRequestFilter {

    private final RateLimitService rateLimitService;
    private final RateLimitProperties properties;

    @Override
    protected void doFilterInternal(@NonNull HttpServletRequest request,
                                     @NonNull HttpServletResponse response,
                                     @NonNull FilterChain filterChain) throws ServletException, IOException {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !(auth.getPrincipal() instanceof UUID userId)) {
            filterChain.doFilter(request, response);
            return;
        }

        String bucketKey = "user:" + userId;
        ConsumptionProbe probe = rateLimitService.tryConsume(bucketKey, () -> RateLimitService.bucketOf(
                RateLimitService.bandwidth(properties.getUser().getRequestsPerMinute(), Duration.ofMinutes(1))));

        if (!probe.isConsumed()) {
            long retryAfterSeconds = TimeUnit.NANOSECONDS.toSeconds(probe.getNanosToWaitForRefill()) + 1;
            log.warn("Per-user rate limit exceeded user_hash={} retryAfterSeconds={}",
                    RateLimitKeys.hash(userId.toString()), retryAfterSeconds);
            RateLimitResponses.writeTooManyRequests(request, response, retryAfterSeconds);
            return;
        }

        filterChain.doFilter(request, response);
    }
}
