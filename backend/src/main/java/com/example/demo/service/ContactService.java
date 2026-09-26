package com.example.demo.service;

import com.example.demo.dto.ContactRequest;
import com.example.demo.dto.GraphNode;
import com.example.demo.dto.NodeKind;
import com.example.demo.dto.TagAssignmentResponse;
import com.example.demo.exception.BadRequestException;
import com.example.demo.exception.NotFoundException;
import com.example.demo.model.Contact;
import com.example.demo.model.ContactLink;
import com.example.demo.model.User;
import com.example.demo.repository.ContactLinkRepository;
import com.example.demo.repository.ContactRepository;
import com.example.demo.repository.ContactTagRepository;
import com.example.demo.repository.UserRepository;
import com.example.demo.util.PhoneNumbers;
import com.example.demo.util.UuidOrdering;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

/**
 * Owns a user's private contacts (placeholder or registered nodes), the links between them, and
 * their notes — plan §4 P2. Every read/write here is scoped to the caller's own contacts:
 * {@link ContactRepository#findByIdAndOwnerId} makes someone else's contact a 404, never a 403.
 */
@Service
@RequiredArgsConstructor
public class ContactService {

    private static final int MAX_NAME_LENGTH = 100;
    private static final int MAX_TEXT_LENGTH = 10_000;

    private final ContactRepository contactRepository;
    private final ContactLinkRepository contactLinkRepository;
    private final ContactTagRepository contactTagRepository;
    private final UserRepository userRepository;
    private final TagTaxonomy tagTaxonomy;

    @Transactional
    public GraphNode createContact(UUID ownerId, ContactRequest request) {
        String firstName = validateName(request.firstName(), true, "First name");
        String lastName = validateName(request.lastName(), false, "Last name");
        String about = validateText(request.about(), "About");
        String phone = PhoneNumbers.clean(request.phoneNumber());

        Contact contact = Contact.builder()
                .owner(userRepository.getReferenceById(ownerId))
                .firstName(firstName)
                .lastName(lastName)
                .about(about)
                .phoneNumber(phone)
                .build();
        contact = contactRepository.save(contact);
        return toNode(contact);
    }

    @Transactional
    public GraphNode patchContact(UUID contactId, UUID ownerId, ContactRequest request) {
        Contact contact = getOwned(contactId, ownerId);

        if (request.firstName() != null) {
            contact.setFirstName(validateName(request.firstName(), true, "First name"));
        }
        if (request.lastName() != null) {
            contact.setLastName(validateName(request.lastName(), false, "Last name"));
        }
        if (request.about() != null) {
            contact.setAbout(validateText(request.about(), "About"));
        }
        if (request.phoneNumber() != null) {
            contact.setPhoneNumber(PhoneNumbers.clean(request.phoneNumber()));
        }
        contact.setUpdatedAt(Instant.now());
        contact = contactRepository.save(contact);
        return toNode(contact);
    }

    /**
     * Deleting a REGISTERED contact also unlinks the mutual edge on the other side: their contact
     * for the caller loses {@code linkedUserId} (becomes a PLACEHOLDER again) but keeps their own
     * notes/tags/name — those live on their contact row, untouched. Any active {@code graph_shares}
     * between the two are left exactly as they are: sharing and connection are independent (§1).
     */
    @Transactional
    public void deleteContact(UUID contactId, UUID ownerId) {
        Contact contact = getOwned(contactId, ownerId);
        if (contact.getLinkedUser() != null) {
            contactRepository.findByOwnerIdAndLinkedUserId(contact.getLinkedUser().getId(), ownerId)
                    .ifPresent(theirContactForMe -> {
                        theirContactForMe.setLinkedUser(null);
                        theirContactForMe.setUpdatedAt(Instant.now());
                        contactRepository.save(theirContactForMe);
                    });
        }
        contactRepository.delete(contact);
    }

    @Transactional
    public void upsertNote(UUID contactId, UUID ownerId, String content) {
        Contact contact = getOwned(contactId, ownerId);
        contact.setNote(validateText(content, "Note"));
        contact.setUpdatedAt(Instant.now());
        contactRepository.save(contact);
    }

    @Transactional
    public void link(UUID ownerId, UUID aId, UUID bId) {
        if (aId == null || bId == null || aId.equals(bId)) {
            throw new BadRequestException("Provide two distinct contacts to link");
        }
        Contact contactA = getOwned(aId, ownerId);
        Contact contactB = getOwned(bId, ownerId);
        boolean aFirst = UuidOrdering.isBefore(contactA.getId(), contactB.getId());
        Contact low = aFirst ? contactA : contactB;
        Contact high = aFirst ? contactB : contactA;

        if (contactLinkRepository.findByContactAIdAndContactBId(low.getId(), high.getId()).isPresent()) {
            return;
        }
        contactLinkRepository.save(ContactLink.builder()
                .owner(contactA.getOwner())
                .contactA(low)
                .contactB(high)
                .build());
    }

