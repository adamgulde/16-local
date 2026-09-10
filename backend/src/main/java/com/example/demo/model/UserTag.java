package com.example.demo.model;

import jakarta.persistence.*;
import lombok.*;

import java.util.UUID;

/**
 * Records that {@code tagger} applied a tag to {@code subject} — either a dictionary
 * {@link Tag} or a private free-text {@code customLabel}, never both.
 *
 * <p>{@code tagger.equals(subject)} is a self-tag: public, dictionary-only (enforced in
 * {@code TagService}, never trusted from the client). Any other tagger is a private
 * annotation, visible only to that tagger — the same visibility rule as {@link UserNote} —
 * and may use either a dictionary tag or a custom label.
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

    private String customLabel;
}
