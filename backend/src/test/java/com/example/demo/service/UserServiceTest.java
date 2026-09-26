package com.example.demo.service;

import com.example.demo.dto.TagAssignmentResponse;
import com.example.demo.dto.UserResponse;
import com.example.demo.model.User;
import com.example.demo.repository.UserNoteRepository;
import com.example.demo.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class UserServiceTest {

    @Mock
    private UserRepository userRepository;
    @Mock
    private ConnectionService connectionService;
    @Mock
    private UserNoteRepository userNoteRepository;
    @Mock
    private TagSearchService tagSearchService;
    @Mock
    private TagService tagService;

    @Test
    void directoryCarriesEachPersonsTagsAndTheViewersOwnNotes() {
        UUID viewerId = UUID.randomUUID();
        UUID friendId = UUID.randomUUID();
        UUID strangerId = UUID.randomUUID();
        List<User> users = List.of(
                User.builder().id(viewerId).firstName("Avery").build(),
                User.builder().id(friendId).firstName("Marcus").build(),
                User.builder().id(strangerId).firstName("Priya").build());
        TagAssignmentResponse jazz = new TagAssignmentResponse(UUID.randomUUID(), "Personal Interests", "Jazz",
                true, false, TagAssignmentResponse.Kind.SELF, UUID.randomUUID(), null, 3, "heart",
                "Personal Interests › Music › Jazz");
        when(userRepository.findAll()).thenReturn(users);
        when(connectionService.buildAdjacency()).thenReturn(Map.of(viewerId, List.of(friendId), friendId, List.of(viewerId)));
        when(tagService.getVisibleTagsBySubject(viewerId)).thenReturn(Map.of(friendId, List.of(jazz)));
        when(userNoteRepository.findContentByAuthorId(viewerId)).thenReturn(List.of(note(friendId, "Met at SXSW")));
        UserService userService = new UserService(userRepository, connectionService, userNoteRepository,
                tagSearchService, tagService);

        Map<UUID, UserResponse> byId = userService.getAllUsers(viewerId).stream()
                .collect(Collectors.toMap(UserResponse::id, Function.identity()));

        assertThat(byId.get(friendId).tags()).containsExactly(jazz);
        assertThat(byId.get(friendId).note()).isEqualTo("Met at SXSW");
        assertThat(byId.get(strangerId).tags()).isEmpty();
        assertThat(byId.get(strangerId).note()).isEmpty();
    }

    private static UserNoteRepository.NoteContent note(UUID subjectId, String content) {
        return new UserNoteRepository.NoteContent() {
            @Override
            public UUID getSubjectId() {
                return subjectId;
            }

            @Override
            public String getContent() {
                return content;
            }
        };
    }
}
