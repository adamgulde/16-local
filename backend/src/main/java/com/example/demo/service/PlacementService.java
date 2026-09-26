package com.example.demo.service;

import com.example.demo.model.Neighborhood;
import com.example.demo.repository.NeighborhoodRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;

/**
 * Plan §4 P5: the global map is gone (no more {@code /api/map}, no Hilbert-curve placement) — but
 * {@code users.neighborhood_curve_index} is still {@code NOT NULL} until a later migration (V7)
 * drops it, so every new user still needs a {@link Neighborhood} row to point at. The simplest
 * thing that satisfies that constraint: everyone shares the same one "default" neighborhood,
 * created once (its {@code memberCount} is no longer meaningful and is left untouched).
 * {@code local_index}/{@code map_index}/{@code map_x}/{@code map_y} are nullable and are no longer
 * populated at all — nothing reads them any more.
 */
@Service
@RequiredArgsConstructor
public class PlacementService {

    private final NeighborhoodRepository neighborhoodRepository;

    @Transactional
    public Neighborhood defaultNeighborhood() {
        return neighborhoodRepository.findFirstByOrderByCurveIndexAsc()
                .orElseGet(() -> neighborhoodRepository.save(Neighborhood.builder()
                        .memberCount(0L)
                        .createdAt(Instant.now())
                        .build()));
    }
}
