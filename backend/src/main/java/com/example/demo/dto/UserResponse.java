package com.example.demo.dto;

import com.example.demo.model.User;

import java.time.Instant;
import java.util.UUID;

/**
 * Public-facing view of a User. phoneNumber is null unless the caller is the user themselves —
 * there is no more "connection" concept globally (plan §4 P5): a linked user's phone, when it's
 * ever shown to someone else at all, comes from graph composition (P4's {@code GraphNode}), never
 * from this DTO. inviteCode (S4) is only ever populated for the user's own account — every other
 * subject sees null, never their invite code. discoverableInSharedGraphs (plan §1.5) is likewise
 * only ever populated for the owner — it isn't anyone else's business whether a third party has
 * opted into being shown by name in someone else's shared graph.
 */
public record UserResponse(
        UUID id,
        String firstName,
        String lastName,
        String phoneNumber,
        String bio,
        String inviteCode,
        Instant createdAt,
        Boolean discoverableInSharedGraphs
) {
    /** Used only where the subject is always the caller themself (auth responses, GET/PATCH /api/users/me). */
    public static UserResponse from(User user, boolean includePhoneNumber) {
        return from(user, includePhoneNumber, true);
    }

    public static UserResponse from(User user, boolean includePhoneNumber, boolean isOwner) {
        return new UserResponse(
                user.getId(),
                user.getFirstName(),
                user.getLastName(),
                includePhoneNumber ? user.getPhoneNumber() : null,
                user.getBio() == null ? "" : user.getBio(),
                isOwner ? user.getInviteCode() : null,
                user.getCreatedAt(),
                isOwner ? user.isDiscoverableInSharedGraphs() : null
        );
    }
}
