package com.example.demo.service;

import com.example.demo.dto.UserResponse;
import com.example.demo.exception.BadRequestException;
import com.example.demo.exception.NotFoundException;
import com.example.demo.model.User;
import com.example.demo.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.UUID;

@Service
@RequiredArgsConstructor
public class UserService {

    private static final int MAX_NAME_LENGTH = 100;
    /** users.bio is VARCHAR(2000) — kept in step with that column, not the 10k text-field cap. */
    private static final int MAX_BIO_LENGTH = 2000;

    private final UserRepository userRepository;

    public User getUserById(UUID id) {
        return userRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("User not found: " + id));
    }

    /** Plan §4 P5: there is no more global directory — a caller may only ever look themselves up this way. */
    public UserResponse getPublicUserById(UUID targetId, UUID requestingUserId) {
        User targetUser = getUserById(targetId);
        boolean isSelf = targetUser.getId().equals(requestingUserId);
        return UserResponse.from(targetUser, isSelf, isSelf);
    }

    /**
     * PATCH /api/users/me: partial update — only fields the caller actually sent are applied.
     * Deliberately has no {@code phoneNumber} parameter at all: changing the phone requires
     * re-proving ownership via OTP (the signup/register flow), never a bare field edit — see the
     * fix-up note on {@link com.example.demo.controller.UserController}.
     */
    public void updateSelfProfile(UUID id, String firstName, String lastName, String bio) {
        User user = getUserById(id);
        if (firstName != null) {
            String trimmed = firstName.trim();
            if (trimmed.isEmpty()) {
                throw new BadRequestException("First name is required");
            }
            if (trimmed.length() > MAX_NAME_LENGTH) {
                throw new BadRequestException("First name must be " + MAX_NAME_LENGTH + " characters or fewer");
            }
            user.setFirstName(trimmed);
        }
        if (lastName != null) {
            String trimmed = lastName.trim();
            if (trimmed.length() > MAX_NAME_LENGTH) {
                throw new BadRequestException("Last name must be " + MAX_NAME_LENGTH + " characters or fewer");
            }
            user.setLastName(trimmed);
        }
        if (bio != null) {
            if (bio.length() > MAX_BIO_LENGTH) {
                throw new BadRequestException("Bio must be " + MAX_BIO_LENGTH + " characters or fewer");
            }
            user.setBio(bio);
        }
        userRepository.save(user);
    }

    /** PUT /api/users/me/privacy (plan §1.5): whether this user's registered contacts of others may show them by name. */
    public void updateDiscoverableInSharedGraphs(UUID id, boolean discoverable) {
        User user = getUserById(id);
        user.setDiscoverableInSharedGraphs(discoverable);
        userRepository.save(user);
    }

    public void deleteUser(UUID id) {
        userRepository.deleteById(id);
    }
}