    @Transactional
    public void unlink(UUID ownerId, UUID aId, UUID bId) {
        if (aId == null || bId == null || aId.equals(bId)) {
            throw new BadRequestException("Provide two distinct contacts to unlink");
        }
        Contact contactA = getOwned(aId, ownerId);
        Contact contactB = getOwned(bId, ownerId);
        boolean aFirst = UuidOrdering.isBefore(contactA.getId(), contactB.getId());
        Contact low = aFirst ? contactA : contactB;
        Contact high = aFirst ? contactB : contactA;
        contactLinkRepository.deleteByContactAIdAndContactBId(low.getId(), high.getId());
    }

    /**
     * Ensures {@code owner} has a REGISTERED contact for {@code linked} — no-op if one already
     * exists (idempotent). Prefers linking {@code preferredPlaceholder} (the owner's own unlinked
     * contact, re-checked here since it may have changed since it was offered) over creating a new
     * one. Used both by invite-code auto-connect and by accepting a share request with Connect.
     */
    @Transactional
    public void ensureRegisteredContact(User owner, User linked, Contact preferredPlaceholder) {
        if (owner.getId().equals(linked.getId())) {
            return;
        }
        if (contactRepository.existsByOwnerIdAndLinkedUserId(owner.getId(), linked.getId())) {
            return;
        }
        Contact placeholder = preferredPlaceholder == null ? null
                : contactRepository.findByIdAndOwnerId(preferredPlaceholder.getId(), owner.getId())
                        .filter(c -> c.getLinkedUser() == null)
                        .orElse(null);
        if (placeholder != null) {
            placeholder.setLinkedUser(linked);
            placeholder.setUpdatedAt(Instant.now());
            contactRepository.save(placeholder);
        } else {
            contactRepository.save(Contact.builder()
                    .owner(owner)
                    .linkedUser(linked)
                    .firstName(linked.getFirstName())
                    .lastName(linked.getLastName())
                    .build());
        }
    }

    /** Both directions of a mutual edge at once — {@code aPlaceholder}, if given, is only ever tried on a's side. */
    @Transactional
    public void connectMutually(User a, User b, Contact aPlaceholder) {
        ensureRegisteredContact(a, b, aPlaceholder);
        ensureRegisteredContact(b, a, null);
    }

    public Contact getOwned(UUID contactId, UUID ownerId) {
        return contactRepository.findByIdAndOwnerId(contactId, ownerId)
                .orElseThrow(() -> new NotFoundException("Contact not found: " + contactId));
    }

    /** S4's invite-registration cap (plan §4 P5) — see {@link ContactRepository#countByOwnerIdAndLinkedUserIsNotNullAndCreatedAtGreaterThanEqual}. */
    public long countRegisteredContactsCreatedSince(UUID ownerId, Instant since) {
        return contactRepository.countByOwnerIdAndLinkedUserIsNotNullAndCreatedAtGreaterThanEqual(ownerId, since);
    }

    /** Own-contact view: no share overlay, always editable, profile/source are P4's job. */
    GraphNode toNode(Contact contact) {
        TagTaxonomy.Snapshot taxonomy = tagTaxonomy.current();
        var tags = contactTagRepository.findByContactId(contact.getId()).stream()
                .map(ct -> TagAssignmentResponse.from(ct, taxonomy))
                .toList();
        boolean registered = contact.getLinkedUser() != null;
        String phoneNumber = registered ? contact.getLinkedUser().getPhoneNumber() : contact.getPhoneNumber();
        return new GraphNode(
                contact.getId().toString(),
                registered ? NodeKind.REGISTERED : NodeKind.PLACEHOLDER,
                contact.getFirstName(),
                contact.getLastName() == null ? "" : contact.getLastName(),
                contact.getAbout() == null ? "" : contact.getAbout(),
                phoneNumber,
                tags,
                contact.getNote() == null ? "" : contact.getNote(),
                null,
                registered ? contact.getLinkedUser().getId() : null,
                null,
                true
        );
    }

    private String validateName(String name, boolean required, String fieldLabel) {
        String trimmed = name == null ? null : name.trim();
        if (required && (trimmed == null || trimmed.isEmpty())) {
            throw new BadRequestException(fieldLabel + " is required");
        }
        if (trimmed != null && trimmed.length() > MAX_NAME_LENGTH) {
            throw new BadRequestException(fieldLabel + " must be " + MAX_NAME_LENGTH + " characters or fewer");
        }
        return trimmed;
    }

    private String validateText(String text, String fieldLabel) {
        if (text != null && text.length() > MAX_TEXT_LENGTH) {
            throw new BadRequestException(fieldLabel + " must be " + MAX_TEXT_LENGTH + " characters or fewer");
        }
        return text;
    }
}
