package com.example.demo.dto;

import java.util.UUID;

/**
 * A minimal placeholder for a connected/pending-connected user whose own position falls
 * outside the requested viewport box, so the client can still draw an edge line out to
 * their position without a full profile fetch.
 */
public record MapUserStub(
        UUID id,
        Long mapX,
        Long mapY,
        Long localIndex,
        Long founderMapX,
        Long founderMapY
) {
}
