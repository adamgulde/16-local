package com.example.demo.dto;

import java.util.UUID;

/**
 * A line to draw between two users on the map: either a confirmed Connection
 * (pending = false) or a still-outstanding ConnectionRequest (pending = true).
 */
public record MapEdge(
        UUID sourceId,
        UUID targetId,
        boolean pending
) {
}
