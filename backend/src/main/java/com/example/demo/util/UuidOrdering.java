package com.example.demo.util;

import java.util.UUID;

/**
 * Orders a pair of UUIDs the way Postgres's {@code uuid} type does (unsigned byte-by-byte), not the
 * way {@link UUID#compareTo} does. {@code UUID.compareTo} compares {@code mostSigBits}/
 * {@code leastSigBits} as <em>signed</em> {@code long}s, so any id whose high bit within either half
 * is set (e.g. a most-significant-bits value starting with {@code 8}-{@code f}) sorts as negative —
 * disagreeing with Postgres for roughly half of all id pairs. Every place a pair of ids must be
 * stored/looked-up in a Postgres-enforced {@code a < b} order (e.g. {@code contact_links}'
 * {@code chk_contact_links_order}) needs to agree with Postgres, not Java, so it must go through
 * this helper instead of {@code compareTo} or {@code Comparator.naturalOrder()}.
 *
 * <p>The canonical {@link UUID#toString()} form is lowercase hex in big-endian byte order, so plain
 * lexicographic string comparison matches Postgres's unsigned byte ordering exactly.
 */
public final class UuidOrdering {

    private UuidOrdering() {
    }

    /** True if {@code a} sorts before {@code b} the way Postgres's {@code uuid} type would. */
    public static boolean isBefore(UUID a, UUID b) {
        return a.toString().compareTo(b.toString()) < 0;
    }

    /** {@code [low, high]} in Postgres's {@code uuid} order — {@code low < high} per {@link #isBefore}. */
    public static UUID[] pgOrder(UUID a, UUID b) {
        return isBefore(a, b) ? new UUID[] {a, b} : new UUID[] {b, a};
    }
}
