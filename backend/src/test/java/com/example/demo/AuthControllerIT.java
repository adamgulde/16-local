package com.example.demo;

import com.example.demo.dto.AuthResponse;
import com.example.demo.dto.InitiateOtpRequest;
import com.example.demo.dto.RegisterRequest;
import com.example.demo.dto.VerifyOtpRequest;
import com.example.demo.repository.OtpRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Testcontainers
public class AuthControllerIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @LocalServerPort
    private int port;

    @Autowired
    private TestRestTemplate restTemplate;

    @Autowired
    private OtpRepository otpRepository;

    private String baseUrl(String path) {
        return "http://localhost:" + port + path;
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
        String phone = "5551112233";
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
        String phone = "5552223344";
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
        String phoneA = "5553334455";
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
        String phoneB = "5554445566";
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
}
