package com.example.demo.controller;

import com.example.demo.dto.RespondRequest;
import com.example.demo.dto.ShareRequestCreateRequest;
import com.example.demo.dto.ShareRequestListResponse;
import com.example.demo.service.ShareRequestService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

/** Plan §1.3, §1.7 and §4 P3 — graph-share requests replace connection requests. */
@RestController
@RequestMapping("/api/share-requests")
@RequiredArgsConstructor
public class ShareRequestController {

    private final ShareRequestService shareRequestService;

    /** Always 202, whether or not phoneNumber/inviteCode matched an account — no enumeration (§1.7). */
    @PostMapping
    public ResponseEntity<Void> create(@RequestBody ShareRequestCreateRequest request,
                                        @AuthenticationPrincipal UUID senderId) {
        shareRequestService.create(senderId, request);
        return ResponseEntity.accepted().build();
    }

    @GetMapping
    public ShareRequestListResponse list(@AuthenticationPrincipal UUID userId) {
        return shareRequestService.list(userId);
    }

    @PostMapping("/{id}/respond")
    public ResponseEntity<Void> respond(@PathVariable UUID id, @RequestBody RespondRequest request,
                                         @AuthenticationPrincipal UUID recipientId) {
        shareRequestService.respond(id, recipientId, request);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> cancel(@PathVariable UUID id, @AuthenticationPrincipal UUID senderId) {
        shareRequestService.cancel(id, senderId);
        return ResponseEntity.noContent().build();
    }
}
