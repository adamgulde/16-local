package com.example.demo.repository;

import com.example.demo.model.UserNote;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface UserNoteRepository extends JpaRepository<UserNote, UUID> {
    Optional<UserNote> findByAuthorIdAndSubjectId(UUID authorId, UUID subjectId);

    interface NoteContent {
        UUID getSubjectId();

        String getContent();
    }

    /** All of one author's notes in one query, as bare values — loading the entities would pull in both users per row. */
    @Query("SELECT n.subject.id AS subjectId, n.content AS content FROM UserNote n WHERE n.author.id = :authorId")
    List<NoteContent> findContentByAuthorId(@Param("authorId") UUID authorId);

    /** Note search — always scoped to the author, since notes are private to whoever wrote them. */
    List<UserNote> findByAuthorIdAndContentContainingIgnoreCase(UUID authorId, String content);
}
