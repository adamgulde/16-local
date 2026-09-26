package com.example.demo.service;

import com.example.demo.dto.TagAssignmentResponse;
import com.example.demo.dto.TagResponse;
import com.example.demo.exception.BadRequestException;
import com.example.demo.exception.NotFoundException;
import com.example.demo.model.Tag;
import com.example.demo.model.User;
import com.example.demo.model.UserTag;
import com.example.demo.repository.TagRepository;
import com.example.demo.repository.UserRepository;
import com.example.demo.repository.UserTagRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Self-tags (tagger == subject) are public — dictionary tags, or custom labels filed under a
 * category — and anyone viewing a card sees them. Tags placed on someone else are private to the
 * tagger (dictionary or custom) and never shown to the subject or any other viewer — the same
 * visibility rule as {@link NoteService}. Self-only categories (age, nationality, identity
 * groups) can never be applied to someone else. All rules are enforced here, never left to the client.
 */
@Service
@RequiredArgsConstructor
public class TagService {

    /** Cheap clutter/spam guard, not a hard product limit — easy to raise later. */
    private static final int MAX_TAGS_PER_PAIR = 40;
    private static final int MAX_CUSTOM_LABEL_LENGTH = 60;

    private final TagRepository tagRepository;
    private final UserTagRepository userTagRepository;
    private final UserRepository userRepository;
    private final TagTaxonomy tagTaxonomy;

    public List<TagResponse> getAllTags() {
        TagTaxonomy.Snapshot taxonomy = tagTaxonomy.current();
        return taxonomy.all().stream().map(node -> TagResponse.from(node, taxonomy)).toList();
    }

    /** Mirrors UserTagRepository.VISIBLE_TO_VIEWER — keep the two in step. */
    static boolean isVisible(UserTag userTag, UUID viewerId) {
        boolean isSelfTag = userTag.getTagger().getId().equals(userTag.getSubject().getId());
        boolean isMine = userTag.getTagger().getId().equals(viewerId);
        return isMine || (isSelfTag && (userTag.getTag() != null || userTag.getParentTag() != null));
    }

    @Transactional(readOnly = true)
    public List<TagAssignmentResponse> getTagsForSubject(UUID subjectId, UUID viewerId) {
        TagTaxonomy.Snapshot taxonomy = tagTaxonomy.current();
        return userTagRepository.findBySubjectIdAndTaggerIdIn(subjectId, List.of(subjectId, viewerId)).stream()
                .filter(userTag -> isVisible(userTag, viewerId))
                .map(userTag -> TagAssignmentResponse.from(userTag, viewerId, taxonomy))
                .toList();
    }

    /** {@link #getTagsForSubject} for every user at once, keyed by subject — one query for the whole directory. */
    @Transactional(readOnly = true)
    public Map<UUID, List<TagAssignmentResponse>> getVisibleTagsBySubject(UUID viewerId) {
        TagTaxonomy.Snapshot taxonomy = tagTaxonomy.current();
        return userTagRepository.findAllVisibleTo(viewerId).stream()
                .filter(userTag -> isVisible(userTag, viewerId))
                .collect(Collectors.groupingBy(
                        userTag -> userTag.getSubject().getId(),
                        Collectors.mapping(userTag -> TagAssignmentResponse.from(userTag, viewerId, taxonomy),
                                Collectors.toList())));
    }

    @Transactional
    public TagAssignmentResponse addTag(UUID subjectId, UUID taggerId, UUID tagId, String customLabel, UUID parentTagId) {
        User subject = findUser(subjectId);
        User tagger = findUser(taggerId);
        TagTaxonomy.Snapshot taxonomy = tagTaxonomy.current();
        boolean isSelfTag = subjectId.equals(taggerId);
        String label = customLabel == null || customLabel.isBlank() ? null : customLabel.trim();

        if (tagId == null && label == null) {
            throw new BadRequestException("Provide either a tagId or a customLabel");
        }
        if (tagId != null && label != null) {
            throw new BadRequestException("Provide either a tagId or a customLabel, not both");
        }
        if (label != null && label.length() > MAX_CUSTOM_LABEL_LENGTH) {
            throw new BadRequestException("Custom tags are limited to " + MAX_CUSTOM_LABEL_LENGTH + " characters");
        }

        // The tree node this assignment hangs off: the dictionary tag itself, or the custom tag's parent.
        UUID anchorId = tagId != null ? tagId : parentTagId;
        TagTaxonomy.Node anchor = null;
        if (anchorId != null) {
            anchor = taxonomy.get(anchorId).orElseThrow(() -> new NotFoundException("Tag not found: " + anchorId));
        }
        if (tagId != null && !taxonomy.isSelectable(anchor)) {
            throw new BadRequestException("Pick a tag within this category");
        }
        if (label != null && isSelfTag && anchor == null) {
            throw new BadRequestException("Choose a category for your custom tag");
        }
        if (anchor != null && !isSelfTag && taxonomy.isSelfOnly(anchor.id())) {
            throw new BadRequestException("Only people themselves can add " + taxonomy.root(anchor.id()).label() + " tags");
        }

        List<UserTag> existing = userTagRepository.findByTaggerIdAndSubjectId(taggerId, subjectId);
        if (tagId != null && existing.stream().anyMatch(t -> t.getTag() != null && t.getTag().getId().equals(tagId))) {
            throw new BadRequestException("This tag is already applied");
        }
        UUID parentId = anchor != null ? anchor.id() : null;
        if (label != null && existing.stream().anyMatch(t -> label.equalsIgnoreCase(t.getCustomLabel())
                && Objects.equals(parentId, anchorOf(t)))) {
            throw new BadRequestException("This custom tag is already applied");
        }

        // Single-select groups (one age range, one gender): the new choice replaces the old one.
        List<UserTag> replaced = List.of();
        Optional<TagTaxonomy.Node> group = anchor != null ? taxonomy.singleSelectGroup(anchor.id()) : Optional.empty();
        if (group.isPresent()) {
            Set<UUID> groupIds = taxonomy.subtree(group.get().id());
            replaced = existing.stream().filter(t -> groupIds.contains(anchorOf(t))).toList();
            userTagRepository.deleteAll(replaced);
        }
        if (existing.size() - replaced.size() >= MAX_TAGS_PER_PAIR) {
            throw new BadRequestException("Already at the maximum number of tags for this person");
        }

        UserTag saved = userTagRepository.save(UserTag.builder()
                .tagger(tagger)
                .subject(subject)
                .tag(tagId != null ? tagRepository.getReferenceById(tagId) : null)
                .parentTag(tagId == null && parentId != null ? tagRepository.getReferenceById(parentId) : null)
                .customLabel(label)
                .build());
        return TagAssignmentResponse.from(saved, taggerId, taxonomy);
    }

    private static UUID anchorOf(UserTag userTag) {
        Tag anchor = userTag.getTag() != null ? userTag.getTag() : userTag.getParentTag();
        return anchor != null ? anchor.getId() : null;
    }

    public void removeTag(UUID assignmentId, UUID requestingUserId) {
        UserTag userTag = userTagRepository.findById(assignmentId)
                .orElseThrow(() -> new NotFoundException("Tag assignment not found: " + assignmentId));
        if (!userTag.getTagger().getId().equals(requestingUserId)) {
            throw new BadRequestException("You can only remove tags you applied yourself");
        }
        userTagRepository.delete(userTag);
    }

    private User findUser(UUID id) {
        return userRepository.findById(id).orElseThrow(() -> new NotFoundException("User not found: " + id));
    }
}
