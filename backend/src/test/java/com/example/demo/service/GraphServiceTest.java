package com.example.demo.service;

import com.example.demo.dto.EdgeKind;
import com.example.demo.dto.Graph;
import com.example.demo.dto.GraphEdge;
import com.example.demo.dto.GraphNode;
import com.example.demo.dto.NodeKind;
import com.example.demo.exception.NotFoundException;
import com.example.demo.model.Contact;
import com.example.demo.model.ContactLink;
import com.example.demo.model.ContactTag;
import com.example.demo.model.GraphShare;
import com.example.demo.model.GraphShareHiddenContact;
import com.example.demo.model.GraphShareHiddenContactId;
import com.example.demo.model.User;
import com.example.demo.model.UserTag;
import com.example.demo.repository.ContactLinkRepository;
import com.example.demo.repository.ContactRepository;
import com.example.demo.repository.ContactTagRepository;
import com.example.demo.repository.GraphShareHiddenContactRepository;
import com.example.demo.repository.GraphShareRepository;
import com.example.demo.repository.TagRepository;
import com.example.demo.repository.UserRepository;
import com.example.demo.repository.UserTagRepository;
import com.example.demo.util.DeterministicIds;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Plan §4 P4 — one test per visibility rule in {@link GraphService}. Both entry points
 * ({@code buildFor}'s SHARED overlay and {@code buildShared}'s standalone graph) go through the
 * same {@code resolveSharedContact} rules, so most rules are checked via whichever entry point
 * exercises them most directly; the C==viewer rule is checked through both, since that's the one
 * place their behaviour differs.
 */
@ExtendWith(MockitoExtension.class)
class GraphServiceTest {

    @Mock
    private UserRepository userRepository;
    @Mock
    private ContactRepository contactRepository;
    @Mock
    private ContactLinkRepository contactLinkRepository;
    @Mock
    private ContactTagRepository contactTagRepository;
    @Mock
    private UserTagRepository userTagRepository;
    @Mock
    private GraphShareRepository graphShareRepository;
    @Mock
    private GraphShareHiddenContactRepository hiddenContactRepository;
    @Mock
    private TagRepository tagRepository;

    private GraphService graphService;

    private final UUID viewerId = UUID.randomUUID();
    private final UUID sharerId = UUID.randomUUID();
    private final User viewer = User.builder().id(viewerId).firstName("Viewer").lastName("V").bio("viewer bio").build();
    private final User sharer = User.builder().id(sharerId).firstName("Sharer").lastName("S").build();

    @BeforeEach
    void setUp() {
        graphService = new GraphService(userRepository, contactRepository, contactLinkRepository,
                contactTagRepository, userTagRepository, graphShareRepository, hiddenContactRepository,
                new TagTaxonomy(tagRepository));
        lenient().when(tagRepository.findAll()).thenReturn(List.of());
        lenient().when(userRepository.findById(viewerId)).thenReturn(Optional.of(viewer));
        lenient().when(contactRepository.findByOwnerId(viewerId)).thenReturn(List.of());
        lenient().when(contactLinkRepository.findByOwnerId(any())).thenReturn(List.of());
        lenient().when(contactTagRepository.findByContactIdIn(anyCollection())).thenReturn(List.of());
        lenient().when(userTagRepository.findSelfTagsBySubjectIdIn(anyCollection())).thenReturn(List.of());
        lenient().when(graphShareRepository.findByViewerIdAndRevokedAtIsNull(viewerId)).thenReturn(List.of());
        lenient().when(hiddenContactRepository.findById_ShareId(any())).thenReturn(List.of());
    }

    private GraphShare activeShare(UUID id, boolean about, boolean tags, boolean notes, boolean phone) {
        return GraphShare.builder().id(id).sharer(sharer).viewer(viewer)
                .shareAbout(about).shareTags(tags).shareNotes(notes).sharePhone(phone).build();
    }

    // ---- buildFor: own graph -------------------------------------------------------------------

