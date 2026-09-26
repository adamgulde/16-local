package com.example.demo.repository;

import com.example.demo.model.UserTag;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

@Repository
public interface UserTagRepository extends JpaRepository<UserTag, UUID> {

    /**
     * What a viewer may search on: their own tags on anyone, plus public self-tags (dictionary, or
     * custom filed under a category). Must stay in step with TagService#isVisible.
     */
    String VISIBLE_TO_VIEWER = "(ut.tagger.id = :viewerId OR (ut.tagger.id = ut.subject.id AND " +
            "(ut.tag IS NOT NULL OR ut.parentTag IS NOT NULL)))";

    // tagger, subject and tag are eager @ManyToOnes. Without an entity graph Hibernate loads them with one
    // extra select per row, which against a remote database is what made tag loading crawl.

    /** The merged card view: pass {selfTag=subjectId, mine=viewerId} to get public self-tags + the viewer's own private ones. */
    @EntityGraph(attributePaths = {"tagger", "subject", "tag"})
    List<UserTag> findBySubjectIdAndTaggerIdIn(UUID subjectId, Collection<UUID> taggerIds);

    /** Every tag the viewer may see, across the whole directory, in one query. */
    @EntityGraph(attributePaths = {"tagger", "subject", "tag"})
    @Query("SELECT ut FROM UserTag ut WHERE " + VISIBLE_TO_VIEWER)
    List<UserTag> findAllVisibleTo(@Param("viewerId") UUID viewerId);

    /** Every tag a given tagger has placed on a given subject — used for the per-pair cap and duplicate checks. */
    List<UserTag> findByTaggerIdAndSubjectId(UUID taggerId, UUID subjectId);

    /** Users with a dictionary tag in, or a custom tag filed under, any of the given tree nodes. */
    @Query("SELECT ut FROM UserTag ut LEFT JOIN ut.tag t LEFT JOIN ut.parentTag p " +
            "WHERE (t.id IN :tagIds OR p.id IN :tagIds) AND " + VISIBLE_TO_VIEWER)
    List<UserTag> findVisibleByTagIds(@Param("tagIds") Collection<UUID> tagIds, @Param("viewerId") UUID viewerId);

    /** Free-text match on custom labels and dictionary labels; {@code pattern} is a pre-escaped LIKE pattern. */
    @Query("SELECT ut FROM UserTag ut LEFT JOIN ut.tag t " +
            "WHERE (LOWER(ut.customLabel) LIKE :pattern ESCAPE '\\' OR LOWER(t.label) LIKE :pattern ESCAPE '\\') AND " +
            VISIBLE_TO_VIEWER)
    List<UserTag> findVisibleByLabelLike(@Param("pattern") String pattern, @Param("viewerId") UUID viewerId);
}
