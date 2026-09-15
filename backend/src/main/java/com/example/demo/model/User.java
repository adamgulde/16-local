package com.example.demo.model;

import jakarta.persistence.*;
import lombok.*;

import java.util.UUID;

@Entity
@Table(name = "users", indexes = @Index(name = "idx_users_map_index", columnList = "map_index"))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EqualsAndHashCode(of = "id")
@ToString(of = {"id", "firstName", "lastName"})
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    private String firstName;
    private String lastName;

    @Column(unique = true, nullable = false)
    private String phoneNumber;

    @Column(unique = true, nullable = false)
    private String inviteCode;

    @Column(nullable = false)
    @Builder.Default
    private java.time.Instant createdAt = java.time.Instant.now();

    @Column(length = 2000)
    private String bio;

    /** Maximum degree of separation allowed for incoming connection requests; null means accept all. */
    private Integer maxConnectionDegree;

    /** Whether this user is a default seeded demo user. Default users auto-accept connection requests. */
    @Column(nullable = false, columnDefinition = "boolean default false")
    @Builder.Default
    private boolean defaultUser = false;

    public boolean isDefaultUser() {
        return defaultUser || (phoneNumber != null && phoneNumber.startsWith("+1 555-000-"));
    }

    @ManyToOne(optional = false)
    @JoinColumn(name = "neighborhood_curve_index")
    private Neighborhood neighborhood;

    /** This user's join order within their neighborhood — the low-order bits of mapIndex. */
    @Column(name = "local_index")
    private Long localIndex;

    /** The single combined Hilbert index this user is placed at; see HilbertCurve. */
    @Column(name = "map_index")
    private Long mapIndex;

    @Column(name = "map_x")
    private Long mapX;

    @Column(name = "map_y")
    private Long mapY;
}
