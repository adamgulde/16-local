package com.example.demo.service;

import com.example.demo.model.Tag;
import com.example.demo.repository.TagRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Deque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * In-memory index of the tag tree. The dictionary only changes through Flyway migrations, so it
 * is loaded once and every path / ancestor / subtree question is answered without touching lazy
 * JPA associations (which would fail outside a session with open-in-view disabled).
 */
@Component
@RequiredArgsConstructor
public class TagTaxonomy {

    public static final String PATH_SEPARATOR = " › ";

    private final TagRepository tagRepository;
    private volatile Snapshot snapshot;

    public Snapshot current() {
        Snapshot s = snapshot;
        if (s == null) {
            synchronized (this) {
                if (snapshot == null) {
                    snapshot = new Snapshot(tagRepository.findAll());
                }
                s = snapshot;
            }
        }
        return s;
    }

    /** Drop the cached tree, e.g. after tests insert dictionary rows. */
    public void invalidate() {
        snapshot = null;
    }

    public record Node(UUID id, String label, UUID parentId, int level, String icon, int displayOrder,
                       boolean selfOnly, boolean singleSelect) {
    }

    public static final class Snapshot {
        private final Map<UUID, Node> byId = new HashMap<>();
        private final Map<UUID, List<Node>> children = new HashMap<>();
        private final List<Node> ordered = new ArrayList<>();

        Snapshot(List<Tag> tags) {
            for (Tag tag : tags) {
                Node node = new Node(
                        tag.getId(),
                        tag.getLabel(),
                        tag.getParent() != null ? tag.getParent().getId() : null,
                        tag.getLevel() != null ? tag.getLevel() : 1,
                        tag.getIcon(),
                        tag.getDisplayOrder() != null ? tag.getDisplayOrder() : 0,
                        tag.isSelfOnly(),
                        tag.isSingleSelect());
                byId.put(node.id(), node);
            }
            Comparator<Node> order = Comparator.comparingInt(Node::displayOrder).thenComparing(Node::label);
            byId.values().forEach(n -> children.computeIfAbsent(n.parentId(), k -> new ArrayList<>()).add(n));
            children.values().forEach(list -> list.sort(order));
            // Depth-first order: each category followed by its subtree, matching the picker's layout.
            Deque<Node> stack = new ArrayDeque<>(children.getOrDefault(null, List.of()).reversed());
            while (!stack.isEmpty()) {
                Node n = stack.pop();
                ordered.add(n);
                children.getOrDefault(n.id(), List.of()).reversed().forEach(stack::push);
            }
        }

        public List<Node> all() {
            return ordered;
        }

        public Optional<Node> get(UUID id) {
            return Optional.ofNullable(id == null ? null : byId.get(id));
        }

        public boolean hasChildren(UUID id) {
            return !children.getOrDefault(id, List.of()).isEmpty();
        }

        public List<Node> childrenOf(UUID id) {
            return children.getOrDefault(id, List.of());
        }

        /** Self first, then each ancestor up to (and including) the category. */
        public List<Node> lineage(UUID id) {
            List<Node> result = new ArrayList<>();
            Node n = byId.get(id);
            while (n != null) {
                result.add(n);
                n = n.parentId() != null ? byId.get(n.parentId()) : null;
            }
            return result;
        }

        public Node root(UUID id) {
            List<Node> lineage = lineage(id);
            return lineage.isEmpty() ? null : lineage.getLast();
        }

        public String path(UUID id) {
            return String.join(PATH_SEPARATOR, lineage(id).reversed().stream().map(Node::label).toList());
        }

        /** Categories themselves and single-select group headers ("Gender") are not tags. */
        public boolean isSelectable(Node node) {
            return node.level() > 1 && !node.singleSelect();
        }

        public boolean isSelfOnly(UUID id) {
            return lineage(id).stream().anyMatch(Node::selfOnly);
        }

        /** Nearest single-select ancestor-or-self, whose subtree may hold at most one assignment. */
        public Optional<Node> singleSelectGroup(UUID id) {
            return lineage(id).stream().filter(Node::singleSelect).findFirst();
        }

        public Set<UUID> subtree(UUID id) {
            Set<UUID> result = new HashSet<>();
            if (!byId.containsKey(id)) {
                return result;
            }
            Deque<UUID> queue = new ArrayDeque<>(List.of(id));
            while (!queue.isEmpty()) {
                UUID next = queue.pop();
                if (result.add(next)) {
                    children.getOrDefault(next, List.of()).forEach(c -> queue.push(c.id()));
                }
            }
            return result;
        }
    }
}