    @Test
    void buildForIncludesSelfAndOwnContactsWithDirectEdgesAndProfiles() {
        Contact placeholder = Contact.builder().id(UUID.randomUUID()).owner(viewer)
                .firstName("Ghost").about("my note about them").build();
        User linked = User.builder().id(UUID.randomUUID()).firstName("Linked").lastName("User")
                .phoneNumber("+1 555-000-0001").bio("their bio").build();
        Contact registered = Contact.builder().id(UUID.randomUUID()).owner(viewer).linkedUser(linked)
                .firstName("Linked").build();
        when(contactRepository.findByOwnerId(viewerId)).thenReturn(List.of(placeholder, registered));
        when(userTagRepository.findSelfTagsBySubjectIdIn(anyCollection())).thenReturn(List.of(
                UserTag.builder().id(UUID.randomUUID()).tagger(linked).subject(linked).customLabel("Runner").build()));

        Graph graph = graphService.buildFor(viewerId);

        assertThat(graph.nodes()).extracting(GraphNode::id)
                .containsExactlyInAnyOrder(viewerId.toString(), placeholder.getId().toString(), registered.getId().toString());
        GraphNode self = node(graph, viewerId.toString());
        assertThat(self.kind()).isEqualTo(NodeKind.SELF);
        assertThat(self.editable()).isTrue();
        assertThat(self.profile().bio()).isEqualTo("viewer bio");

        GraphNode registeredNode = node(graph, registered.getId().toString());
        assertThat(registeredNode.kind()).isEqualTo(NodeKind.REGISTERED);
        assertThat(registeredNode.phoneNumber()).isEqualTo("+1 555-000-0001");
        assertThat(registeredNode.linkedUserId()).isEqualTo(linked.getId());
        assertThat(registeredNode.profile().bio()).isEqualTo("their bio");
        assertThat(registeredNode.profile().tags()).extracting(t -> t.label()).containsExactly("Runner");
        assertThat(registeredNode.source()).isNull();

        assertThat(graph.edges()).contains(
                new GraphEdge(viewerId.toString(), placeholder.getId().toString(), EdgeKind.DIRECT, null),
                new GraphEdge(viewerId.toString(), registered.getId().toString(), EdgeKind.DIRECT, null));
    }

    @Test
    void buildForIncludesLinkEdgesAmongOwnContacts() {
        Contact a = Contact.builder().id(UUID.fromString("00000000-0000-0000-0000-000000000001")).owner(viewer).firstName("A").build();
        Contact b = Contact.builder().id(UUID.fromString("00000000-0000-0000-0000-000000000002")).owner(viewer).firstName("B").build();
        when(contactRepository.findByOwnerId(viewerId)).thenReturn(List.of(a, b));
        when(contactLinkRepository.findByOwnerId(viewerId))
                .thenReturn(List.of(ContactLink.builder().id(UUID.randomUUID()).owner(viewer).contactA(a).contactB(b).build()));

        Graph graph = graphService.buildFor(viewerId);

        assertThat(graph.edges()).contains(new GraphEdge(a.getId().toString(), b.getId().toString(), EdgeKind.LINK, null));
    }

    @Test
    void tagAndProfileLookupsAreBatchedNotPerContact() {
        List<Contact> many = List.of(
                Contact.builder().id(UUID.randomUUID()).owner(viewer).firstName("One").build(),
                Contact.builder().id(UUID.randomUUID()).owner(viewer).firstName("Two").build(),
                Contact.builder().id(UUID.randomUUID()).owner(viewer).firstName("Three").build());
        when(contactRepository.findByOwnerId(viewerId)).thenReturn(many);

        graphService.buildFor(viewerId);

        verify(contactTagRepository, times(1)).findByContactIdIn(anyCollection());
        verify(userTagRepository, times(1)).findSelfTagsBySubjectIdIn(anyCollection());
        verify(contactRepository, times(1)).findByOwnerId(viewerId);
    }

    @Test
    void revokedShareIsExcludedFromOwnGraph() {
        // findByViewerIdAndRevokedAtIsNull already only returns active shares — simulate a revoked
        // share by simply not appearing in that result, same as the real query would do.
        when(graphShareRepository.findByViewerIdAndRevokedAtIsNull(viewerId)).thenReturn(List.of());
        User linked = User.builder().id(sharerId).firstName("Sharer").build();
        Contact myContactForSharer = Contact.builder().id(UUID.randomUUID()).owner(viewer).linkedUser(linked).firstName("Sharer").build();
        when(contactRepository.findByOwnerId(viewerId)).thenReturn(List.of(myContactForSharer));

        Graph graph = graphService.buildFor(viewerId);

        assertThat(graph.edges()).noneMatch(e -> e.kind() == EdgeKind.SHARED);
    }

