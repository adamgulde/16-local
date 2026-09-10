package com.example.demo.controller;

import com.example.demo.dto.MapViewportResponse;
import com.example.demo.service.MapService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/map")
@RequiredArgsConstructor
public class MapController {

    private final MapService mapService;

    /**
     * Returns everything visible in the given map box at the given zoom level. Below
     * MapService.NEIGHBORHOOD_ZOOM_THRESHOLD this returns one aggregate marker per
     * neighborhood; at or above it, individual user markers (with off-viewport stubs
     * for their connections) plus the edges between them.
     */
    @GetMapping("/viewport")
    public MapViewportResponse getViewport(@RequestParam long minX,
                                            @RequestParam long minY,
                                            @RequestParam long maxX,
                                            @RequestParam long maxY,
                                            @RequestParam int zoom,
                                            @AuthenticationPrincipal UUID requestingUserId) {
        return mapService.getViewport(minX, minY, maxX, maxY, zoom, requestingUserId);
    }
}
