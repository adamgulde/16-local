package com.example.demo.service;

import com.example.demo.dto.TagAssignmentResponse;
import com.example.demo.dto.TagResponse;
import com.example.demo.exception.BadRequestException;
import com.example.demo.exception.NotFoundException;
import com.example.demo.model.Tag;
import com.example.demo.model.User;
import com.example.demo.model.UserTag;
import com.example.demo.repository.TagRepository;
import com.example.demo.repository.UserTagRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.UUID;

/**
 * Self-tags (tagger == subject) are public and dictionary-only — anyone viewing a card sees
 * them. Tags placed on someone else are private to the tagger (dictionary or free-text custom
 * label) and never shown to the subject or any other viewer — the same visibility rule as
 * {@link NoteService}. Both rules are enforced here, never left to the client.
 */
@Service
@RequiredArgsConstructor
public class TagService {

    /** Cheap clutter/spam guard, not a hard product limit — easy to raise later. */
    private static final int MAX_TAGS_PER_PAIR = 15;

    private final TagRepository tagRepository;
    private final UserTagRepository userTagRepository;
    private final UserService userService;

    public List<TagResponse> getAllTags() {
        return tagRepository.findAll().stream().map(TagResponse::from).toList();
    }

    public List<TagAssignmentResponse> getTagsForSubject(UUID subjectId, UUID viewerId) {
        return userTagRepository.findBySubjectIdAndTaggerIdIn(subjectId, List.of(subjectId, viewerId)).stream()
                .filter(userTag -> {
                    // Custom tags are strictly private and only shown on the logged-in tagger's screen
                    if (userTag.getTag() == null || userTag.getCustomLabel() != null) {
                        return userTag.getTagger().getId().equals(viewerId);
                    }
                    // Dictionary tags are visible if public self-tag or placed by viewer
                    return true;
                })
                .map(userTag -> TagAssignmentResponse.from(userTag, viewerId))
                .toList();
    }

    public TagAssignmentResponse addTag(UUID subjectId, UUID taggerId, UUID tagId, String customLabel) {
        User subject = userService.getUserById(subjectId);
        User tagger = userService.getUserById(taggerId);
        String normalizedCustomLabel = customLabel == null || customLabel.isBlank() ? null : customLabel.trim();

        if (tagId == null && normalizedCustomLabel == null) {
            throw new BadRequestException("Provide either a tagId or a customLabel");
        }
        if (tagId != null && normalizedCustomLabel != null) {
            throw new BadRequestException("Provide either a tagId or a customLabel, not both");
        }

        List<UserTag> existing = userTagRepository.findByTaggerIdAndSubjectId(taggerId, subjectId);
        if (existing.size() >= MAX_TAGS_PER_PAIR) {
            throw new BadRequestException("Already at the maximum number of tags for this person");
        }

        Tag tag = null;
        if (tagId != null) {
            tag = tagRepository.findById(tagId).orElseThrow(() -> new NotFoundException("Tag not found: " + tagId));
            UUID finalTagId = tagId;
            boolean alreadyTagged = existing.stream().anyMatch(t -> t.getTag() != null && t.getTag().getId().equals(finalTagId));
            if (alreadyTagged) {
                throw new BadRequestException("This tag is already applied");
            }
        } else {
            boolean alreadyTagged = existing.stream()
                    .anyMatch(t -> normalizedCustomLabel.equalsIgnoreCase(t.getCustomLabel()));
            if (alreadyTagged) {
                throw new BadRequestException("This custom tag is already applied");
            }
        }

        UserTag saved = userTagRepository.save(UserTag.builder()
                .tagger(tagger)
                .subject(subject)
                .tag(tag)
                .customLabel(tag == null ? normalizedCustomLabel : null)
                .build());
        return TagAssignmentResponse.from(saved, taggerId);
    }

    public void removeTag(UUID assignmentId, UUID requestingUserId) {
        UserTag userTag = userTagRepository.findById(assignmentId)
                .orElseThrow(() -> new NotFoundException("Tag assignment not found: " + assignmentId));
        if (!userTag.getTagger().getId().equals(requestingUserId)) {
            throw new BadRequestException("You can only remove tags you applied yourself");
        }
        userTagRepository.delete(userTag);
    }
}
