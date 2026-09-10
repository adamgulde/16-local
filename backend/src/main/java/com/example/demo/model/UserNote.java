package com.example.demo.model;

import jakarta.persistence.*;
import lombok.*;

import java.util.UUID;

/**
 * A private note {@code author} wrote about {@code subject} — one evolving text blob per
 * (author, subject) pair, edited in place. Never returned to anyone but its author: there is
 * no endpoint that could return another author's note, by construction (see NoteService).
 */
@Entity
@Table(name = "user_notes", uniqueConstraints = @UniqueConstraint(columnNames = {"author_id", "subject_id"}))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EqualsAndHashCode(of = "id")
@ToString(of = {"id"})
public class UserNote {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(optional = false)
    @JoinColumn(name = "author_id")
    private User author;

    @ManyToOne(optional = false)
    @JoinColumn(name = "subject_id")
    private User subject;

    @Column(columnDefinition = "text")
    private String content;
}
