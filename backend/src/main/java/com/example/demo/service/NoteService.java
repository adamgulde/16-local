package com.example.demo.service;

import com.example.demo.model.User;
import com.example.demo.model.UserNote;
import com.example.demo.repository.UserNoteRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.UUID;

/**
 * A private note per (author, subject) pair, edited in place. There is deliberately no method
 * here that takes an arbitrary author id from a caller other than the authenticated principal —
 * every entry point threads authorId in from {@code @AuthenticationPrincipal}, so there's no way
 * to fetch or overwrite someone else's note even by mistake.
 */
@Service
@RequiredArgsConstructor
public class NoteService {

    private final UserNoteRepository userNoteRepository;
    private final UserService userService;

    public String getNote(UUID authorId, UUID subjectId) {
        return userNoteRepository.findByAuthorIdAndSubjectId(authorId, subjectId)
                .map(UserNote::getContent)
                .orElse("");
    }

    public void upsertNote(UUID authorId, UUID subjectId, String content) {
        UserNote note = userNoteRepository.findByAuthorIdAndSubjectId(authorId, subjectId)
                .orElseGet(() -> {
                    User author = userService.getUserById(authorId);
                    User subject = userService.getUserById(subjectId);
                    return UserNote.builder().author(author).subject(subject).build();
                });
        note.setContent(content);
        userNoteRepository.save(note);
    }
}
