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

    // tagger, subject and tag are eager @ManyToOnes. Without an entity graph Hibernate loads them with one
    // extra select per row, which against a remote database is what made tag loading crawl.

    /** The merged card view: pass {selfTag=subjectId, mine=viewerId} to get public self-tags + the viewer's own private ones. */
    @EntityGraph(attributePaths = {"tagger", "subject", "tag"})
    List<UserTag> findBySubjectIdAndTaggerIdIn(UUID subjectId, Collection<UUID> taggerIds);

    /** Every tag a given tagger has placed on a given subject — used for the per-pair cap and duplicate checks. */
    List<UserTag> findByTaggerIdAndSubjectId(UUID taggerId, UUID subjectId);

    /**
     * Batch load for graph composition (P4): every public self-tag (tagger == subject) for a set of
     * users at once — used to build the {@code profile.tags} of a SELF node or a registered
     * contact/third party, one query regardless of how many subjects are asked for.
     */
    @EntityGraph(attributePaths = {"tagger", "subject", "tag"})
    @Query("SELECT ut FROM UserTag ut WHERE ut.tagger.id = ut.subject.id AND ut.subject.id IN :subjectIds")
    List<UserTag> findSelfTagsBySubjectIdIn(@Param("subjectIds") Collection<UUID> subjectIds);
}
