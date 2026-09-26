package com.example.demo.service;

import com.example.demo.dto.RespondRequest;
import com.example.demo.dto.ShareRequestCreateRequest;
import com.example.demo.dto.ShareRequestDirection;
import com.example.demo.dto.ShareRequestListResponse;
import com.example.demo.dto.ShareRequestResponse;
import com.example.demo.exception.BadRequestException;
import com.example.demo.exception.NotFoundException;
import com.example.demo.exception.TooManyRequestsException;
import com.example.demo.model.Contact;
import com.example.demo.model.GraphShare;
import com.example.demo.model.ShareRequest;
import com.example.demo.model.User;
import com.example.demo.ratelimit.RateLimitProperties;
import com.example.demo.ratelimit.RateLimitService;
import com.example.demo.repository.ContactRepository;
import com.example.demo.repository.GraphShareRepository;
import com.example.demo.repository.ShareRequestRepository;
import com.example.demo.repository.UserRepository;
import com.example.demo.security.EncryptedPhoneNumberConverter;
import com.example.demo.util.MinimumResponseTime;
import com.example.demo.util.PhoneNumbers;
import io.github.bucket4j.ConsumptionProbe;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

/**
 * Graph-share requests (plan §1.3, §1.7 and §4 P3) — replaces connection requests. Discovery never
 * enumerates: {@link #create} always completes normally (the controller always answers 202)
 * whether or not the target phone number/invite code matched an account, and whether or not a row
 * was actually written.
 */
@Service
@RequiredArgsConstructor
public class ShareRequestService {

    private final ShareRequestRepository shareRequestRepository;
    private final ContactRepository contactRepository;
    private final UserRepository userRepository;
    private final GraphShareRepository graphShareRepository;
    private final ContactService contactService;
    private final RateLimitService rateLimitService;
    private final RateLimitProperties rateLimitProperties;

    @Transactional
    public void create(UUID senderId, ShareRequestCreateRequest request) {
        enforceRateLimit(senderId);

        boolean hasPhone = request.phoneNumber() != null && !request.phoneNumber().isBlank();
        boolean hasInvite = request.inviteCode() != null && !request.inviteCode().isBlank();
        if (hasPhone == hasInvite) {
            throw new BadRequestException("Provide exactly one of phoneNumber or inviteCode");
        }

        // Revealing that a placeholder isn't the sender's own unlinked contact leaks nothing about
        // the recipient, so this validation may fail loudly (400) unlike the recipient lookup below.
        Contact placeholder = null;
        if (request.placeholderContactId() != null) {
            placeholder = contactRepository.findByIdAndOwnerId(request.placeholderContactId(), senderId)
                    .orElseThrow(() -> new BadRequestException("placeholderContactId must be your own contact"));
            if (placeholder.getLinkedUser() != null) {
                throw new BadRequestException("placeholderContactId must be an unlinked contact");
            }
        }

        User sender = userRepository.findById(senderId)
                .orElseThrow(() -> new NotFoundException("User not found: " + senderId));

        // A match writes a row (and, on unknown-phone, encrypts it); a miss does nothing — pad both
        // paths to the same floor so response timing can't be used to enumerate accounts/invite
        // codes, the same way AuthController's initiate-otp endpoints do (plan §4 P4 fix-up).
        long startNanos = System.nanoTime();
        if (hasPhone) {
            String normalizedPhone = PhoneNumbers.clean(request.phoneNumber());
            Optional<User> recipient = normalizedPhone == null ? Optional.empty()
                    : userRepository.findByPhoneNumber(normalizedPhone);
            if (recipient.isPresent()) {
                createForKnownRecipient(sender, recipient.get(), placeholder);
            } else if (normalizedPhone != null) {
                createForUnknownPhone(sender, normalizedPhone, placeholder);
            }
        } else {
            String code = request.inviteCode().trim().toUpperCase();
            Contact chosenPlaceholder = placeholder;
            userRepository.findByInviteCode(code)
                    .ifPresent(recipient -> createForKnownRecipient(sender, recipient, chosenPlaceholder));
        }
        MinimumResponseTime.enforce(startNanos);
    }

    private void createForKnownRecipient(User sender, User recipient, Contact placeholder) {
        if (recipient.getId().equals(sender.getId())) {
            return;
        }
        if (shareRequestRepository.existsBySenderIdAndRecipientIdAndStatus(
                sender.getId(), recipient.getId(), ShareRequest.Status.PENDING)) {
            return;
        }
        shareRequestRepository.save(ShareRequest.builder()
                .sender(sender)
                .recipient(recipient)
                .placeholderContact(placeholder)
                .build());
    }

