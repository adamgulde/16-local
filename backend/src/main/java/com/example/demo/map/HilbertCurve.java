package com.example.demo.map;

import java.util.ArrayList;
import java.util.List;

/**
 * Standard Hilbert space-filling curve, generalized to work at any "order" (the grid is
 * 2^order by 2^order; the linear index ranges over [0, 4^order)).
 *
 * This is deliberately the ONLY curve implementation in the app. A user's map position is
 * placed on a single combined-order curve where a neighborhood's index occupies the
 * high-order bits and a member's local index occupies the low-order bits (see
 * PlacementService) — because the algorithm below processes index bits from
 * least-significant (finest) to most-significant (coarsest), concatenating a valid
 * neighborhood-order index with a valid local-order index and decoding the result at the
 * combined order reproduces exactly the two-level nesting we want, with no special-casing
 * required here.
 */
public final class HilbertCurve {

    private HilbertCurve() {
    }

    /** Encodes a grid coordinate (each in [0, 2^order)) into its position on the curve. */
    public static long xy2d(int order, long x, long y) {
        long d = 0;
        for (long s = 1L << (order - 1); s > 0; s >>= 1) {
            long rx = (x & s) > 0 ? 1 : 0;
            long ry = (y & s) > 0 ? 1 : 0;
            d += s * s * ((3 * rx) ^ ry);
            long[] rotated = rotate(s, x, y, rx, ry);
            x = rotated[0];
            y = rotated[1];
        }
        return d;
    }

    /** Decodes a curve index back into its grid coordinate {x, y}. */
    public static long[] d2xy(int order, long index) {
        long x = 0;
        long y = 0;
        long t = index;
        for (long s = 1; s < (1L << order); s <<= 1) {
            long rx = 1 & (t / 2);
            long ry = 1 & (t ^ rx);
            long[] rotated = rotate(s, x, y, rx, ry);
            x = rotated[0] + s * rx;
            y = rotated[1] + s * ry;
            t /= 4;
        }
        return new long[]{x, y};
    }

    private static long[] rotate(long s, long x, long y, long rx, long ry) {
        if (ry == 0) {
            if (rx == 1) {
                x = s - 1 - x;
                y = s - 1 - y;
            }
            return new long[]{y, x};
        }
        return new long[]{x, y};
    }

    /**
     * Decomposes a query rectangle (inclusive of both corners, coordinates in [0, 2^order))
     * into a small set of contiguous, inclusive [start, end] index ranges suitable for a
     * "WHERE index BETWEEN start AND end" scan. Recurses a standard quadtree down from the
     * whole grid, pruning cells that don't overlap the box and stopping (adding a range)
     * once a cell is either fully inside the box or is a single point.
     */
    public static List<long[]> rangesForBox(int order, long minX, long minY, long maxX, long maxY) {
        List<long[]> ranges = new ArrayList<>();
        collect(order, 0, 0, order, minX, minY, maxX, maxY, ranges);
        return ranges;
    }

    private static void collect(int fullOrder, long cellX0, long cellY0, int cellOrder,
                                 long minX, long minY, long maxX, long maxY, List<long[]> ranges) {
        long cellSize = 1L << cellOrder;
        long cellMaxX = cellX0 + cellSize - 1;
        long cellMaxY = cellY0 + cellSize - 1;

        boolean overlaps = cellX0 <= maxX && cellMaxX >= minX && cellY0 <= maxY && cellMaxY >= minY;
        if (!overlaps) {
            return;
        }

        boolean fullyInside = cellX0 >= minX && cellMaxX <= maxX && cellY0 >= minY && cellMaxY <= maxY;
        if (fullyInside || cellOrder == 0) {
            // Any point in an aligned order-k cell falls somewhere within that cell's
            // contiguous 4^k-sized index block, but not necessarily at the block's start —
            // which corner is the curve's actual entry point depends on accumulated
            // rotation. Block boundaries are always exact multiples of the block length
            // (a basic property of the recursive construction), so floor-dividing any
            // in-cell index by the length reliably recovers the true start regardless of
            // which point we sampled.
            long length = 1L << (2 * cellOrder);
            long anyIndexInCell = xy2d(fullOrder, cellX0, cellY0);
            long start = (anyIndexInCell / length) * length;
            ranges.add(new long[]{start, start + length - 1});
            return;
        }

        long half = cellSize / 2;
        collect(fullOrder, cellX0, cellY0, cellOrder - 1, minX, minY, maxX, maxY, ranges);
        collect(fullOrder, cellX0 + half, cellY0, cellOrder - 1, minX, minY, maxX, maxY, ranges);
        collect(fullOrder, cellX0, cellY0 + half, cellOrder - 1, minX, minY, maxX, maxY, ranges);
        collect(fullOrder, cellX0 + half, cellY0 + half, cellOrder - 1, minX, minY, maxX, maxY, ranges);
    }

    /**
     * The founder's own (localIndex 0) position for a neighborhood at curveIndex — derivable
     * purely from curveIndex, with no per-user lookup, by decoding the exact same combined-order
     * mapIndex a founder is actually placed at (curveIndex shifted into the high bits, localIndex
     * 0 in the low bits) — i.e. this must match PlacementService.placeInNeighborhood exactly.
     *
     * <p>An earlier version of this method tried to shortcut that by decoding curveIndex alone
     * at the smaller neighborhood order and scaling the result up by 2^localOrder, reasoning
     * that the neighborhood-order curve's traversal is "the same, just scaled" as the combined
     * curve's coarse bits. That reasoning was wrong: {@link #rotate}'s reflection branch
     * (`s - 1 - x`) has a constant `-1` term that does NOT scale linearly with `s`, so the
     * shortcut only coincidentally matched the real founder position for the first couple of
     * curveIndex values (before any reflection with rx=1 occurred) and silently diverged for
     * later ones — confirmed by comparing against real placed founders (curveIndex 3's founder
     * sits at a completely different point than the shortcut produced). Decoding at the full
     * combined order avoids the shortcut, and thus the bug, entirely.
     */
    public static long[] founderPosition(int neighborhoodOrder, int localOrder, long curveIndex) {
        long founderMapIndex = curveIndex << (2 * localOrder);
        return d2xy(neighborhoodOrder + localOrder, founderMapIndex);
    }
}
