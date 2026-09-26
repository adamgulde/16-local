package com.example.demo.dto;

import java.util.List;
import java.util.UUID;

/**
 * One node in a private graph — see plan §3. {@code id} is the contact id (SELF uses the user's
 * own id instead). P2 only ever produces the owner's own PLACEHOLDER/REGISTERED nodes (source
 * always null, editable always true, profile always null); HIDDEN nodes and populated
 * {@code profile}/{@code source} are built by graph composition (P4).
 */
public record GraphNode(
        String id,
        NodeKind kind,
        String firstName,
        String lastName,
        String about,
        String phoneNumber,
        List<TagAssignmentResponse> tags,
        String note,
        ProfileView profile,
        UUID linkedUserId,
        NodeSource source,
        boolean editable
) {
}
