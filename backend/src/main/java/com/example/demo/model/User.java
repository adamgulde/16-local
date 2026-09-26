package com.example.demo.model;

import com.example.demo.security.EncryptedPhoneNumberConverter;
import jakarta.persistence.*;
import lombok.*;

import java.util.UUID;

@Entity
@Table(name = "users")
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

    @Convert(converter = EncryptedPhoneNumberConverter.class)
    @Column(unique = true, nullable = false)
    private String phoneNumber;

    @Column(unique = true, nullable = false)
    private String inviteCode;

    @Column(nullable = false)
    @Builder.Default
    private java.time.Instant createdAt = java.time.Instant.now();

    @Column(length = 2000)
    private String bio;

    /**
     * Every user still needs one (the column is NOT NULL) but the global map is gone (plan §4 P5):
     * new registrations are simply assigned the one shared default neighborhood (see
     * {@code PlacementService#defaultNeighborhood}), and nothing reads this for placement any more.
     * {@code maxConnectionDegree}/{@code defaultUser}/{@code localIndex}/{@code mapIndex}/
     * {@code mapX}/{@code mapY} columns still exist (kept until a later V7 migration drops them)
     * but are no longer mapped here at all — nothing reads or writes them any more.
     */
    @ManyToOne(optional = false)
    @JoinColumn(name = "neighborhood_curve_index")
    private Neighborhood neighborhood;

    /** Whether a registered contact of this user may be shown as themselves (not Hidden User) to a
     *  third party viewing a shared graph. Default off — see plan §1.5. */
    @Column(name = "discoverable_in_shared_graphs", nullable = false)
    @Builder.Default
    private boolean discoverableInSharedGraphs = false;
}
