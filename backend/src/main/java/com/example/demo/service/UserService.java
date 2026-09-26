package com.example.demo.service;

import com.example.demo.dto.SearchMode;
import com.example.demo.dto.SearchResult;
import com.example.demo.dto.TagAssignmentResponse;
import com.example.demo.dto.UserResponse;
import com.example.demo.exception.NotFoundException;
import com.example.demo.model.User;
import com.example.demo.model.UserNote;
import com.example.demo.repository.UserNoteRepository;
import com.example.demo.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class UserService {

    private static final int SEARCH_RESULT_LIMIT = 20;
    private static final int TAG_SEARCH_RESULT_LIMIT = 200;

    private final UserRepository userRepository;
    private final ConnectionService connectionService;
    private final UserNoteRepository userNoteRepository;
    private final TagSearchService tagSearchService;
    private final TagService tagService;

    public User getUserById(UUID id) {
        return userRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("User not found: " + id));
    }

    /**
     * The whole directory for the graph, with tags and the requester's own notes included so
     * opening a card needs no further request. Phone numbers are only included for the
     * requester's own connections (or themselves).
     */
    @Transactional(readOnly = true)
    public List<UserResponse> getAllUsers(UUID requestingUserId) {
        List<User> users = userRepository.findAll();
        Map<UUID, List<UUID>> adjacency = connectionService.buildAdjacency();
        Map<UUID, List<TagAssignmentResponse>> tagsBySubject = tagService.getVisibleTagsBySubject(requestingUserId);
        Map<UUID, String> notesBySubject = requestingUserId == null ? Map.of()
                : userNoteRepository.findContentByAuthorId(requestingUserId).stream()
                        .collect(Collectors.toMap(UserNoteRepository.NoteContent::getSubjectId,
                                note -> Objects.requireNonNullElse(note.getContent(), "")));
        Set<UUID> myConnections = requestingUserId != null
                ? new HashSet<>(adjacency.getOrDefault(requestingUserId, List.of()))
                : Collections.emptySet();

        return users.stream()
                .map(user -> {
                    boolean isSelf = requestingUserId != null && user.getId().equals(requestingUserId);
                    boolean isConnection = requestingUserId != null && myConnections.contains(user.getId());
                    List<UUID> relationships = adjacency.getOrDefault(user.getId(), List.of());
                    List<TagAssignmentResponse> tags = tagsBySubject.getOrDefault(user.getId(), List.of());
                    String note = notesBySubject.getOrDefault(user.getId(), "");
                    return UserResponse.from(user, relationships, isSelf || isConnection, isSelf, tags, note);
                })
                .toList();
    }

    public UserResponse getPublicUserById(UUID targetId, UUID requestingUserId) {
        User targetUser = getUserById(targetId);
        return toResponse(targetUser, requestingUserId);
    }

    private UserResponse toResponse(User user, UUID requestingUserId) {
        boolean isSelf = user.getId().equals(requestingUserId);
        boolean isConnection = !isSelf && connectionService.areConnected(user.getId(), requestingUserId);
        List<UUID> relationships = connectionService.getNeighborIds(user.getId());
        List<TagAssignmentResponse> tags = tagService.getTagsForSubject(user.getId(), requestingUserId);
        String note = userNoteRepository.findByAuthorIdAndSubjectId(requestingUserId, user.getId())
                .map(UserNote::getContent).orElse("");
        return UserResponse.from(user, relationships, isSelf || isConnection, isSelf, tags, note);
    }

    /** Search one field at a time (see {@link SearchMode}); tag criteria are only read in TAGS mode. */
    @Transactional(readOnly = true)
    public List<SearchResult> searchUsers(SearchMode mode, String query, List<UUID> tagIds, List<String> labels,
                                          boolean matchAll, UUID requestingUserId) {
        String trimmed = query == null ? "" : query.trim();
        List<User> candidates = new ArrayList<>();

        switch (mode) {
            case NAMES -> {
                if (trimmed.isEmpty()) {
                    return List.of();
                }
                candidates.addAll(userRepository
                        .findByFirstNameContainingIgnoreCaseOrLastNameContainingIgnoreCase(trimmed, trimmed));
                String[] parts = trimmed.split("\\s+", 2);
                if (parts.length == 2) {
                    candidates.addAll(userRepository
                            .findByFirstNameContainingIgnoreCaseAndLastNameContainingIgnoreCase(parts[0], parts[1]));
                }
            }
            case BIOS -> {
                if (trimmed.isEmpty()) {
                    return List.of();
                }
                candidates.addAll(userRepository.findByBioContainingIgnoreCase(trimmed));
            }
            case NOTES -> {
                if (trimmed.isEmpty()) {
                    return List.of();
                }
                userNoteRepository.findByAuthorIdAndContentContainingIgnoreCase(requestingUserId, trimmed)
                        .forEach(note -> candidates.add(note.getSubject()));
            }
            case TAGS -> {
                // Tag results drive graph highlighting, so return more of them and skip the
                // per-result connection lists (N extra queries each) that nothing reads here.
                return tagSearchService.findUsers(
                                tagIds == null ? List.of() : tagIds,
                                labels == null ? List.of() : labels,
                                matchAll, requestingUserId).stream()
                        .limit(TAG_SEARCH_RESULT_LIMIT)
                        .map(user -> new SearchResult(toResponse(user, requestingUserId), List.of()))
                        .toList();
            }
        }

        return candidates.stream()
                .distinct()
                .limit(SEARCH_RESULT_LIMIT)
                .map(user -> toSearchResult(user, requestingUserId))
                .toList();
    }

    private SearchResult toSearchResult(User user, UUID requestingUserId) {
        UserResponse matchedUser = getPublicUserById(user.getId(), requestingUserId);
        List<UserResponse> connections = connectionService.getNeighborIds(user.getId()).stream()
                .map(neighborId -> getPublicUserById(neighborId, requestingUserId))
                .toList();
        return new SearchResult(matchedUser, connections);
    }

    public User updateUser(UUID id, User userDetails) {
        User user = getUserById(id);
        user.setFirstName(userDetails.getFirstName());
        user.setLastName(userDetails.getLastName());
        user.setPhoneNumber(userDetails.getPhoneNumber());
        return userRepository.save(user);
    }

    public void updateBio(UUID id, String bio) {
        User user = getUserById(id);
        user.setBio(bio);
        userRepository.save(user);
    }

    public void deleteUser(UUID id) {
        userRepository.deleteById(id);
    }

    public void updateMaxConnectionDegree(UUID id, Integer maxDegree) {
        User user = getUserById(id);
        user.setMaxConnectionDegree(maxDegree);
        userRepository.save(user);
    }

    public long countUsers() {
        return userRepository.count();
    }
}
