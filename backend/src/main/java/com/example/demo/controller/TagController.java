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

    /** The caller's own self-tags (public profile tags) — plan §3's `/api/users/me/tags`. */
    @GetMapping("/api/users/me/tags")
    public List<TagAssignmentResponse> getMyTags(@AuthenticationPrincipal UUID userId) {
        return tagService.getTagsForSubject(userId, userId);
    }

    @PostMapping("/api/users/me/tags")
    public List<TagAssignmentResponse> addMyTag(@RequestBody AddTagRequest request, @AuthenticationPrincipal UUID userId) {
        tagService.addTag(userId, userId, request.tagId(), request.customLabel(), request.parentTagId());
        return tagService.getTagsForSubject(userId, userId);
    }

    @DeleteMapping("/api/users/me/tags/{assignmentId}")
    public ResponseEntity<Void> removeMyTag(@PathVariable UUID assignmentId, @AuthenticationPrincipal UUID userId) {
        tagService.removeTag(assignmentId, userId);
        return ResponseEntity.noContent().build();
    }

    // Plan §4 P5: GET/POST/DELETE /api/users/{id}/tags for a non-self subject are removed — tags on
    // someone else now live on that person's *contact* (ContactController/ContactTagService); this
    // controller only ever tags the caller's own public profile now.
}
