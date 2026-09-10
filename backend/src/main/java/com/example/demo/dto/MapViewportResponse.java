package com.example.demo.dto;

import java.util.List;

/**
 * Response for GET /api/map/viewport. Exactly one of the two shapes is populated,
 * depending on the requested zoom level:
 * <ul>
 *   <li>Zoomed in (>= MapService.NEIGHBORHOOD_ZOOM_THRESHOLD): {@code users},
 *       {@code offViewportStubs} and {@code edges} are populated, {@code neighborhoods}
 *       is empty.</li>
 *   <li>Zoomed out (< MapService.NEIGHBORHOOD_ZOOM_THRESHOLD): {@code neighborhoods} is
 *       populated, the other three are empty.</li>
 * </ul>
 */
public record MapViewportResponse(
        List<MapUserMarker> users,
        List<MapUserStub> offViewportStubs,
        List<MapNeighborhoodMarker> neighborhoods,
        List<MapEdge> edges
) {
}
