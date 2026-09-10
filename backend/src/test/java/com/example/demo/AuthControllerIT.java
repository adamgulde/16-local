package com.example.demo;

import com.example.demo.dto.AuthResponse;
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

import java.util.Map;

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

    private String baseUrl(String path) {
        return "http://localhost:" + port + path;
    }

    @Test
    void shouldRegisterAndReturnTokenAndUser() {
        Map<String, String> registerBody = Map.of(
                "username", "testuser",
                "password", "secret123",
                "firstName", "Test",
                "lastName", "User",
                "phoneNumber", "5551234567"
        );

        ResponseEntity<AuthResponse> response = restTemplate.postForEntity(baseUrl("/api/auth/register"), registerBody, AuthResponse.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().token()).isNotBlank();
        assertThat(response.getBody().user().firstName()).isEqualTo("Test");
        assertThat(response.getBody().user().lastName()).isEqualTo("User");
    }

    @Test
    void shouldRejectLoginWithWrongPassword() {
        Map<String, String> registerBody = Map.of(
                "username", "wrongpass",
                "password", "correct-horse",
                "firstName", "Wrong",
                "lastName", "Pass",
                "phoneNumber", "5550000000"
        );
        restTemplate.postForEntity(baseUrl("/api/auth/register"), registerBody, AuthResponse.class);

        Map<String, String> loginBody = Map.of("username", "wrongpass", "password", "not-the-password");
        ResponseEntity<String> response = restTemplate.postForEntity(baseUrl("/api/auth/login"), loginBody, String.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void shouldLoginWithCorrectPassword() {
        Map<String, String> registerBody = Map.of(
                "username", "rightpass",
                "password", "correct-horse",
                "firstName", "Right",
                "lastName", "Pass",
                "phoneNumber", "5550000001"
        );
        restTemplate.postForEntity(baseUrl("/api/auth/register"), registerBody, AuthResponse.class);

        Map<String, String> loginBody = Map.of("username", "rightpass", "password", "correct-horse");
        ResponseEntity<AuthResponse> response = restTemplate.postForEntity(baseUrl("/api/auth/login"), loginBody, AuthResponse.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().token()).isNotBlank();
        assertThat(response.getBody().user().firstName()).isEqualTo("Right");
    }
}
