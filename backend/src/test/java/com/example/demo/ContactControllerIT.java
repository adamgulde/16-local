package com.example.demo;

import com.example.demo.dto.AuthResponse;
import com.example.demo.dto.ContactLinkRequest;
import com.example.demo.dto.InitiateOtpRequest;
import com.example.demo.dto.RegisterRequest;
import com.example.demo.repository.OtpRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.Instant;
import java.sql.Timestamp;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Regression coverage for the contact_links ordering bug: {@code UUID.compareTo} disagrees with
 * Postgres's {@code uuid} ordering for any pair where one id's low 64 bits has its sign bit set,
 * which used to blow {@code chk_contact_links_order} with a 500 on roughly half of all pairs (see
 * {@link com.example.demo.util.UuidOrdering}).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(TestcontainersConfiguration.class)
class ContactControllerIT {

    @LocalServerPort
    private int port;

    @Autowired
    private TestRestTemplate restTemplate;

    @Autowired
    private OtpRepository otpRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private static final AtomicInteger phoneSeq = new AtomicInteger((int) (System.currentTimeMillis() % 100000));

    private String baseUrl(String path) {
        return "http://localhost:" + port + path;
    }

    private static String cleanPhone(String phone) {
        String digits = phone.replaceAll("\\D", "");
        if (digits.startsWith("1") && digits.length() == 11) digits = digits.substring(1);
        if (digits.length() == 10) return String.format("+1 %s-%s-%s", digits.substring(0, 3), digits.substring(3, 6), digits.substring(6));
        return phone;
    }

    private AuthResponse register(String firstName, String lastName) {
        String phone = "555777" + String.format("%04d", phoneSeq.incrementAndGet() % 10000);
        restTemplate.postForEntity(baseUrl("/api/auth/signup/initiate-otp"), new InitiateOtpRequest(phone, null), Void.class);
        String code = otpRepository.findByPhoneNumber(cleanPhone(phone)).orElseThrow().getCode();
        return restTemplate.postForEntity(baseUrl("/api/auth/register"),
                new RegisterRequest(phone, code, firstName, lastName, null), AuthResponse.class).getBody();
    }

    private HttpHeaders authHeaders(String token) {
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(token);
        return headers;
    }

    private <T> ResponseEntity<T> exchange(String path, HttpMethod method, Object body, HttpHeaders headers, Class<T> type) {
        return restTemplate.exchange(baseUrl(path), method, new HttpEntity<>(body, headers), type);
    }

    /** Inserts a bare placeholder contact directly with an explicit id, bypassing gen_random_uuid(). */
    private void insertContact(UUID id, UUID ownerId, String firstName) {
        Timestamp now = Timestamp.from(Instant.now());
        jdbcTemplate.update("INSERT INTO contacts (id, owner_id, first_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
                id, ownerId, firstName, now, now);
    }

    @Test
    void linkingTheExactPairFromTheBugReportSucceeds() {
        AuthResponse owner = register("Alice", "Owner");
        UUID ownerId = owner.user().id();
        HttpHeaders headers = authHeaders(owner.token());

        // The exact pair from the incident: Java's signed UUID.compareTo says a < b (a's high bits
        // start with 'b' -> negative most-significant long), Postgres's unsigned byte order says the
        // opposite.
        UUID a = UUID.fromString("b752449e-7f86-4535-b8a3-3ef3ce5172ef");
        UUID b = UUID.fromString("2fc822f0-5c58-44ab-9346-1689b358f945");
        assertThat(a.compareTo(b)).isLessThan(0);
        assertThat(a.toString().compareTo(b.toString())).isGreaterThan(0);

        insertContact(a, ownerId, "A");
        insertContact(b, ownerId, "B");

        ResponseEntity<Void> linkResponse = exchange("/api/contacts/links", HttpMethod.POST,
                new ContactLinkRequest(a, b), headers, Void.class);
        assertThat(linkResponse.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);

        ResponseEntity<Void> unlinkResponse = exchange("/api/contacts/links", HttpMethod.DELETE,
                new ContactLinkRequest(a, b), headers, Void.class);
        assertThat(unlinkResponse.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
    }

    @Test
    void linkingManyRandomContactPairsNeverViolatesTheOrderingConstraint() {
        AuthResponse owner = register("Bob", "Owner");
        UUID ownerId = owner.user().id();
        HttpHeaders headers = authHeaders(owner.token());

        for (int i = 0; i < 20; i++) {
            UUID a = randomUuid();
            UUID b = randomUuid();
            insertContact(a, ownerId, "A" + i);
            insertContact(b, ownerId, "B" + i);

            ResponseEntity<Void> linkResponse = exchange("/api/contacts/links", HttpMethod.POST,
                    new ContactLinkRequest(a, b), headers, Void.class);
            assertThat(linkResponse.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);

            ResponseEntity<Void> unlinkResponse = exchange("/api/contacts/links", HttpMethod.DELETE,
                    new ContactLinkRequest(a, b), headers, Void.class);
            assertThat(unlinkResponse.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        }
    }

    private static UUID randomUuid() {
        ThreadLocalRandom r = ThreadLocalRandom.current();
        return new UUID(r.nextLong(), r.nextLong());
    }
}
