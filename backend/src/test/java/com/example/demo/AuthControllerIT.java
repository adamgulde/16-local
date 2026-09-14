package com.example.demo;

import com.example.demo.dto.AuthResponse;
import com.example.demo.dto.InitiateOtpRequest;
import com.example.demo.dto.RegisterRequest;
import com.example.demo.dto.VerifyOtpRequest;
import com.example.demo.model.ConnectionRequest;
import com.example.demo.model.User;
import com.example.demo.repository.ConnectionRequestRepository;
import com.example.demo.repository.OtpRepository;
import com.example.demo.repository.UserRepository;
import com.example.demo.service.ConnectionService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.context.annotation.Import;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(TestcontainersConfiguration.class)
public class AuthControllerIT {

    @LocalServerPort
    private int port;

    @Autowired
    private TestRestTemplate restTemplate;

    @Autowired
    private OtpRepository otpRepository;

    @Autowired
    private ConnectionRequestRepository connectionRequestRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private ConnectionService connectionService;

    private String baseUrl(String path) {
        return "http://localhost:" + port + path;
    }

    private static final java.util.concurrent.atomic.AtomicInteger phoneSeq = new java.util.concurrent.atomic.AtomicInteger((int) (System.currentTimeMillis() % 100000));

    private String nextPhone(String prefix) {
        return prefix + String.format("%04d", phoneSeq.incrementAndGet() % 10000);
    }

    private String cleanPhone(String phone) {
        if (phone == null) return null;
        String digits = phone.replaceAll("\\D", "");
        if (digits.startsWith("1") && digits.length() == 11) digits = digits.substring(1);
        if (digits.length() == 10) return String.format("+1 %s-%s-%s", digits.substring(0, 3), digits.substring(3, 6), digits.substring(6));
        return phone;
    }

    private String getOtp(String phone) {
        return otpRepository.findByPhoneNumber(cleanPhone(phone)).orElseThrow().getCode();
    }

    @Test
    void shouldRegisterAndReturnTokenAndUser() {
        String phone = nextPhone("555111");
        restTemplate.postForEntity(baseUrl("/api/auth/signup/initiate-otp"),
                new InitiateOtpRequest(phone, null), Void.class);

        String code = getOtp(phone);
        RegisterRequest request = new RegisterRequest(phone, code, "Test", "User", null);

        ResponseEntity<AuthResponse> response = restTemplate.postForEntity(
                baseUrl("/api/auth/register"), request, AuthResponse.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().token()).isNotBlank();
        assertThat(response.getBody().user().firstName()).isEqualTo("Test");
        assertThat(response.getBody().user().lastName()).isEqualTo("User");
        assertThat(response.getBody().user().inviteCode()).isNotBlank();
    }

