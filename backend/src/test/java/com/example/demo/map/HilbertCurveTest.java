package com.example.demo.map;

import org.junit.jupiter.api.Test;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

class HilbertCurveTest {

    @Test
    void roundTripsEveryPointAtSmallOrder() {
        int order = 6; // 64x64 grid, 4096 points — small enough to check exhaustively
        long side = 1L << order;
        Set<Long> seenIndices = new HashSet<>();

        for (long x = 0; x < side; x++) {
            for (long y = 0; y < side; y++) {
                long index = HilbertCurve.xy2d(order, x, y);
                long[] decoded = HilbertCurve.d2xy(order, index);

                assertThat(decoded).containsExactly(x, y);
                assertThat(seenIndices.add(index)).as("index %d reused", index).isTrue();
            }
        }
        assertThat(seenIndices).hasSize((int) (side * side));
    }

    @Test
    void consecutiveIndicesAreAlwaysSpatiallyAdjacent() {
        int order = 5;
        long side = 1L << order;
        long total = side * side;

        long[] prev = HilbertCurve.d2xy(order, 0);
        for (long d = 1; d < total; d++) {
            long[] curr = HilbertCurve.d2xy(order, d);
            long manhattan = Math.abs(curr[0] - prev[0]) + Math.abs(curr[1] - prev[1]);
            assertThat(manhattan).as("jump at index %d", d).isEqualTo(1);
            prev = curr;
        }
    }

    @Test
    void concatenatingTwoOrdersMatchesOneCombinedOrder() {
        // The core trick the whole placement scheme relies on: a coarse-order index in the
        // high bits + a fine-order index in the low bits, decoded at the combined order,
        // must equal the coarse cell's origin (scaled up) plus the fine offset.
        int coarseOrder = 3;
        int localOrder = 4;
        long coarseX = 5, coarseY = 2;
        long localX = 9, localY = 3;

        long coarseIndex = HilbertCurve.xy2d(coarseOrder, coarseX, coarseY);
        long localIndex = HilbertCurve.xy2d(localOrder, localX, localY);
        long combinedIndex = (coarseIndex << (2 * localOrder)) | localIndex;

        long[] combinedXY = HilbertCurve.d2xy(coarseOrder + localOrder, combinedIndex);

        long expectedX = coarseX * (1L << localOrder) + localX;
        long expectedY = coarseY * (1L << localOrder) + localY;

        assertThat(combinedXY).containsExactly(expectedX, expectedY);
    }

    @Test
    void founderPositionMatchesActualCombinedOrderPlacement() {
        int neighborhoodOrder = 4;
        int localOrder = 3;
        for (long curveIndex = 0; curveIndex < 30; curveIndex++) {
            long[] actual = HilbertCurve.founderPosition(neighborhoodOrder, localOrder, curveIndex);
            // The founder always sits at localIndex 0, i.e. exactly what PlacementService
            // itself decodes for (curveIndex << local bits) | 0 at the combined order — this
            // is the ground truth founderPosition must match.
            long[] expected = HilbertCurve.d2xy(neighborhoodOrder + localOrder, curveIndex << (2 * localOrder));
            assertThat(actual).as("curveIndex %d", curveIndex).containsExactly(expected);
        }
    }

    @Test
    void founderPositionIsNotTheNaiveNeighborhoodOrderShortcut() {
        // Regression guard: an earlier version computed founderPosition by decoding curveIndex
        // alone at the smaller neighborhood order and scaling the result up by 2^localOrder,
        // reasoning the neighborhood-order curve's traversal is "the same, just scaled" as the
        // combined curve's coarse bits. That's wrong — rotate()'s reflection branch has a
        // constant "-1" term that doesn't scale with the block size, so the shortcut only
        // coincidentally matches for the first few curveIndex values (before any reflection)
        // and silently diverges afterward. This asserts at least one curveIndex in a small
        // range exposes that divergence, so a future refactor back toward the shortcut fails
        // loudly instead of silently misplacing higher-curveIndex founders (as it did for real
        // seed data — confirmed against a live database where curveIndex 3's actual founder
        // sat nowhere near what the shortcut produced).
        int neighborhoodOrder = 4;
        int localOrder = 3;
        boolean anyDivergence = false;
        for (long curveIndex = 0; curveIndex < 30; curveIndex++) {
            long[] correct = HilbertCurve.founderPosition(neighborhoodOrder, localOrder, curveIndex);
            long[] shortcutXY = HilbertCurve.d2xy(neighborhoodOrder, curveIndex);
            long[] shortcut = {shortcutXY[0] << localOrder, shortcutXY[1] << localOrder};
            if (correct[0] != shortcut[0] || correct[1] != shortcut[1]) {
                anyDivergence = true;
                break;
            }
        }
        assertThat(anyDivergence).as("expected the naive shortcut to diverge for some curveIndex").isTrue();
    }

    @Test
    void rangesForBoxCoverExactlyTheRequestedPoints() {
        int order = 5;
        long minX = 3, minY = 4, maxX = 9, maxY = 12;

        List<long[]> ranges = HilbertCurve.rangesForBox(order, minX, minY, maxX, maxY);

        Set<Long> covered = new HashSet<>();
        for (long[] range : ranges) {
            for (long d = range[0]; d <= range[1]; d++) {
                assertThat(covered.add(d)).as("index %d covered by overlapping ranges", d).isTrue();
            }
        }

        Set<Long> expected = new HashSet<>();
        for (long x = minX; x <= maxX; x++) {
            for (long y = minY; y <= maxY; y++) {
                expected.add(HilbertCurve.xy2d(order, x, y));
            }
        }

        assertThat(covered).isEqualTo(expected);
    }
}
