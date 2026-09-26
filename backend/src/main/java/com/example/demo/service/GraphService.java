package com.example.demo.service;

import com.example.demo.dto.EdgeKind;
import com.example.demo.dto.Graph;
import com.example.demo.dto.GraphEdge;
import com.example.demo.dto.GraphNode;
import com.example.demo.dto.NodeKind;
import com.example.demo.dto.NodeSource;
import com.example.demo.dto.ProfileView;
import com.example.demo.dto.TagAssignmentResponse;
import com.example.demo.exception.NotFoundException;
import com.example.demo.model.Contact;
import com.example.demo.model.ContactLink;
import com.example.demo.model.GraphShare;
import com.example.demo.model.User;
import com.example.demo.repository.ContactLinkRepository;
import com.example.demo.repository.ContactRepository;
import com.example.demo.repository.ContactTagRepository;
import com.example.demo.repository.GraphShareHiddenContactRepository;
import com.example.demo.repository.GraphShareRepository;
import com.example.demo.repository.UserRepository;
import com.example.demo.repository.UserTagRepository;
import com.example.demo.util.DeterministicIds;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Builds a {@link Graph} for a viewer — plan §1 and §4 P4: {@link #buildFor} is the viewer's own
 * graph ({@code GET /api/graph}: SELF, their own contacts, DIRECT/LINK edges, plus SHARED overlays
 * from connected sharers), {@link #buildShared} is one sharer's graph as a particular viewer may
 * see it ({@code GET /api/shares/{id}/graph}, viewer-only, connected or not).
 *
 * <p>Both read only the sharer's own {@code contacts}/{@code contact_links} rows (never anything
 * the sharer only sees through someone else's share — there is no re-sharing, and this falls out
 * naturally since a share never stores or reads another share's composed nodes). Visibility for one
 * of the sharer's contacts, as seen by one viewer, is computed once by {@link #resolveSharedContact}
 * and reused by both entry points so the two never drift apart.
 *
 * <p>Query budget: {@link #buildFor} issues a fixed number of queries for the caller's own graph
 * (independent of how many contacts they have) plus up to five bounded, batched queries per active
 * share the caller views (never one query per contact) — see the inline comments below.
 */
@Service
@RequiredArgsConstructor
public class GraphService {

    private final UserRepository userRepository;
    private final ContactRepository contactRepository;
    private final ContactLinkRepository contactLinkRepository;
    private final ContactTagRepository contactTagRepository;
    private final UserTagRepository userTagRepository;
    private final GraphShareRepository graphShareRepository;
    private final GraphShareHiddenContactRepository hiddenContactRepository;
    private final TagTaxonomy tagTaxonomy;

    @Transactional(readOnly = true)
    public Graph buildFor(UUID viewerId) {
        User viewer = userRepository.findById(viewerId)
                .orElseThrow(() -> new NotFoundException("User not found: " + viewerId));
        List<Contact> myContacts = contactRepository.findByOwnerId(viewerId);
        List<ContactLink> myLinks = contactLinkRepository.findByOwnerId(viewerId);
        Map<UUID, List<TagAssignmentResponse>> myContactTags =
                tagsByContact(myContacts.stream().map(Contact::getId).toList());

        // Self-profiles needed for SELF plus every registered contact's `profile` — one batch query
        // regardless of how many registered contacts there are.
        Map<UUID, String> bioBySubject = new HashMap<>();
        bioBySubject.put(viewerId, viewer.getBio());
        for (Contact c : myContacts) {
            if (c.getLinkedUser() != null) {
                bioBySubject.put(c.getLinkedUser().getId(), c.getLinkedUser().getBio());
            }
        }
        Map<UUID, ProfileView> profiles = selfProfiles(bioBySubject);

        Map<String, GraphNode> nodes = new LinkedHashMap<>();
        List<GraphEdge> edges = new ArrayList<>();

        nodes.put(viewerId.toString(), new GraphNode(
                viewerId.toString(), NodeKind.SELF,
                nullToEmpty(viewer.getFirstName()), nullToEmpty(viewer.getLastName()),
                "", null, List.of(), "",
                profiles.get(viewerId), null, null, true));

        Map<UUID, Contact> myContactByLinkedUserId = new HashMap<>();
        for (Contact c : myContacts) {
            boolean registered = c.getLinkedUser() != null;
            String phoneNumber = registered ? c.getLinkedUser().getPhoneNumber() : c.getPhoneNumber();
            ProfileView profile = registered ? profiles.get(c.getLinkedUser().getId()) : null;
            GraphNode node = new GraphNode(
                    c.getId().toString(), registered ? NodeKind.REGISTERED : NodeKind.PLACEHOLDER,
                    c.getFirstName(), nullToEmpty(c.getLastName()), nullToEmpty(c.getAbout()), phoneNumber,
                    myContactTags.getOrDefault(c.getId(), List.of()), nullToEmpty(c.getNote()), profile,
                    registered ? c.getLinkedUser().getId() : null, null, true);
            nodes.put(node.id(), node);
            edges.add(new GraphEdge(viewerId.toString(), node.id(), EdgeKind.DIRECT, null));
            if (registered) {
                myContactByLinkedUserId.put(c.getLinkedUser().getId(), c);
            }
        }
        for (ContactLink link : myLinks) {
            edges.add(new GraphEdge(link.getContactA().getId().toString(), link.getContactB().getId().toString(),
                    EdgeKind.LINK, null));
        }

        // SHARED overlays: only sharers I'm connected to attach here — a non-connected share only
        // ever shows up through GET /api/shares/{id}/graph.
        for (GraphShare share : graphShareRepository.findByViewerIdAndRevokedAtIsNull(viewerId)) {
            Contact myContactForSharer = myContactByLinkedUserId.get(share.getSharer().getId());
            if (myContactForSharer == null) {
                continue;
            }
            appendSharerSubgraph(share, viewerId, viewer, myContactForSharer.getId().toString(),
                    EdgeKind.SHARED, false, nodes, edges);
        }

        return new Graph(new ArrayList<>(nodes.values()), edges);
    }

    @Transactional(readOnly = true)
    public Graph buildShared(UUID shareId, UUID viewerId) {
        GraphShare share = graphShareRepository.findByIdAndViewerIdAndRevokedAtIsNull(shareId, viewerId)
                .orElseThrow(() -> new NotFoundException("Share not found: " + shareId));
        User viewer = userRepository.findById(viewerId)
                .orElseThrow(() -> new NotFoundException("User not found: " + viewerId));
        User sharer = share.getSharer();

        Map<String, GraphNode> nodes = new LinkedHashMap<>();
        List<GraphEdge> edges = new ArrayList<>();

        NodeSource rootSource = new NodeSource(share.getId(), sharer.getId(), fullName(sharer));
        nodes.put(sharer.getId().toString(), new GraphNode(
                sharer.getId().toString(), NodeKind.REGISTERED,
                nullToEmpty(sharer.getFirstName()), nullToEmpty(sharer.getLastName()),
                "", null, List.of(), "", null, null, rootSource, false));

        appendSharerSubgraph(share, viewerId, viewer, sharer.getId().toString(), EdgeKind.DIRECT, true, nodes, edges);

        return new Graph(new ArrayList<>(nodes.values()), edges);
    }

    /**
     * Loads {@code share.sharer}'s own direct contacts and links (never anything they only see
     * through someone else's share — {@link ContactRepository#findByOwnerId} can't return those,
     * they simply aren't rows in {@code contacts}) and appends the visible nodes/edges to the graph
     * under construction. Shared with both entry points: {@code rootId} is either the viewer's own
     * contact node for the sharer ({@link #buildFor}'s overlay) or the sharer's own root node
     * ({@link #buildShared}); {@code standalone} controls whether a viewer-as-third-party contact
     * gets its own SELF-like node emitted here (buildShared) or is left to the caller, who already
     * has a SELF node for the viewer (buildFor's overlay).
     */
    private void appendSharerSubgraph(GraphShare share, UUID viewerId, User viewer, String rootId,
                                       EdgeKind rootEdgeKind, boolean standalone,
                                       Map<String, GraphNode> nodes, List<GraphEdge> edges) {
        User sharer = share.getSharer();
        NodeSource source = new NodeSource(share.getId(), sharer.getId(), fullName(sharer));
        String shareIdString = share.getId().toString();

        List<Contact> sharerContacts = contactRepository.findByOwnerId(sharer.getId());
        Set<UUID> hiddenIds = hiddenContactRepository.findById_ShareId(share.getId()).stream()
                .map(h -> h.getContact().getId())
                .collect(Collectors.toSet());
        List<ContactLink> sharerLinks = contactLinkRepository.findByOwnerId(sharer.getId());
        Map<UUID, List<TagAssignmentResponse>> sharerContactTags = share.isShareTags()
                ? tagsByContact(sharerContacts.stream().map(Contact::getId).toList())
                : Map.of();

        Map<UUID, String> discoverableBio = new HashMap<>();
        for (Contact c : sharerContacts) {
            User linked = c.getLinkedUser();
            if (linked != null && !linked.getId().equals(viewerId) && linked.isDiscoverableInSharedGraphs()) {
                discoverableBio.put(linked.getId(), linked.getBio());
            }
        }
        Map<UUID, ProfileView> profiles = selfProfiles(discoverableBio);

        Map<UUID, ResolvedNode> resolved = new HashMap<>();
        for (Contact x : sharerContacts) {
            ResolvedNode r = resolveSharedContact(x, share, hiddenIds, viewerId, sharerContactTags, profiles,
                    source, viewer, standalone);
            resolved.put(x.getId(), r);
            if (r.node() != null) {
                nodes.putIfAbsent(r.mappedId(), r.node());
            }
            edges.add(new GraphEdge(rootId, r.mappedId(), rootEdgeKind, shareIdString));
        }
        for (ContactLink link : sharerLinks) {
            ResolvedNode a = resolved.get(link.getContactA().getId());
            ResolvedNode b = resolved.get(link.getContactB().getId());
            if (a != null && b != null) {
                edges.add(new GraphEdge(a.mappedId(), b.mappedId(), EdgeKind.LINK, shareIdString));
            }
        }
    }

    /**
     * Plan §1.4-1.5's visibility rules for one of the sharer's contacts {@code x}, as seen by
     * {@code viewerId} through {@code share} — applied in this order (matches the plan's own
     * ordering, so a sharer who explicitly hides "the viewer themselves" gets Hidden User too,
     * before the C==viewer rule ever runs):
     * <ol>
     *   <li>Explicitly hidden by the sharer &rarr; Hidden User (deterministic per-share id).</li>
     *   <li>Registered to the viewer themselves (C == V) &rarr; no separate node in the overlay
     *       (maps to the viewer's own SELF node instead); a non-editable SELF-like node when
     *       building the sharer's graph standalone.</li>
     *   <li>Registered to someone else who hasn't opted in ({@code discoverableInSharedGraphs}) &rarr;
     *       Hidden User too (the plan's "locked" contacts — can't be un-hidden).</li>
     *   <li>Registered to someone else who has opted in &rarr; their name and their own public
     *       profile (bio + self-tags); never their real phone number, never their linked-user id,
     *       and never the sharer's own about/tags/note about them (those stay private to the
     *       sharer — only the third party's own, already-public self-profile is shown).</li>
     *   <li>Placeholder &rarr; name always; about/tags/note/phone only when the share's respective
     *       flag is on (all default off).</li>
     * </ol>
     */
    private ResolvedNode resolveSharedContact(Contact x, GraphShare share, Set<UUID> hiddenIds, UUID viewerId,
                                               Map<UUID, List<TagAssignmentResponse>> tagsByContactId,
                                               Map<UUID, ProfileView> profiles, NodeSource source,
                                               User viewer, boolean standalone) {
        if (hiddenIds.contains(x.getId())) {
            return hiddenNode(share.getId(), x.getId(), source);
        }

        User linkedUser = x.getLinkedUser();
        boolean isViewer = linkedUser != null && linkedUser.getId().equals(viewerId);
        if (isViewer) {
            String id = viewerId.toString();
            if (!standalone) {
                return new ResolvedNode(id, null);
            }
            GraphNode selfLike = new GraphNode(id, NodeKind.SELF,
                    nullToEmpty(viewer.getFirstName()), nullToEmpty(viewer.getLastName()),
                    "", null, List.of(), "", null, null, source, false);
            return new ResolvedNode(id, selfLike);
        }

        if (linkedUser != null) {
            if (!linkedUser.isDiscoverableInSharedGraphs()) {
                return hiddenNode(share.getId(), x.getId(), source);
            }
            GraphNode node = new GraphNode(x.getId().toString(), NodeKind.REGISTERED,
                    x.getFirstName(), nullToEmpty(x.getLastName()), "", null, List.of(), "",
                    profiles.get(linkedUser.getId()), null, source, false);
            return new ResolvedNode(x.getId().toString(), node);
        }

        String about = share.isShareAbout() ? nullToEmpty(x.getAbout()) : "";
        List<TagAssignmentResponse> tags = share.isShareTags()
                ? tagsByContactId.getOrDefault(x.getId(), List.of()) : List.of();
        String note = share.isShareNotes() ? nullToEmpty(x.getNote()) : "";
        String phone = share.isSharePhone() ? x.getPhoneNumber() : null;
        GraphNode node = new GraphNode(x.getId().toString(), NodeKind.PLACEHOLDER,
                x.getFirstName(), nullToEmpty(x.getLastName()), about, phone, tags, note, null,
                null, source, false);
        return new ResolvedNode(x.getId().toString(), node);
    }

    private ResolvedNode hiddenNode(UUID shareId, UUID contactId, NodeSource source) {
        UUID hiddenId = DeterministicIds.hiddenContactId(shareId, contactId);
        GraphNode node = new GraphNode(hiddenId.toString(), NodeKind.HIDDEN, "Hidden", "User",
                "", null, List.of(), "", null, null, source, false);
        return new ResolvedNode(hiddenId.toString(), node);
    }

    /** One contact's tags, batched over a set of contact ids — never one query per contact. */
    private Map<UUID, List<TagAssignmentResponse>> tagsByContact(List<UUID> contactIds) {
        if (contactIds.isEmpty()) {
            return Map.of();
        }
        TagTaxonomy.Snapshot taxonomy = tagTaxonomy.current();
        return contactTagRepository.findByContactIdIn(contactIds).stream()
                .collect(Collectors.groupingBy(ct -> ct.getContact().getId(),
                        Collectors.mapping(ct -> TagAssignmentResponse.from(ct, taxonomy), Collectors.toList())));
    }

    /**
     * A {@link ProfileView} (bio + public self-tags) per subject id, batched in one query — bios
     * come from already-loaded {@link User} entities (no extra query), only self-tags need fetching.
     */
    private Map<UUID, ProfileView> selfProfiles(Map<UUID, String> bioBySubjectId) {
        if (bioBySubjectId.isEmpty()) {
            return Map.of();
        }
        TagTaxonomy.Snapshot taxonomy = tagTaxonomy.current();
        Map<UUID, List<TagAssignmentResponse>> tagsBySubject = userTagRepository
                .findSelfTagsBySubjectIdIn(bioBySubjectId.keySet()).stream()
                .collect(Collectors.groupingBy(ut -> ut.getSubject().getId(),
                        Collectors.mapping(ut -> TagAssignmentResponse.from(ut, ut.getSubject().getId(), taxonomy),
                                Collectors.toList())));
        Map<UUID, ProfileView> result = new HashMap<>();
        bioBySubjectId.forEach((id, bio) ->
                result.put(id, new ProfileView(nullToEmpty(bio), tagsBySubject.getOrDefault(id, List.of()))));
        return result;
    }

    private static String nullToEmpty(String s) {
        return s == null ? "" : s;
    }

    private static String fullName(User user) {
        return nullToEmpty(user.getFirstName()) + (user.getLastName() == null ? "" : " " + user.getLastName());
    }

    /** A visible contact mapped to its node id — {@code node} is null only for the overlay's C==V case. */
    private record ResolvedNode(String mappedId, GraphNode node) {
    }
}
