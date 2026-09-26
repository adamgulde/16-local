package com.example.demo.dto;

import com.example.demo.model.User;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Public-facing view of a User. phoneNumber is null unless the caller is
 * allowed to see it (self, or an existing connection) — decided server-side
 * by the caller of {@link #from}, never by a client-supplied flag.
 * tags are what the caller may see on this user (public self-tags plus the
 * caller's own private tags) and note is the caller's own private note on them
 * ("" if none). Both are null where they aren't loaded (auth responses, which
 * the client keeps as a long-lived session snapshot).
 * inviteCode (S4) is only ever populated for the user's own account — every
 * other subject sees null, never their invite code.
 */
public record UserResponse(
        UUID id,
        String firstName,
        String lastName,
        String phoneNumber,
        String bio,
        List<UUID> relationships,
        String inviteCode,
        Integer maxConnectionDegree,
        Boolean defaultUser,
        Instant createdAt,
        List<TagAssignmentResponse> tags,
        String note
) {
    /** Used only where the subject is always the caller themself (auth responses). */
    public static UserResponse from(User user, List<UUID> relationships, boolean includePhoneNumber) {
        return from(user, relationships, includePhoneNumber, true, null, null);
    }

    public static UserResponse from(User user, List<UUID> relationships, boolean includePhoneNumber,
                                    boolean isOwner, List<TagAssignmentResponse> tags, String note) {
        return new UserResponse(
                user.getId(),
                user.getFirstName(),
                user.getLastName(),
                includePhoneNumber ? user.getPhoneNumber() : null,
                user.getBio() == null ? "" : user.getBio(),
                relationships,
                isOwner ? user.getInviteCode() : null,
                user.getMaxConnectionDegree(),
                user.isDefaultUser(),
                user.getCreatedAt(),
                tags,
                note
        );
    }
}
