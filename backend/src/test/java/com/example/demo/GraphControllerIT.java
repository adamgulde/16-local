package com.example.demo;

import com.example.demo.dto.AuthResponse;
import com.example.demo.dto.EdgeKind;
import com.example.demo.dto.Graph;
import com.example.demo.dto.GraphNode;
import com.example.demo.dto.InitiateOtpRequest;
import com.example.demo.dto.NodeKind;
import com.example.demo.dto.RegisterRequest;
import com.example.demo.dto.RespondRequest;
import com.example.demo.dto.ShareFlagsRequest;
import com.example.demo.dto.ShareRequestCreateRequest;
import com.example.demo.dto.ShareRequestListResponse;
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

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * End-to-end fixture for plan §4 P4: GET /api/graph (own graph + SHARED overlay from a connected
 * sharer) and GET /api/shares/{id}/graph (a non-connected sharer's graph, viewer-only).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(TestcontainersConfiguration.class)
class GraphControllerIT {

    @LocalServerPort
    private int port;

    @Autowired
    private TestRestTemplate restTemplate;

    @Autowired
    private OtpRepository otpRepository;

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
        String phone = "555888" + String.format("%04d", phoneSeq.incrementAndGet() % 10000);
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
    void ownGraphShowsSelfAndContactsThenOverlaysAConnectedSharersDirectContacts() {
        AuthResponse a = register("Alice", "Root", null);
        AuthResponse b = register("Bob", "Invited", a.user().inviteCode());
        HttpHeaders aHeaders = authHeaders(a.token());
        HttpHeaders bHeaders = authHeaders(b.token());

        // A and B are already mutually connected via invite-code registration (plan §3).
        Graph aGraphBefore = exchange("/api/graph", HttpMethod.GET, null, aHeaders, Graph.class).getBody();
        assertThat(aGraphBefore.nodes()).extracting(GraphNode::id).contains(a.user().id().toString());
        GraphNode bAsContact = aGraphBefore.nodes().stream()
                .filter(n -> b.user().id().equals(n.linkedUserId()))
                .findFirst().orElseThrow();
        assertThat(bAsContact.kind()).isEqualTo(NodeKind.REGISTERED);
        assertThat(aGraphBefore.edges()).contains(
                new com.example.demo.dto.GraphEdge(a.user().id().toString(), bAsContact.id(), EdgeKind.DIRECT, null));

        // B creates their own placeholder contact "Dora" — never seen by A yet (no share).
        ResponseEntity<Map> doraResp = exchange("/api/contacts", HttpMethod.POST,
                Map.of("firstName", "Dora", "about", "met at a conference"), bHeaders, Map.class);
        String doraId = (String) doraResp.getBody().get("id");

        // A asks to view B's graph; B grants allowView (already connected, so `connect` is moot).
        exchange("/api/share-requests", HttpMethod.POST,
                new ShareRequestCreateRequest(b.user().phoneNumber(), null, null), aHeaders, Void.class);
        ShareRequestListResponse bIncoming = exchange("/api/share-requests", HttpMethod.GET, null, bHeaders,
                ShareRequestListResponse.class).getBody();
        UUID requestId = bIncoming.incoming().get(0).id();
        exchange("/api/share-requests/" + requestId + "/respond", HttpMethod.POST,
                new RespondRequest(false, true), bHeaders, Void.class);

        // Still no Dora in A's graph — B hasn't turned on any share flags yet, but the name always shows.
        Graph aGraphAfterShare = exchange("/api/graph", HttpMethod.GET, null, aHeaders, Graph.class).getBody();
        GraphNode doraToA = aGraphAfterShare.nodes().stream().filter(n -> n.id().equals(doraId)).findFirst().orElseThrow();
        assertThat(doraToA.firstName()).isEqualTo("Dora");
        assertThat(doraToA.about()).isEmpty();
        assertThat(doraToA.editable()).isFalse();
        assertThat(doraToA.source().sharerName()).isEqualTo("Bob Invited");
        assertThat(aGraphAfterShare.edges()).anyMatch(e -> e.kind() == EdgeKind.SHARED
                && e.source().equals(bAsContact.id()) && e.target().equals(doraId));

        // B turns shareAbout on for that share — now Dora's about shows too.
        var bShares = exchange("/api/shares", HttpMethod.GET, null, bHeaders, Map.class).getBody();
        var sharedByMe = (java.util.List<Map<String, Object>>) bShares.get("sharedByMe");
        String shareId = (String) sharedByMe.get(0).get("id");
        exchange("/api/shares/" + shareId, HttpMethod.PATCH, new ShareFlagsRequest(true, null, null, null), bHeaders, Object.class);

        Graph aGraphWithAbout = exchange("/api/graph", HttpMethod.GET, null, aHeaders, Graph.class).getBody();
        GraphNode doraWithAbout = aGraphWithAbout.nodes().stream().filter(n -> n.id().equals(doraId)).findFirst().orElseThrow();
        assertThat(doraWithAbout.about()).isEqualTo("met at a conference");

        // B hides Dora — she now renders as an anonymous Hidden User to A, at a different id.
        exchange("/api/shares/" + shareId + "/hidden-contacts", HttpMethod.PUT,
                Map.of("contactIds", java.util.List.of(doraId)), bHeaders, Void.class);
        Graph aGraphAfterHide = exchange("/api/graph", HttpMethod.GET, null, aHeaders, Graph.class).getBody();
        assertThat(aGraphAfterHide.nodes()).extracting(GraphNode::id).doesNotContain(doraId);
        assertThat(aGraphAfterHide.nodes()).anyMatch(n -> n.kind() == NodeKind.HIDDEN);
    }

    @Test
    void nonConnectedSharesGraphIsOnlyReachableThroughItsOwnEndpoint() {
        AuthResponse b = register("Bea", "Sharer", null);
        AuthResponse c = register("Cid", "Viewer", null);
        HttpHeaders bHeaders = authHeaders(b.token());
        HttpHeaders cHeaders = authHeaders(c.token());

        // B and C are never connected — C asks to view B's graph only (no connect).
        exchange("/api/share-requests", HttpMethod.POST,
                new ShareRequestCreateRequest(b.user().phoneNumber(), null, null), cHeaders, Void.class);
        ShareRequestListResponse bIncoming = exchange("/api/share-requests", HttpMethod.GET, null, bHeaders,
                ShareRequestListResponse.class).getBody();
        UUID requestId = bIncoming.incoming().get(0).id();
        exchange("/api/share-requests/" + requestId + "/respond", HttpMethod.POST,
                new RespondRequest(false, true), bHeaders, Void.class);

        var cShares = exchange("/api/shares", HttpMethod.GET, null, cHeaders, Map.class).getBody();
        var sharedWithMe = (java.util.List<Map<String, Object>>) cShares.get("sharedWithMe");
        String shareId = (String) sharedWithMe.get(0).get("id");

        // Not connected -> B never appears in C's own /api/graph.
        Graph cOwnGraph = exchange("/api/graph", HttpMethod.GET, null, cHeaders, Graph.class).getBody();
        assertThat(cOwnGraph.nodes()).extracting(GraphNode::id).doesNotContain(b.user().id().toString());

        // But C can still open B's graph directly.
        Graph sharedGraph = exchange("/api/shares/" + shareId + "/graph", HttpMethod.GET, null, cHeaders, Graph.class).getBody();
        assertThat(sharedGraph.nodes()).anyMatch(n -> n.id().equals(b.user().id().toString()) && n.kind() == NodeKind.REGISTERED
                && !n.editable());

        // Someone else entirely gets a 404, not B's graph.
        AuthResponse stranger = register("Stan", "Stranger", null);
        ResponseEntity<String> forbidden = exchange("/api/shares/" + shareId + "/graph", HttpMethod.GET, null,
                authHeaders(stranger.token()), String.class);
        assertThat(forbidden.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }
}
