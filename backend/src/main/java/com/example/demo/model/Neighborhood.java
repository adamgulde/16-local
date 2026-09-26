package com.example.demo.model;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

/**
 * Vestigial since plan §4 P5 removed the global map: every user still needs a row here
 * ({@code users.neighborhood_curve_index} is NOT NULL until a later migration drops it), but
 * everyone now shares the one "default" neighborhood ({@code PlacementService#defaultNeighborhood})
 * instead of being placed on a Hilbert curve — {@code memberCount} is no longer maintained.
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
