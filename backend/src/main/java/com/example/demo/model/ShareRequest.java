package com.example.demo.model;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

/**
 * A graph-share request from {@code sender} to either a known {@code recipient}, or a phone number
 * / invite code that hasn't registered yet (recipient null; {@code targetPhoneEncrypted} /
 * {@code targetInviteCode} set instead, and matched up if that number registers later). Replaces
 * {@link ConnectionRequest}; see the plan §1.3 for the two independent Accept choices this maps to.
 */
@Entity
@Table(name = "share_requests")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EqualsAndHashCode(of = "id")
@ToString(of = {"id", "status"})
public class ShareRequest {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "sender_id")
    private User sender;

    /** Null while the target phone number / invite code hasn't matched a registered user yet. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "recipient_id")
    private User recipient;

    /**
     * The same deterministic-encryption ciphertext EncryptedPhoneNumberConverter would produce for
     * the normalized target phone number when saved as a {@code users.phone_number} — reversible
     * with the app key, same protection level as that column, not a one-way hash. See V6's
     * migration comment for why this format was chosen over a separate secret.
     */
    @Column(name = "target_phone_encrypted")
    private String targetPhoneEncrypted;

    @Column(name = "target_invite_code")
    private String targetInviteCode;

    /** The sender's own (unlinked) contact offered as "this is my placeholder for them" on Connect. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "placeholder_contact_id")
    private Contact placeholderContact;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    @Builder.Default
    private Status status = Status.PENDING;

    @Column(name = "created_at", nullable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();

    @Column(name = "responded_at")
    private Instant respondedAt;

    public enum Status {
        PENDING, ACCEPTED, DECLINED, CANCELLED
    }
}
