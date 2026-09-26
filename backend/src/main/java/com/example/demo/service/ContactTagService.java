package com.example.demo.service;

import com.example.demo.dto.TagAssignmentResponse;
import com.example.demo.exception.BadRequestException;
import com.example.demo.exception.NotFoundException;
import com.example.demo.model.Contact;
import com.example.demo.model.ContactTag;
import com.example.demo.repository.ContactTagRepository;
import com.example.demo.repository.TagRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * Tags the owner places on one of their own contacts — mirrors {@link TagService}'s rules for a
 * private tag on someone else (dictionary or custom, category optional), since a contact is never
 * "self": self-only categories (age, nationality, identity groups) can never apply here, and every
 * assignment is private to the owner (there is no public/self-tag concept for a contact). Ownership
 * of the contact itself is checked by {@link ContactService#getOwned} — someone else's contact is a
 * 404, never a 403.
 */
@Service
@RequiredArgsConstructor
public class ContactTagService {

    private static final int MAX_TAGS_PER_CONTACT = 40;
    private static final int MAX_CUSTOM_LABEL_LENGTH = 60;

    private final TagRepository tagRepository;
    private final ContactTagRepository contactTagRepository;
    private final ContactService contactService;
    private final TagTaxonomy tagTaxonomy;

    @Transactional(readOnly = true)
    public List<TagAssignmentResponse> getTagsForContact(UUID contactId, UUID ownerId) {
        Contact contact = contactService.getOwned(contactId, ownerId);
        TagTaxonomy.Snapshot taxonomy = tagTaxonomy.current();
        return contactTagRepository.findByContactId(contact.getId()).stream()
                .map(ct -> TagAssignmentResponse.from(ct, taxonomy))
                .toList();
    }

    /** Returns the contact's tags as they now stand, not just the new one — same shape as TagController#addTag. */
    @Transactional
    public List<TagAssignmentResponse> addTag(UUID contactId, UUID ownerId, UUID tagId, String customLabel, UUID parentTagId) {
        Contact contact = contactService.getOwned(contactId, ownerId);
        TagTaxonomy.Snapshot taxonomy = tagTaxonomy.current();
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

        UUID anchorId = tagId != null ? tagId : parentTagId;
        TagTaxonomy.Node anchor = null;
        if (anchorId != null) {
            anchor = taxonomy.get(anchorId).orElseThrow(() -> new NotFoundException("Tag not found: " + anchorId));
        }
        if (tagId != null && !taxonomy.isSelectable(anchor)) {
            throw new BadRequestException("Pick a tag within this category");
        }
        if (anchor != null && taxonomy.isSelfOnly(anchor.id())) {
            throw new BadRequestException("Only people themselves can add " + taxonomy.root(anchor.id()).label() + " tags");
        }

        List<ContactTag> existing = contactTagRepository.findByContactId(contact.getId());
        if (tagId != null && existing.stream().anyMatch(t -> t.getTag() != null && t.getTag().getId().equals(tagId))) {
            throw new BadRequestException("This tag is already applied");
        }
        UUID parentId = anchor != null ? anchor.id() : null;
        if (label != null && existing.stream().anyMatch(t -> label.equalsIgnoreCase(t.getCustomLabel())
                && Objects.equals(parentId, anchorOf(t)))) {
            throw new BadRequestException("This custom tag is already applied");
        }

        // Single-select groups (one age range, one gender) replace the previous choice — same as UserTag.
        List<ContactTag> replaced = List.of();
        Optional<TagTaxonomy.Node> group = anchor != null ? taxonomy.singleSelectGroup(anchor.id()) : Optional.empty();
        if (group.isPresent()) {
            Set<UUID> groupIds = taxonomy.subtree(group.get().id());
            replaced = existing.stream().filter(t -> groupIds.contains(anchorOf(t))).toList();
            contactTagRepository.deleteAll(replaced);
        }
        if (existing.size() - replaced.size() >= MAX_TAGS_PER_CONTACT) {
            throw new BadRequestException("Already at the maximum number of tags for this contact");
        }

        contactTagRepository.save(ContactTag.builder()
                .contact(contact)
                .tag(tagId != null ? tagRepository.getReferenceById(tagId) : null)
                .parentTag(tagId == null && parentId != null ? tagRepository.getReferenceById(parentId) : null)
                .customLabel(label)
                .build());
        return getTagsForContact(contactId, ownerId);
    }

    @Transactional
    public void removeTag(UUID contactId, UUID assignmentId, UUID ownerId) {
        Contact contact = contactService.getOwned(contactId, ownerId);
        contactTagRepository.deleteByIdAndContactId(assignmentId, contact.getId());
    }

    private static UUID anchorOf(ContactTag contactTag) {
        var anchor = contactTag.getTag() != null ? contactTag.getTag() : contactTag.getParentTag();
        return anchor != null ? anchor.getId() : null;
    }
}
