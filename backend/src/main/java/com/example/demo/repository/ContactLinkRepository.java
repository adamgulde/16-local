package com.example.demo.repository;

import com.example.demo.model.ContactLink;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface ContactLinkRepository extends JpaRepository<ContactLink, UUID> {

    /** All links among one owner's contacts — used to build DIRECT-graph LINK edges. */
    List<ContactLink> findByOwnerId(UUID ownerId);

    /** Lookup by normalized (a &lt; b) order, as ContactLinkService always stores them. */
    Optional<ContactLink> findByContactAIdAndContactBId(UUID contactAId, UUID contactBId);

    void deleteByContactAIdAndContactBId(UUID contactAId, UUID contactBId);
}
