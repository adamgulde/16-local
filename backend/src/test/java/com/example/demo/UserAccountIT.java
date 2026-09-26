package com.example.demo;

import com.example.demo.dto.AuthResponse;
import com.example.demo.dto.InitiateOtpRequest;
import com.example.demo.dto.RegisterRequest;
import com.example.demo.dto.UserResponse;
import com.example.demo.repository.ContactRepository;
import com.example.demo.repository.OtpRepository;
import com.example.demo.repository.UserRepository;
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

import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Fix-up (post-P5 review): {@code PUT /api/users/{id}} (arbitrary phone overwrite, no OTP) and
 * {@code GET /api/users/{id}} (no legitimate caller without a directory) are gone; account deletion
 * moved to {@code DELETE /api/users/me} (self-only by construction, no id path param to spoof).
 * This covers: PATCH /me can't touch the phone number, and deleting a user turns *other* people's
 * REGISTERED contact for them into a PLACEHOLDER (via the {@code contacts.linked_user_id}
 * {@code ON DELETE SET NULL} FK) rather than deleting or orphaning it.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(TestcontainersConfiguration.class)
class UserAccountIT {

    @LocalServerPort
    private int port;

    @Autowired
    private TestRestTemplate restTemplate;

    @Autowired
    private OtpRepository otpRepository;

    @Autowired
    private ContactRepository contactRepository;

    @Autowired
    private UserRepository userRepository;

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

    private AuthResponse register(String firstName, String lastName, String inviteCode) {
        String phone = "555999" + String.format("%04d", phoneSeq.incrementAndGet() % 10000);
        restTemplate.postForEntity(baseUrl("/api/auth/signup/initiate-otp"), new InitiateOtpRequest(phone, inviteCode), Void.class);
        String code = otpRepository.findByPhoneNumber(cleanPhone(phone)).orElseThrow().getCode();
        return restTemplate.postForEntity(baseUrl("/api/auth/register"),
                new RegisterRequest(phone, code, firstName, lastName, inviteCode), AuthResponse.class).getBody();
    }

    private HttpHeaders authHeaders(String token) {
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(token);
        return headers;
    }

    private <T> ResponseEntity<T> exchange(String path, HttpMethod method, Object body, HttpHeaders headers, Class<T> type) {
        return restTemplate.exchange(baseUrl(path), method, new HttpEntity<>(body, headers), type);
    }

    @Test
    void patchMeIgnoresAPhoneNumberFieldInTheBody() {
        AuthResponse user = register("Pat", "Chme", null);
        HttpHeaders headers = authHeaders(user.token());
        String originalPhone = user.user().phoneNumber();

        Map<String, String> body = Map.of("firstName", "Patricia", "phoneNumber", "555-000-9999");
        ResponseEntity<UserResponse> response = exchange("/api/users/me", HttpMethod.PATCH, body, headers, UserResponse.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody().firstName()).isEqualTo("Patricia");
        assertThat(response.getBody().phoneNumber()).isEqualTo(originalPhone);
        assertThat(userRepository.findById(user.user().id()).orElseThrow().getPhoneNumber()).isEqualTo(originalPhone);
    }

    @Test
    void deletingSelfTurnsOthersRegisteredContactIntoAPlaceholderNotAVanishedRow() {
        AuthResponse a = register("Alice", "Root", null);
        AuthResponse b = register("Bob", "Invited", a.user().inviteCode());
        HttpHeaders bHeaders = authHeaders(b.token());

        // A has a REGISTERED contact for B (auto-connect via invite code).
        assertThat(contactRepository.existsByOwnerIdAndLinkedUserId(a.user().id(), b.user().id())).isTrue();

        ResponseEntity<Void> deleteResp = exchange("/api/users/me", HttpMethod.DELETE, null, bHeaders, Void.class);
        assertThat(deleteResp.getStatusCode()).isIn(HttpStatus.OK, HttpStatus.NO_CONTENT);

        // B's account itself is gone.
        assertThat(userRepository.findById(b.user().id())).isEmpty();

        // B's own contacts (e.g. their REGISTERED contact for A) are gone too (owner_id cascade).
        assertThat(contactRepository.findByOwnerId(b.user().id())).isEmpty();

        // A's contact for B still exists, still named "Bob Invited", but is no longer linked —
        // it reverted to a placeholder (contacts.linked_user_id ON DELETE SET NULL), not deleted.
        var aContactForB = contactRepository.findByOwnerId(a.user().id()).stream()
                .filter(c -> "Bob".equals(c.getFirstName()))
                .findFirst()
                .orElseThrow(() -> new AssertionError("A's contact for B should still exist as a placeholder"));
        assertThat(aContactForB.getLinkedUser()).isNull();
        assertThat(aContactForB.getLastName()).isEqualTo("Invited");
    }

    @Test
    void thereIsNoLongerAGetOrPutOrDeleteEndpointForAnArbitraryUserId() {
        AuthResponse a = register("Gone", "Directory", null);
        HttpHeaders headers = authHeaders(a.token());

        assertThat(exchange("/api/users/" + a.user().id(), HttpMethod.GET, null, headers, String.class)
                .getStatusCode().is4xxClientError()).isTrue();
        assertThat(exchange("/api/users/" + a.user().id(), HttpMethod.PUT, Map.of("firstName", "X"), headers, String.class)
                .getStatusCode().is4xxClientError()).isTrue();
        assertThat(exchange("/api/users/" + a.user().id() + "/bio", HttpMethod.PUT, Map.of("bio", "X"), headers, String.class)
                .getStatusCode().is4xxClientError()).isTrue();
        assertThat(exchange("/api/users/" + a.user().id(), HttpMethod.DELETE, null, headers, String.class)
                .getStatusCode().is4xxClientError()).isTrue();
    }
}
