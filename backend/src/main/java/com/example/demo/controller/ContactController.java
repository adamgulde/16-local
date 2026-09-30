package com.example.demo.controller;

import com.example.demo.dto.AddTagRequest;
import com.example.demo.dto.ContactImportRequest;
import com.example.demo.dto.ContactImportResponse;
import com.example.demo.dto.ContactLinkRequest;
import com.example.demo.dto.ContactRequest;
import com.example.demo.dto.GraphNode;
import com.example.demo.dto.TagAssignmentResponse;
import com.example.demo.service.ContactService;
import com.example.demo.service.ContactTagService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Plan §4 P2 — a user's private contacts (nodes in their own graph), links between them, notes and tags. */
@RestController
@RequestMapping("/api/contacts")
@RequiredArgsConstructor
public class ContactController {

    private final ContactService contactService;
    private final ContactTagService contactTagService;

    @PostMapping
    public GraphNode createContact(@RequestBody ContactRequest request, @AuthenticationPrincipal UUID ownerId) {
        return contactService.createContact(ownerId, request);
    }

    /** Bulk-creates placeholders from the user's address book (device contacts, vCard or CSV). */
    @PostMapping("/import")
    public ContactImportResponse importContacts(@RequestBody ContactImportRequest request,
                                                @AuthenticationPrincipal UUID ownerId) {
        return contactService.importContacts(ownerId, request);
    }

    @PatchMapping("/{id}")
    public GraphNode patchContact(@PathVariable UUID id, @RequestBody ContactRequest request,
                                   @AuthenticationPrincipal UUID ownerId) {
        return contactService.patchContact(id, ownerId, request);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteContact(@PathVariable UUID id, @AuthenticationPrincipal UUID ownerId) {
        contactService.deleteContact(id, ownerId);
        return ResponseEntity.noContent().build();
    }

    @PutMapping("/{id}/note")
    public ResponseEntity<Void> upsertNote(@PathVariable UUID id, @RequestBody Map<String, String> body,
                                            @AuthenticationPrincipal UUID ownerId) {
        contactService.upsertNote(id, ownerId, body.getOrDefault("content", ""));
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/{id}/tags")
    public List<TagAssignmentResponse> getTags(@PathVariable UUID id, @AuthenticationPrincipal UUID ownerId) {
        return contactTagService.getTagsForContact(id, ownerId);
    }

    @PostMapping("/{id}/tags")
    public List<TagAssignmentResponse> addTag(@PathVariable UUID id, @RequestBody AddTagRequest request,
                                               @AuthenticationPrincipal UUID ownerId) {
        return contactTagService.addTag(id, ownerId, request.tagId(), request.customLabel(), request.parentTagId());
    }

    @DeleteMapping("/{id}/tags/{assignmentId}")
    public ResponseEntity<Void> removeTag(@PathVariable UUID id, @PathVariable UUID assignmentId,
                                           @AuthenticationPrincipal UUID ownerId) {
        contactTagService.removeTag(id, assignmentId, ownerId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/links")
    public ResponseEntity<Void> link(@RequestBody ContactLinkRequest request, @AuthenticationPrincipal UUID ownerId) {
        contactService.link(ownerId, request.a(), request.b());
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/links")
    public ResponseEntity<Void> unlink(@RequestBody ContactLinkRequest request, @AuthenticationPrincipal UUID ownerId) {
        contactService.unlink(ownerId, request.a(), request.b());
        return ResponseEntity.noContent().build();
    }
}
