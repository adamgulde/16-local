package com.example.demo;

import com.example.demo.dto.InitiateOtpRequest;
import org.apache.hc.client5.http.impl.classic.HttpClients;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.HttpComponentsClientHttpRequestFactory;
import org.springframework.test.context.TestPropertySource;
import org.springframework.web.client.NoOpResponseErrorHandler;
import org.springframework.web.client.RestTemplate;

import java.net.URI;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * S5: exercises the actual 429 path end-to-end. Runs in its own Spring context (distinct
 * property overrides) so the tight limit here doesn't affect the generous ceilings the other
 * ITs rely on for their normal signup/signin flows.
 *
 * <p>Deliberately does NOT use the Spring Boot-managed {@code TestRestTemplate} bean: Apache
 * HttpClient 5 is on the test classpath (pulled in transitively), so Spring Boot's default
 * request factory detection picks {@code HttpComponentsClientHttpRequestFactory}, whose
 * {@code DefaultHttpRequestRetryStrategy} automatically retries 429/503 responses and sleeps for
 * the {@code Retry-After} duration first — which here is on the order of an hour, hanging the
 * test. Worse, {@code TestRestTemplate}'s own builder unconditionally rebuilds its request
 * factory from scratch (see {@code TestRestTemplate.createInitialBuilder}), so handing it a
 * pre-configured {@code RestTemplateBuilder} with retries disabled has no effect — the retrying
 * factory always wins. We instead use a plain {@code RestTemplate} with our own retry-free
 * request factory, plus Spring's {@code NoOpResponseErrorHandler} (the same one TestRestTemplate
 * itself uses) so 4xx/5xx responses come back as ordinary {@code ResponseEntity}s instead of
 * throwing.
 *
 * <p>Each test method below uses its own fake client IP (via {@code X-Real-IP}, honored because
 * the loopback test client's real {@code remoteAddr} is in the default trusted-proxy list) so the
 * bucket state one test consumes never bleeds into another, even though the Spring context (and
 * therefore the singleton {@code RateLimitService} bean/cache) is shared across all of them.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(TestcontainersConfiguration.class)
@TestPropertySource(properties = {
        "app.rate-limit.ip.initiate-otp-per-hour=5",
        "app.rate-limit.ip.initiate-otp-per-day=5"
})
class RateLimitIT {

    @LocalServerPort
    private int port;

    private final RestTemplate restTemplate = buildNonRetryingRestTemplate();

    private static RestTemplate buildNonRetryingRestTemplate() {
        RestTemplate template = new RestTemplate(new HttpComponentsClientHttpRequestFactory(
                HttpClients.custom().disableAutomaticRetries().build()));
        template.setErrorHandler(new NoOpResponseErrorHandler());
        return template;
    }

    private URI uri(String path) {
        return URI.create("http://localhost:" + port + path);
    }

    /**
     * Sends the request as a fully-formed {@link URI} (never a template string RestTemplate might
     * re-encode) so percent-escapes / semicolons in {@code path} reach the server byte-for-byte,
     * exactly like a crafted client request would.
     */
    private ResponseEntity<String> postInitiateOtp(String path, String phone, String fakeClientIp) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.set("X-Real-IP", fakeClientIp);
        HttpEntity<InitiateOtpRequest> entity = new HttpEntity<>(new InitiateOtpRequest(phone, null), headers);
        return restTemplate.exchange(uri(path), HttpMethod.POST, entity, String.class);
    }

    @Test
    @Timeout(60)
    void sixthInitiateOtpFromSameIp_returns429WithRetryAfter() {
        for (int i = 0; i < 5; i++) {
            ResponseEntity<String> response = postInitiateOtp(
                    "/api/auth/signin/initiate-otp", "+1 555-900-000" + i, "10.20.30.1");
            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        }

        ResponseEntity<String> sixth = postInitiateOtp(
                "/api/auth/signin/initiate-otp", "+1 555-900-0009", "10.20.30.1");

        assertThat(sixth.getStatusCode().value()).isEqualTo(429);
        assertThat(sixth.getHeaders().getFirst("Retry-After")).isNotBlank();
        assertThat(sixth.getBody()).contains("Too many requests");
    }

    /**
     * SECURITY: {@code IpRateLimitFilter} used to classify requests by the raw, undecoded
     * {@code getRequestURI()} with an exact string match, but Spring MVC decodes the path before
     * routing — so a percent-encoded path like {@code /api/auth/signin/%69nitiate-otp} (decodes
     * to {@code .../initiate-otp}) matched no rule in the filter (falling through uncounted) while
     * still reaching the controller. Five plain-path calls exhaust the budget; a 6th call using an
     * encoded path must still be blocked, proving the filter and the router now agree on what path
     * a request is for.
     */
    @Test
    @Timeout(60)
    void sixthInitiateOtpCall_viaPercentEncodedPath_isStillRateLimited() {
        for (int i = 0; i < 5; i++) {
            ResponseEntity<String> response = postInitiateOtp(
                    "/api/auth/signin/initiate-otp", "+1 555-900-100" + i, "10.20.30.2");
            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        }

        // %69 == 'i' — decodes to the exact same route as the plain calls above.
        ResponseEntity<String> sixth = postInitiateOtp(
                "/api/auth/s%69gnin/initiate-otp", "+1 555-900-1009", "10.20.30.2");

        assertThat(sixth.getStatusCode().value()).isEqualTo(429);
        assertThat(sixth.getHeaders().getFirst("Retry-After")).isNotBlank();
    }

    /** Same bypass, but every one of the six calls (not just the last) uses the encoded path. */
    @Test
    @Timeout(60)
    void allSixInitiateOtpCalls_viaPercentEncodedPath_stillTripsLimitOnSixth() {
        for (int i = 0; i < 5; i++) {
            ResponseEntity<String> response = postInitiateOtp(
                    "/api/auth/s%69gnin/initiate-otp", "+1 555-900-200" + i, "10.20.30.3");
            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        }

        ResponseEntity<String> sixth = postInitiateOtp(
                "/api/auth/s%69gnin/initiate-otp", "+1 555-900-2009", "10.20.30.3");

        assertThat(sixth.getStatusCode().value()).isEqualTo(429);
    }

    /**
     * A trailing-slash variant must never reach the controller uncounted: this Spring Boot/MVC
     * version doesn't match trailing slashes by default, so it 404s before ever reaching the
     * handler — but if that default ever changes, catching it here as "never 200" keeps the same
     * invariant regardless of exactly how it's rejected.
     */
    @Test
    @Timeout(60)
    void trailingSlashVariant_neverReturnsOkUncounted() {
        for (int i = 0; i < 5; i++) {
            ResponseEntity<String> response = postInitiateOtp(
                    "/api/auth/signin/initiate-otp", "+1 555-900-300" + i, "10.20.30.4");
            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        }

        ResponseEntity<String> sixth = postInitiateOtp(
                "/api/auth/signin/initiate-otp/", "+1 555-900-3009", "10.20.30.4");

        assertThat(sixth.getStatusCode().value()).isNotEqualTo(200);
    }

    /**
     * A {@code ;matrix=param} path segment is the same class of decode-time mismatch as the
     * percent-encoding one above (Spring's path-matching strips it before routing, so
     * {@code /initiate-otp;x=y} would map to the same handler as {@code /initiate-otp}), but in
     * this stack it never gets that far: Spring Security's default {@code StrictHttpFirewall}
     * rejects any request path containing a semicolon with 400 before it reaches our filter or
     * the controller. Assert the "never reach the controller uncounted" invariant in terms of
     * that outcome (never 200) rather than assuming which layer stops it, so this keeps holding
     * even if the firewall's semicolon policy ever changes.
     */
    @Test
    @Timeout(60)
    void matrixParameterVariant_neverReturnsOkUncounted() {
        for (int i = 0; i < 5; i++) {
            ResponseEntity<String> response = postInitiateOtp(
                    "/api/auth/signin/initiate-otp", "+1 555-900-400" + i, "10.20.30.5");
            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        }

        ResponseEntity<String> sixth = postInitiateOtp(
                "/api/auth/signin/initiate-otp;jsessionid=abc", "+1 555-900-4009", "10.20.30.5");

        assertThat(sixth.getStatusCode().value()).isNotEqualTo(200);
    }
}
