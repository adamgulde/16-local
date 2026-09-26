package com.example.demo.model;

import com.example.demo.security.EncryptedPhoneNumberConverter;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.OnDelete;
import org.hibernate.annotations.OnDeleteAction;

import java.time.Instant;
import java.util.UUID;

/**
 * A node in {@code owner}'s private graph: either a placeholder (no {@code linkedUser}, everything
 * about them is what the owner typed) or registered (linked to a real account — name, tags and note
 * are still the owner's own, but phone/profile at read time may come from the linked user, see
 * {@code GraphService}). Never visible to anyone but the owner, except through an explicit
 * {@link GraphShare} of the owner's direct contacts.
 */
@Entity
@Table(name = "contacts")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EqualsAndHashCode(of = "id")
@ToString(of = {"id", "firstName", "lastName"})
public class Contact {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    // owner: ON DELETE CASCADE, linkedUser: ON DELETE SET NULL in V6's raw SQL. Tests run with
    // Flyway disabled and ddl-auto=update (schema generated from these mappings), and Hibernate's
    // generator defaults every FK to NO ACTION unless told otherwise — @OnDelete makes the
    // *generated* test schema match the real migration's cascade instead of silently diverging
    // from it (a real 500 deleting a user who owns contacts is what surfaced this — see
    // UserAccountIT).
    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "owner_id")
    @OnDelete(action = OnDeleteAction.CASCADE)
    private User owner;

    /** Set only when this contact is linked to a real account (mutual edge); null = placeholder. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "linked_user_id")
    @OnDelete(action = OnDeleteAction.SET_NULL)
    private User linkedUser;

    @Column(name = "first_name", nullable = false)
    private String firstName;

    @Column(name = "last_name")
    private String lastName;

    @Column(columnDefinition = "text")
    private String about;

    @Convert(converter = EncryptedPhoneNumberConverter.class)
    private String phoneNumber;

    @Column(columnDefinition = "text")
    private String note;

    @Column(name = "created_at", nullable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    @Builder.Default
    private Instant updatedAt = Instant.now();
}