    @Test
    void nonConnectedShareDoesNotAppearInOwnGraphButBuildSharedStillWorks() {
        GraphShare share = activeShare(UUID.randomUUID(), true, true, true, true);
        when(graphShareRepository.findByViewerIdAndRevokedAtIsNull(viewerId)).thenReturn(List.of(share));
        // Viewer has no contact linked to the sharer at all -> not connected.
        when(contactRepository.findByOwnerId(viewerId)).thenReturn(List.of());

        Graph ownGraph = graphService.buildFor(viewerId);
        assertThat(ownGraph.nodes()).extracting(GraphNode::id).doesNotContain(sharerId.toString());
        assertThat(ownGraph.edges()).isEmpty();

        when(graphShareRepository.findByIdAndViewerIdAndRevokedAtIsNull(share.getId(), viewerId))
                .thenReturn(Optional.of(share));
        Graph sharedGraph = graphService.buildShared(share.getId(), viewerId);
        assertThat(sharedGraph.nodes()).extracting(GraphNode::id).contains(sharerId.toString());
    }

    // ---- buildShared: visibility rules -----------------------------------------------------------

    private void givenActiveShare(GraphShare share) {
        when(graphShareRepository.findByIdAndViewerIdAndRevokedAtIsNull(share.getId(), viewerId))
                .thenReturn(Optional.of(share));
    }

    @Test
    void buildSharedIs404WhenTheShareIsNotActiveOrNotTheCallersAsViewer() {
        UUID shareId = UUID.randomUUID();
        when(graphShareRepository.findByIdAndViewerIdAndRevokedAtIsNull(shareId, viewerId)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> graphService.buildShared(shareId, viewerId)).isInstanceOf(NotFoundException.class);
    }

    @Test
    void buildSharedRootIsTheSharerNonEditableWithSourceSet() {
        GraphShare share = activeShare(UUID.randomUUID(), false, false, false, false);
        givenActiveShare(share);
        when(contactRepository.findByOwnerId(sharerId)).thenReturn(List.of());

        Graph graph = graphService.buildShared(share.getId(), viewerId);

        GraphNode root = node(graph, sharerId.toString());
        assertThat(root.kind()).isEqualTo(NodeKind.REGISTERED);
        assertThat(root.editable()).isFalse();
        assertThat(root.source()).isEqualTo(new com.example.demo.dto.NodeSource(share.getId(), sharerId, "Sharer S"));
    }

    @Test
    void placeholderFieldsAreEmptyWhenAllShareFlagsAreOff() {
        GraphShare share = activeShare(UUID.randomUUID(), false, false, false, false);
        givenActiveShare(share);
        Contact placeholder = Contact.builder().id(UUID.randomUUID()).owner(sharer)
                .firstName("Ghost").lastName("Writer").about("secret about").phoneNumber("+1 555-000-0002")
                .note("secret note").build();
        when(contactRepository.findByOwnerId(sharerId)).thenReturn(List.of(placeholder));

        GraphNode n = node(graphService.buildShared(share.getId(), viewerId), placeholder.getId().toString());

        assertThat(n.kind()).isEqualTo(NodeKind.PLACEHOLDER);
        assertThat(n.firstName()).isEqualTo("Ghost");
        assertThat(n.lastName()).isEqualTo("Writer");
        assertThat(n.about()).isEmpty();
        assertThat(n.tags()).isEmpty();
        assertThat(n.note()).isEmpty();
        assertThat(n.phoneNumber()).isNull();
        assertThat(n.editable()).isFalse();
        assertThat(n.source().shareId()).isEqualTo(share.getId());
    }

    @Test
    void placeholderFieldsAreShownWhenTheirShareFlagIsOn() {
        GraphShare share = activeShare(UUID.randomUUID(), true, true, true, true);
        givenActiveShare(share);
        Contact placeholder = Contact.builder().id(UUID.randomUUID()).owner(sharer)
                .firstName("Ghost").about("visible about").phoneNumber("+1 555-000-0003").note("visible note").build();
        when(contactRepository.findByOwnerId(sharerId)).thenReturn(List.of(placeholder));
        when(contactTagRepository.findByContactIdIn(anyCollection())).thenReturn(List.of(
                ContactTag.builder().id(UUID.randomUUID()).contact(placeholder).customLabel("Old friend").build()));

        GraphNode n = node(graphService.buildShared(share.getId(), viewerId), placeholder.getId().toString());

        assertThat(n.about()).isEqualTo("visible about");
        assertThat(n.tags()).extracting(t -> t.label()).containsExactly("Old friend");
        assertThat(n.note()).isEqualTo("visible note");
        assertThat(n.phoneNumber()).isEqualTo("+1 555-000-0003");
    }

