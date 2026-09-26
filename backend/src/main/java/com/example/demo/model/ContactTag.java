package com.example.demo.model;

import jakarta.persistence.*;
import lombok.*;

import java.util.UUID;

/**
 * A tag the owner of {@code contact} placed on it — mirrors {@link UserTag}'s dictionary-tag XOR
 * free-text-under-parent shape, but keyed by contact instead of (tagger, subject): the contact
 * itself already identifies both who wrote it (contact.owner) and who it's about.
 */
@Entity
@Table(name = "contact_tags", uniqueConstraints = @UniqueConstraint(columnNames = {"contact_id", "tag_id"}))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EqualsAndHashCode(of = "id")
@ToString(of = {"id"})
public class ContactTag {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "contact_id")
    private Contact contact;

    @ManyToOne
    @JoinColumn(name = "tag_id")
    private Tag tag;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "parent_tag_id")
    private Tag parentTag;

    /** Legacy free-text category, kept only for parity with UserTag's retired-tag fallback. */
    private String customCategory;

    private String customLabel;
}
