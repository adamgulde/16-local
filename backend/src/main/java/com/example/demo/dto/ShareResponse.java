package com.example.demo.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Plan §3's {@code Share} DTO. {@code hiddenContactIds}/{@code lockedContactIds} are sharer-only —
 * null when this response is built for the viewer's side ({@code sharedWithMe}).
 */
public record ShareResponse(
        UUID id,
        UUID sharerUserId,
        String sharerName,
        UUID viewerUserId,
        String viewerName,
        boolean shareAbout,
        boolean shareTags,
        boolean shareNotes,
        boolean sharePhone,
        List<UUID> hiddenContactIds,
        List<UUID> lockedContactIds,
        Instant createdAt
) {
}
