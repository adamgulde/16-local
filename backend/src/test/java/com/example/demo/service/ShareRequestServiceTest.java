package com.example.demo.service;

import com.example.demo.dto.RespondRequest;
import com.example.demo.dto.ShareRequestCreateRequest;
import com.example.demo.dto.ShareRequestListResponse;
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
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
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
class ShareRequestServiceTest {

    @Mock
    private ShareRequestRepository shareRequestRepository;
    @Mock
    private ContactRepository contactRepository;
    @Mock
    private UserRepository userRepository;
    @Mock
    private GraphShareRepository graphShareRepository;
    @Mock
    private ContactService contactService;

    private ShareRequestService shareRequestService;

    private final UUID senderId = UUID.randomUUID();
    private final User sender = User.builder().id(senderId).firstName("Sender").phoneNumber("+1 555-000-0001").build();
    private final UUID recipientId = UUID.randomUUID();
    private final User recipient = User.builder().id(recipientId).firstName("Recipient").phoneNumber("+1 555-000-0002").build();

    @BeforeEach
    void setUp() {
        RateLimitProperties properties = new RateLimitProperties();
        properties.getUser().setShareRequestsPerDay(1000);
        shareRequestService = new ShareRequestService(shareRequestRepository, contactRepository, userRepository,
                graphShareRepository, contactService, new RateLimitService(properties), properties);
        lenient().when(userRepository.findById(senderId)).thenReturn(Optional.of(sender));
        lenient().when(shareRequestRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
    }

    @Test
    void exactlyOneOfPhoneOrInviteCodeIsRequired() {
        assertThatThrownBy(() -> shareRequestService.create(senderId, new ShareRequestCreateRequest(null, null, null)))
                .isInstanceOf(BadRequestException.class);
        assertThatThrownBy(() -> shareRequestService.create(senderId,
                new ShareRequestCreateRequest("5551234567", "ABCDEF", null)))
                .isInstanceOf(BadRequestException.class);
    }

    @Test
    void placeholderMustBeTheSendersOwnUnlinkedContact() {
        UUID placeholderId = UUID.randomUUID();
        when(contactRepository.findByIdAndOwnerId(placeholderId, senderId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> shareRequestService.create(senderId,
                new ShareRequestCreateRequest("5551234567", null, placeholderId)))
                .isInstanceOf(BadRequestException.class);
    }

    @Test
    void placeholderThatIsAlreadyLinkedIsRejected() {
        UUID placeholderId = UUID.randomUUID();
        Contact linked = Contact.builder().id(placeholderId).owner(sender).linkedUser(recipient).build();
        when(contactRepository.findByIdAndOwnerId(placeholderId, senderId)).thenReturn(Optional.of(linked));

        assertThatThrownBy(() -> shareRequestService.create(senderId,
                new ShareRequestCreateRequest("5551234567", null, placeholderId)))
                .isInstanceOf(BadRequestException.class);
    }

    @Test
    void cannotTargetYourselfByPhoneOrInviteCodeButStillNoOp() {
        when(userRepository.findByPhoneNumber(sender.getPhoneNumber())).thenReturn(Optional.of(sender));

        shareRequestService.create(senderId, new ShareRequestCreateRequest(sender.getPhoneNumber(), null, null));

        verify(shareRequestRepository, never()).save(any());
    }

    @Test
    void knownRecipientByPhoneCreatesAPendingRequest() {
        when(userRepository.findByPhoneNumber(recipient.getPhoneNumber())).thenReturn(Optional.of(recipient));
        when(shareRequestRepository.existsBySenderIdAndRecipientIdAndStatus(senderId, recipientId, ShareRequest.Status.PENDING))
                .thenReturn(false);

        shareRequestService.create(senderId, new ShareRequestCreateRequest(recipient.getPhoneNumber(), null, null));

        ArgumentCaptor<ShareRequest> captor = ArgumentCaptor.forClass(ShareRequest.class);
        verify(shareRequestRepository).save(captor.capture());
        assertThat(captor.getValue().getRecipient()).isEqualTo(recipient);
        assertThat(captor.getValue().getStatus()).isEqualTo(ShareRequest.Status.PENDING);
    }

    @Test
    void deDupesAnExistingPendingRequestToTheSameRecipient() {
        when(userRepository.findByPhoneNumber(recipient.getPhoneNumber())).thenReturn(Optional.of(recipient));
        when(shareRequestRepository.existsBySenderIdAndRecipientIdAndStatus(senderId, recipientId, ShareRequest.Status.PENDING))
                .thenReturn(true);

        shareRequestService.create(senderId, new ShareRequestCreateRequest(recipient.getPhoneNumber(), null, null));

        verify(shareRequestRepository, never()).save(any());
    }

    @Test
    void unknownPhoneStoresAPlaceholderRowWithTheEncryptedPhoneAndNoRecipient() {
        String phone = "+1 555-999-8888";
        when(userRepository.findByPhoneNumber(phone)).thenReturn(Optional.empty());
        when(shareRequestRepository.existsBySenderIdAndTargetPhoneEncryptedAndRecipientIdIsNullAndStatus(
                any(), any(), any())).thenReturn(false);

        shareRequestService.create(senderId, new ShareRequestCreateRequest("555 999 8888", null, null));

        ArgumentCaptor<ShareRequest> captor = ArgumentCaptor.forClass(ShareRequest.class);
        verify(shareRequestRepository).save(captor.capture());
        assertThat(captor.getValue().getRecipient()).isNull();
        assertThat(captor.getValue().getTargetPhoneEncrypted()).isEqualTo(EncryptedPhoneNumberConverter.encrypt(phone));
    }

    @Test
    void unknownInviteCodeIsANoOpNoRowStored() {
        when(userRepository.findByInviteCode("ABCDEF")).thenReturn(Optional.empty());

        shareRequestService.create(senderId, new ShareRequestCreateRequest(null, "abcdef", null));

        verify(shareRequestRepository, never()).save(any());
    }

    @Test
    void rateLimitTripsAfterTheConfiguredDailyCap() {
        RateLimitProperties properties = new RateLimitProperties();
        properties.getUser().setShareRequestsPerDay(1);
        ShareRequestService limited = new ShareRequestService(shareRequestRepository, contactRepository, userRepository,
                graphShareRepository, contactService, new RateLimitService(properties), properties);
        when(userRepository.findByInviteCode(any())).thenReturn(Optional.empty());

        limited.create(senderId, new ShareRequestCreateRequest(null, "AAAAAA", null));
        assertThatThrownBy(() -> limited.create(senderId, new ShareRequestCreateRequest(null, "BBBBBB", null)))
                .isInstanceOf(TooManyRequestsException.class);
    }

    @Test
    void attachPendingRequestsForNewUserSetsTheRecipientOnMatchingRows() {
        User newUser = User.builder().id(UUID.randomUUID()).phoneNumber("+1 555-777-6666").build();
        ShareRequest pending = ShareRequest.builder().id(UUID.randomUUID())
                .targetPhoneEncrypted(EncryptedPhoneNumberConverter.encrypt(newUser.getPhoneNumber())).build();
        when(shareRequestRepository.findByTargetPhoneEncryptedAndRecipientIdIsNullAndStatus(
                EncryptedPhoneNumberConverter.encrypt(newUser.getPhoneNumber()), ShareRequest.Status.PENDING))
                .thenReturn(List.of(pending));

        shareRequestService.attachPendingRequestsForNewUser(newUser);

        assertThat(pending.getRecipient()).isEqualTo(newUser);
        verify(shareRequestRepository).saveAll(List.of(pending));
    }

    @Test
    void listNeverShowsOutgoingCounterpartNameUntilAccepted() {
        ShareRequest pendingOutgoing = ShareRequest.builder().id(UUID.randomUUID()).sender(sender).recipient(recipient)
                .status(ShareRequest.Status.PENDING).build();
        ShareRequest acceptedOutgoing = ShareRequest.builder().id(UUID.randomUUID()).sender(sender).recipient(recipient)
                .status(ShareRequest.Status.ACCEPTED).build();
        when(shareRequestRepository.findByRecipientId(senderId)).thenReturn(List.of());
        when(shareRequestRepository.findBySenderId(senderId)).thenReturn(List.of(pendingOutgoing, acceptedOutgoing));

        ShareRequestListResponse list = shareRequestService.list(senderId);

        assertThat(list.outgoing()).hasSize(2);
        assertThat(list.outgoing().stream().filter(r -> r.status() == ShareRequest.Status.PENDING).findFirst().orElseThrow()
                .counterpartName()).isNull();
        assertThat(list.outgoing().stream().filter(r -> r.status() == ShareRequest.Status.ACCEPTED).findFirst().orElseThrow()
                .counterpartName()).isEqualTo("Recipient");
    }

    @Test
    void incomingAlwaysShowsTheSendersName() {
        ShareRequest incoming = ShareRequest.builder().id(UUID.randomUUID()).sender(sender).recipient(recipient)
                .status(ShareRequest.Status.PENDING).build();
        when(shareRequestRepository.findByRecipientId(recipientId)).thenReturn(List.of(incoming));
        when(shareRequestRepository.findBySenderId(recipientId)).thenReturn(List.of());

        ShareRequestListResponse list = shareRequestService.list(recipientId);

        assertThat(list.incoming()).hasSize(1);
        assertThat(list.incoming().get(0).counterpartName()).isEqualTo("Sender");
    }

    @Test
    void respondConnectLinksContactsAndMarksAccepted() {
        ShareRequest shareRequest = ShareRequest.builder().id(UUID.randomUUID()).sender(sender).recipient(recipient)
                .status(ShareRequest.Status.PENDING).build();
        when(shareRequestRepository.findByIdAndRecipientId(shareRequest.getId(), recipientId))
                .thenReturn(Optional.of(shareRequest));

        shareRequestService.respond(shareRequest.getId(), recipientId, new RespondRequest(true, false));

        verify(contactService).connectMutually(sender, recipient, null);
        assertThat(shareRequest.getStatus()).isEqualTo(ShareRequest.Status.ACCEPTED);
        verify(graphShareRepository, never()).save(any());
    }

    @Test
    void respondAllowViewGrantsSharerRecipientViewerSender() {
        ShareRequest shareRequest = ShareRequest.builder().id(UUID.randomUUID()).sender(sender).recipient(recipient)
                .status(ShareRequest.Status.PENDING).build();
        when(shareRequestRepository.findByIdAndRecipientId(shareRequest.getId(), recipientId))
                .thenReturn(Optional.of(shareRequest));
        when(graphShareRepository.findBySharerIdAndViewerIdAndRevokedAtIsNull(recipientId, senderId))
                .thenReturn(Optional.empty());

        shareRequestService.respond(shareRequest.getId(), recipientId, new RespondRequest(false, true));

        ArgumentCaptor<GraphShare> captor = ArgumentCaptor.forClass(GraphShare.class);
        verify(graphShareRepository).save(captor.capture());
        assertThat(captor.getValue().getSharer()).isEqualTo(recipient);
        assertThat(captor.getValue().getViewer()).isEqualTo(sender);
        assertThat(shareRequest.getStatus()).isEqualTo(ShareRequest.Status.ACCEPTED);
    }

    @Test
    void respondBothFalseDeclines() {
        ShareRequest shareRequest = ShareRequest.builder().id(UUID.randomUUID()).sender(sender).recipient(recipient)
                .status(ShareRequest.Status.PENDING).build();
        when(shareRequestRepository.findByIdAndRecipientId(shareRequest.getId(), recipientId))
                .thenReturn(Optional.of(shareRequest));

        shareRequestService.respond(shareRequest.getId(), recipientId, new RespondRequest(false, false));

        assertThat(shareRequest.getStatus()).isEqualTo(ShareRequest.Status.DECLINED);
        verify(contactService, never()).connectMutually(any(), any(), any());
        verify(graphShareRepository, never()).save(any());
    }

    @Test
    void respondOnlyTheAddressedRecipientMayAnswerElse404() {
        UUID id = UUID.randomUUID();
        when(shareRequestRepository.findByIdAndRecipientId(id, senderId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> shareRequestService.respond(id, senderId, new RespondRequest(true, false)))
                .isInstanceOf(NotFoundException.class);
    }

    @Test
    void cancelOnlyWorksOnAPendingRequestOwnedBySender() {
        ShareRequest answered = ShareRequest.builder().id(UUID.randomUUID()).sender(sender).recipient(recipient)
                .status(ShareRequest.Status.ACCEPTED).build();
        when(shareRequestRepository.findByIdAndSenderId(answered.getId(), senderId)).thenReturn(Optional.of(answered));

        assertThatThrownBy(() -> shareRequestService.cancel(answered.getId(), senderId))
                .isInstanceOf(BadRequestException.class);
    }
}