    @Test
    void eachPlaceholderFlagGatesOnlyItsOwnField() {
        GraphShare share = activeShare(UUID.randomUUID(), true, false, false, false);
        givenActiveShare(share);
        Contact placeholder = Contact.builder().id(UUID.randomUUID()).owner(sharer)
                .firstName("Ghost").about("about only").note("note hidden").phoneNumber("+1 555-000-0004").build();
        when(contactRepository.findByOwnerId(sharerId)).thenReturn(List.of(placeholder));

        GraphNode n = node(graphService.buildShared(share.getId(), viewerId), placeholder.getId().toString());

        assertThat(n.about()).isEqualTo("about only");
        assertThat(n.note()).isEmpty();
        assertThat(n.phoneNumber()).isNull();
    }

    @Test
    void explicitlyHiddenContactRendersAsHiddenUserWithDeterministicId() {
        GraphShare share = activeShare(UUID.randomUUID(), true, true, true, true);
        givenActiveShare(share);
        Contact hidden = Contact.builder().id(UUID.randomUUID()).owner(sharer)
                .firstName("Real").lastName("Name").about("should not leak").build();
        when(contactRepository.findByOwnerId(sharerId)).thenReturn(List.of(hidden));
        when(hiddenContactRepository.findById_ShareId(share.getId())).thenReturn(List.of(
                GraphShareHiddenContact.builder()
                        .id(new GraphShareHiddenContactId(share.getId(), hidden.getId()))
                        .share(share).contact(hidden).build()));

        Graph graph = graphService.buildShared(share.getId(), viewerId);

        UUID expectedId = DeterministicIds.hiddenContactId(share.getId(), hidden.getId());
        assertThat(graph.nodes()).extracting(GraphNode::id).doesNotContain(hidden.getId().toString());
        GraphNode hiddenNode = node(graph, expectedId.toString());
        assertThat(hiddenNode.kind()).isEqualTo(NodeKind.HIDDEN);
        assertThat(hiddenNode.firstName()).isEqualTo("Hidden");
        assertThat(hiddenNode.lastName()).isEqualTo("User");
        assertThat(hiddenNode.about()).isEmpty();
        assertThat(hiddenNode.tags()).isEmpty();
    }

    @Test
    void hiddenIdIsStableAcrossCallsButDiffersAcrossShares() {
        Contact contact = Contact.builder().id(UUID.randomUUID()).owner(sharer).firstName("X").build();
        GraphShare share1 = activeShare(UUID.randomUUID(), false, false, false, false);
        GraphShare share2 = activeShare(UUID.randomUUID(), false, false, false, false);
        when(contactRepository.findByOwnerId(sharerId)).thenReturn(List.of(contact));
        when(hiddenContactRepository.findById_ShareId(share1.getId())).thenReturn(List.of(
                GraphShareHiddenContact.builder().id(new GraphShareHiddenContactId(share1.getId(), contact.getId()))
                        .share(share1).contact(contact).build()));
        when(hiddenContactRepository.findById_ShareId(share2.getId())).thenReturn(List.of(
                GraphShareHiddenContact.builder().id(new GraphShareHiddenContactId(share2.getId(), contact.getId()))
                        .share(share2).contact(contact).build()));
        givenActiveShare(share1);
        when(graphShareRepository.findByIdAndViewerIdAndRevokedAtIsNull(share2.getId(), viewerId)).thenReturn(Optional.of(share2));

        Graph graph1a = graphService.buildShared(share1.getId(), viewerId);
        Graph graph1b = graphService.buildShared(share1.getId(), viewerId);
        Graph graph2 = graphService.buildShared(share2.getId(), viewerId);

        String id1a = onlyNonRootId(graph1a);
        String id1b = onlyNonRootId(graph1b);
        String id2 = onlyNonRootId(graph2);
        assertThat(id1a).isEqualTo(id1b);
        assertThat(id1a).isNotEqualTo(id2);
    }

