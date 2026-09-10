package com.example.demo.controller;

import com.example.demo.dto.ConnectionRequestResponse;
import com.example.demo.dto.UserSummary;
import com.example.demo.exception.BadRequestException;
import com.example.demo.model.ConnectionRequest;
import com.example.demo.model.User;
import com.example.demo.repository.ConnectionRequestRepository;
import com.example.demo.service.ConnectionService;
import com.example.demo.service.PlacementService;
import com.example.demo.service.UserService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/requests")
@RequiredArgsConstructor
public class RequestController {

    private final ConnectionRequestRepository requestRepository;
    private final UserService userService;
    private final ConnectionService connectionService;
    private final PlacementService placementService;

    @PostMapping
    public ResponseEntity<Void> sendRequest(@RequestBody Map<String, String> body,
                                             @AuthenticationPrincipal UUID senderId) {
        UUID receiverId = UUID.fromString(body.get("receiverId"));
        if (senderId.equals(receiverId)) {
            throw new BadRequestException("You cannot send a connection request to yourself");
        }
        if (connectionService.areConnected(senderId, receiverId)) {
            throw new BadRequestException("You are already connected with this user");
        }

        User sender = userService.getUserById(senderId);
        User receiver = userService.getUserById(receiverId);

        boolean alreadyPending = requestRepository.findBySenderOrReceiver(sender, sender).stream()
                .anyMatch(r -> r.getStatus() == ConnectionRequest.RequestStatus.PENDING
                        && (r.getReceiver().getId().equals(receiverId) || r.getSender().getId().equals(receiverId)));
        if (alreadyPending) {
            throw new BadRequestException("A pending request already exists between these users");
        }

        ConnectionRequest connRequest = ConnectionRequest.builder()
                .sender(sender)
                .receiver(receiver)
                .status(ConnectionRequest.RequestStatus.PENDING)
                .build();
        requestRepository.save(connRequest);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/me")
    public List<ConnectionRequestResponse> getMyRequests(@AuthenticationPrincipal UUID requestingUserId) {
        User user = userService.getUserById(requestingUserId);
        return requestRepository.findBySenderOrReceiver(user, user).stream()
                .map(RequestController::toResponse)
                .toList();
    }

    @PutMapping("/{requestId}/accept")
    public ResponseEntity<Void> acceptRequest(@PathVariable UUID requestId,
                                               @AuthenticationPrincipal UUID requestingUserId) {
        ConnectionRequest request = requestRepository.findById(requestId)
                .orElseThrow(() -> new BadRequestException("Request not found"));
        if (!request.getReceiver().getId().equals(requestingUserId)) {
            throw new BadRequestException("Only the recipient can accept a connection request");
        }

        request.setStatus(ConnectionRequest.RequestStatus.ACCEPTED);
        connectionService.connect(request.getSender(), request.getReceiver());
        requestRepository.save(request);

        return ResponseEntity.noContent().build();
    }

    @PutMapping("/{requestId}/decline")
    public ResponseEntity<Void> declineRequest(@PathVariable UUID requestId,
                                                @AuthenticationPrincipal UUID requestingUserId) {
        ConnectionRequest request = requestRepository.findById(requestId)
                .orElseThrow(() -> new BadRequestException("Request not found"));
        if (!request.getReceiver().getId().equals(requestingUserId)) {
            throw new BadRequestException("Only the recipient can decline a connection request");
        }

        request.setStatus(ConnectionRequest.RequestStatus.REJECTED);
        requestRepository.save(request);

        if (request.isSponsorRequest()) {
            placementService.relocateToNewNeighborhood(request.getSender());
        }

        return ResponseEntity.noContent().build();
    }

    // No redaction logic needed here at all (unlike UserResponse) — a notification row never
    // carries phone number or relationships in the first place, regardless of connection status.
    private static ConnectionRequestResponse toResponse(ConnectionRequest request) {
        return new ConnectionRequestResponse(
                request.getId(),
                UserSummary.from(request.getSender()),
                UserSummary.from(request.getReceiver()),
                request.getStatus()
        );
    }
}
