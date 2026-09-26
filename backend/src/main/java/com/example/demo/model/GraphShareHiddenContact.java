package com.example.demo.model;

import jakarta.persistence.*;
import lombok.*;

/**
 * One contact the sharer has interactively hidden from a specific {@link GraphShare} — renders as
 * "Hidden User" to that share's viewer. Composite key (share, contact) since the pair itself is the
 * whole fact; {@code PUT /api/shares/{id}/hidden-contacts} replaces the full set for a share.
 */
@Entity
@Table(name = "graph_share_hidden_contacts")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EqualsAndHashCode(of = "id")
public class GraphShareHiddenContact {

    @EmbeddedId
    private GraphShareHiddenContactId id;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @MapsId("shareId")
    @JoinColumn(name = "share_id")
    private GraphShare share;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @MapsId("contactId")
    @JoinColumn(name = "contact_id")
    private Contact contact;
}
