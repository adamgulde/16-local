package com.example.demo.repository;

import com.example.demo.model.Connection;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface ConnectionRepository extends JpaRepository<Connection, UUID> {

    List<Connection> findByUserAIdOrUserBId(UUID userAId, UUID userBId);

    boolean existsByUserAIdAndUserBId(UUID userAId, UUID userBId);

    Optional<Connection> findByUserAIdAndUserBId(UUID userAId, UUID userBId);

    void deleteByUserAIdAndUserBId(UUID userAId, UUID userBId);

    /** Connections that touch any user in the given id set on either side — used by the map viewport to find edges. */
    List<Connection> findByUserAIdInOrUserBIdIn(Collection<UUID> userAIds, Collection<UUID> userBIds);

    /**
     * Count of connections touching userId (either side) created at/after {@code since} —
     * used by S4's invite-code registration cap (each invite-code registration immediately
     * creates one such connection to the inviter).
     */
    @Query("select count(c) from Connection c where (c.userA.id = :userId or c.userB.id = :userId) "
            + "and c.createdAt >= :since")
    long countByUserIdAndCreatedAtSince(@Param("userId") UUID userId, @Param("since") Instant since);
}
