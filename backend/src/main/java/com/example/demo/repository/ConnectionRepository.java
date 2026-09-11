package com.example.demo.repository;

import com.example.demo.model.Connection;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

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
}
