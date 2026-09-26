package com.example.demo.util;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.UUID;

/**
 * Deterministic, opaque ids for graph composition (plan §4 P4) — currently just the id a HIDDEN
 * node gets: stable across calls (the same share always hides the same contact under the same id)
 * and different across shares (the same contact hidden from two different shares gets two
 * different ids, so a viewer can never correlate a Hidden User between two shares, or reverse the
 * contact id out of it without already knowing it). Implemented as a standard RFC 4122 v5
 * (SHA-1, name-based) UUID under a fixed namespace, exactly like a DNS/URL-namespaced UUIDv5.
 */
public final class DeterministicIds {

    /** Fixed, arbitrary namespace for this app's hidden-contact ids — never reuse for anything else. */
    private static final UUID HIDDEN_CONTACT_NAMESPACE = UUID.fromString("6f3d6b3e-6e0a-4b8f-9f0e-9a2f5f6d7c11");

    private DeterministicIds() {
    }

    /** The id a viewer sees for {@code contactId} once it's hidden (explicitly or "locked") from {@code shareId}. */
    public static UUID hiddenContactId(UUID shareId, UUID contactId) {
        return uuidV5(HIDDEN_CONTACT_NAMESPACE, shareId + ":" + contactId);
    }

    private static UUID uuidV5(UUID namespace, String name) {
        try {
            MessageDigest sha1 = MessageDigest.getInstance("SHA-1");
            ByteBuffer namespaceBytes = ByteBuffer.allocate(16);
            namespaceBytes.putLong(namespace.getMostSignificantBits());
            namespaceBytes.putLong(namespace.getLeastSignificantBits());
            sha1.update(namespaceBytes.array());
            byte[] hash = sha1.digest(name.getBytes(StandardCharsets.UTF_8));

            hash[6] &= 0x0f;
            hash[6] |= 0x50; // version 5
            hash[8] &= 0x3f;
            hash[8] |= (byte) 0x80; // RFC 4122 variant

            ByteBuffer buffer = ByteBuffer.wrap(hash, 0, 16);
            return new UUID(buffer.getLong(), buffer.getLong());
        } catch (NoSuchAlgorithmException e) {
            // SHA-1 is a JDK-mandated algorithm; this can't actually happen.
            throw new IllegalStateException(e);
        }
    }
}
