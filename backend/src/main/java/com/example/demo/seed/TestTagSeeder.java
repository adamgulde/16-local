package com.example.demo.seed;

import com.example.demo.model.User;
import com.example.demo.model.UserTag;
import com.example.demo.repository.TagRepository;
import com.example.demo.repository.UserRepository;
import com.example.demo.repository.UserTagRepository;
import com.example.demo.service.TagTaxonomy;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.annotation.Profile;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Random;
import java.util.Set;
import java.util.UUID;

/**
 * Gives every user without self-tags a random, plausible set of self-assigned tags so tag search
 * and the picker can be exercised on local and staging data. Never active in prod (profile guard)
 * and off unless APP_TAG_SEED_ENABLED=true. Idempotent: users who already have any self-tag are
 * skipped, and each user's picks are seeded from their id so reruns are reproducible.
 */
@Component
@Profile("!prod")
@ConditionalOnProperty(name = "app.tag-seed.enabled", havingValue = "true")
@RequiredArgsConstructor
public class TestTagSeeder {

    private static final Logger log = LoggerFactory.getLogger(TestTagSeeder.class);
    private static final List<String> CUSTOM_LABELS = List.of(
            "Weekend Tinkerer", "Night Owl", "Early Riser", "Trivia Regular", "Plant Parent", "Sourdough Baker");

    private final UserRepository userRepository;
    private final UserTagRepository userTagRepository;
    private final TagRepository tagRepository;
    private final TagTaxonomy tagTaxonomy;

    @EventListener(ApplicationReadyEvent.class)
    @Transactional
    public void seed() {
        TagTaxonomy.Snapshot taxonomy = tagTaxonomy.current();
        List<TagTaxonomy.Node> categories = taxonomy.childrenOf(null);
        if (categories.isEmpty()) {
            log.warn("Tag seed skipped: the tag dictionary is empty");
            return;
        }

        int seededUsers = 0;
        for (User user : userRepository.findAll()) {
            boolean hasSelfTags = !userTagRepository.findByTaggerIdAndSubjectId(user.getId(), user.getId()).isEmpty();
            if (hasSelfTags) {
                continue;
            }
            Random random = new Random(user.getId().getMostSignificantBits() ^ user.getId().getLeastSignificantBits());
            List<UserTag> picks = new ArrayList<>();
            Set<UUID> usedGroups = new HashSet<>();

            List<TagTaxonomy.Node> shuffled = new ArrayList<>(categories);
            Collections.shuffle(shuffled, random);
            int categoryCount = 4 + random.nextInt(Math.min(4, shuffled.size() - 3));
            for (TagTaxonomy.Node category : shuffled.subList(0, Math.min(categoryCount, shuffled.size()))) {
                int perCategory = 1 + random.nextInt(2);
                for (int i = 0; i < perCategory; i++) {
                    TagTaxonomy.Node tag = randomSelectableIn(taxonomy, category.id(), random);
                    if (tag == null || picks.stream().anyMatch(p -> p.getTag().getId().equals(tag.id()))) {
                        continue;
                    }
                    UUID group = taxonomy.singleSelectGroup(tag.id()).map(TagTaxonomy.Node::id).orElse(null);
                    if (group != null && !usedGroups.add(group)) {
                        continue;
                    }
                    picks.add(UserTag.builder().tagger(user).subject(user)
                            .tag(tagRepository.getReferenceById(tag.id())).build());
                }
            }
            if (random.nextInt(3) == 0) {
                TagTaxonomy.Node parent = shuffled.getFirst();
                if (!taxonomy.isSelfOnly(parent.id())) {
                    picks.add(UserTag.builder().tagger(user).subject(user)
                            .parentTag(tagRepository.getReferenceById(parent.id()))
                            .customLabel(CUSTOM_LABELS.get(random.nextInt(CUSTOM_LABELS.size()))).build());
                }
            }
            userTagRepository.saveAll(picks);
            seededUsers++;
        }
        log.info("Tag seed: assigned random self-tags to {} user(s)", seededUsers);
    }

    /** Walk down from a category, stopping at a selectable node with a 1-in-3 chance per level. */
    private static TagTaxonomy.Node randomSelectableIn(TagTaxonomy.Snapshot taxonomy, UUID categoryId, Random random) {
        TagTaxonomy.Node current = null;
        List<TagTaxonomy.Node> options = taxonomy.childrenOf(categoryId);
        while (!options.isEmpty()) {
            current = options.get(random.nextInt(options.size()));
            List<TagTaxonomy.Node> deeper = taxonomy.childrenOf(current.id());
            if (deeper.isEmpty() || (taxonomy.isSelectable(current) && random.nextInt(3) == 0)) {
                break;
            }
            options = deeper;
        }
        return current != null && taxonomy.isSelectable(current) ? current : null;
    }
}
