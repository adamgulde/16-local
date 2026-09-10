package com.example.demo.dto;

import java.util.UUID;

/**
 * A fully-rendered user marker on the map, returned when the viewport is zoomed in enough
 * to show individuals. phoneNumber follows the same redaction rule as everywhere else
 * (null unless the caller is the user themselves or a confirmed connection).
 */
public record MapUserMarker(
        UUID id,
        String firstName,
        String lastName,
        String phoneNumber,
        Long mapX,
        Long mapY,
        Long localIndex,
        Long founderMapX,
        Long founderMapY
) {
}
