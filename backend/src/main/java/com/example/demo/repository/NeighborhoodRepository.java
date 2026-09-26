package com.example.demo.repository;

import com.example.demo.model.Neighborhood;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface NeighborhoodRepository extends JpaRepository<Neighborhood, Long> {

    /** Plan §4 P5: the map is gone — every new user shares one "default" neighborhood row. */
    Optional<Neighborhood> findFirstByOrderByCurveIndexAsc();
}
