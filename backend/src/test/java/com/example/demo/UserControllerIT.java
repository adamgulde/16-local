package com.example.demo;

import com.example.demo.dto.AuthResponse;
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
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Testcontainers
public class UserControllerIT {

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

    private AuthResponse register(String username, String firstName, String lastName) {
        Map<String, String> body = Map.of(
                "username", username,
                "password", "secret123",
                "firstName", firstName,
                "lastName", lastName,
                "phoneNumber", "5559990000"
        );
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
        String requestId = (String) requests.getBody()[0].get("id");

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
}