    @Test
    void shouldSignInWithOtp() {
        String phone = nextPhone("555222");
        restTemplate.postForEntity(baseUrl("/api/auth/signup/initiate-otp"),
                new InitiateOtpRequest(phone, null), Void.class);
        String code = getOtp(phone);

        restTemplate.postForEntity(baseUrl("/api/auth/register"),
                new RegisterRequest(phone, code, "Sign", "InUser", null), AuthResponse.class);

        // Now initiate signin
        ResponseEntity<Void> initResponse = restTemplate.postForEntity(
                baseUrl("/api/auth/signin/initiate-otp"), new InitiateOtpRequest(phone, null), Void.class);
        assertThat(initResponse.getStatusCode()).isEqualTo(HttpStatus.OK);

        String loginCode = getOtp(phone);
        ResponseEntity<AuthResponse> loginResponse = restTemplate.postForEntity(
                baseUrl("/api/auth/signin/verify-otp"), new VerifyOtpRequest(phone, loginCode), AuthResponse.class);

        assertThat(loginResponse.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(loginResponse.getBody()).isNotNull();
        assertThat(loginResponse.getBody().token()).isNotBlank();
        assertThat(loginResponse.getBody().user().firstName()).isEqualTo("Sign");
    }

    @Test
    void shouldAutoConnectWhenRegisteringWithInviteCode() {
        // User A registers
        String phoneA = nextPhone("555333");
        restTemplate.postForEntity(baseUrl("/api/auth/signup/initiate-otp"),
                new InitiateOtpRequest(phoneA, null), Void.class);
        String codeA = getOtp(phoneA);
        ResponseEntity<AuthResponse> userAResponse = restTemplate.postForEntity(
                baseUrl("/api/auth/register"),
                new RegisterRequest(phoneA, codeA, "Alice", "Inviter", null), AuthResponse.class);

        assertThat(userAResponse.getBody()).isNotNull();
        String inviteCodeA = userAResponse.getBody().user().inviteCode();
        assertThat(inviteCodeA).isNotBlank();

        // User B registers with User A's invite code
        String phoneB = nextPhone("555444");
        restTemplate.postForEntity(baseUrl("/api/auth/signup/initiate-otp"),
                new InitiateOtpRequest(phoneB, inviteCodeA), Void.class);
        String codeB = getOtp(phoneB);
        ResponseEntity<AuthResponse> userBResponse = restTemplate.postForEntity(
                baseUrl("/api/auth/register"),
                new RegisterRequest(phoneB, codeB, "Bob", "Invitee", inviteCodeA), AuthResponse.class);

        assertThat(userBResponse.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(userBResponse.getBody()).isNotNull();
        assertThat(userBResponse.getBody().user().relationships())
                .contains(userAResponse.getBody().user().id());
    }

    @Test
    void shouldReceive3ConnectionRequestsFromDefaultUsersWhenNewUserRegisters() {
        String phone = nextPhone("555991");
        restTemplate.postForEntity(baseUrl("/api/auth/signup/initiate-otp"),
                new InitiateOtpRequest(phone, null), Void.class);
        String code = getOtp(phone);
        ResponseEntity<AuthResponse> response = restTemplate.postForEntity(
                baseUrl("/api/auth/register"),
                new RegisterRequest(phone, code, "Carol", "NewUser", null), AuthResponse.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        User registeredUser = userRepository.findById(response.getBody().user().id()).orElseThrow();
        assertThat(registeredUser.isDefaultUser()).isFalse();

        // Check incoming requests
        List<ConnectionRequest> incoming = connectionRequestRepository.findBySenderOrReceiver(registeredUser, registeredUser).stream()
                .filter(r -> r.getReceiver().getId().equals(registeredUser.getId()))
                .toList();

        assertThat(incoming).hasSize(3);
        for (ConnectionRequest req : incoming) {
            assertThat(req.getStatus()).isEqualTo(ConnectionRequest.RequestStatus.PENDING);
            assertThat(req.getSender().isDefaultUser()).isTrue();
        }
    }

    @Test
    void shouldAutoAcceptWhenRequestSentToDefaultUser() {
        // Register new user
        String phone = nextPhone("555992");
        restTemplate.postForEntity(baseUrl("/api/auth/signup/initiate-otp"),
                new InitiateOtpRequest(phone, null), Void.class);
        String code = getOtp(phone);
        ResponseEntity<AuthResponse> response = restTemplate.postForEntity(
                baseUrl("/api/auth/register"),
                new RegisterRequest(phone, code, "Dave", "Sender", null), AuthResponse.class);

        String token = response.getBody().token();
        UUID userId = response.getBody().user().id();

        // Pick a default user that isn't connected to Dave and has no pending request
        List<UUID> incomingSenderIds = connectionRequestRepository.findAll().stream()
                .filter(r -> r.getReceiver().getId().equals(userId))
                .map(r -> r.getSender().getId())
                .toList();

        User defaultTarget = userRepository.findAll().stream()
                .filter(u -> u.isDefaultUser() && !incomingSenderIds.contains(u.getId()))
                .findFirst()
                .orElseThrow();

        // Send connection request from Dave to defaultTarget
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(token);
        HttpEntity<Map<String, String>> requestEntity = new HttpEntity<>(Map.of("receiverId", defaultTarget.getId().toString()), headers);

        ResponseEntity<Void> sendResp = restTemplate.postForEntity(baseUrl("/api/requests"), requestEntity, Void.class);
        assertThat(sendResp.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);

        // Verify connected immediately!
        assertThat(connectionService.areConnected(userId, defaultTarget.getId())).isTrue();
    }

    @Test
    void shouldNotAutoAcceptWhenRequestSentToAnotherRegisteredUser() {
        // User 1
        String phone1 = nextPhone("555993");
        restTemplate.postForEntity(baseUrl("/api/auth/signup/initiate-otp"), new InitiateOtpRequest(phone1, null), Void.class);
        ResponseEntity<AuthResponse> user1 = restTemplate.postForEntity(baseUrl("/api/auth/register"),
                new RegisterRequest(phone1, getOtp(phone1), "User", "One", null), AuthResponse.class);

        // User 2
        String phone2 = nextPhone("555994");
        restTemplate.postForEntity(baseUrl("/api/auth/signup/initiate-otp"), new InitiateOtpRequest(phone2, null), Void.class);
        ResponseEntity<AuthResponse> user2 = restTemplate.postForEntity(baseUrl("/api/auth/register"),
                new RegisterRequest(phone2, getOtp(phone2), "User", "Two", null), AuthResponse.class);

        // User 1 sends request to User 2
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(user1.getBody().token());
        HttpEntity<Map<String, String>> requestEntity = new HttpEntity<>(Map.of("receiverId", user2.getBody().user().id().toString()), headers);

        ResponseEntity<Void> sendResp = restTemplate.postForEntity(baseUrl("/api/requests"), requestEntity, Void.class);
        assertThat(sendResp.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);

        // Verify NOT connected
        assertThat(connectionService.areConnected(user1.getBody().user().id(), user2.getBody().user().id())).isFalse();

        // Verify request is PENDING
        User receiver = userRepository.findById(user2.getBody().user().id()).orElseThrow();
        boolean pending = connectionRequestRepository.findBySenderOrReceiver(receiver, receiver).stream()
                .anyMatch(r -> r.getSender().getId().equals(user1.getBody().user().id())
                        && r.getReceiver().getId().equals(user2.getBody().user().id())
                        && r.getStatus() == ConnectionRequest.RequestStatus.PENDING);
        assertThat(pending).isTrue();
    }

    @Test
    void shouldAllowDefaultUsersToSignInWith000000() {
        // 1. User 0 via full phone format
        ResponseEntity<Void> initResp0 = restTemplate.postForEntity(
                baseUrl("/api/auth/signin/initiate-otp"),
                new InitiateOtpRequest("+1 555-000-0000", null), Void.class);
        assertThat(initResp0.getStatusCode()).isEqualTo(HttpStatus.OK);

        ResponseEntity<AuthResponse> verifyResp0 = restTemplate.postForEntity(
                baseUrl("/api/auth/signin/verify-otp"),
                new VerifyOtpRequest("+1 555-000-0000", "000000"), AuthResponse.class);
        assertThat(verifyResp0.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(verifyResp0.getBody()).isNotNull();
        assertThat(verifyResp0.getBody().token()).isNotBlank();
        assertThat(verifyResp0.getBody().user().defaultUser()).isTrue();

        // 2. User 1 via shortcut "1"
        ResponseEntity<Void> initResp1 = restTemplate.postForEntity(
                baseUrl("/api/auth/signin/initiate-otp"),
                new InitiateOtpRequest("1", null), Void.class);
        assertThat(initResp1.getStatusCode()).isEqualTo(HttpStatus.OK);

        ResponseEntity<AuthResponse> verifyResp1 = restTemplate.postForEntity(
                baseUrl("/api/auth/signin/verify-otp"),
                new VerifyOtpRequest("1", "000000"), AuthResponse.class);
        assertThat(verifyResp1.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(verifyResp1.getBody()).isNotNull();
        assertThat(verifyResp1.getBody().token()).isNotBlank();
        assertThat(verifyResp1.getBody().user().defaultUser()).isTrue();

        // 3. User 100 via shortcut "user 100"
        ResponseEntity<Void> initResp100 = restTemplate.postForEntity(
                baseUrl("/api/auth/signin/initiate-otp"),
                new InitiateOtpRequest("user 100", null), Void.class);
        assertThat(initResp100.getStatusCode()).isEqualTo(HttpStatus.OK);

        ResponseEntity<AuthResponse> verifyResp100 = restTemplate.postForEntity(
                baseUrl("/api/auth/signin/verify-otp"),
                new VerifyOtpRequest("user 100", "000000"), AuthResponse.class);
        assertThat(verifyResp100.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(verifyResp100.getBody()).isNotNull();
        assertThat(verifyResp100.getBody().token()).isNotBlank();
        assertThat(verifyResp100.getBody().user().defaultUser()).isTrue();
    }
}