    private void createForUnknownPhone(User sender, String normalizedPhone, Contact placeholder) {
        String encrypted = EncryptedPhoneNumberConverter.encrypt(normalizedPhone);
        if (shareRequestRepository.existsBySenderIdAndTargetPhoneEncryptedAndRecipientIdIsNullAndStatus(
                sender.getId(), encrypted, ShareRequest.Status.PENDING)) {
            return;
        }
        shareRequestRepository.save(ShareRequest.builder()
                .sender(sender)
                .targetPhoneEncrypted(encrypted)
                .placeholderContact(placeholder)
                .build());
    }

    /** Hook for AuthController#register: attach any share requests sent to this phone before it registered. */
    @Transactional
    public void attachPendingRequestsForNewUser(User newUser) {
        String encrypted = EncryptedPhoneNumberConverter.encrypt(newUser.getPhoneNumber());
        var pending = shareRequestRepository.findByTargetPhoneEncryptedAndRecipientIdIsNullAndStatus(
                encrypted, ShareRequest.Status.PENDING);
        pending.forEach(sr -> sr.setRecipient(newUser));
        shareRequestRepository.saveAll(pending);
    }

    @Transactional(readOnly = true)
    public ShareRequestListResponse list(UUID userId) {
        var incoming = shareRequestRepository.findByRecipientId(userId).stream()
                .map(sr -> new ShareRequestResponse(
                        sr.getId(), ShareRequestDirection.INCOMING,
                        fullName(sr.getSender()), null,
                        sr.getCreatedAt(), sr.getStatus()))
                .toList();
        var outgoing = shareRequestRepository.findBySenderId(userId).stream()
                .map(sr -> new ShareRequestResponse(
                        sr.getId(), ShareRequestDirection.OUTGOING,
                        sr.getStatus() == ShareRequest.Status.ACCEPTED && sr.getRecipient() != null
                                ? fullName(sr.getRecipient()) : null,
                        sr.getPlaceholderContact() != null ? fullName(sr.getPlaceholderContact()) : null,
                        sr.getCreatedAt(), sr.getStatus()))
                .toList();
        return new ShareRequestListResponse(incoming, outgoing);
    }

    @Transactional
    public void respond(UUID id, UUID recipientId, RespondRequest request) {
        ShareRequest shareRequest = shareRequestRepository.findByIdAndRecipientId(id, recipientId)
                .orElseThrow(() -> new NotFoundException("Share request not found: " + id));
        if (shareRequest.getStatus() != ShareRequest.Status.PENDING) {
            throw new BadRequestException("This request has already been answered");
        }

        User sender = shareRequest.getSender();
        User recipient = shareRequest.getRecipient();

        if (request.connect()) {
            contactService.connectMutually(sender, recipient, shareRequest.getPlaceholderContact());
        }
        if (request.allowView()) {
            grantView(recipient, sender);
        }

        shareRequest.setStatus(request.connect() || request.allowView()
                ? ShareRequest.Status.ACCEPTED : ShareRequest.Status.DECLINED);
        shareRequest.setRespondedAt(Instant.now());
        shareRequestRepository.save(shareRequest);
    }

    /** allowView: sharer=recipient (the one responding), viewer=sender — "A may view B's graph" (§1.3). */
    private void grantView(User sharer, User viewer) {
        Optional<GraphShare> existing = graphShareRepository
                .findBySharerIdAndViewerIdAndRevokedAtIsNull(sharer.getId(), viewer.getId());
        if (existing.isPresent()) {
            return;
        }
        graphShareRepository.save(GraphShare.builder().sharer(sharer).viewer(viewer).build());
    }

    @Transactional
    public void cancel(UUID id, UUID senderId) {
        ShareRequest shareRequest = shareRequestRepository.findByIdAndSenderId(id, senderId)
                .orElseThrow(() -> new NotFoundException("Share request not found: " + id));
        if (shareRequest.getStatus() != ShareRequest.Status.PENDING) {
            throw new BadRequestException("Only a pending request can be cancelled");
        }
        shareRequest.setStatus(ShareRequest.Status.CANCELLED);
        shareRequest.setRespondedAt(Instant.now());
        shareRequestRepository.save(shareRequest);
    }

    private void enforceRateLimit(UUID senderId) {
        ConsumptionProbe probe = rateLimitService.tryConsume("share-request:" + senderId, () -> RateLimitService.bucketOf(
                RateLimitService.bandwidth(rateLimitProperties.getUser().getShareRequestsPerDay(), Duration.ofDays(1))));
        if (!probe.isConsumed()) {
            long retryAfterSeconds = TimeUnit.NANOSECONDS.toSeconds(probe.getNanosToWaitForRefill()) + 1;
            throw new TooManyRequestsException(retryAfterSeconds);
        }
    }

    private static String fullName(User user) {
        return (user.getFirstName() == null ? "" : user.getFirstName())
                + (user.getLastName() == null ? "" : " " + user.getLastName());
    }

    private static String fullName(Contact contact) {
        return (contact.getFirstName() == null ? "" : contact.getFirstName())
                + (contact.getLastName() == null ? "" : " " + contact.getLastName());
    }
}
