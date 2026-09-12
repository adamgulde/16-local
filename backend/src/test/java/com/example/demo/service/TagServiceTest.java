package com.example.demo.service;

import com.example.demo.dto.TagAssignmentResponse;
import com.example.demo.exception.BadRequestException;
import com.example.demo.model.Tag;
import com.example.demo.model.User;
import com.example.demo.model.UserTag;
import com.example.demo.repository.TagRepository;
import com.example.demo.repository.UserTagRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class TagServiceTest {

    @Mock
    private TagRepository tagRepository;
    @Mock
    private UserTagRepository userTagRepository;
    @Mock
    private UserService userService;

    private TagService tagService;

    private final UUID selfId = UUID.randomUUID();
    private final UUID otherId = UUID.randomUUID();
    private final UUID tagId = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        tagService = new TagService(tagRepository, userTagRepository, userService);
        lenient().when(userService.getUserById(selfId)).thenReturn(User.builder().id(selfId).build());
        lenient().when(userService.getUserById(otherId)).thenReturn(User.builder().id(otherId).build());
    }

    @Test
    void addTagSavesACustomLabelOnSelf() {
        when(userTagRepository.findByTaggerIdAndSubjectId(selfId, selfId)).thenReturn(List.of());
        when(userTagRepository.save(any())).thenAnswer(inv -> {
            UserTag ut = inv.getArgument(0);
            ut.setId(UUID.randomUUID());
            return ut;
        });

        TagAssignmentResponse response = tagService.addTag(selfId, selfId, null, "  Creative Mind  ");

        assertThat(response.label()).isEqualTo("Creative Mind");
        assertThat(response.category()).isEqualTo("Custom");
        assertThat(response.isSelfTag()).isTrue();
        assertThat(response.isMine()).isTrue();
    }

    @Test
    void getTagsForSubjectFiltersOutCustomTagsFromOtherUsers() {
        UUID viewerId = otherId;
        UserTag selfCustomTag = UserTag.builder().tagger(User.builder().id(selfId).build())
                .subject(User.builder().id(selfId).build())
                .customLabel("Private Personal Note")
                .build();
        UserTag selfPublicTag = UserTag.builder().tagger(User.builder().id(selfId).build())
                .subject(User.builder().id(selfId).build())
                .tag(Tag.builder().category("Role").label("Founder").build())
                .build();
        when(userTagRepository.findBySubjectIdAndTaggerIdIn(selfId, List.of(selfId, viewerId)))
                .thenReturn(List.of(selfCustomTag, selfPublicTag));

        List<TagAssignmentResponse> results = tagService.getTagsForSubject(selfId, viewerId);

        // selfCustomTag is filtered out because viewerId != tagger (selfId)
        assertThat(results).hasSize(1);
        assertThat(results.get(0).label()).isEqualTo("Founder");
        assertThat(results.get(0).isSelfTag()).isTrue();
        assertThat(results.get(0).isMine()).isFalse();
    }

    @Test
    void addTagRequiresExactlyOneOfTagIdOrCustomLabel() {
        assertThatThrownBy(() -> tagService.addTag(otherId, selfId, null, null))
                .isInstanceOf(BadRequestException.class);
        assertThatThrownBy(() -> tagService.addTag(otherId, selfId, tagId, "also this"))
                .isInstanceOf(BadRequestException.class);
    }

    @Test
    void addTagRejectsAnAlreadyAppliedDictionaryTag() {
        when(userTagRepository.findByTaggerIdAndSubjectId(selfId, otherId))
                .thenReturn(List.of(UserTag.builder().tag(Tag.builder().id(tagId).build()).build()));
        when(tagRepository.findById(tagId)).thenReturn(java.util.Optional.of(Tag.builder().id(tagId).build()));

        assertThatThrownBy(() -> tagService.addTag(otherId, selfId, tagId, null))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("already applied");
    }

    @Test
    void addTagRejectsADuplicateCustomLabelCaseInsensitively() {
        when(userTagRepository.findByTaggerIdAndSubjectId(selfId, otherId))
                .thenReturn(List.of(UserTag.builder().customLabel("Foodie").build()));

        assertThatThrownBy(() -> tagService.addTag(otherId, selfId, null, "foodie"))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("already applied");
    }

    @Test
    void addTagEnforcesTheCapOnTagsPerPair() {
        List<UserTag> fifteen = java.util.stream.Stream.generate(() -> UserTag.builder().customLabel(UUID.randomUUID().toString()).build())
                .limit(15)
                .toList();
        when(userTagRepository.findByTaggerIdAndSubjectId(selfId, otherId)).thenReturn(fifteen);

        assertThatThrownBy(() -> tagService.addTag(otherId, selfId, null, "one too many"))
                .isInstanceOf(BadRequestException.class)
                .hasMessageContaining("maximum");
    }

    @Test
    void addTagSavesACustomLabelOnAnotherUser() {
        when(userTagRepository.findByTaggerIdAndSubjectId(selfId, otherId)).thenReturn(List.of());
        when(userTagRepository.save(any())).thenAnswer(inv -> {
            UserTag ut = inv.getArgument(0);
            ut.setId(UUID.randomUUID());
            return ut;
        });

        TagAssignmentResponse response = tagService.addTag(otherId, selfId, null, "  Hiking Buddy  ");

        assertThat(response.label()).isEqualTo("Hiking Buddy");
        assertThat(response.category()).isEqualTo("Custom");
        assertThat(response.isSelfTag()).isFalse();
        assertThat(response.isMine()).isTrue();
    }

    @Test
    void getTagsForSubjectMarksOnlyTheViewersOwnPrivateTagsAsMine() {
        UUID viewerId = selfId;
        UserTag selfDeclared = UserTag.builder().tagger(User.builder().id(otherId).build())
                .subject(User.builder().id(otherId).build())
                .tag(Tag.builder().category("Region").label("Europe").build())
                .build();
        UserTag myPrivateTag = UserTag.builder().tagger(User.builder().id(viewerId).build())
                .subject(User.builder().id(otherId).build())
                .customLabel("Met at conference")
                .build();
        when(userTagRepository.findBySubjectIdAndTaggerIdIn(otherId, List.of(otherId, viewerId)))
                .thenReturn(List.of(selfDeclared, myPrivateTag));

        List<TagAssignmentResponse> results = tagService.getTagsForSubject(otherId, viewerId);

        assertThat(results).hasSize(2);
        assertThat(results.get(0).isSelfTag()).isTrue();
        assertThat(results.get(0).isMine()).isFalse();
        assertThat(results.get(1).isSelfTag()).isFalse();
        assertThat(results.get(1).isMine()).isTrue();
    }

    @Test
    void removeTagOnlyAllowsTheOriginalTaggerToRemoveIt() {
        UserTag someonesTag = UserTag.builder().id(UUID.randomUUID())
                .tagger(User.builder().id(otherId).build())
                .subject(User.builder().id(selfId).build())
                .customLabel("whatever")
                .build();
        when(userTagRepository.findById(someonesTag.getId())).thenReturn(java.util.Optional.of(someonesTag));

        assertThatThrownBy(() -> tagService.removeTag(someonesTag.getId(), selfId))
                .as("selfId did not apply this tag, only otherId (the tagger) may remove it")
                .isInstanceOf(BadRequestException.class);
    }
}
