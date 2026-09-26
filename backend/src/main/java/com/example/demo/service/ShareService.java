package com.example.demo.service;

import com.example.demo.dto.ShareFlagsRequest;
import com.example.demo.dto.ShareListResponse;
import com.example.demo.dto.ShareResponse;
import com.example.demo.exception.BadRequestException;
import com.example.demo.exception.NotFoundException;
import com.example.demo.model.Contact;
import com.example.demo.model.GraphShare;
import com.example.demo.model.GraphShareHiddenContact;
import com.example.demo.model.GraphShareHiddenContactId;
import com.example.demo.model.User;
import com.example.demo.repository.ContactRepository;
import com.example.demo.repository.GraphShareHiddenContactRepository;
import com.example.demo.repository.GraphShareRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * Live graph-share grants (plan §1.4-1.5, §4 P3): who may view whose direct contacts, and what of
 * them (bio/tags/notes/phone — name is always shown). Full graph composition for
 * {@code GET /api/shares/{id}/graph} is P4; this service only owns the share records themselves.
 */
@Service
@RequiredArgsConstructor
public class ShareService {

    private final GraphShareRepository graphShareRepository;
    private final GraphShareHiddenContactRepository hiddenContactRepository;
    private final ContactRepository contactRepository;

    @Transactional(readOnly = true)
    public ShareListResponse list(UUID userId) {
        List<ShareResponse> sharedByMe = graphShareRepository.findBySharerIdAndRevokedAtIsNull(userId).stream()
                .map(gs -> toResponse(gs, true))
                .toList();
        List<ShareResponse> sharedWithMe = graphShareRepository.findByViewerIdAndRevokedAtIsNull(userId).stream()
                .map(gs -> toResponse(gs, false))
                .toList();
        return new ShareListResponse(sharedByMe, sharedWithMe);
    }

    @Transactional
    public ShareResponse updateFlags(UUID shareId, UUID sharerId, ShareFlagsRequest request) {
        GraphShare share = graphShareRepository.findByIdAndSharerId(shareId, sharerId)
                .orElseThrow(() -> new NotFoundException("Share not found: " + shareId));
        if (request.shareAbout() != null) {
            share.setShareAbout(request.shareAbout());
        }
        if (request.shareTags() != null) {
            share.setShareTags(request.shareTags());
        }
        if (request.shareNotes() != null) {
            share.setShareNotes(request.shareNotes());
        }
        if (request.sharePhone() != null) {
            share.setSharePhone(request.sharePhone());
        }
        share = graphShareRepository.save(share);
        return toResponse(share, true);
    }

    /** Full replace — every id must be one of the sharer's own contacts, else 400 (§4 P3). */
    @Transactional
    public void replaceHiddenContacts(UUID shareId, UUID sharerId, List<UUID> contactIds) {
        GraphShare share = graphShareRepository.findByIdAndSharerId(shareId, sharerId)
                .orElseThrow(() -> new NotFoundException("Share not found: " + shareId));

        Set<UUID> distinctIds = contactIds == null ? Set.of() : new HashSet<>(contactIds);
        List<Contact> owned = distinctIds.isEmpty() ? List.of()
                : contactRepository.findByOwnerIdAndIdIn(sharerId, distinctIds);
        if (owned.size() != distinctIds.size()) {
            throw new BadRequestException("hidden-contacts must all be your own contacts");
        }

        hiddenContactRepository.deleteById_ShareId(shareId);
        List<GraphShareHiddenContact> rows = owned.stream()
                .map(contact -> GraphShareHiddenContact.builder()
                        .id(new GraphShareHiddenContactId(share.getId(), contact.getId()))
                        .share(share)
                        .contact(contact)
                        .build())
                .toList();
        hiddenContactRepository.saveAll(rows);
    }

    /** Either party may revoke/remove — someone else's share is a 404. */
    @Transactional
    public void revokeOrRemove(UUID shareId, UUID userId) {
        GraphShare share = graphShareRepository.findByIdAndEitherParty(shareId, userId)
                .orElseThrow(() -> new NotFoundException("Share not found: " + shareId));
        share.setRevokedAt(Instant.now());
        graphShareRepository.save(share);
    }

    private ShareResponse toResponse(GraphShare share, boolean asSharer) {
        List<UUID> hidden = null;
        List<UUID> locked = null;
        if (asSharer) {
            hidden = hiddenContactRepository.findById_ShareId(share.getId()).stream()
                    .map(h -> h.getContact().getId())
                    .toList();
            locked = computeLockedContactIds(share.getSharer().getId());
        }
        return new ShareResponse(
                share.getId(),
                share.getSharer().getId(), fullName(share.getSharer()),
                share.getViewer().getId(), fullName(share.getViewer()),
                share.isShareAbout(), share.isShareTags(), share.isShareNotes(), share.isSharePhone(),
                hidden, locked, share.getCreatedAt());
    }

    /** Your REGISTERED contacts whose linked user opted out of discovery — always Hidden User, can't be un-hidden. */
    private List<UUID> computeLockedContactIds(UUID sharerId) {
        return contactRepository.findByOwnerId(sharerId).stream()
                .filter(c -> c.getLinkedUser() != null && !c.getLinkedUser().isDiscoverableInSharedGraphs())
                .map(Contact::getId)
                .toList();
    }

    private static String fullName(User user) {
        return (user.getFirstName() == null ? "" : user.getFirstName())
                + (user.getLastName() == null ? "" : " " + user.getLastName());
    }
}
