package com.example.demo.ratelimit;

import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.web.util.matcher.IpAddressMatcher;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Resolves the "real" client IP for rate limiting. We never trust a client-supplied header by
 * default: X-Real-IP (set by our nginx reverse proxy) is only honored when the TCP peer
 * (remoteAddr) itself is inside a configured trusted range — our proxy's own loopback/docker
 * network. Any other remoteAddr gets rate-limited on remoteAddr itself, so a client can't spoof
 * its way around limits by sending its own X-Real-IP header.
 */
@Slf4j
@Component
public class ClientIpResolver {

    private static final String REAL_IP_HEADER = "X-Real-IP";

    private final List<IpAddressMatcher> trustedMatchers;

    public ClientIpResolver(RateLimitProperties properties) {
        this.trustedMatchers = properties.getTrustedProxyCidrs().stream()
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .map(IpAddressMatcher::new)
                .toList();
    }

    public String resolve(HttpServletRequest request) {
        String remoteAddr = request.getRemoteAddr();
        if (isTrusted(remoteAddr)) {
            String headerValue = request.getHeader(REAL_IP_HEADER);
            if (headerValue != null && !headerValue.isBlank()) {
                return headerValue.trim();
            }
        }
        return remoteAddr;
    }

    private boolean isTrusted(String remoteAddr) {
        if (remoteAddr == null || remoteAddr.isBlank()) {
            return false;
        }
        for (IpAddressMatcher matcher : trustedMatchers) {
            try {
                if (matcher.matches(remoteAddr)) {
                    return true;
                }
            } catch (IllegalArgumentException e) {
                // remoteAddr couldn't be parsed as an IP (shouldn't happen from the servlet
                // container) — treat as untrusted rather than fail the request.
                log.debug("Could not evaluate remoteAddr against trusted proxy ranges: {}", e.getMessage());
            }
        }
        return false;
    }
}
