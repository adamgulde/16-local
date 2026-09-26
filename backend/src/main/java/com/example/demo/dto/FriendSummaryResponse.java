package com.example.demo.dto;

import com.example.demo.model.User;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Summary DTO for friends list queries, including calculated metrics like
 * connections count and mutual friends with the viewing user.
 * inviteCode (S4) is only ever populated when the subject is the viewer themself.
 */
public record FriendSummaryResponse(
        UUID id,
        String firstName,
        String lastName,
        String phoneNumber,
        String bio,
        List<UUID> relationships,
        String inviteCode,
        Boolean defaultUser,
        Instant createdAt,
        int connectionsCount,
        int mutualFriendsCount,
        boolean isConnectedToViewer
) {
    public static FriendSummaryResponse from(
            User user,
            List<UUID> relationships,
            boolean includePhoneNumber,
            boolean isOwner,
            int connectionsCount,
            int mutualFriendsCount,
            boolean isConnectedToViewer
    ) {
        return new FriendSummaryResponse(
                user.getId(),
                user.getFirstName(),
                user.getLastName(),
                includePhoneNumber ? user.getPhoneNumber() : null,
                user.getBio() == null ? "" : user.getBio(),
                relationships,
                isOwner ? user.getInviteCode() : null,
                user.isDefaultUser(),
                user.getCreatedAt(),
                connectionsCount,
                mutualFriendsCount,
                isConnectedToViewer
        );
    }
}
