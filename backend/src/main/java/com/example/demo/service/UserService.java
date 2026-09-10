package com.example.demo.service;

import com.example.demo.dto.SearchResult;
import com.example.demo.dto.UserResponse;
import com.example.demo.exception.NotFoundException;
import com.example.demo.model.User;
import com.example.demo.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class UserService {

    private static final int SEARCH_RESULT_LIMIT = 20;

    private final UserRepository userRepository;
    private final ConnectionService connectionService;

    public User getUserById(UUID id) {
        return userRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("User not found: " + id));
    }

    /** List view: phone numbers are only included for the requester's own connections (or themselves). */
    public List<UserResponse> getAllUsers(UUID requestingUserId) {
        return userRepository.findAll().stream()
                .map(user -> toResponse(user, requestingUserId))
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

    /**
     * Case-insensitive search over first name, last name, or "first last"
     * concatenation. Each hit comes back with its own direct connections so
     * the frontend can render a small neighborhood around it without a
     * separate round-trip.
     */
    public List<SearchResult> searchUsers(String query, UUID requestingUserId) {
        if (query == null || query.isBlank()) {
            return List.of();
        }
        String trimmed = query.trim();

        List<User> candidates = new ArrayList<>(userRepository
                .findByFirstNameContainingIgnoreCaseOrLastNameContainingIgnoreCase(trimmed, trimmed));

        String[] parts = trimmed.split("\\s+", 2);
        if (parts.length == 2) {
            candidates.addAll(userRepository
                    .findByFirstNameContainingIgnoreCaseAndLastNameContainingIgnoreCase(parts[0], parts[1]));
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

    public long countUsers() {
        return userRepository.count();
    }
}
