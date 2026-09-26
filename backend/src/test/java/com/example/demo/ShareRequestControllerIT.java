package com.example.demo;

import com.example.demo.dto.AuthResponse;
import com.example.demo.dto.GraphNode;
import com.example.demo.dto.InitiateOtpRequest;
import com.example.demo.dto.RegisterRequest;
import com.example.demo.dto.ShareListResponse;
import com.example.demo.dto.ShareRequestCreateRequest;
import com.example.demo.dto.ShareRequestListResponse;
import com.example.demo.repository.ContactRepository;
import com.example.demo.repository.OtpRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Plan §1.7 / §4 P3: POST /api/share-requests must answer identically (202, empty body) whether
 * or not phoneNumber/inviteCode matched a real account — and end to end, respond{connect,
 * allowView} must produce the mutual contact + the graph_shares row plan §1.3-1.4 describe.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(TestcontainersConfiguration.class)
class ShareRequestControllerIT {

    @LocalServerPort
    private int port;

    @Autowired
    private TestRestTemplate restTemplate;

    @Autowired
    private OtpRepository otpRepository;

    @Autowired
    private ContactRepository contactRepository;

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

    @Test
    void postShareRequestsIsByteIdenticalWhetherOrNotThePhoneOrInviteCodeMatched() {
        AuthResponse sender = register("Sender", "One");
        AuthResponse knownRecipient = register("Recipient", "Two");
        HttpHeaders headers = authHeaders(sender.token());

        ResponseEntity<String> matchingPhone = restTemplate.exchange(baseUrl("/api/share-requests"),
                org.springframework.http.HttpMethod.POST,
                new HttpEntity<>(new ShareRequestCreateRequest(knownRecipient.user().phoneNumber(), null, null), headers),
                String.class);
        ResponseEntity<String> unknownPhone = restTemplate.exchange(baseUrl("/api/share-requests"),
                org.springframework.http.HttpMethod.POST,
                new HttpEntity<>(new ShareRequestCreateRequest("555000" + phoneSeq.incrementAndGet(), null, null), headers),
                String.class);
        ResponseEntity<String> matchingInvite = restTemplate.exchange(baseUrl("/api/share-requests"),
                org.springframework.http.HttpMethod.POST,
                new HttpEntity<>(new ShareRequestCreateRequest(null, knownRecipient.user().inviteCode(), null), headers),
                String.class);
        ResponseEntity<String> unknownInvite = restTemplate.exchange(baseUrl("/api/share-requests"),
                org.springframework.http.HttpMethod.POST,
                new HttpEntity<>(new ShareRequestCreateRequest(null, "ZZZZZZ", null), headers),
                String.class);

        for (ResponseEntity<String> response : java.util.List.of(matchingPhone, unknownPhone, matchingInvite, unknownInvite)) {
            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.ACCEPTED);
            assertThat(response.getBody()).isNullOrEmpty();
        }
    }

    @Test
    void respondConnectAndAllowViewCreateTheMutualContactAndTheShare() {
        AuthResponse a = register("Alice", "Sender");
        AuthResponse b = register("Bob", "Recipient");
        HttpHeaders aHeaders = authHeaders(a.token());
        HttpHeaders bHeaders = authHeaders(b.token());

        // A creates a placeholder for B and offers it on the share request.
        ResponseEntity<GraphNode> placeholderResp = restTemplate.exchange(baseUrl("/api/contacts"),
                org.springframework.http.HttpMethod.POST,
                new HttpEntity<>(Map.of("firstName", "Bobby"), aHeaders), GraphNode.class);
        String placeholderId = placeholderResp.getBody().id();

        ResponseEntity<Void> createResp = restTemplate.exchange(baseUrl("/api/share-requests"),
                org.springframework.http.HttpMethod.POST,
                new HttpEntity<>(new ShareRequestCreateRequest(b.user().phoneNumber(), null,
                        java.util.UUID.fromString(placeholderId)), aHeaders),
                Void.class);
        assertThat(createResp.getStatusCode()).isEqualTo(HttpStatus.ACCEPTED);

        ResponseEntity<ShareRequestListResponse> bList = restTemplate.exchange(baseUrl("/api/share-requests"),
                org.springframework.http.HttpMethod.GET, new HttpEntity<>(bHeaders), ShareRequestListResponse.class);
        assertThat(bList.getBody().incoming()).hasSize(1);
        assertThat(bList.getBody().incoming().get(0).counterpartName()).isEqualTo("Alice Sender");
        String requestId = bList.getBody().incoming().get(0).id().toString();

        ResponseEntity<Void> respondResp = restTemplate.exchange(baseUrl("/api/share-requests/" + requestId + "/respond"),
                org.springframework.http.HttpMethod.POST,
                new HttpEntity<>(Map.of("connect", true, "allowView", true), bHeaders), Void.class);
        assertThat(respondResp.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);

        // A's placeholder is now linked to B; B has a fresh registered contact for A.
        assertThat(contactRepository.findById(java.util.UUID.fromString(placeholderId)).orElseThrow()
                .getLinkedUser().getId()).isEqualTo(b.user().id());
        assertThat(contactRepository.existsByOwnerIdAndLinkedUserId(b.user().id(), a.user().id())).isTrue();

        // allowView: sharer=B (the recipient who responded), viewer=A.
        ResponseEntity<ShareListResponse> bShares = restTemplate.exchange(baseUrl("/api/shares"),
                org.springframework.http.HttpMethod.GET, new HttpEntity<>(bHeaders), ShareListResponse.class);
        assertThat(bShares.getBody().sharedByMe()).hasSize(1);
        assertThat(bShares.getBody().sharedByMe().get(0).viewerUserId()).isEqualTo(a.user().id());
    }
}