    @Test
    void registeredThirdPartyWhoOptedInShowsPublicProfileNeverPhoneOrOwnAnnotationsOrUserId() {
        GraphShare share = activeShare(UUID.randomUUID(), true, true, true, true); // flags on to prove they're ignored here
        givenActiveShare(share);
        User c = User.builder().id(UUID.randomUUID()).firstName("Carol").bio("public bio")
                .discoverableInSharedGraphs(true).phoneNumber("+1 555-000-0005").build();
        Contact contactForC = Contact.builder().id(UUID.randomUUID()).owner(sharer).linkedUser(c)
                .firstName("Carol").about("sharer's private annotation").note("sharer's private note").build();
        when(contactRepository.findByOwnerId(sharerId)).thenReturn(List.of(contactForC));
        when(userTagRepository.findSelfTagsBySubjectIdIn(anyCollection())).thenReturn(List.of(
                UserTag.builder().id(UUID.randomUUID()).tagger(c).subject(c).customLabel("Public tag").build()));

        GraphNode n = node(graphService.buildShared(share.getId(), viewerId), contactForC.getId().toString());

        assertThat(n.kind()).isEqualTo(NodeKind.REGISTERED);
        assertThat(n.linkedUserId()).isNull();
        assertThat(n.phoneNumber()).isNull();
        assertThat(n.about()).isEmpty();
        assertThat(n.note()).isEmpty();
        assertThat(n.profile().bio()).isEqualTo("public bio");
        assertThat(n.profile().tags()).extracting(t -> t.label()).containsExactly("Public tag");
    }

    @Test
    void registeredThirdPartyWhoOptedOutRendersAsHiddenUser() {
        GraphShare share = activeShare(UUID.randomUUID(), true, true, true, true);
        givenActiveShare(share);
        User c = User.builder().id(UUID.randomUUID()).firstName("Dan").discoverableInSharedGraphs(false).build();
        Contact contactForC = Contact.builder().id(UUID.randomUUID()).owner(sharer).linkedUser(c).firstName("Dan").build();
        when(contactRepository.findByOwnerId(sharerId)).thenReturn(List.of(contactForC));

        Graph graph = graphService.buildShared(share.getId(), viewerId);

        assertThat(graph.nodes()).extracting(GraphNode::id).doesNotContain(contactForC.getId().toString());
        GraphNode n = node(graph, DeterministicIds.hiddenContactId(share.getId(), contactForC.getId()).toString());
        assertThat(n.kind()).isEqualTo(NodeKind.HIDDEN);
    }

    @Test
    void contactRegisteredToTheViewerMapsToASelfLikeNonEditableNodeInStandaloneGraph() {
        GraphShare share = activeShare(UUID.randomUUID(), true, true, true, true);
        givenActiveShare(share);
        Contact contactForViewer = Contact.builder().id(UUID.randomUUID()).owner(sharer).linkedUser(viewer).firstName("Viewer").build();
        when(contactRepository.findByOwnerId(sharerId)).thenReturn(List.of(contactForViewer));

        Graph graph = graphService.buildShared(share.getId(), viewerId);

        assertThat(graph.nodes()).extracting(GraphNode::id).doesNotContain(contactForViewer.getId().toString());
        GraphNode selfLike = node(graph, viewerId.toString());
        assertThat(selfLike.kind()).isEqualTo(NodeKind.SELF);
        assertThat(selfLike.editable()).isFalse();
        assertThat(selfLike.source()).isNotNull();
    }

    @Test
    void contactRegisteredToTheViewerAttachesToViewersOwnSelfNodeInOverlayWithoutADuplicateNode() {
        GraphShare share = activeShare(UUID.randomUUID(), true, true, true, true);
        User myContactForSharerLinked = sharer;
        Contact myContactForSharer = Contact.builder().id(UUID.randomUUID()).owner(viewer)
                .linkedUser(myContactForSharerLinked).firstName("Sharer").build();
        Contact sharersContactForMe = Contact.builder().id(UUID.randomUUID()).owner(sharer).linkedUser(viewer).firstName("Viewer").build();
        when(contactRepository.findByOwnerId(viewerId)).thenReturn(List.of(myContactForSharer));
        when(graphShareRepository.findByViewerIdAndRevokedAtIsNull(viewerId)).thenReturn(List.of(share));
        when(contactRepository.findByOwnerId(sharerId)).thenReturn(List.of(sharersContactForMe));

        Graph graph = graphService.buildFor(viewerId);

        // Exactly one SELF node (the viewer's own) — no separate node was emitted for "me" in the overlay.
        assertThat(graph.nodes()).filteredOn(n -> n.kind() == NodeKind.SELF).hasSize(1);
        assertThat(graph.nodes()).extracting(GraphNode::id).doesNotContain(sharersContactForMe.getId().toString());
        assertThat(graph.edges()).contains(
                new GraphEdge(myContactForSharer.getId().toString(), viewerId.toString(), EdgeKind.SHARED, share.getId().toString()));
    }

