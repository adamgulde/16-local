package com.example.demo.ratelimit;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import java.io.IOException;

/** Writes the standard 429 response (S1) from raw servlet filters, which run before the
 * DispatcherServlet and so can't rely on {@code GlobalExceptionHandler}. */
final class RateLimitResponses {

    private RateLimitResponses() {
    }

    static void writeTooManyRequests(HttpServletRequest request, HttpServletResponse response,
                                      long retryAfterSeconds) throws IOException {
        // Since we're short-circuiting before Spring MVC ever reads it, the client's POST body
        // (e.g. a JSON payload) is still sitting unread on the connection. Draining it here
        // keeps HTTP/1.1 keep-alive framing intact — otherwise the client can see the response
        // as truncated/out-of-sync and retry (or hang retrying) against a corrupted connection.
        try {
            request.getInputStream().readAllBytes();
        } catch (IOException ignored) {
            // Nothing sensible to do if the body can't be drained; the response below still
            // gets sent, worst case the connection just isn't reused for keep-alive.
        }

        response.setStatus(429);
        response.setHeader("Retry-After", String.valueOf(Math.max(1, retryAfterSeconds)));
        // Force the client to open a fresh connection rather than reuse a pooled keep-alive one
        // for the next request — some HTTP client stacks get confused reusing a connection whose
        // last response came from a filter short-circuit like this one.
        response.setHeader("Connection", "close");
        response.setContentType("application/json");
        response.getWriter().write("{\"error\":\"Too many requests\"}");
    }
}
