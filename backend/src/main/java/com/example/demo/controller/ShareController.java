package com.example.demo.controller;

import com.example.demo.dto.Graph;
import com.example.demo.dto.HiddenContactsRequest;
import com.example.demo.dto.ShareFlagsRequest;
import com.example.demo.dto.ShareListResponse;
import com.example.demo.dto.ShareResponse;
import com.example.demo.service.GraphService;
import com.example.demo.service.ShareService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

/** Plan §1.4-1.5 and §4 P3 — live graph-share grants. */
@RestController
@RequestMapping("/api/shares")
@RequiredArgsConstructor
public class ShareController {

    private final ShareService shareService;
    private final GraphService graphService;

    @GetMapping
    public ShareListResponse list(@AuthenticationPrincipal UUID userId) {
        return shareService.list(userId);
    }

    @PatchMapping("/{id}")
    public ShareResponse updateFlags(@PathVariable UUID id, @RequestBody ShareFlagsRequest request,
                                      @AuthenticationPrincipal UUID sharerId) {
        return shareService.updateFlags(id, sharerId, request);
    }

    @PutMapping("/{id}/hidden-contacts")
    public ResponseEntity<Void> replaceHiddenContacts(@PathVariable UUID id, @RequestBody HiddenContactsRequest request,
                                                        @AuthenticationPrincipal UUID sharerId) {
        shareService.replaceHiddenContacts(id, sharerId, request.contactIds());
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> remove(@PathVariable UUID id, @AuthenticationPrincipal UUID userId) {
        shareService.revokeOrRemove(id, userId);
        return ResponseEntity.noContent().build();
    }

    /** The sharer's graph as the viewer may see it (plan §4 P4) — viewer-only, active share, else 404. */
    @GetMapping("/{id}/graph")
    public Graph graph(@PathVariable UUID id, @AuthenticationPrincipal UUID viewerId) {
        return graphService.buildShared(id, viewerId);
    }
}
