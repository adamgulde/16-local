package com.example.demo.ratelimit;

import jakarta.servlet.FilterChain;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

/** Unit tests for the per-authenticated-user throughput limit (S1: 120 req/min default). */
class UserRateLimitFilterTest {

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void requestsWithinLimit_allPassThrough() throws Exception {
        RateLimitProperties properties = new RateLimitProperties();
        properties.getUser().setRequestsPerMinute(2);
        UserRateLimitFilter filter = new UserRateLimitFilter(new RateLimitService(properties), properties);
        authenticateAs(UUID.randomUUID());
        FilterChain chain = mock(FilterChain.class);

        filter.doFilter(new MockHttpServletRequest(), new MockHttpServletResponse(), chain);
        filter.doFilter(new MockHttpServletRequest(), new MockHttpServletResponse(), chain);

        verify(chain, times(2)).doFilter(any(), any());
    }

    @Test
    void requestBeyondLimit_returns429WithRetryAfterAndSkipsChain() throws Exception {
        RateLimitProperties properties = new RateLimitProperties();
        properties.getUser().setRequestsPerMinute(1);
        UserRateLimitFilter filter = new UserRateLimitFilter(new RateLimitService(properties), properties);
        authenticateAs(UUID.randomUUID());
        FilterChain chain = mock(FilterChain.class);

        filter.doFilter(new MockHttpServletRequest(), new MockHttpServletResponse(), chain); // consumes the only token

        MockHttpServletResponse blockedResponse = new MockHttpServletResponse();
        filter.doFilter(new MockHttpServletRequest(), blockedResponse, chain);

        verify(chain, times(1)).doFilter(any(), any());
        assertThat(blockedResponse.getStatus()).isEqualTo(429);
        assertThat(blockedResponse.getHeader("Retry-After")).isNotBlank();
        assertThat(blockedResponse.getContentAsString()).contains("Too many requests");
    }

    @Test
    void distinctUsers_haveIndependentBudgets() throws Exception {
        RateLimitProperties properties = new RateLimitProperties();
        properties.getUser().setRequestsPerMinute(1);
        UserRateLimitFilter filter = new UserRateLimitFilter(new RateLimitService(properties), properties);
        FilterChain chain = mock(FilterChain.class);

        authenticateAs(UUID.randomUUID());
        filter.doFilter(new MockHttpServletRequest(), new MockHttpServletResponse(), chain);

        authenticateAs(UUID.randomUUID()); // a different principal must get its own bucket
        MockHttpServletResponse secondUserResponse = new MockHttpServletResponse();
        filter.doFilter(new MockHttpServletRequest(), secondUserResponse, chain);

        verify(chain, times(2)).doFilter(any(), any());
        assertThat(secondUserResponse.getStatus()).isEqualTo(200);
    }

    @Test
    void unauthenticatedRequest_passesThroughUntouched() throws Exception {
        RateLimitProperties properties = new RateLimitProperties();
        properties.getUser().setRequestsPerMinute(1);
        UserRateLimitFilter filter = new UserRateLimitFilter(new RateLimitService(properties), properties);
        SecurityContextHolder.clearContext();
        FilterChain chain = mock(FilterChain.class);

        // No authenticated principal (public endpoints) — IpRateLimitFilter covers those instead,
        // this filter must never block them regardless of how many times it's called.
        filter.doFilter(new MockHttpServletRequest(), new MockHttpServletResponse(), chain);
        filter.doFilter(new MockHttpServletRequest(), new MockHttpServletResponse(), chain);

        verify(chain, times(2)).doFilter(any(), any());
    }

    private void authenticateAs(UUID userId) {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(userId, null, List.of()));
    }
}
