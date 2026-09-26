package com.example.demo.model;

import jakarta.persistence.*;
import lombok.*;

import java.util.UUID;

/**
 * One node in the curated, global tag tree (see backend/scripts/taxonomy/tags.txt). Level-1 nodes
 * are categories ("Personal Interests") and are never applied directly; deeper nodes are tags.
 * This is the shared menu tagging draws from — distinct from {@link UserTag}, which records who
 * actually applied a tag to whom. Paths and inherited rules are resolved by {@code TagTaxonomy}.
 */
@Entity
@Table(name = "tags")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EqualsAndHashCode(of = "id")
@ToString(of = {"id", "category", "label", "level"})
public class Tag {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    private String category;
    private String label;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "parent_id")
    private Tag parent;

    @Builder.Default
    private Integer level = 1;

    private String icon;

    @Builder.Default
    private Integer displayOrder = 0;

    /** Only the subject may apply tags under this node to themselves (sensitive categories). */
    @Builder.Default
    @Column(nullable = false)
    private boolean selfOnly = false;

    /** At most one tag under this node per tagger/subject pair (e.g. one age range). */
    @Builder.Default
    @Column(nullable = false)
    private boolean singleSelect = false;
}
