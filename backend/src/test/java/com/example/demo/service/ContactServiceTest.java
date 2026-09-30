package com.example.demo.service;

import com.example.demo.dto.ContactImportRequest;
import com.example.demo.dto.ContactImportResponse;
import com.example.demo.dto.ContactRequest;
import com.example.demo.dto.GraphNode;
import com.example.demo.dto.NodeKind;
import com.example.demo.exception.BadRequestException;
import com.example.demo.exception.NotFoundException;
import com.example.demo.model.Contact;
import com.example.demo.model.ContactLink;
import com.example.demo.model.User;
import com.example.demo.repository.ContactLinkRepository;
import com.example.demo.repository.ContactRepository;
import com.example.demo.repository.ContactTagRepository;
import com.example.demo.repository.TagRepository;
import com.example.demo.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.ArrayList;
import java.util.Collections;
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
class ContactServiceTest {

    @Mock
    private ContactRepository contactRepository;
    @Mock
    private ContactLinkRepository contactLinkRepository;
    @Mock
    private ContactTagRepository contactTagRepository;
    @Mock
    private UserRepository userRepository;
    @Mock
    private TagRepository tagRepository;

    private ContactService contactService;

    private final UUID ownerId = UUID.randomUUID();
    private final UUID strangerId = UUID.randomUUID();
    private final User owner = User.builder().id(ownerId).firstName("Owner").lastName("User").build();

    @BeforeEach
    void setUp() {
        contactService = new ContactService(contactRepository, contactLinkRepository, contactTagRepository,
                userRepository, new TagTaxonomy(tagRepository));
        lenient().when(tagRepository.findAll()).thenReturn(List.of());
        lenient().when(userRepository.getReferenceById(ownerId)).thenReturn(owner);
        lenient().when(contactTagRepository.findByContactId(any())).thenReturn(List.of());
    }

    @Test
    void createContactRequiresAFirstName() {
        ContactRequest request = new ContactRequest(" ", null, null, null);
        assertThatThrownBy(() -> contactService.createContact(ownerId, request))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("First name");
    }

    @Test
    void createContactRejectsOverlongNames() {
        String longName = "x".repeat(101);
        ContactRequest request = new ContactRequest(longName, null, null, null);
        assertThatThrownBy(() -> contactService.createContact(ownerId, request))
                .isInstanceOf(BadRequestException.class);
    }

    @Test
    void createContactRejectsOverlongAbout() {
        ContactRequest request = new ContactRequest("Alex", null, "x".repeat(10_001), null);
        assertThatThrownBy(() -> contactService.createContact(ownerId, request))
                .isInstanceOf(BadRequestException.class);
    }

    @Test
    void createContactNormalizesPhoneAndReturnsAPlaceholderNode() {
        when(contactRepository.save(any())).thenAnswer(inv -> {
            Contact c = inv.getArgument(0);
            c.setId(UUID.randomUUID());
            return c;
        });

        GraphNode node = contactService.createContact(ownerId, new ContactRequest("Alex", "Doe", "friend", "5551234567"));

        assertThat(node.kind()).isEqualTo(NodeKind.PLACEHOLDER);
        assertThat(node.firstName()).isEqualTo("Alex");
        assertThat(node.phoneNumber()).isEqualTo("+1 555-123-4567");
        assertThat(node.editable()).isTrue();
        assertThat(node.linkedUserId()).isNull();
        assertThat(node.source()).isNull();
    }

    @Test
    void someoneElsesContactIs404NotFoundOnEveryOperation() {
        when(contactRepository.findByIdAndOwnerId(any(), any())).thenReturn(Optional.empty());
        UUID contactId = UUID.randomUUID();

        assertThatThrownBy(() -> contactService.patchContact(contactId, strangerId, new ContactRequest(null, null, null, null)))
                .isInstanceOf(NotFoundException.class);
        assertThatThrownBy(() -> contactService.deleteContact(contactId, strangerId))
                .isInstanceOf(NotFoundException.class);
        assertThatThrownBy(() -> contactService.upsertNote(contactId, strangerId, "hi"))
                .isInstanceOf(NotFoundException.class);
    }

