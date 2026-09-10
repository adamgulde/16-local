package com.example.demo.model;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

/**
 * A neighborhood is founded by whichever user registers with no sponsor (or whose sponsor
 * later declines their connection). Every other user joins their sponsor's neighborhood.
 * curveIndex is both this entity's primary key and its position on the top-order bits of
 * the shared Hilbert curve (see HilbertCurve) — assigned once via DB identity generation
 * and never changed. Using a plain auto-increment as the key (rather than a UUID) is what
 * gives us the monotonic sequence the curve needs, for free.
 */
@Entity
@Table(name = "neighborhoods")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EqualsAndHashCode(of = "curveIndex")
@ToString(of = {"curveIndex", "memberCount"})
public class Neighborhood {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long curveIndex;

    @Builder.Default
    @Column(nullable = false)
    private Long memberCount = 0L;

    private Instant createdAt;
}
