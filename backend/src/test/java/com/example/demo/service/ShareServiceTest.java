package com.example.demo.service;

import com.example.demo.dto.ShareFlagsRequest;
import com.example.demo.dto.ShareListResponse;
import com.example.demo.dto.ShareResponse;
import com.example.demo.exception.BadRequestException;
import com.example.demo.exception.NotFoundException;
import com.example.demo.model.Contact;
import com.example.demo.model.GraphShare;
import com.example.demo.model.GraphShareHiddenContact;
import com.example.demo.model.User;
import com.example.demo.repository.ContactRepository;
import com.example.demo.repository.GraphShareHiddenContactRepository;
import com.example.demo.repository.GraphShareRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ShareServiceTest {

    @Mock
    private GraphShareRepository graphShareRepository;
    @Mock
    private GraphShareHiddenContactRepository hiddenContactRepository;
    @Mock
    private ContactRepository contactRepository;

    private ShareService shareService;

    private final UUID sharerId = UUID.randomUUID();
    private final UUID viewerId = UUID.randomUUID();
    private final User sharer = User.builder().id(sharerId).firstName("Sharer").build();
    private final User viewer = User.builder().id(viewerId).firstName("Viewer").build();

    @BeforeEach
    void setUp() {
        shareService = new ShareService(graphShareRepository, hiddenContactRepository, contactRepository);
    }

    @Test
    void sharedByMeIncludesHiddenAndLockedContactIdsSharedWithMeDoesNot() {
        GraphShare share = GraphShare.builder().id(UUID.randomUUID()).sharer(sharer).viewer(viewer).build();
        when(graphShareRepository.findBySharerIdAndRevokedAtIsNull(sharerId)).thenReturn(List.of(share));
        when(graphShareRepository.findByViewerIdAndRevokedAtIsNull(sharerId)).thenReturn(List.of());
        when(hiddenContactRepository.findById_ShareId(share.getId())).thenReturn(List.of());

        User optedOut = User.builder().id(UUID.randomUUID()).discoverableInSharedGraphs(false).build();
        Contact lockedContact = Contact.builder().id(UUID.randomUUID()).owner(sharer).linkedUser(optedOut).build();
        when(contactRepository.findByOwnerId(sharerId)).thenReturn(List.of(lockedContact));

        ShareListResponse response = shareService.list(sharerId);

        assertThat(response.sharedByMe()).hasSize(1);
        ShareResponse byMe = response.sharedByMe().get(0);
        assertThat(byMe.hiddenContactIds()).isEmpty();
        assertThat(byMe.lockedContactIds()).containsExactly(lockedContact.getId());

        // Same share, but as the viewer's side: sharer-only fields must be null.
        when(graphShareRepository.findBySharerIdAndRevokedAtIsNull(viewerId)).thenReturn(List.of());
        when(graphShareRepository.findByViewerIdAndRevokedAtIsNull(viewerId)).thenReturn(List.of(share));
        ShareListResponse asViewer = shareService.list(viewerId);
        ShareResponse withMe = asViewer.sharedWithMe().get(0);
        assertThat(withMe.hiddenContactIds()).isNull();
        assertThat(withMe.lockedContactIds()).isNull();
    }

    @Test
    void lockedContactIdsExcludesContactsWhoseLinkedUserOptedIn() {
        GraphShare share = GraphShare.builder().id(UUID.randomUUID()).sharer(sharer).viewer(viewer).build();
        when(graphShareRepository.findBySharerIdAndRevokedAtIsNull(sharerId)).thenReturn(List.of(share));
        when(graphShareRepository.findByViewerIdAndRevokedAtIsNull(sharerId)).thenReturn(List.of());
        when(hiddenContactRepository.findById_ShareId(share.getId())).thenReturn(List.of());

        User optedIn = User.builder().id(UUID.randomUUID()).discoverableInSharedGraphs(true).build();
        Contact discoverableContact = Contact.builder().id(UUID.randomUUID()).owner(sharer).linkedUser(optedIn).build();
        Contact placeholder = Contact.builder().id(UUID.randomUUID()).owner(sharer).build();
        when(contactRepository.findByOwnerId(sharerId)).thenReturn(List.of(discoverableContact, placeholder));

        ShareResponse byMe = shareService.list(sharerId).sharedByMe().get(0);

        assertThat(byMe.lockedContactIds()).isEmpty();
    }

    @Test
    void updateFlagsOnlyAppliesFieldsThatWerePresentAndIsSharerOnly() {
        GraphShare share = GraphShare.builder().id(UUID.randomUUID()).sharer(sharer).viewer(viewer)
                .shareAbout(true).build();
        when(graphShareRepository.findByIdAndSharerId(share.getId(), sharerId)).thenReturn(Optional.of(share));
        when(graphShareRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        lenient().when(hiddenContactRepository.findById_ShareId(share.getId())).thenReturn(List.of());
        lenient().when(contactRepository.findByOwnerId(sharerId)).thenReturn(List.of());

        shareService.updateFlags(share.getId(), sharerId, new ShareFlagsRequest(null, true, null, null));

        assertThat(share.isShareAbout()).isTrue();
        assertThat(share.isShareTags()).isTrue();
        assertThat(share.isShareNotes()).isFalse();

        when(graphShareRepository.findByIdAndSharerId(share.getId(), viewerId)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> shareService.updateFlags(share.getId(), viewerId, new ShareFlagsRequest(true, null, null, null)))
                .isInstanceOf(NotFoundException.class);
    }

    @Test
    void replaceHiddenContactsRejectsAnyIdThatIsNotTheSharersOwnContact() {
        GraphShare share = GraphShare.builder().id(UUID.randomUUID()).sharer(sharer).viewer(viewer).build();
        when(graphShareRepository.findByIdAndSharerId(share.getId(), sharerId)).thenReturn(Optional.of(share));
        UUID notMine = UUID.randomUUID();
        when(contactRepository.findByOwnerIdAndIdIn(sharerId, java.util.Set.of(notMine))).thenReturn(List.of());

        assertThatThrownBy(() -> shareService.replaceHiddenContacts(share.getId(), sharerId, List.of(notMine)))
                .isInstanceOf(BadRequestException.class);
        verify(hiddenContactRepository, never()).deleteById_ShareId(any());
    }

    @Test
    void replaceHiddenContactsFullyReplacesTheSet() {
        GraphShare share = GraphShare.builder().id(UUID.randomUUID()).sharer(sharer).viewer(viewer).build();
        Contact mine = Contact.builder().id(UUID.randomUUID()).owner(sharer).build();
        when(graphShareRepository.findByIdAndSharerId(share.getId(), sharerId)).thenReturn(Optional.of(share));
        when(contactRepository.findByOwnerIdAndIdIn(sharerId, java.util.Set.of(mine.getId()))).thenReturn(List.of(mine));

        shareService.replaceHiddenContacts(share.getId(), sharerId, List.of(mine.getId()));

        verify(hiddenContactRepository).deleteById_ShareId(share.getId());
        verify(hiddenContactRepository).saveAll(org.mockito.ArgumentMatchers.<List<GraphShareHiddenContact>>argThat(
                list -> list.size() == 1 && list.get(0).getContact().getId().equals(mine.getId())));
    }

    @Test
    void revokeOrRemoveWorksForEitherPartyAndIsA404Otherwise() {
        GraphShare share = GraphShare.builder().id(UUID.randomUUID()).sharer(sharer).viewer(viewer).build();
        when(graphShareRepository.findByIdAndEitherParty(share.getId(), viewerId)).thenReturn(Optional.of(share));
        when(graphShareRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        shareService.revokeOrRemove(share.getId(), viewerId);

        assertThat(share.getRevokedAt()).isNotNull();

        UUID strangerId = UUID.randomUUID();
        when(graphShareRepository.findByIdAndEitherParty(share.getId(), strangerId)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> shareService.revokeOrRemove(share.getId(), strangerId))
                .isInstanceOf(NotFoundException.class);
    }
}
