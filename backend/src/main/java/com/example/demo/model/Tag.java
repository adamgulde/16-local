package com.example.demo.model;

import jakarta.persistence.*;
import lombok.*;

import java.util.UUID;

/**
 * A single entry in the curated, global tag dictionary (e.g. category "Region", label "West").
 * This is the shared menu self-tagging draws from — distinct from {@link UserTag}, which
 * records who actually applied a tag to whom.
 */
@Entity
@Table(name = "tags", uniqueConstraints = @UniqueConstraint(columnNames = {"category", "label"}))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EqualsAndHashCode(of = "id")
@ToString(of = {"id", "category", "label"})
public class Tag {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    private String category;
    private String label;
}