    @Test
    void explicitlyHiddenTakesPriorityOverTheViewerThemselvesPerPlanOrdering() {
        GraphShare share = activeShare(UUID.randomUUID(), true, true, true, true);
        givenActiveShare(share);
        Contact contactForViewer = Contact.builder().id(UUID.randomUUID()).owner(sharer).linkedUser(viewer).firstName("Viewer").build();
        when(contactRepository.findByOwnerId(sharerId)).thenReturn(List.of(contactForViewer));
        when(hiddenContactRepository.findById_ShareId(share.getId())).thenReturn(List.of(
                GraphShareHiddenContact.builder()
                        .id(new GraphShareHiddenContactId(share.getId(), contactForViewer.getId()))
                        .share(share).contact(contactForViewer).build()));

        Graph graph = graphService.buildShared(share.getId(), viewerId);

        // Hidden, not the SELF-like mapping — even though the underlying contact is the viewer themselves.
        assertThat(graph.nodes()).filteredOn(n -> n.kind() == NodeKind.SELF).isEmpty();
        GraphNode hiddenNode = node(graph, DeterministicIds.hiddenContactId(share.getId(), contactForViewer.getId()).toString());
        assertThat(hiddenNode.kind()).isEqualTo(NodeKind.HIDDEN);
    }

    @Test
    void linkEdgesAreMappedThroughTheSameVisibilityRulesAsNodes() {
        GraphShare share = activeShare(UUID.randomUUID(), true, true, true, true);
        givenActiveShare(share);
        Contact visible = Contact.builder().id(UUID.randomUUID()).owner(sharer).firstName("Visible").build();
        Contact hidden = Contact.builder().id(UUID.randomUUID()).owner(sharer).firstName("Hidden").build();
        when(contactRepository.findByOwnerId(sharerId)).thenReturn(List.of(visible, hidden));
        when(hiddenContactRepository.findById_ShareId(share.getId())).thenReturn(List.of(
                GraphShareHiddenContact.builder().id(new GraphShareHiddenContactId(share.getId(), hidden.getId()))
                        .share(share).contact(hidden).build()));
        UUID lowId = visible.getId().compareTo(hidden.getId()) < 0 ? visible.getId() : hidden.getId();
        UUID highId = visible.getId().compareTo(hidden.getId()) < 0 ? hidden.getId() : visible.getId();
        Contact low = lowId.equals(visible.getId()) ? visible : hidden;
        Contact high = highId.equals(visible.getId()) ? visible : hidden;
        when(contactLinkRepository.findByOwnerId(sharerId)).thenReturn(List.of(
                ContactLink.builder().id(UUID.randomUUID()).owner(sharer).contactA(low).contactB(high).build()));

        Graph graph = graphService.buildShared(share.getId(), viewerId);

        String hiddenMappedId = DeterministicIds.hiddenContactId(share.getId(), hidden.getId()).toString();
        assertThat(graph.edges()).anyMatch(e -> e.kind() == EdgeKind.LINK
                && Set.of(e.source(), e.target()).equals(Set.of(visible.getId().toString(), hiddenMappedId)));
    }

    @Test
    void sharersOwnContactsAreTheOnlySourceOfASharedGraphNeverAnotherSharesNodes() {
        GraphShare share = activeShare(UUID.randomUUID(), true, true, true, true);
        givenActiveShare(share);
        Contact ownContact = Contact.builder().id(UUID.randomUUID()).owner(sharer).firstName("Mine").build();
        when(contactRepository.findByOwnerId(sharerId)).thenReturn(List.of(ownContact));

        Graph graph = graphService.buildShared(share.getId(), viewerId);

        // The graph is built solely from contactRepository.findByOwnerId(sharerId) — the sharer's
        // own rows — never anything keyed by some other share or viewer.
        verify(contactRepository, times(1)).findByOwnerId(sharerId);
        verify(contactRepository, never()).findByOwnerId(viewerId);
        assertThat(graph.nodes()).extracting(GraphNode::id)
                .containsExactlyInAnyOrder(sharerId.toString(), ownContact.getId().toString());
    }

    private static GraphNode node(Graph graph, String id) {
        return graph.nodes().stream().filter(n -> n.id().equals(id)).findFirst()
                .orElseThrow(() -> new AssertionError("No node with id " + id + " in " + graph.nodes()));
    }

    /** The one hidden-user node id in a graph whose only other node is the sharer root. */
    private String onlyNonRootId(Graph graph) {
        return graph.nodes().stream().map(GraphNode::id)
                .filter(id -> !id.equals(sharerId.toString()))
                .findFirst().orElseThrow();
    }
}
