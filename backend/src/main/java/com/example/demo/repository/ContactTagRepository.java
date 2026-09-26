package com.example.demo.repository;

import com.example.demo.model.ContactTag;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface ContactTagRepository extends JpaRepository<ContactTag, UUID> {

    @EntityGraph(attributePaths = {"tag"})
    List<ContactTag> findByContactId(UUID contactId);

    /** Batch load for graph composition (P4): every tag on any of a set of contacts, in one query. */
    @EntityGraph(attributePaths = {"tag"})
    List<ContactTag> findByContactIdIn(Collection<UUID> contactIds);

    Optional<ContactTag> findByIdAndContactId(UUID id, UUID contactId);

    void deleteByIdAndContactId(UUID id, UUID contactId);
}
