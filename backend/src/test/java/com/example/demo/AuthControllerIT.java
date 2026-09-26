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
import com.example.demo.service.verify.TwilioVerifyService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
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
import static org.mockito.Mockito.verifyNoInteractions;

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

    @MockitoBean
    private TwilioVerifyService twilioVerifyService;

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
    void shouldVerifySignUpOtpAndThenRegister() {
        String phone = nextPhone("555333");

        // 1. Initiate sign-up OTP
        ResponseEntity<Void> initResp = restTemplate.postForEntity(
                baseUrl("/api/auth/signup/initiate-otp"),
                new InitiateOtpRequest(phone, null), Void.class);
        assertThat(initResp.getStatusCode()).isEqualTo(HttpStatus.OK);

        String code = getOtp(phone);

        // 2. Immediate verification at OTP step
        ResponseEntity<Void> verifyResp = restTemplate.postForEntity(
                baseUrl("/api/auth/signup/verify-otp"),
                new VerifyOtpRequest(phone, code), Void.class);
        assertThat(verifyResp.getStatusCode()).isEqualTo(HttpStatus.OK);

        // Verify that OTP code was converted to "VERIFIED"
        assertThat(getOtp(phone)).isEqualTo("VERIFIED");

        // 3. Complete registration with name
        RegisterRequest request = new RegisterRequest(phone, code, "Alice", "Smith", null);
        ResponseEntity<AuthResponse> regResp = restTemplate.postForEntity(
                baseUrl("/api/auth/register"), request, AuthResponse.class);
        assertThat(regResp.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(regResp.getBody()).isNotNull();
        assertThat(regResp.getBody().token()).isNotBlank();
        assertThat(regResp.getBody().user().firstName()).isEqualTo("Alice");
        assertThat(regResp.getBody().user().lastName()).isEqualTo("Smith");

        // Stored OTP is deleted upon successful registration
        assertThat(otpRepository.findByPhoneNumber(cleanPhone(phone))).isEmpty();
    }

    // --- S2: no phone enumeration -----------------------------------------------------------

    @Test
    void signInInitiateOtp_returnsIdenticalResponseForExistingAndNonExistingNumber() {
        String existingPhone = nextPhone("555700");
        restTemplate.postForEntity(baseUrl("/api/auth/signup/initiate-otp"),
                new InitiateOtpRequest(existingPhone, null), Void.class);
        restTemplate.postForEntity(baseUrl("/api/auth/register"),
                new RegisterRequest(existingPhone, getOtp(existingPhone), "Exists", "Already", null), AuthResponse.class);

        String nonExistingPhone = nextPhone("555701");

        ResponseEntity<String> existingResponse = restTemplate.postForEntity(
                baseUrl("/api/auth/signin/initiate-otp"), new InitiateOtpRequest(existingPhone, null), String.class);
        ResponseEntity<String> nonExistingResponse = restTemplate.postForEntity(
                baseUrl("/api/auth/signin/initiate-otp"), new InitiateOtpRequest(nonExistingPhone, null), String.class);

        assertThat(existingResponse.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(nonExistingResponse.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(existingResponse.getBody()).isEqualTo(nonExistingResponse.getBody());
    }

    @Test
    void signUpInitiateOtp_returnsIdenticalResponseWhetherPhoneIsTakenOrNot() {
        String takenPhone = nextPhone("555702");
        restTemplate.postForEntity(baseUrl("/api/auth/signup/initiate-otp"),
                new InitiateOtpRequest(takenPhone, null), Void.class);
        restTemplate.postForEntity(baseUrl("/api/auth/register"),
                new RegisterRequest(takenPhone, getOtp(takenPhone), "Taken", "Number", null), AuthResponse.class);

        String freePhone = nextPhone("555703");

        ResponseEntity<String> takenResponse = restTemplate.postForEntity(
                baseUrl("/api/auth/signup/initiate-otp"), new InitiateOtpRequest(takenPhone, null), String.class);
        ResponseEntity<String> freeResponse = restTemplate.postForEntity(
                baseUrl("/api/auth/signup/initiate-otp"), new InitiateOtpRequest(freePhone, null), String.class);

        assertThat(takenResponse.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(freeResponse.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(takenResponse.getBody()).isEqualTo(freeResponse.getBody());
    }

    @Test
    void signUpInitiateOtp_withInvalidInviteCode_returnsGenericOkAndSendsNoOtp() {
        String phone = nextPhone("555704");

        ResponseEntity<Void> response = restTemplate.postForEntity(
                baseUrl("/api/auth/signup/initiate-otp"), new InitiateOtpRequest(phone, "NOTAREALCODE"), Void.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(otpRepository.findByPhoneNumber(cleanPhone(phone))).isEmpty();
        verifyNoInteractions(twilioVerifyService);
    }

    // --- S4: invite code registration cap -----------------------------------------------------

    @Test
    void register_withInviteCode_isRejectedOnceDailyCapIsReached() {
        String inviterPhone = nextPhone("555800");
        restTemplate.postForEntity(baseUrl("/api/auth/signup/initiate-otp"),
                new InitiateOtpRequest(inviterPhone, null), Void.class);
        ResponseEntity<AuthResponse> inviterResponse = restTemplate.postForEntity(baseUrl("/api/auth/register"),
                new RegisterRequest(inviterPhone, getOtp(inviterPhone), "Cap", "Inviter", null), AuthResponse.class);
        String inviteCode = inviterResponse.getBody().user().inviteCode();

        // Default cap is 10/day (app.invite.max-registrations-per-day) — use it up.
        for (int i = 0; i < 10; i++) {
            String phone = nextPhone("555801");
            restTemplate.postForEntity(baseUrl("/api/auth/signup/initiate-otp"),
                    new InitiateOtpRequest(phone, inviteCode), Void.class);
            ResponseEntity<AuthResponse> response = restTemplate.postForEntity(baseUrl("/api/auth/register"),
                    new RegisterRequest(phone, getOtp(phone), "Invitee", "Number" + i, inviteCode), AuthResponse.class);
            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        }

        String oneTooManyPhone = nextPhone("555802");
        restTemplate.postForEntity(baseUrl("/api/auth/signup/initiate-otp"),
                new InitiateOtpRequest(oneTooManyPhone, inviteCode), Void.class);
        ResponseEntity<Map> rejected = restTemplate.postForEntity(baseUrl("/api/auth/register"),
                new RegisterRequest(oneTooManyPhone, getOtp(oneTooManyPhone), "Invitee", "TooMany", inviteCode), Map.class);

        assertThat(rejected.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(rejected.getBody()).containsEntry("error", "This invite link has reached its limit for today");
    }
}
