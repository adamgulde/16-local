package com.example.demo.ratelimit;

import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** Unit tests for the client-IP resolver (S1/S5): X-Real-IP is only honored from a trusted peer. */
class ClientIpResolverTest {

    private static ClientIpResolver resolverWithDefaults() {
        return new ClientIpResolver(new RateLimitProperties());
    }

    @Test
    void honorsXRealIp_whenRemoteAddrIsLoopback() {
        ClientIpResolver resolver = resolverWithDefaults();
        HttpServletRequest request = mock(HttpServletRequest.class);
        when(request.getRemoteAddr()).thenReturn("127.0.0.1");
        when(request.getHeader("X-Real-IP")).thenReturn("203.0.113.7");

        assertThat(resolver.resolve(request)).isEqualTo("203.0.113.7");
    }

    @Test
    void ignoresSpoofedXRealIp_whenRemoteAddrIsNotTrusted() {
        ClientIpResolver resolver = resolverWithDefaults();
        HttpServletRequest request = mock(HttpServletRequest.class);
        when(request.getRemoteAddr()).thenReturn("203.0.113.50");
        when(request.getHeader("X-Real-IP")).thenReturn("198.51.100.9");

        assertThat(resolver.resolve(request)).isEqualTo("203.0.113.50");
    }

    @Test
    void honorsXRealIp_whenRemoteAddrIsInTrustedDockerRange() {
        ClientIpResolver resolver = resolverWithDefaults();
        HttpServletRequest request = mock(HttpServletRequest.class);
        when(request.getRemoteAddr()).thenReturn("172.20.0.5");
        when(request.getHeader("X-Real-IP")).thenReturn("8.8.8.8");

        assertThat(resolver.resolve(request)).isEqualTo("8.8.8.8");
    }

    @Test
    void fallsBackToRemoteAddr_whenNoHeaderPresent() {
        ClientIpResolver resolver = resolverWithDefaults();
        HttpServletRequest request = mock(HttpServletRequest.class);
        when(request.getRemoteAddr()).thenReturn("127.0.0.1");
        when(request.getHeader("X-Real-IP")).thenReturn(null);

        assertThat(resolver.resolve(request)).isEqualTo("127.0.0.1");
    }

    @Test
    void respectsCustomTrustedProxyCidrs_narrowerThanDefaults() {
        RateLimitProperties properties = new RateLimitProperties();
        properties.setTrustedProxyCidrs(List.of("10.0.0.0/8"));
        ClientIpResolver resolver = new ClientIpResolver(properties);

        HttpServletRequest request = mock(HttpServletRequest.class);
        // 127.0.0.1 is no longer trusted once the default list is overridden.
        when(request.getRemoteAddr()).thenReturn("127.0.0.1");
        when(request.getHeader("X-Real-IP")).thenReturn("9.9.9.9");

        assertThat(resolver.resolve(request)).isEqualTo("127.0.0.1");
    }
}
