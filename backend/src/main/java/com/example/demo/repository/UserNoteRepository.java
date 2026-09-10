package com.example.demo.repository;

import com.example.demo.model.UserNote;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface UserNoteRepository extends JpaRepository<UserNote, UUID> {
    Optional<UserNote> findByAuthorIdAndSubjectId(UUID authorId, UUID subjectId);
}
