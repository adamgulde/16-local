package com.example.demo.service;

import com.example.demo.dto.TagAssignmentResponse;
import com.example.demo.dto.TagResponse;
import com.example.demo.exception.BadRequestException;
import com.example.demo.model.Tag;
import com.example.demo.model.User;
import com.example.demo.model.UserTag;
import com.example.demo.repository.TagRepository;
import com.example.demo.repository.UserRepository;
import com.example.demo.repository.UserTagRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.tuple;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class TagServiceTest {

    @Mock
    private TagRepository tagRepository;
    @Mock
    private UserTagRepository userTagRepository;
    @Mock
    private UserRepository userRepository;

    private TagService tagService;

    private final UUID selfId = UUID.randomUUID();
    private final UUID otherId = UUID.randomUUID();
    private final User self = User.builder().id(selfId).build();
    private final User other = User.builder().id(otherId).build();

    // Personal Interests > Music > Jazz ; Age Range {self, single} > 18–29, 30–39 ;
    // Interest Groups {self} > Gender {single} > Male, Female
    private final Tag interests = Tag.builder().id(UUID.randomUUID()).label("Personal Interests").level(1).icon("heart").build();
    private final Tag music = tag("Music", interests, 2);
    private final Tag jazz = tag("Jazz", music, 3);
    private final Tag age = Tag.builder().id(UUID.randomUUID()).label("Age Range").level(1).icon("calendar")
            .selfOnly(true).singleSelect(true).build();
    private final Tag age18 = tag("18–29", age, 2);
    private final Tag age30 = tag("30–39", age, 2);
    private final Tag groups = Tag.builder().id(UUID.randomUUID()).label("Interest Groups").level(1).icon("people")
            .selfOnly(true).build();
    private final Tag gender = Tag.builder().id(UUID.randomUUID()).label("Gender").parent(groups).level(2)
            .singleSelect(true).build();
    private final Tag male = tag("Male", gender, 3);

    private static Tag tag(String label, Tag parent, int level) {
        return Tag.builder().id(UUID.randomUUID()).label(label).parent(parent).level(level).build();
    }

    @BeforeEach
    void setUp() {
        List<Tag> all = List.of(interests, music, jazz, age, age18, age30, groups, gender, male);
        Map<UUID, Tag> byId = all.stream().collect(Collectors.toMap(Tag::getId, Function.identity()));
        lenient().when(tagRepository.findAll()).thenReturn(all);
        lenient().when(tagRepository.getReferenceById(any())).thenAnswer(inv -> byId.get(inv.<UUID>getArgument(0)));
        tagService = new TagService(tagRepository, userTagRepository, userRepository, new TagTaxonomy(tagRepository));
        lenient().when(userRepository.findById(selfId)).thenReturn(Optional.of(self));
        lenient().when(userRepository.findById(otherId)).thenReturn(Optional.of(other));
        lenient().when(userTagRepository.save(any())).thenAnswer(inv -> {
            UserTag ut = inv.getArgument(0);
            ut.setId(UUID.randomUUID());
            return ut;
        });
    }

    @Test
    void getAllTagsIsDepthFirstWithCategoryIconAndRulesResolved() {
        List<TagResponse> tags = tagService.getAllTags();

        TagResponse jazzResponse = tags.stream().filter(t -> t.id().equals(jazz.getId())).findFirst().orElseThrow();
        assertThat(jazzResponse.category()).isEqualTo("Personal Interests");
        assertThat(jazzResponse.icon()).isEqualTo("heart");
        assertThat(jazzResponse.fullPath()).isEqualTo("Personal Interests › Music › Jazz");
        assertThat(jazzResponse.selectable()).isTrue();

        TagResponse maleResponse = tags.stream().filter(t -> t.id().equals(male.getId())).findFirst().orElseThrow();
        assertThat(maleResponse.selfOnly()).isTrue();
        assertThat(tags.stream().filter(t -> t.id().equals(gender.getId())).findFirst().orElseThrow().selectable()).isFalse();
        assertThat(tags.stream().filter(t -> t.id().equals(interests.getId())).findFirst().orElseThrow().selectable()).isFalse();
        assertThat(tags.stream().filter(t -> t.id().equals(music.getId())).findFirst().orElseThrow().hasChildren()).isTrue();

        List<UUID> order = tags.stream().map(TagResponse::id).toList();
        assertThat(order.indexOf(music.getId())).isEqualTo(order.indexOf(interests.getId()) + 1);
        assertThat(order.indexOf(jazz.getId())).isEqualTo(order.indexOf(music.getId()) + 1);
    }

    @Test
    void customSelfTagRequiresACategory() {
        assertThatThrownBy(() -> tagService.addTag(selfId, selfId, null, "Night Owl", null))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("category");
    }

    @Test
    void customSelfTagUnderACategoryIsPublicCustom() {
        when(userTagRepository.findByTaggerIdAndSubjectId(selfId, selfId)).thenReturn(List.of());

        TagAssignmentResponse response = tagService.addTag(selfId, selfId, null, "  Bebop  ", music.getId());

        assertThat(response.label()).isEqualTo("Bebop");
        assertThat(response.kind()).isEqualTo(TagAssignmentResponse.Kind.CUSTOM);
        assertThat(response.category()).isEqualTo("Personal Interests");
        assertThat(response.fullPath()).isEqualTo("Personal Interests › Music › Bebop");
        assertThat(response.parentId()).isEqualTo(music.getId());
    }

    @Test
    void categoriesAndGroupHeadersCannotBeAppliedDirectly() {
        assertThatThrownBy(() -> tagService.addTag(selfId, selfId, interests.getId(), null, null))
                .isInstanceOf(BadRequestException.class);
        assertThatThrownBy(() -> tagService.addTag(selfId, selfId, gender.getId(), null, null))
                .isInstanceOf(BadRequestException.class);
    }

    @Test
    void selfOnlyCategoriesCannotBeAppliedToSomeoneElse() {
        assertThatThrownBy(() -> tagService.addTag(otherId, selfId, age30.getId(), null, null))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("Age Range");
        assertThatThrownBy(() -> tagService.addTag(otherId, selfId, null, "Guess", gender.getId()))
                .isInstanceOf(BadRequestException.class);
        verify(userTagRepository, never()).save(any());
    }

    @Test
    void privateTagOnSomeoneElseIsPrivateKindAndMayBeUncategorized() {
        when(userTagRepository.findByTaggerIdAndSubjectId(selfId, otherId)).thenReturn(List.of());

        TagAssignmentResponse dictionary = tagService.addTag(otherId, selfId, jazz.getId(), null, null);
        TagAssignmentResponse custom = tagService.addTag(otherId, selfId, null, "Met at SXSW", null);

        assertThat(dictionary.kind()).isEqualTo(TagAssignmentResponse.Kind.PRIVATE);
        assertThat(custom.kind()).isEqualTo(TagAssignmentResponse.Kind.PRIVATE);
        assertThat(custom.category()).isEqualTo(TagAssignmentResponse.UNCATEGORIZED);
    }

    @Test
    void singleSelectGroupReplacesThePreviousChoice() {
        UserTag previous = UserTag.builder().id(UUID.randomUUID()).tagger(self).subject(self).tag(age18).build();
        UserTag unrelated = UserTag.builder().id(UUID.randomUUID()).tagger(self).subject(self).tag(jazz).build();
        when(userTagRepository.findByTaggerIdAndSubjectId(selfId, selfId)).thenReturn(List.of(previous, unrelated));

        TagAssignmentResponse response = tagService.addTag(selfId, selfId, age30.getId(), null, null);

        verify(userTagRepository).deleteAll(List.of(previous));
        assertThat(response.label()).isEqualTo("30–39");
        assertThat(response.kind()).isEqualTo(TagAssignmentResponse.Kind.SELF);
    }

    @Test
    void duplicateTagsAreRejected() {
        UserTag existing = UserTag.builder().tagger(self).subject(self).tag(jazz).build();
        UserTag existingCustom = UserTag.builder().tagger(self).subject(self).parentTag(music).customLabel("Bebop").build();
        when(userTagRepository.findByTaggerIdAndSubjectId(selfId, selfId)).thenReturn(List.of(existing, existingCustom));

        assertThatThrownBy(() -> tagService.addTag(selfId, selfId, jazz.getId(), null, null))
                .isInstanceOf(BadRequestException.class);
        assertThatThrownBy(() -> tagService.addTag(selfId, selfId, null, "bebop", music.getId()))
                .isInstanceOf(BadRequestException.class);
    }

    @Test
    void getTagsForSubjectHidesUncategorizedCustomSelfTagsFromOthers() {
        UserTag uncategorized = UserTag.builder().id(UUID.randomUUID()).tagger(self).subject(self)
                .customLabel("Legacy Label").build();
        UserTag categorized = UserTag.builder().id(UUID.randomUUID()).tagger(self).subject(self)
                .parentTag(music).customLabel("Bebop").build();
        UserTag dictionary = UserTag.builder().id(UUID.randomUUID()).tagger(self).subject(self).tag(jazz).build();
        List<UserTag> stored = List.of(uncategorized, categorized, dictionary);
        when(userTagRepository.findBySubjectIdAndTaggerIdIn(selfId, List.of(selfId, otherId))).thenReturn(stored);
        when(userTagRepository.findBySubjectIdAndTaggerIdIn(selfId, List.of(selfId, selfId))).thenReturn(stored);

        assertThat(tagService.getTagsForSubject(selfId, otherId))
                .extracting(TagAssignmentResponse::label)
                .containsExactlyInAnyOrder("Bebop", "Jazz");
        assertThat(tagService.getTagsForSubject(selfId, selfId))
                .extracting(TagAssignmentResponse::label)
                .containsExactlyInAnyOrder("Legacy Label", "Bebop", "Jazz");
    }

    @Test
    void visibleTagsBySubjectCoversTheDirectoryWithTheSameVisibilityRule() {
        UserTag myJazz = UserTag.builder().id(UUID.randomUUID()).tagger(self).subject(self).tag(jazz).build();
        UserTag theirGender = UserTag.builder().id(UUID.randomUUID()).tagger(other).subject(other).tag(male).build();
        UserTag myPrivateTagOnThem = UserTag.builder().id(UUID.randomUUID()).tagger(self).subject(other)
                .customLabel("Met at SXSW").build();
        UserTag theirUncategorized = UserTag.builder().id(UUID.randomUUID()).tagger(other).subject(other)
                .customLabel("Legacy Label").build();
        when(userTagRepository.findAllVisibleTo(selfId))
                .thenReturn(List.of(myJazz, theirGender, myPrivateTagOnThem, theirUncategorized));

        Map<UUID, List<TagAssignmentResponse>> bySubject = tagService.getVisibleTagsBySubject(selfId);

        assertThat(bySubject.get(selfId)).extracting(TagAssignmentResponse::label).containsExactly("Jazz");
        assertThat(bySubject.get(otherId))
                .extracting(TagAssignmentResponse::label, TagAssignmentResponse::kind)
                .containsExactlyInAnyOrder(
                        tuple("Male", TagAssignmentResponse.Kind.SELF),
                        tuple("Met at SXSW", TagAssignmentResponse.Kind.PRIVATE));
    }

    @Test
    void removeTagOnlyAllowsTheTagger() {
        UserTag assignment = UserTag.builder().id(UUID.randomUUID()).tagger(other).subject(self).tag(jazz).build();
        when(userTagRepository.findById(assignment.getId())).thenReturn(java.util.Optional.of(assignment));

        assertThatThrownBy(() -> tagService.removeTag(assignment.getId(), selfId))
                .isInstanceOf(BadRequestException.class);
    }
}
