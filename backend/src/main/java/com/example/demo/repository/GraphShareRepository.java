package com.example.demo.repository;

import com.example.demo.model.GraphShare;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface GraphShareRepository extends JpaRepository<GraphShare, UUID> {

    /** The one active share (if any) from sharer to viewer — enforced unique at the DB level too. */
    Optional<GraphShare> findBySharerIdAndViewerIdAndRevokedAtIsNull(UUID sharerId, UUID viewerId);

    /** GET /api/shares "sharedByMe". */
    List<GraphShare> findBySharerIdAndRevokedAtIsNull(UUID sharerId);

    /** GET /api/shares "sharedWithMe". */
    List<GraphShare> findByViewerIdAndRevokedAtIsNull(UUID viewerId);

    /** Ownership check: only the sharer may PATCH flags / set hidden contacts. */
    Optional<GraphShare> findByIdAndSharerId(UUID id, UUID sharerId);

    /** GET /api/shares/{id}/graph is viewer-only and only for an active share (plan §4 P4). */
    Optional<GraphShare> findByIdAndViewerIdAndRevokedAtIsNull(UUID id, UUID viewerId);

    /** Either side may revoke/remove: sharer or viewer — someone else's share is a 404. */
    @Query("select gs from GraphShare gs where gs.id = :id and (gs.sharer.id = :userId or gs.viewer.id = :userId)")
    Optional<GraphShare> findByIdAndEitherParty(@Param("id") UUID id, @Param("userId") UUID userId);
}
