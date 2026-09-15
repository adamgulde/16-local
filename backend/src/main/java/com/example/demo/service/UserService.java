package com.example.demo.service;

import com.example.demo.dto.SearchResult;
import com.example.demo.dto.UserResponse;
import com.example.demo.exception.NotFoundException;
import com.example.demo.model.User;
import com.example.demo.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class UserService {

    private static final int SEARCH_RESULT_LIMIT = 20;

    private final UserRepository userRepository;
    private final ConnectionService connectionService;
    private final com.example.demo.repository.UserTagRepository userTagRepository;

    public User getUserById(UUID id) {
        return userRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("User not found: " + id));
    }

    /** List view: phone numbers are only included for the requester's own connections (or themselves). */
    @Transactional(readOnly = true)
    public List<UserResponse> getAllUsers(UUID requestingUserId) {
        List<User> users = userRepository.findAll();
        Map<UUID, List<UUID>> adjacency = connectionService.buildAdjacency();
        Set<UUID> myConnections = requestingUserId != null
                ? new HashSet<>(adjacency.getOrDefault(requestingUserId, List.of()))
                : Collections.emptySet();

        return users.stream()
                .map(user -> {
                    boolean isSelf = requestingUserId != null && user.getId().equals(requestingUserId);
                    boolean isConnection = requestingUserId != null && myConnections.contains(user.getId());
                    List<UUID> relationships = adjacency.getOrDefault(user.getId(), List.of());
                    return UserResponse.from(user, relationships, isSelf || isConnection);
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
        return UserResponse.from(user, relationships, isSelf || isConnection);
    }

    public List<SearchResult> searchUsers(String query, UUID requestingUserId) {
        return searchUsers(query, true, true, requestingUserId);
    }

    /**
     * Search over names and/or tags according to options.
     */
    public List<SearchResult> searchUsers(String query, boolean searchNames, boolean searchTags, UUID requestingUserId) {
        if (query == null || query.isBlank() || (!searchNames && !searchTags)) {
            return List.of();
        }
        String trimmed = query.trim();
        List<User> candidates = new ArrayList<>();

        if (searchNames) {
            candidates.addAll(userRepository
                    .findByFirstNameContainingIgnoreCaseOrLastNameContainingIgnoreCase(trimmed, trimmed));

            String[] parts = trimmed.split("\\s+", 2);
            if (parts.length == 2) {
                candidates.addAll(userRepository
                        .findByFirstNameContainingIgnoreCaseAndLastNameContainingIgnoreCase(parts[0], parts[1]));
            }
        }

        if (searchTags) {
            candidates.addAll(userTagRepository.findSubjectsByTagQuery(trimmed, requestingUserId));
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
