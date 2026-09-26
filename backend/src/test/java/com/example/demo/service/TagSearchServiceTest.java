package com.example.demo.service;

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
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class TagSearchServiceTest {

    @Mock
    private TagRepository tagRepository;
    @Mock
    private UserTagRepository userTagRepository;

    private TagSearchService tagSearchService;

    private final UUID viewerId = UUID.randomUUID();
    private final User alice = User.builder().id(UUID.randomUUID()).firstName("Alice").build();
    private final User bob = User.builder().id(UUID.randomUUID()).firstName("Bob").build();

    private final Tag interests = Tag.builder().id(UUID.randomUUID()).label("Personal Interests").level(1).build();
    private final Tag music = Tag.builder().id(UUID.randomUUID()).label("Music").parent(interests).level(2).build();
    private final Tag jazz = Tag.builder().id(UUID.randomUUID()).label("Jazz").parent(music).level(3).build();
    private final Tag dogs = Tag.builder().id(UUID.randomUUID()).label("Dogs").parent(interests).level(2).build();

    @BeforeEach
    void setUp() {
        lenient().when(tagRepository.findAll()).thenReturn(List.of(interests, music, jazz, dogs));
        tagSearchService = new TagSearchService(userTagRepository, new TagTaxonomy(tagRepository));
    }

    private UserTag selfTag(User user, Tag tag) {
        return UserTag.builder().tagger(user).subject(user).tag(tag).build();
    }

    @Test
    void selectingAParentTagMatchesItsWholeSubtree() {
        when(userTagRepository.findVisibleByTagIds(Set.of(music.getId(), jazz.getId()), viewerId))
                .thenReturn(List.of(selfTag(alice, jazz)));

        List<User> result = tagSearchService.findUsers(List.of(music.getId()), List.of(), true, viewerId);

        assertThat(result).containsExactly(alice);
    }

    @Test
    void matchAllIntersectsAndMatchAnyUnionsCriteria() {
        when(userTagRepository.findVisibleByTagIds(Set.of(jazz.getId()), viewerId))
                .thenReturn(List.of(selfTag(alice, jazz), selfTag(bob, jazz)));
        when(userTagRepository.findVisibleByTagIds(Set.of(dogs.getId()), viewerId))
                .thenReturn(List.of(selfTag(alice, dogs)));

        assertThat(tagSearchService.findUsers(List.of(jazz.getId(), dogs.getId()), List.of(), true, viewerId))
                .containsExactly(alice);
        assertThat(tagSearchService.findUsers(List.of(jazz.getId(), dogs.getId()), List.of(), false, viewerId))
                .containsExactlyInAnyOrder(alice, bob);
    }

    @Test
    void freeTextLabelsAreCombinedWithTagCriteria() {
        when(userTagRepository.findVisibleByTagIds(Set.of(dogs.getId()), viewerId))
                .thenReturn(List.of(selfTag(alice, dogs), selfTag(bob, dogs)));
        when(userTagRepository.findVisibleByLabelLike(eq("%sxsw%"), eq(viewerId)))
                .thenReturn(List.of(UserTag.builder().tagger(User.builder().id(viewerId).build()).subject(bob)
                        .customLabel("Met at SXSW").build()));

        assertThat(tagSearchService.findUsers(List.of(dogs.getId()), List.of(" SXSW "), true, viewerId))
                .containsExactly(bob);
    }

    @Test
    void unknownTagOrNoCriteriaMatchesNobody() {
        assertThat(tagSearchService.findUsers(List.of(), List.of(), true, viewerId)).isEmpty();
        assertThat(tagSearchService.findUsers(List.of(UUID.randomUUID()), List.of(), true, viewerId)).isEmpty();
    }

    @Test
    void likePatternEscapesWildcards() {
        assertThat(TagSearchService.likePattern(" 100%_Real\\ ")).isEqualTo("%100\\%\\_real\\\\%");
        when(userTagRepository.findVisibleByLabelLike(anyString(), eq(viewerId))).thenReturn(List.of());
        assertThat(tagSearchService.findUsers(List.of(), List.of("%"), true, viewerId)).isEmpty();
    }
}
