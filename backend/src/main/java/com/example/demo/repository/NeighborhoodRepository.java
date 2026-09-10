package com.example.demo.repository;

import com.example.demo.model.Neighborhood;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface NeighborhoodRepository extends JpaRepository<Neighborhood, Long> {

    /**
     * Row-locks the neighborhood for the duration of the caller's transaction, so two
     * concurrent registrations into the same neighborhood can't read-then-write the same
     * memberCount and collide on localIndex.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select n from Neighborhood n where n.curveIndex = :curveIndex")
    Neighborhood lockForUpdate(Long curveIndex);

    /** Range-scan for the map viewport: curveIndex is itself a valid Hilbert index at NEIGHBORHOOD_ORDER. */
    List<Neighborhood> findByCurveIndexBetween(Long start, Long end);
}
