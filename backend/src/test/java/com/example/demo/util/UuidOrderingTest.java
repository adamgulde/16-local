package com.example.demo.util;

import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class UuidOrderingTest {

    /** The exact pair from the production incident: chk_contact_links_order (a < b in Postgres's
     * unsigned uuid order) rejected a row ordered by Java's signed UUID.compareTo. */
    @Test
    void ordersTheExactPairFromTheIncidentThePostgresWay() {
        UUID a = UUID.fromString("b752449e-7f86-4535-b8a3-3ef3ce5172ef");
        UUID b = UUID.fromString("2fc822f0-5c58-44ab-9346-1689b358f945");

        // Java's signed compareTo disagrees with Postgres here — that disagreement is the bug.
        assertThat(a.compareTo(b)).isLessThan(0);

        assertThat(UuidOrdering.isBefore(a, b)).isFalse();
        assertThat(UuidOrdering.isBefore(b, a)).isTrue();
        assertThat(UuidOrdering.pgOrder(a, b)).containsExactly(b, a);
        assertThat(UuidOrdering.pgOrder(b, a)).containsExactly(b, a);
    }

    /** Two ids identical except for the sign bit of the low 64 bits (the high nibble of the fourth
     * hex group) — the exact bit signed {@code compareTo} gets backwards relative to Postgres's
     * unsigned byte order. */
    @Test
    void ordersPairsDifferingOnlyInTheLowHalfsSignBitThePostgresWay() {
        UUID positiveLow = UUID.fromString("00000000-0000-4000-3000-000000000000");
        UUID negativeLow = UUID.fromString("00000000-0000-4000-b000-000000000000");

        // Same most-significant bits, so compareTo falls through to comparing leastSigBits as a
        // signed long: negativeLow's is negative (top bit set), positiveLow's is positive.
        assertThat(positiveLow.compareTo(negativeLow)).isGreaterThan(0);

        // Postgres compares the same bytes unsigned: 0x30... < 0xb0..., so positiveLow sorts first.
        assertThat(UuidOrdering.isBefore(positiveLow, negativeLow)).isTrue();
        assertThat(UuidOrdering.isBefore(negativeLow, positiveLow)).isFalse();
        assertThat(UuidOrdering.pgOrder(positiveLow, negativeLow)).containsExactly(positiveLow, negativeLow);
        assertThat(UuidOrdering.pgOrder(negativeLow, positiveLow)).containsExactly(positiveLow, negativeLow);
    }

    @Test
    void isBeforeIsFalseForEqualIds() {
        UUID id = UUID.randomUUID();
        assertThat(UuidOrdering.isBefore(id, id)).isFalse();
    }
}
