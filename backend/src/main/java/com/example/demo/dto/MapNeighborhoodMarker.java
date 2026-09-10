package com.example.demo.dto;

/**
 * An aggregate marker representing an entire neighborhood, returned when the viewport is
 * zoomed out far enough that individual users are no longer meaningful. mapX/mapY are the
 * neighborhood's centroid, decoded from its own curveIndex and expressed in the same
 * combined-order coordinate units individual users' mapX/mapY use.
 */
public record MapNeighborhoodMarker(
        Long neighborhoodId,
        Long mapX,
        Long mapY,
        Long memberCount
) {
}
