package com.example.demo.repository;

import com.example.demo.model.UserTag;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

@Repository
public interface UserTagRepository extends JpaRepository<UserTag, UUID> {

    /** The merged card view: pass {selfTag=subjectId, mine=viewerId} to get public self-tags + the viewer's own private ones. */
    List<UserTag> findBySubjectIdAndTaggerIdIn(UUID subjectId, Collection<UUID> taggerIds);

    /** Every tag a given tagger has placed on a given subject — used for the per-pair cap and duplicate checks. */
    List<UserTag> findByTaggerIdAndSubjectId(UUID taggerId, UUID subjectId);
}
