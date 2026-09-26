package com.example.demo.controller;

import com.example.demo.dto.AddTagRequest;
import com.example.demo.dto.TagAssignmentResponse;
import com.example.demo.dto.TagResponse;
import com.example.demo.service.TagService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequiredArgsConstructor
public class TagController {

    private final TagService tagService;

    /** The whole tag tree, depth-first — the menu self-tagging (and tagging others) draws from. */
    @GetMapping("/api/tags")
    public List<TagResponse> getAllTags() {
        return tagService.getAllTags();
    }

    /** Public self-tags on this user, plus (only) the caller's own private tags on them. */
    @GetMapping("/api/users/{id}/tags")
    public List<TagAssignmentResponse> getTagsForUser(@PathVariable UUID id, @AuthenticationPrincipal UUID viewerId) {
        return tagService.getTagsForSubject(id, viewerId);
    }

    /**
     * Returns the subject's tags as the caller now sees them, not just the new one: picking in a
     * single-select group (age range, gender) also removes the previous pick.
     */
    @PostMapping("/api/users/{id}/tags")
    public List<TagAssignmentResponse> addTag(@PathVariable UUID id, @RequestBody AddTagRequest request,
                                               @AuthenticationPrincipal UUID taggerId) {
        tagService.addTag(id, taggerId, request.tagId(), request.customLabel(), request.parentTagId());
        return tagService.getTagsForSubject(id, taggerId);
    }

    @DeleteMapping("/api/users/{id}/tags/{assignmentId}")
    public ResponseEntity<Void> removeTag(@PathVariable UUID id, @PathVariable UUID assignmentId,
                                           @AuthenticationPrincipal UUID requestingUserId) {
        tagService.removeTag(assignmentId, requestingUserId);
        return ResponseEntity.noContent().build();
    }
}
