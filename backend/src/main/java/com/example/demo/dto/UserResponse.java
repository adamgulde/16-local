package com.example.demo.dto;

import com.example.demo.model.User;

import java.util.List;
import java.util.UUID;

/**
 * Public-facing view of a User. phoneNumber is null unless the caller is
 * allowed to see it (self, or an existing connection) — decided server-side
 * by the caller of {@link #from}, never by a client-supplied flag.
 */
public record UserResponse(
        UUID id,
        String firstName,
        String lastName,
        String phoneNumber,
        String bio,
        List<UUID> relationships
) {
    public static UserResponse from(User user, List<UUID> relationships, boolean includePhoneNumber) {
        return new UserResponse(
                user.getId(),
                user.getFirstName(),
                user.getLastName(),
                includePhoneNumber ? user.getPhoneNumber() : null,
                user.getBio() == null ? "" : user.getBio(),
                relationships
        );
    }
}
