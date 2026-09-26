package com.example.demo.service;

import com.example.demo.model.User;
import com.example.demo.model.UserTag;
import com.example.demo.repository.UserTagRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Finds people by tag for the Tags search mode. Each criterion is either a tree node (matching
 * that node or anything beneath it, so "Music" finds "Jazz" fans) or free text (matching custom
 * and dictionary labels). Only assignments the viewer could see on a card are ever considered.
 */
@Service
@RequiredArgsConstructor
public class TagSearchService {

    private final UserTagRepository userTagRepository;
    private final TagTaxonomy tagTaxonomy;

    @Transactional(readOnly = true)
    public List<User> findUsers(List<UUID> tagIds, List<String> labels, boolean matchAll, UUID viewerId) {
        TagTaxonomy.Snapshot taxonomy = tagTaxonomy.current();
        List<List<UserTag>> matchesPerCriterion = new ArrayList<>();
        for (UUID tagId : tagIds) {
            Set<UUID> subtree = taxonomy.subtree(tagId);
            matchesPerCriterion.add(subtree.isEmpty() ? List.of() : userTagRepository.findVisibleByTagIds(subtree, viewerId));
        }
        for (String label : labels) {
            if (!label.isBlank()) {
                matchesPerCriterion.add(userTagRepository.findVisibleByLabelLike(likePattern(label), viewerId));
            }
        }
        if (matchesPerCriterion.isEmpty()) {
            return List.of();
        }

        Map<UUID, User> users = new LinkedHashMap<>();
        Set<UUID> result = null;
        for (List<UserTag> matches : matchesPerCriterion) {
            matches.forEach(ut -> users.putIfAbsent(ut.getSubject().getId(), ut.getSubject()));
            Set<UUID> ids = matches.stream().map(ut -> ut.getSubject().getId()).collect(Collectors.toSet());
            if (result == null) {
                result = new HashSet<>(ids);
            } else if (matchAll) {
                result.retainAll(ids);
            } else {
                result.addAll(ids);
            }
        }
        Set<UUID> matched = result;
        return users.values().stream().filter(u -> matched.contains(u.getId())).toList();
    }

    /** Lower-cased "%text%" with LIKE wildcards in the user's text escaped. */
    static String likePattern(String text) {
        String escaped = text.trim().toLowerCase(Locale.ROOT)
                .replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
        return "%" + escaped + "%";
    }
}
