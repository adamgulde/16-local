package com.example.demo.dto;

import com.example.demo.model.ContactTag;
import com.example.demo.model.UserTag;
import com.example.demo.service.TagTaxonomy;

import java.util.UUID;

/**
 * One tag as a particular viewer sees it on someone's card: a public self-tag, or a private tag
 * the current viewer placed on this person themselves (isMine) — never a third party's private
 * tag, which this record's caller (TagService) never fetches in the first place.
 *
 * <p>{@code kind} drives the chip colour: SELF (dictionary self-tag), CUSTOM (free-text self-tag)
 * or PRIVATE (anything the viewer placed on someone else). Category is shown by {@code icon}.
 */
public record TagAssignmentResponse(
        UUID id,
        String category,
        String label,
        boolean isSelfTag,
        boolean isMine,
        Kind kind,
        UUID tagId,
        UUID parentId,
        Integer level,
        String icon,
        String fullPath
) {
    public enum Kind { SELF, CUSTOM, PRIVATE }

    public static final String UNCATEGORIZED = "Custom";

    public static TagAssignmentResponse from(UserTag userTag, UUID viewerId, TagTaxonomy.Snapshot taxonomy) {
        boolean isSelfTag = userTag.getTagger().getId().equals(userTag.getSubject().getId());
        boolean isMine = userTag.getTagger().getId().equals(viewerId);
        Kind kind = !isSelfTag ? Kind.PRIVATE : userTag.getTag() != null ? Kind.SELF : Kind.CUSTOM;

        // Dictionary tag: everything comes from the tree. Custom tag: filed under parentTag.
        UUID tagId = userTag.getTag() != null ? userTag.getTag().getId() : null;
        UUID anchorId = tagId != null ? tagId : userTag.getParentTag() != null ? userTag.getParentTag().getId() : null;
        TagTaxonomy.Node anchor = taxonomy.get(anchorId).orElse(null);

        if (anchor == null) {
            String legacyCategory = userTag.getCustomCategory();
            boolean hasLegacyCategory = legacyCategory != null && !legacyCategory.isBlank();
            return new TagAssignmentResponse(
                    userTag.getId(),
                    hasLegacyCategory ? legacyCategory : UNCATEGORIZED,
                    userTag.getCustomLabel(),
                    isSelfTag, isMine, kind, null, null, 1, null,
                    hasLegacyCategory ? legacyCategory + TagTaxonomy.PATH_SEPARATOR + userTag.getCustomLabel()
                            : userTag.getCustomLabel());
        }

        TagTaxonomy.Node root = taxonomy.root(anchor.id());
        String anchorPath = taxonomy.path(anchor.id());
        boolean isDictionary = tagId != null;
        return new TagAssignmentResponse(
                userTag.getId(),
                root.label(),
                isDictionary ? anchor.label() : userTag.getCustomLabel(),
                isSelfTag,
                isMine,
                kind,
                tagId,
                isDictionary ? anchor.parentId() : anchor.id(),
                isDictionary ? anchor.level() : anchor.level() + 1,
                root.icon(),
                isDictionary ? anchorPath : anchorPath + TagTaxonomy.PATH_SEPARATOR + userTag.getCustomLabel()
        );
    }

    /**
     * A tag the owner placed on one of their own contacts. Contacts are never "self", so every
     * contact tag is shaped like a private {@link UserTag} on someone else: {@code isSelfTag} is
     * always false, {@code isMine} always true (contact tags are only ever fetched by their
     * owner), and {@code kind} is always {@link Kind#PRIVATE}.
     */
    public static TagAssignmentResponse from(ContactTag contactTag, TagTaxonomy.Snapshot taxonomy) {
        UUID tagId = contactTag.getTag() != null ? contactTag.getTag().getId() : null;
        UUID anchorId = tagId != null ? tagId
                : contactTag.getParentTag() != null ? contactTag.getParentTag().getId() : null;
        TagTaxonomy.Node anchor = taxonomy.get(anchorId).orElse(null);

        if (anchor == null) {
            String legacyCategory = contactTag.getCustomCategory();
            boolean hasLegacyCategory = legacyCategory != null && !legacyCategory.isBlank();
            return new TagAssignmentResponse(
                    contactTag.getId(),
                    hasLegacyCategory ? legacyCategory : UNCATEGORIZED,
                    contactTag.getCustomLabel(),
                    false, true, Kind.PRIVATE, null, null, 1, null,
                    hasLegacyCategory ? legacyCategory + TagTaxonomy.PATH_SEPARATOR + contactTag.getCustomLabel()
                            : contactTag.getCustomLabel());
        }

        TagTaxonomy.Node root = taxonomy.root(anchor.id());
        String anchorPath = taxonomy.path(anchor.id());
        boolean isDictionary = tagId != null;
        return new TagAssignmentResponse(
                contactTag.getId(),
                root.label(),
                isDictionary ? anchor.label() : contactTag.getCustomLabel(),
                false,
                true,
                Kind.PRIVATE,
                tagId,
                isDictionary ? anchor.parentId() : anchor.id(),
                isDictionary ? anchor.level() : anchor.level() + 1,
                root.icon(),
                isDictionary ? anchorPath : anchorPath + TagTaxonomy.PATH_SEPARATOR + contactTag.getCustomLabel()
        );
    }
}
