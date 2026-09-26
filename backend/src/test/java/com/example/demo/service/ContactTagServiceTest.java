package com.example.demo.service;

import com.example.demo.dto.TagAssignmentResponse;
import com.example.demo.exception.BadRequestException;
import com.example.demo.exception.NotFoundException;
import com.example.demo.model.Contact;
import com.example.demo.model.ContactTag;
import com.example.demo.model.Tag;
import com.example.demo.model.User;
import com.example.demo.repository.ContactLinkRepository;
import com.example.demo.repository.ContactRepository;
import com.example.demo.repository.ContactTagRepository;
import com.example.demo.repository.TagRepository;
import com.example.demo.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.ArrayList;
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
class ContactTagServiceTest {

    @Mock
    private TagRepository tagRepository;
    @Mock
    private ContactTagRepository contactTagRepository;
    @Mock
    private ContactRepository contactRepository;
    @Mock
    private ContactLinkRepository contactLinkRepository;
    @Mock
    private UserRepository userRepository;

    private ContactTagService contactTagService;
    private final List<ContactTag> stored = new ArrayList<>();

    private final UUID ownerId = UUID.randomUUID();
    private final User owner = User.builder().id(ownerId).build();
    private final Contact contact = Contact.builder().id(UUID.randomUUID()).owner(owner).firstName("Ghost").build();

    // Age Range {selfOnly, singleSelect} > 18-29 ; Personal Interests > Music > Jazz
    private final Tag age = Tag.builder().id(UUID.randomUUID()).label("Age Range").level(1)
            .selfOnly(true).singleSelect(true).build();
    private final Tag age18 = Tag.builder().id(UUID.randomUUID()).label("18-29").parent(age).level(2).build();
    private final Tag interests = Tag.builder().id(UUID.randomUUID()).label("Personal Interests").level(1).build();
    private final Tag music = Tag.builder().id(UUID.randomUUID()).label("Music").parent(interests).level(2).build();
    private final Tag jazz = Tag.builder().id(UUID.randomUUID()).label("Jazz").parent(music).level(3).build();

    @BeforeEach
    void setUp() {
        List<Tag> all = List.of(age, age18, interests, music, jazz);
        lenient().when(tagRepository.findAll()).thenReturn(all);
        lenient().when(tagRepository.getReferenceById(any())).thenAnswer(inv -> all.stream()
                .filter(t -> t.getId().equals(inv.<UUID>getArgument(0))).findFirst().orElseThrow());
        ContactService contactService = new ContactService(contactRepository, contactLinkRepository,
                contactTagRepository, userRepository, new TagTaxonomy(tagRepository));
        contactTagService = new ContactTagService(tagRepository, contactTagRepository, contactService, new TagTaxonomy(tagRepository));
        lenient().when(contactRepository.findByIdAndOwnerId(contact.getId(), ownerId)).thenReturn(Optional.of(contact));
        lenient().when(contactTagRepository.findByContactId(contact.getId())).thenAnswer(inv -> new ArrayList<>(stored));
        lenient().when(contactTagRepository.save(any())).thenAnswer(inv -> {
            ContactTag ct = inv.getArgument(0);
            ct.setId(UUID.randomUUID());
            stored.add(ct);
            return ct;
        });
    }

    @Test
    void selfOnlyCategoriesCanNeverBeAppliedToAContact() {
        assertThatThrownBy(() -> contactTagService.addTag(contact.getId(), ownerId, age18.getId(), null, null))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("Age Range");
        verify(contactTagRepository, never()).save(any());
    }

    @Test
    void dictionaryTagIsAddedAndFullListIsReturned() {
        List<TagAssignmentResponse> result = contactTagService.addTag(contact.getId(), ownerId, jazz.getId(), null, null);

        assertThat(result).extracting(TagAssignmentResponse::label).containsExactly("Jazz");
        assertThat(result.get(0).kind()).isEqualTo(TagAssignmentResponse.Kind.PRIVATE);
        assertThat(result.get(0).isSelfTag()).isFalse();
        assertThat(result.get(0).isMine()).isTrue();
    }

    @Test
    void customTagWithNoCategoryIsAllowedAndUncategorized() {
        List<TagAssignmentResponse> result = contactTagService.addTag(contact.getId(), ownerId, null, "Met at SXSW", null);

        assertThat(result).extracting(TagAssignmentResponse::label).containsExactly("Met at SXSW");
        assertThat(result.get(0).category()).isEqualTo(TagAssignmentResponse.UNCATEGORIZED);
    }

    @Test
    void duplicateDictionaryTagIsRejected() {
        stored.add(ContactTag.builder().id(UUID.randomUUID()).contact(contact).tag(jazz).build());

        assertThatThrownBy(() -> contactTagService.addTag(contact.getId(), ownerId, jazz.getId(), null, null))
                .isInstanceOf(BadRequestException.class);
    }

    @Test
    void someoneElsesContactIs404OnAddAndRemove() {
        UUID strangerId = UUID.randomUUID();
        when(contactRepository.findByIdAndOwnerId(contact.getId(), strangerId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> contactTagService.addTag(contact.getId(), strangerId, jazz.getId(), null, null))
                .isInstanceOf(NotFoundException.class);
        assertThatThrownBy(() -> contactTagService.removeTag(contact.getId(), UUID.randomUUID(), strangerId))
                .isInstanceOf(NotFoundException.class);
    }
}
