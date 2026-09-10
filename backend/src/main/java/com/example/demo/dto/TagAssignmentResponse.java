package com.example.demo.dto;

import com.example.demo.model.UserTag;

import java.util.UUID;

/**
 * One tag as it should appear on a user's card: either a public self-tag (anyone can see it) or
 * a private tag the current viewer placed on this person themselves (isMine) — never a third
 * party's private tag, which this record's caller (TagService) never fetches in the first place.
 */
public record TagAssignmentResponse(UUID id, String category, String label, boolean isSelfTag, boolean isMine) {
    public static TagAssignmentResponse from(UserTag userTag, UUID viewerId) {
        boolean isSelfTag = userTag.getTagger().getId().equals(userTag.getSubject().getId());
        String category = userTag.getTag() != null ? userTag.getTag().getCategory() : "Custom";
        String label = userTag.getTag() != null ? userTag.getTag().getLabel() : userTag.getCustomLabel();
        return new TagAssignmentResponse(
                userTag.getId(), category, label, isSelfTag, userTag.getTagger().getId().equals(viewerId));
    }
}
