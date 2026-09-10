package com.example.demo.service;

import com.example.demo.model.User;
import com.example.demo.model.UserNote;
import com.example.demo.repository.UserNoteRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class NoteServiceTest {

    @Mock
    private UserNoteRepository userNoteRepository;
    @Mock
    private UserService userService;

    private NoteService noteService;

    private final UUID authorId = UUID.randomUUID();
    private final UUID subjectId = UUID.randomUUID();

    @Test
    void getNoteReturnsEmptyStringWhenNoneWrittenYet() {
        noteService = new NoteService(userNoteRepository, userService);
        when(userNoteRepository.findByAuthorIdAndSubjectId(authorId, subjectId)).thenReturn(Optional.empty());

        assertThat(noteService.getNote(authorId, subjectId)).isEmpty();
    }

    @Test
    void getNoteReturnsTheExistingContent() {
        noteService = new NoteService(userNoteRepository, userService);
        when(userNoteRepository.findByAuthorIdAndSubjectId(authorId, subjectId))
                .thenReturn(Optional.of(UserNote.builder().content("met at the conference").build()));

        assertThat(noteService.getNote(authorId, subjectId)).isEqualTo("met at the conference");
    }

    @Test
    void upsertNoteCreatesANewRowWhenNoneExists() {
        noteService = new NoteService(userNoteRepository, userService);
        when(userNoteRepository.findByAuthorIdAndSubjectId(authorId, subjectId)).thenReturn(Optional.empty());
        when(userService.getUserById(authorId)).thenReturn(User.builder().id(authorId).build());
        when(userService.getUserById(subjectId)).thenReturn(User.builder().id(subjectId).build());

        noteService.upsertNote(authorId, subjectId, "first note");

        ArgumentCaptor<UserNote> captor = ArgumentCaptor.forClass(UserNote.class);
        verify(userNoteRepository).save(captor.capture());
        assertThat(captor.getValue().getAuthor().getId()).isEqualTo(authorId);
        assertThat(captor.getValue().getSubject().getId()).isEqualTo(subjectId);
        assertThat(captor.getValue().getContent()).isEqualTo("first note");
    }

    @Test
    void upsertNoteEditsTheExistingRowInPlaceRatherThanCreatingASecondOne() {
        noteService = new NoteService(userNoteRepository, userService);
        UserNote existing = UserNote.builder().id(UUID.randomUUID()).content("old content").build();
        when(userNoteRepository.findByAuthorIdAndSubjectId(authorId, subjectId)).thenReturn(Optional.of(existing));

        noteService.upsertNote(authorId, subjectId, "updated content");

        verify(userService, never()).getUserById(any());
        ArgumentCaptor<UserNote> captor = ArgumentCaptor.forClass(UserNote.class);
        verify(userNoteRepository).save(captor.capture());
        assertThat(captor.getValue().getId()).isEqualTo(existing.getId());
        assertThat(captor.getValue().getContent()).isEqualTo("updated content");
    }
}
