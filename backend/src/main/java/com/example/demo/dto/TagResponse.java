package com.example.demo.dto;

import com.example.demo.service.TagTaxonomy;

import java.util.UUID;

/**
 * One node of the global tag tree — the menu tagging draws from. {@code category} and
 * {@code icon} are always the node's top-level category, so the client never walks the tree to
 * style a chip; {@code selfOnly} is already inherited from ancestors.
 */
public record TagResponse(
        UUID id,
        String category,
        String label,
        UUID parentId,
        Integer level,
        String icon,
        Integer displayOrder,
        String fullPath,
        boolean hasChildren,
        boolean selectable,
        boolean selfOnly
) {
    public static TagResponse from(TagTaxonomy.Node node, TagTaxonomy.Snapshot taxonomy) {
        TagTaxonomy.Node root = taxonomy.root(node.id());
        return new TagResponse(
                node.id(),
                root.label(),
                node.label(),
                node.parentId(),
                node.level(),
                root.icon(),
                node.displayOrder(),
                taxonomy.path(node.id()),
                taxonomy.hasChildren(node.id()),
                taxonomy.isSelectable(node),
                taxonomy.isSelfOnly(node.id())
        );
    }
}
