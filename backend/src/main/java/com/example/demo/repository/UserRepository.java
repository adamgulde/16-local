package com.example.demo.repository;

import com.example.demo.model.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface UserRepository extends JpaRepository<User, UUID> {

    /** Matches the query against either name field individually. */
    List<User> findByFirstNameContainingIgnoreCaseOrLastNameContainingIgnoreCase(String firstName, String lastName);

    /** Matches a two-word "first last" query against the two fields separately. */
    List<User> findByFirstNameContainingIgnoreCaseAndLastNameContainingIgnoreCase(String firstName, String lastName);

    /** Range-scan for the map viewport: mapIndex is the combined Hilbert index a user is placed at. */
    List<User> findByMapIndexBetween(Long start, Long end);

    Optional<User> findByPhoneNumber(String phoneNumber);

    boolean existsByPhoneNumber(String phoneNumber);

    Optional<User> findByInviteCode(String inviteCode);

    boolean existsByInviteCode(String inviteCode);
}
