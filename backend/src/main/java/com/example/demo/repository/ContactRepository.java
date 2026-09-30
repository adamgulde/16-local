package com.example.demo.repository;

import com.example.demo.model.Contact;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface ContactRepository extends JpaRepository<Contact, UUID> {

    /**
     * All of an owner's contacts — the base of GET /api/graph and of graph composition (P4), which
     * always needs each registered contact's linked user (bio, phone, discoverability) too — the
     * entity graph fetch-joins it instead of one extra select per registered contact.
     */
    @EntityGraph(attributePaths = {"linkedUser"})
    List<Contact> findByOwnerId(UUID ownerId);

    /** Ownership check for every per-contact read/write: someone else's contact is a 404, not a 403. */
    Optional<Contact> findByIdAndOwnerId(UUID id, UUID ownerId);

    /** The owner's existing registered contact for a linked user, if any (connect / already-connected checks). */
    Optional<Contact> findByOwnerIdAndLinkedUserId(UUID ownerId, UUID linkedUserId);

    boolean existsByOwnerIdAndLinkedUserId(UUID ownerId, UUID linkedUserId);

    /** Total size of an owner's graph — enforces the per-user contact cap on bulk import. */
    long countByOwnerId(UUID ownerId);

    /** Every contact anyone has registered as this user — used when a user is removed/unlinked on their end. */
    List<Contact> findByLinkedUserId(UUID linkedUserId);

    /** Batch load for graph composition: an owner's contacts restricted to a set of ids (e.g. not-hidden). */
    List<Contact> findByOwnerIdAndIdIn(UUID ownerId, Collection<UUID> ids);

    /**
     * S4's invite-registration cap (plan §4 P5): how many of {@code ownerId}'s registered contacts
     * were created at/after {@code since} — the same rolling-window check the old (now-unwritten)
     * {@code connections} table backed, since {@link com.example.demo.service.ContactService#connectMutually}
     * is the only thing that creates a registered contact for a brand-new invite-code registration.
     */
    long countByOwnerIdAndLinkedUserIsNotNullAndCreatedAtGreaterThanEqual(UUID ownerId, Instant since);
}
