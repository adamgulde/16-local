package com.example.demo.model;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

/**
 * A live grant letting {@code viewer} see {@code sharer}'s direct contacts (never contacts the
 * sharer only sees through someone else's share — no re-sharing). The four {@code shareX} flags are
 * per-share, sharer-only visibility toggles for bio/tags/notes/phone; name is always shown. See the
 * plan §1.4 and §3's {@code Share} DTO.
 */
@Entity
@Table(name = "graph_shares")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EqualsAndHashCode(of = "id")
@ToString(of = {"id", "sharer", "viewer"})
public class GraphShare {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "sharer_id")
    private User sharer;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "viewer_id")
    private User viewer;

    @Column(name = "share_about", nullable = false)
    @Builder.Default
    private boolean shareAbout = false;

    @Column(name = "share_tags", nullable = false)
    @Builder.Default
    private boolean shareTags = false;

    @Column(name = "share_notes", nullable = false)
    @Builder.Default
    private boolean shareNotes = false;

    @Column(name = "share_phone", nullable = false)
    @Builder.Default
    private boolean sharePhone = false;

    @Column(name = "created_at", nullable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();

    /** Null while active; set once the sharer revokes or the viewer removes the share. */
    @Column(name = "revoked_at")
    private Instant revokedAt;
}
