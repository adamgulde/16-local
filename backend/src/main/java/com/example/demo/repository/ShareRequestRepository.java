package com.example.demo.repository;

import com.example.demo.model.ShareRequest;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface ShareRequestRepository extends JpaRepository<ShareRequest, UUID> {

    /** GET /api/share-requests "incoming" — every request ever addressed to this recipient. */
    List<ShareRequest> findByRecipientId(UUID recipientId);

    /** GET /api/share-requests "outgoing" — every request this sender has sent. */
    List<ShareRequest> findBySenderId(UUID senderId);

    /** Ownership check for responding: only the addressed recipient may accept/decline. */
    Optional<ShareRequest> findByIdAndRecipientId(UUID id, UUID recipientId);

    /** Ownership check for cancelling: only the sender may cancel their own request. */
    Optional<ShareRequest> findByIdAndSenderId(UUID id, UUID senderId);

    List<ShareRequest> findByRecipientIdAndStatus(UUID recipientId, ShareRequest.Status status);

    boolean existsBySenderIdAndRecipientIdAndStatus(UUID senderId, UUID recipientId, ShareRequest.Status status);

    /** Requests to a phone number that hadn't registered yet, matched up once it does (P3). */
    List<ShareRequest> findByTargetPhoneEncryptedAndRecipientIdIsNullAndStatus(String targetPhoneEncrypted, ShareRequest.Status status);

    /** De-dupe for an unknown-phone request: same sender, same target phone, still PENDING. */
    boolean existsBySenderIdAndTargetPhoneEncryptedAndRecipientIdIsNullAndStatus(
            UUID senderId, String targetPhoneEncrypted, ShareRequest.Status status);
}
