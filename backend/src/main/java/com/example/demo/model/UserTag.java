package com.example.demo.model;

import jakarta.persistence.*;
import lombok.*;

import java.util.UUID;

/**
 * Records that {@code tagger} applied a tag to {@code subject} — either a dictionary
 * {@link Tag} or a free-text {@code customLabel} filed under {@code parentTag}, never both.
 *
 * <p>{@code tagger.equals(subject)} is a self-tag: public, whether dictionary or custom (custom
 * self-tags must sit under a category). Any other tagger is a private annotation, visible only to
 * that tagger — the same visibility rule as {@link UserNote}. All rules live in {@code TagService}.
 */
@Entity
@Table(name = "user_tags", uniqueConstraints = @UniqueConstraint(columnNames = {"tagger_id", "subject_id", "tag_id"}))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EqualsAndHashCode(of = "id")
@ToString(of = {"id"})
public class UserTag {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(optional = false)
    @JoinColumn(name = "tagger_id")
    private User tagger;

    @ManyToOne(optional = false)
    @JoinColumn(name = "subject_id")
    private User subject;

    @ManyToOne
    @JoinColumn(name = "tag_id")
    private Tag tag;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "parent_tag_id")
    private Tag parentTag;

    /** Legacy free-text category, kept only for assignments migrated off retired dictionary tags. */
    private String customCategory;

    private String customLabel;
}
