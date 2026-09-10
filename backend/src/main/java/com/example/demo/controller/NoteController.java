package com.example.demo.controller;

import com.example.demo.dto.NoteResponse;
import com.example.demo.service.NoteService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/users/{id}/notes")
@RequiredArgsConstructor
public class NoteController {

    private final NoteService noteService;

    /** The caller's own note about this user — never anyone else's. */
    @GetMapping
    public NoteResponse getNote(@PathVariable UUID id, @AuthenticationPrincipal UUID authorId) {
        return new NoteResponse(noteService.getNote(authorId, id));
    }

    @PutMapping
    public ResponseEntity<Void> upsertNote(@PathVariable UUID id, @RequestBody Map<String, String> body,
                                            @AuthenticationPrincipal UUID authorId) {
        noteService.upsertNote(authorId, id, body.getOrDefault("content", ""));
        return ResponseEntity.noContent().build();
    }
}