    @Test
    void patchContactOnlyAppliesFieldsThatWerePresent() {
        Contact existing = Contact.builder().id(UUID.randomUUID()).owner(owner)
                .firstName("Old").lastName("Name").about("old about").build();
        when(contactRepository.findByIdAndOwnerId(existing.getId(), ownerId)).thenReturn(Optional.of(existing));
        when(contactRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        contactService.patchContact(existing.getId(), ownerId, new ContactRequest(null, null, "new about", null));

        assertThat(existing.getFirstName()).isEqualTo("Old");
        assertThat(existing.getAbout()).isEqualTo("new about");
    }

    @Test
    void deletingARegisteredContactUnlinksTheOtherSidesContact() {
        User linkedUser = User.builder().id(UUID.randomUUID()).firstName("Linked").build();
        Contact myContactForThem = Contact.builder().id(UUID.randomUUID()).owner(owner).linkedUser(linkedUser)
                .firstName("Linked").build();
        Contact theirContactForMe = Contact.builder().id(UUID.randomUUID())
                .owner(linkedUser).linkedUser(owner).firstName("Owner").note("they wrote this").build();

        when(contactRepository.findByIdAndOwnerId(myContactForThem.getId(), ownerId)).thenReturn(Optional.of(myContactForThem));
        when(contactRepository.findByOwnerIdAndLinkedUserId(linkedUser.getId(), ownerId))
                .thenReturn(Optional.of(theirContactForMe));

        contactService.deleteContact(myContactForThem.getId(), ownerId);

        ArgumentCaptor<Contact> savedCaptor = ArgumentCaptor.forClass(Contact.class);
        verify(contactRepository).save(savedCaptor.capture());
        assertThat(savedCaptor.getValue().getId()).isEqualTo(theirContactForMe.getId());
        assertThat(savedCaptor.getValue().getLinkedUser()).isNull();
        assertThat(savedCaptor.getValue().getNote()).isEqualTo("they wrote this");
        verify(contactRepository).delete(myContactForThem);
    }

    @Test
    void deletingAPlaceholderContactNeverTouchesAnyoneElsesRow() {
        Contact placeholder = Contact.builder().id(UUID.randomUUID()).owner(owner).firstName("Ghost").build();
        when(contactRepository.findByIdAndOwnerId(placeholder.getId(), ownerId)).thenReturn(Optional.of(placeholder));

        contactService.deleteContact(placeholder.getId(), ownerId);

        verify(contactRepository, never()).findByOwnerIdAndLinkedUserId(any(), any());
        verify(contactRepository).delete(placeholder);
    }

    @Test
    void linkRejectsTheSameContactTwice() {
        UUID id = UUID.randomUUID();
        assertThatThrownBy(() -> contactService.link(ownerId, id, id)).isInstanceOf(BadRequestException.class);
    }

    @Test
    void linkNormalizesOrderAndIsIdempotent() {
        Contact a = Contact.builder().owner(owner).firstName("A").build();
        Contact b = Contact.builder().owner(owner).firstName("B").build();
        UUID lowId = UUID.fromString("00000000-0000-0000-0000-000000000001");
        UUID highId = UUID.fromString("00000000-0000-0000-0000-000000000002");
        a.setId(highId);
        b.setId(lowId);
        when(contactRepository.findByIdAndOwnerId(a.getId(), ownerId)).thenReturn(Optional.of(a));
        when(contactRepository.findByIdAndOwnerId(b.getId(), ownerId)).thenReturn(Optional.of(b));
        when(contactLinkRepository.findByContactAIdAndContactBId(lowId, highId)).thenReturn(Optional.empty());

        contactService.link(ownerId, a.getId(), b.getId());

        ArgumentCaptor<ContactLink> captor = ArgumentCaptor.forClass(ContactLink.class);
        verify(contactLinkRepository).save(captor.capture());
        assertThat(captor.getValue().getContactA().getId()).isEqualTo(lowId);
        assertThat(captor.getValue().getContactB().getId()).isEqualTo(highId);
    }

    @Test
    void ensureRegisteredContactPrefersAStillUnlinkedPlaceholderOverANewRow() {
        User a = User.builder().id(UUID.randomUUID()).firstName("A").build();
        User b = User.builder().id(UUID.randomUUID()).firstName("B").build();
        Contact placeholder = Contact.builder().id(UUID.randomUUID()).owner(a).firstName("My placeholder for B").build();
        when(contactRepository.existsByOwnerIdAndLinkedUserId(a.getId(), b.getId())).thenReturn(false);
        when(contactRepository.findByIdAndOwnerId(placeholder.getId(), a.getId())).thenReturn(Optional.of(placeholder));
        when(contactRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        contactService.ensureRegisteredContact(a, b, placeholder);

        assertThat(placeholder.getLinkedUser()).isEqualTo(b);
        verify(contactRepository).save(placeholder);
    }

    @Test
    void ensureRegisteredContactFallsBackToANewContactWhenThePlaceholderNoLongerQualifies() {
        User a = User.builder().id(UUID.randomUUID()).firstName("A").build();
        User b = User.builder().id(UUID.randomUUID()).firstName("B").build();
        User other = User.builder().id(UUID.randomUUID()).firstName("Other").build();
        Contact alreadyLinkedElsewhere = Contact.builder().id(UUID.randomUUID()).owner(a).linkedUser(other).build();
        when(contactRepository.existsByOwnerIdAndLinkedUserId(a.getId(), b.getId())).thenReturn(false);
        when(contactRepository.findByIdAndOwnerId(alreadyLinkedElsewhere.getId(), a.getId()))
                .thenReturn(Optional.of(alreadyLinkedElsewhere));
        when(contactRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        contactService.ensureRegisteredContact(a, b, alreadyLinkedElsewhere);

        ArgumentCaptor<Contact> captor = ArgumentCaptor.forClass(Contact.class);
        verify(contactRepository).save(captor.capture());
        assertThat(captor.getValue()).isNotSameAs(alreadyLinkedElsewhere);
        assertThat(captor.getValue().getLinkedUser()).isEqualTo(b);
    }

    @Test
    void ensureRegisteredContactIsANoOpWhenAlreadyConnected() {
        User a = User.builder().id(UUID.randomUUID()).build();
        User b = User.builder().id(UUID.randomUUID()).build();
        when(contactRepository.existsByOwnerIdAndLinkedUserId(a.getId(), b.getId())).thenReturn(true);

        contactService.ensureRegisteredContact(a, b, null);

        verify(contactRepository, never()).save(any());
    }

    // --- Bulk import ---

    private void stubSaveAllAssigningIds() {
        when(contactRepository.saveAll(any())).thenAnswer(inv -> {
            List<Contact> saved = new ArrayList<>();
            for (Contact c : (Iterable<Contact>) inv.getArgument(0)) {
                c.setId(UUID.randomUUID());
                saved.add(c);
            }
            return saved;
        });
    }

    @Test
    void importCreatesPlaceholdersAndSkipsDuplicatesOfExistingContactsAndOfEachOther() {
        User linked = User.builder().id(UUID.randomUUID()).firstName("Reg").phoneNumber("+1 555-000-2222").build();
        when(contactRepository.findByOwnerId(ownerId)).thenReturn(List.of(
                Contact.builder().id(UUID.randomUUID()).owner(owner).firstName("Sam").lastName("Smith")
                        .phoneNumber("+1 555-000-1111").build(),
                Contact.builder().id(UUID.randomUUID()).owner(owner).linkedUser(linked).firstName("Reg").build(),
                Contact.builder().id(UUID.randomUUID()).owner(owner).firstName("No").lastName("Phone").build()));
        stubSaveAllAssigningIds();

        ContactImportResponse response = contactService.importContacts(ownerId, new ContactImportRequest(List.of(
                new ContactRequest("Samuel", null, null, "(555) 000-1111"),   // same phone as Sam -> dup
                new ContactRequest("Other", null, null, "15550002222"),       // registered user's phone -> dup
                new ContactRequest("no", "PHONE", null, null),                // same name, no phone -> dup
                new ContactRequest("New", "Person", "Acme", "555 000 3333"),
                new ContactRequest("New", "Twin", null, "+1 (555) 000-3333"), // dup within batch
                new ContactRequest(" ", " ", null, "5550004444"),              // no name -> invalid
                new ContactRequest(null, "Lastonly", null, null))));

        assertThat(response.skippedDuplicates()).isEqualTo(4);
        assertThat(response.skippedInvalid()).isEqualTo(1);
        assertThat(response.created()).extracting(GraphNode::firstName).containsExactly("New", "Lastonly");
        GraphNode first = response.created().get(0);
        assertThat(first.kind()).isEqualTo(NodeKind.PLACEHOLDER);
        assertThat(first.phoneNumber()).isEqualTo("+1 555-000-3333");
        assertThat(first.about()).isEqualTo("Acme");
        assertThat(first.linkedUserId()).isNull();
        assertThat(response.created().get(1).lastName()).isEmpty();
    }

    @Test
    void importTruncatesOverlongNamesInsteadOfFailingTheBatch() {
        when(contactRepository.findByOwnerId(ownerId)).thenReturn(List.of());
        stubSaveAllAssigningIds();

        ContactImportResponse response = contactService.importContacts(ownerId,
                new ContactImportRequest(List.of(new ContactRequest("x".repeat(150), null, null, null))));

        assertThat(response.created()).hasSize(1);
        assertThat(response.created().get(0).firstName()).hasSize(100);
    }

    @Test
    void importRejectsOversizedBatches() {
        List<ContactRequest> entries = Collections.nCopies(ContactService.MAX_IMPORT_BATCH + 1,
                new ContactRequest("A", null, null, null));
        assertThatThrownBy(() -> contactService.importContacts(ownerId, new ContactImportRequest(entries)))
                .isInstanceOf(BadRequestException.class);
        verify(contactRepository, never()).saveAll(any());
    }

    @Test
    void importRejectsGrowingAGraphPastTheCap() {
        List<Contact> existing = new ArrayList<>();
        for (int i = 0; i < ContactService.MAX_CONTACTS_PER_OWNER; i++) {
            existing.add(Contact.builder().id(UUID.randomUUID()).owner(owner).firstName("C" + i).build());
        }
        when(contactRepository.findByOwnerId(ownerId)).thenReturn(existing);

        assertThatThrownBy(() -> contactService.importContacts(ownerId,
                new ContactImportRequest(List.of(new ContactRequest("Brand", "New", null, null)))))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("at most");
        verify(contactRepository, never()).saveAll(any());
    }

    @Test
    void importWithNoEntriesIsANoOp() {
        when(contactRepository.findByOwnerId(ownerId)).thenReturn(List.of());
        when(contactRepository.saveAll(any())).thenReturn(List.of());

        ContactImportResponse response = contactService.importContacts(ownerId, new ContactImportRequest(null));

        assertThat(response.created()).isEmpty();
        assertThat(response.skippedDuplicates()).isZero();
    }
}
