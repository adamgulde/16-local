package com.example.demo;

import com.example.demo.dto.AuthResponse;
import com.example.demo.dto.FriendSummaryResponse;
import com.example.demo.dto.InitiateOtpRequest;
import com.example.demo.dto.RegisterRequest;
import com.example.demo.dto.UserResponse;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.context.annotation.Import;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(TestcontainersConfiguration.class)
public class UserControllerIT {

    @LocalServerPort
    private int port;

    @Autowired
    private TestRestTemplate restTemplate;

    private String baseUrl(String path) {
        return "http://localhost:" + port + path;
    }

    @Autowired
    private com.example.demo.repository.OtpRepository otpRepository;
    private static final java.util.concurrent.atomic.AtomicInteger phoneSeq = new java.util.concurrent.atomic.AtomicInteger((int) (System.currentTimeMillis() % 100000));

    private static String cleanPhone(String phone) {
        if (phone == null) return null;
        String digits = phone.replaceAll("\\D", "");
        if (digits.startsWith("1") && digits.length() == 11) digits = digits.substring(1);
        if (digits.length() == 10) return String.format("+1 %s-%s-%s", digits.substring(0, 3), digits.substring(3, 6), digits.substring(6));
        return phone;
    }

    private AuthResponse register(String identifier, String firstName, String lastName) {
        String phone = "555888" + phoneSeq.incrementAndGet();
        restTemplate.postForEntity(baseUrl("/api/auth/signup/initiate-otp"),
                new com.example.demo.dto.InitiateOtpRequest(phone, null), Void.class);
        String code = otpRepository.findByPhoneNumber(cleanPhone(phone)).orElseThrow().getCode();
        com.example.demo.dto.RegisterRequest body = new com.example.demo.dto.RegisterRequest(
                phone, code, firstName, lastName, null);
        return restTemplate.postForEntity(baseUrl("/api/auth/register"), body, AuthResponse.class).getBody();
    }

    private HttpEntity<Void> authHeader(String token) {
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(token);
        return new HttpEntity<>(headers);
    }

    @Test
    void unauthenticatedRequestsAreRejected() {
        ResponseEntity<String> response = restTemplate.getForEntity(baseUrl("/api/users"), String.class);
        assertThat(response.getStatusCode().is4xxClientError()).isTrue();
    }

    @Test
    void shouldListUsersWithoutLeakingPhoneNumbersOfNonConnections() {
        AuthResponse viewer = register("viewer1", "Viewer", "One");
        register("stranger1", "Stranger", "One");

        ResponseEntity<UserResponse[]> response = restTemplate.exchange(
                baseUrl("/api/users"), HttpMethod.GET, authHeader(viewer.token()), UserResponse[].class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        List<UserResponse> users = List.of(response.getBody());
        assertThat(users).hasSizeGreaterThanOrEqualTo(2);

        UserResponse self = users.stream().filter(u -> u.id().equals(viewer.user().id())).findFirst().orElseThrow();
        assertThat(self.phoneNumber()).isNotNull();

        UserResponse stranger = users.stream().filter(u -> !u.id().equals(viewer.user().id())).findFirst().orElseThrow();
        assertThat(stranger.phoneNumber()).isNull();
    }

    @Test
    void shouldFindShortestPathBetweenConnectedUsers() {
        AuthResponse a = register("patha", "Path", "A");
        AuthResponse b = register("pathb", "Path", "B");

        restTemplate.exchange(baseUrl("/api/requests"), HttpMethod.POST,
                new HttpEntity<>(Map.of("receiverId", b.user().id().toString()), headersFor(a.token())),
                String.class);

        ResponseEntity<Map[]> requests = restTemplate.exchange(
                baseUrl("/api/requests/me"), HttpMethod.GET, authHeader(b.token()), Map[].class);
        assertThat(requests.getBody()).isNotNull();
        String requestId = java.util.Arrays.stream(requests.getBody())
                .filter(req -> {
                    Object senderObj = req.get("sender");
                    if (senderObj instanceof Map<?, ?> senderMap) {
                        return a.user().id().toString().equals(senderMap.get("id"));
                    }
                    return false;
                })
                .map(req -> (String) req.get("id"))
                .findFirst()
                .orElseThrow(() -> new IllegalStateException("Connection request from user A not found"));

        restTemplate.exchange(baseUrl("/api/requests/" + requestId + "/accept"), HttpMethod.PUT, authHeader(b.token()), String.class);

        ResponseEntity<java.util.UUID[]> pathResponse = restTemplate.exchange(
                baseUrl("/api/users/" + a.user().id() + "/path/" + b.user().id()),
                HttpMethod.GET, authHeader(a.token()), java.util.UUID[].class);

        assertThat(pathResponse.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(pathResponse.getBody()).hasSize(2);
        assertThat(pathResponse.getBody()[0]).isEqualTo(a.user().id());
        assertThat(pathResponse.getBody()[1]).isEqualTo(b.user().id());
    }

    private HttpHeaders headersFor(String token) {
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(token);
        headers.setContentType(org.springframework.http.MediaType.APPLICATION_JSON);
        return headers;
    }

    private AuthResponse registerWithInviteCode(String inviteCode, String firstName, String lastName) {
        String phone = "555889" + phoneSeq.incrementAndGet();
        restTemplate.postForEntity(baseUrl("/api/auth/signup/initiate-otp"),
                new InitiateOtpRequest(phone, inviteCode), Void.class);
        String code = otpRepository.findByPhoneNumber(cleanPhone(phone)).orElseThrow().getCode();
        RegisterRequest body = new RegisterRequest(phone, code, firstName, lastName, inviteCode);
        return restTemplate.postForEntity(baseUrl("/api/auth/register"), body, AuthResponse.class).getBody();
    }

    // --- S4: invite code only ever populated for its owner -----------------------------------

    @Test
    void inviteCodeIsNullForNonOwnerInUsersList() {
        AuthResponse viewer = register("owner1", "Own", "Er");
        AuthResponse other = register("other1", "Oth", "Er");

        ResponseEntity<UserResponse[]> response = restTemplate.exchange(
                baseUrl("/api/users"), HttpMethod.GET, authHeader(viewer.token()), UserResponse[].class);

        List<UserResponse> users = List.of(response.getBody());
        UserResponse self = users.stream().filter(u -> u.id().equals(viewer.user().id())).findFirst().orElseThrow();
        UserResponse otherUser = users.stream().filter(u -> u.id().equals(other.user().id())).findFirst().orElseThrow();

        assertThat(self.inviteCode()).isNotBlank();
        assertThat(otherUser.inviteCode()).isNull();
    }

    @Test
    void inviteCodeIsNullForNonOwnerInFriendsList() {
        AuthResponse a = register("friendA1", "Friend", "A");
        AuthResponse b = registerWithInviteCode(a.user().inviteCode(), "Friend", "B");

        // A's friends list contains B — B isn't the viewer, so B's invite code must be hidden.
        ResponseEntity<FriendSummaryResponse[]> asA = restTemplate.exchange(
                baseUrl("/api/users/" + a.user().id() + "/friends"), HttpMethod.GET, authHeader(a.token()),
                FriendSummaryResponse[].class);
        FriendSummaryResponse bAsSeenByA = java.util.Arrays.stream(asA.getBody())
                .filter(f -> f.id().equals(b.user().id())).findFirst().orElseThrow();
        assertThat(bAsSeenByA.inviteCode()).isNull();
    }
}
