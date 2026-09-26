import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { ForceGraphMethods } from 'react-force-graph-2d';
import { fetchGraph, fetchShareGraph, type Graph, type GraphNode } from '../services/graphService';
import {
  createContact,
  deleteContact,
  linkContacts,
  unlinkContacts,
  updateContact,
  type CreateContactPayload,
  type UpdateContactPayload,
} from '../services/contactService';
import { fetchAllTags, type TagsUpdate } from '../services/tagService';
import { putContactNote } from '../services/contactService';
import type { TagCriteria } from '../services/userService';
import { buildTagIndex } from '../utils/tagTree';
import { getSafeErrorMessage } from '../services/apiClient';
import { applyShareModePreview, graphToForceGraphData, contactFullName } from './mapping';
import { EMPTY_TAG_CRITERIA, findPathBFS, searchGraphNodes, type GraphSearchMode } from './graphSearch';
import type { GNode, GLink } from './rendering';
import {
  cancelShareRequest,
  deleteShare,
  fetchSelfProfile,
  fetchShareRequests,
  fetchShares,
  respondToShareRequest,
  sendShareRequest,
  setShareHiddenContacts,
  updatePrivacy,
  updateSelfProfile,
  updateShare,
  type RespondToShareRequestPayload,
  type SelfProfile,
  type SendShareRequestPayload,
  type Share,
  type ShareRequestsResponse,
  type SharesResponse,
  type UpdateSelfProfilePayload,
  type UpdateSharePayload,
} from '../services/shareService';

export type { GraphSearchMode as SearchMode };

const GLOBAL_ZOOM_PADDING = 40;
const LOCATE_ME_ZOOM = 4;

const EMPTY_GRAPH: Graph = { nodes: [], edges: [] };
const EMPTY_SHARE_REQUESTS: ShareRequestsResponse = { incoming: [], outgoing: [] };
const EMPTY_SHARES: SharesResponse = { sharedByMe: [], sharedWithMe: [] };

// Draft state while editing a share's visibility (PLAN.md §5 F5). `hidden` is the sharer's own
// working set (persisted via `PUT hidden-contacts` on Save); `locked` mirrors the share's
// `lockedContactIds` — always hidden, never toggleable, just carried along so the canvas can
// render them the same way as a hidden node.
export interface ShareModeState {
  shareId: string;
  viewerName: string;
  hidden: Set<string>;
  locked: Set<string>;
  flags: UpdateSharePayload;
}

/**
 * Every piece of state, derived data, and handler the graph UI needs — deliberately holds no
 * opinion on layout or presentation, so the desktop (GraphContainer) and mobile (MobileGraphView)
 * renderers can both wrap it in whatever chrome fits their screen without the underlying
 * behavior (physics, search, path-stays-open selection) ever drifting apart between the two.
 *
 * Rewired for the private-network overhaul (PLAN.md §5 F2): fetches the owner's `Graph` (self +
 * contacts + edges) instead of the old global directory, and does search/find-path entirely
 * client-side over the loaded graph — there is no server directory to query any more.
 */
export const useGraphController = (fgRef: RefObject<ForceGraphMethods<GNode, GLink> | undefined>) => {
  const [graph, setGraph] = useState<Graph>(EMPTY_GRAPH);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [highlightNodes, setHighlightNodes] = useState<Set<string>>(new Set());
  const [highlightLinks, setHighlightLinks] = useState<Set<string>>(new Set());
  // The currently-open find-path result, as an ordered list of hop ids. Kept separate from
  // highlightNodes/highlightLinks (which it also drives) purely so selecting a node can tell
  // "is this node part of an open path" and decide whether to keep it open — regardless of
  // whether the tap/click came from the graph itself, a breadcrumb, or a card's link.
  const [activePath, setActivePath] = useState<string[] | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [searchMode, setSearchMode] = useState<GraphSearchMode>('names');
  const [tagCriteria, setTagCriteria] = useState<TagCriteria>(EMPTY_TAG_CRITERIA);
  const [tagDictionary, setTagDictionary] = useState<Awaited<ReturnType<typeof fetchAllTags>>>([]);
  const tagIndex = useMemo(() => buildTagIndex(tagDictionary), [tagDictionary]);

  const nodesById = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph]);
  const selectedNode = selectedId ? (nodesById.get(selectedId) ?? null) : null;
  const selfNode = useMemo(() => graph.nodes.find((n) => n.kind === 'SELF') ?? null, [graph]);

  // Rebuilt only when the graph is (re)fetched or edited. The layout depends on nothing but who
  // exists and who's connected, so editing a contact's about/tags never hands ForceGraph2D a new
  // graphData to re-lay-out.
  const forceGraphData = useMemo(() => graphToForceGraphData(graph), [graph]);

  const searchMatches = useMemo(() => {
    if (searchMode === 'tags') {
      return searchGraphNodes(graph, 'tags', '', tagCriteria, tagIndex).slice(0, 20);
    }
    return searchGraphNodes(graph, searchMode, searchTerm, undefined, tagIndex).slice(0, 8);
  }, [graph, searchMode, searchTerm, tagCriteria, tagIndex]);

  const tagMatchIds = useMemo(() => {
    if (searchMode !== 'tags') return null;
    if (tagCriteria.tagIds.length === 0 && tagCriteria.labels.length === 0) return null;
    return new Set(searchMatches.map((n) => n.id));
  }, [searchMode, searchMatches, tagCriteria]);

  // Your own editable contacts (never SELF, never someone else's shared/hidden node) — the pool
  // offered by "Link to…" (F3).
  const ownContacts = useMemo(
    () => graph.nodes.filter((n) => n.editable && n.kind !== 'SELF'),
    [graph]
  );

  const linkedIdsFor = useCallback(
    (nodeId: string) => {
      const ids = new Set<string>();
      graph.edges.forEach((e) => {
        if (e.kind !== 'LINK') return;
        if (e.source === nodeId) ids.add(e.target);
        else if (e.target === nodeId) ids.add(e.source);
      });
      return ids;
    },
    [graph]
  );

  const pathBreadcrumb = useMemo(() => {
    if (!activePath) return [];
    return activePath.map((id) => nodesById.get(id)).filter((n): n is GraphNode => Boolean(n));
  }, [activePath, nodesById]);

  // For each hop, the true forward node in path-traversal order, keyed by the unordered pair —
  // lets the renderer draw a correctly-directed arrow regardless of which end the underlying
  // link data happens to call "source" (see drawPathArrow in rendering.ts).
  const pathLinkTarget = useMemo(() => {
    const map = new Map<string, string>();
    if (!activePath) return map;
    for (let i = 0; i < activePath.length - 1; i++) {
      const a = activePath[i];
      const b = activePath[i + 1];
      map.set([a, b].sort().join('-'), b);
    }
    return map;
  }, [activePath]);

  // F4/F7 state: share requests (mailbox), shares (F5/F6), and the self profile (F7 settings).
  // Loaded alongside the graph so the mailbox badge count and settings are ready without a
  // separate round trip the moment their panels open.
  const [shareRequests, setShareRequests] = useState<ShareRequestsResponse>(EMPTY_SHARE_REQUESTS);
  const [shares, setShares] = useState<SharesResponse>(EMPTY_SHARES);
  const [selfProfile, setSelfProfile] = useState<SelfProfile | null>(null);

  const pendingIncomingCount = useMemo(
    () => shareRequests.incoming.filter((r) => r.status === 'PENDING').length,
    [shareRequests]
  );

  // Everything the graph shows arrives in this one load: your graph (self, contacts, edges, any
  // SHARED overlays), the tag dictionary, share requests, shares and your own profile. There's no
  // background refresh — only this initial load, your own actions, and the manual
  // "Refresh Graph Now" re-run it.
  const loadData = useCallback(async () => {
    try {
      const [graphData, tags, requests, sharesData, profile] = await Promise.all([
        fetchGraph(),
        fetchAllTags(),
        fetchShareRequests(),
        fetchShares(),
        fetchSelfProfile(),
      ]);
      setGraph(graphData);
      setTagDictionary(tags);
      setShareRequests(requests);
      setShares(sharesData);
      setSelfProfile(profile);
      setInitError(null);
    } catch {
      setInitError('Could not load your graph. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshShareRequests = useCallback(async () => {
    setShareRequests(await fetchShareRequests());
  }, []);

  const refreshShares = useCallback(async () => {
    setShares(await fetchShares());
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, [loadData]);

  // Selecting a node: if a path is currently open and this node is one of its hops, leave the
  // path (and its highlight) exactly as-is. Otherwise, close any open path and highlight just
  // this node's direct neighbors instead.
  const selectNode = useCallback(
    (nodeId: string) => {
      if (!nodesById.has(nodeId)) return;
      setSelectedId(nodeId);
      setActionError(null);

      if (activePath && activePath.includes(nodeId)) {
        return;
      }

      setActivePath(null);
      const neighbors = new Set<string>([nodeId]);
      const links = new Set<string>();
      graph.edges.forEach((edge) => {
        if (edge.source === nodeId || edge.target === nodeId) {
          links.add(`${edge.source}-${edge.target}`);
          neighbors.add(edge.source);
          neighbors.add(edge.target);
        }
      });
      setHighlightNodes(neighbors);
      setHighlightLinks(links);
    },
    [nodesById, activePath, graph]
  );

  // Deselecting (closing the card, tapping/clicking empty background) should never discard an
  // open path — only clear the neighbor-highlight when there isn't one, otherwise every node is
  // left dimmed with nothing marked as "the path" anymore.
  const clearSelection = useCallback(() => {
    setSelectedId(null);
    if (activePath) return;
    setHighlightNodes(new Set());
    setHighlightLinks(new Set());
  }, [activePath]);

  const handleClearPath = useCallback(() => {
    setActivePath(null);
    setHighlightNodes(new Set());
    setHighlightLinks(new Set());
  }, []);

  // Client-side BFS over the loaded graph (PLAN.md §3: no more server /path/{targetId}).
  const handleFindPath = useCallback(
    (targetId: string) => {
      setActionError(null);
      const ids = findPathBFS(graph, selfNode?.id ?? '', targetId);
      if (ids.length === 0) {
        setActionError('Could not find a path to this person.');
        return;
      }
      setActivePath(ids);
      const nodes = new Set(ids);
      const links = new Set<string>();
      for (let i = 0; i < ids.length - 1; i++) {
        links.add(`${ids[i]}-${ids[i + 1]}`);
        links.add(`${ids[i + 1]}-${ids[i]}`);
      }
      setHighlightNodes(nodes);
      setHighlightLinks(links);
      fgRef.current?.zoomToFit(600, 60, (n) => nodes.has(String(n.id)));
    },
    [graph, selfNode, fgRef]
  );

  // Selects a node (wherever its name appears — search, breadcrumb, a card's link) and pans to it
  // on the graph, keeping the current zoom level rather than jumping to whatever scale would fit
  // its connections.
  const focusUser = useCallback(
    (id: string, durationMs = 500) => {
      selectNode(id);
      const gnode = forceGraphData.nodes.find((n) => n.id === id) as GNode | undefined;
      if (gnode && gnode.x != null && gnode.y != null) {
        fgRef.current?.centerAt(gnode.x, gnode.y, durationMs);
      }
    },
    [selectNode, forceGraphData, fgRef]
  );

  const handleSelectSearchResult = useCallback(
    (id: string) => {
      focusUser(id);
      setSearchTerm('');
      setShowSuggestions(false);
    },
    [focusUser]
  );

  const handleLocateMe = useCallback(
    (durationMs = 800) => {
      if (!selfNode) return;
      const gnode = forceGraphData.nodes.find((n) => n.id === selfNode.id) as GNode | undefined;
      if (!gnode || gnode.x == null || gnode.y == null) return;
      fgRef.current?.centerAt(gnode.x, gnode.y, durationMs);
      fgRef.current?.zoom(LOCATE_ME_ZOOM, durationMs);
    },
    [forceGraphData, selfNode, fgRef]
  );

  const handleGlobalZoom = useCallback(() => {
    fgRef.current?.zoomToFit(800, GLOBAL_ZOOM_PADDING);
  }, [fgRef]);

  const handleZoomStep = useCallback(
    (factor: number) => {
      const current = fgRef.current?.zoom() ?? 1;
      fgRef.current?.zoom(current * factor, 400);
    },
    [fgRef]
  );

  // --- Contact CRUD / linking (F3) ---
  const [pendingActionIds, setPendingActionIds] = useState<Set<string>>(new Set());
  const pendingActionIdsRef = useRef<Set<string>>(new Set());

  const isActionPending = useCallback((id: string) => pendingActionIds.has(id), [pendingActionIds]);

  const withPending = useCallback(async (key: string, action: () => Promise<void>, fallback: string) => {
    if (pendingActionIdsRef.current.has(key)) return;
    pendingActionIdsRef.current.add(key);
    setPendingActionIds(new Set(pendingActionIdsRef.current));
    setActionError(null);
    try {
      await action();
    } catch (err) {
      setActionError(getSafeErrorMessage(err, fallback));
    } finally {
      pendingActionIdsRef.current.delete(key);
      setPendingActionIds(new Set(pendingActionIdsRef.current));
    }
  }, []);

  const handleCreateContact = useCallback(
    (payload: CreateContactPayload) =>
      withPending(
        'create-contact',
        async () => {
          const created = await createContact(payload);
          setGraph((prev) => {
            const self = prev.nodes.find((n) => n.kind === 'SELF');
            return {
              nodes: [...prev.nodes, created],
              edges: self ? [...prev.edges, { source: self.id, target: created.id, kind: 'DIRECT', shareId: null }] : prev.edges,
            };
          });
        },
        'Could not add this person.'
      ),
    [withPending]
  );

  const handleUpdateContact = useCallback(
    (id: string, payload: UpdateContactPayload) =>
      withPending(
        id,
        async () => {
          const updated = await updateContact(id, payload);
          setGraph((prev) => ({ ...prev, nodes: prev.nodes.map((n) => (n.id === id ? updated : n)) }));
        },
        'Could not save changes.'
      ),
    [withPending]
  );

  const handleDeleteContact = useCallback(
    (id: string) =>
      withPending(
        id,
        async () => {
          await deleteContact(id);
          setGraph((prev) => ({
            nodes: prev.nodes.filter((n) => n.id !== id),
            edges: prev.edges.filter((e) => e.source !== id && e.target !== id),
          }));
          setSelectedId((prev) => (prev === id ? null : prev));
        },
        'Could not delete this contact.'
      ),
    [withPending]
  );

  const handleLinkContacts = useCallback(
    (a: string, b: string) =>
      withPending(
        `link-${[a, b].sort().join('-')}`,
        async () => {
          await linkContacts(a, b);
          setGraph((prev) => ({ ...prev, edges: [...prev.edges, { source: a, target: b, kind: 'LINK', shareId: null }] }));
        },
        'Could not link these contacts.'
      ),
    [withPending]
  );

  const handleUnlinkContacts = useCallback(
    (a: string, b: string) =>
      withPending(
        `link-${[a, b].sort().join('-')}`,
        async () => {
          await unlinkContacts(a, b);
          setGraph((prev) => ({
            ...prev,
            edges: prev.edges.filter(
              (e) => !(e.kind === 'LINK' && ((e.source === a && e.target === b) || (e.source === b && e.target === a)))
            ),
          }));
        },
        'Could not remove this link.'
      ),
    [withPending]
  );

  // Only `graph.nodes` (and the open card's copy, via nodesById) change — the layout itself is
  // untouched by tag/note edits.
  const updateContactTags = useCallback((id: string, update: TagsUpdate) => {
    setGraph((prev) => ({ ...prev, nodes: prev.nodes.map((n) => (n.id === id ? { ...n, tags: update(n.tags) } : n)) }));
  }, []);

  const updateContactNote = useCallback((id: string, note: string) => {
    setGraph((prev) => ({ ...prev, nodes: prev.nodes.map((n) => (n.id === id ? { ...n, note } : n)) }));
  }, []);

  const saveContactNote = useCallback(async (id: string, content: string) => {
    await putContactNote(id, content);
  }, []);

  // --- SELF profile editing (F0/self-tags follow-up) ---
  const handleUpdateSelfProfile = useCallback(
    (payload: UpdateSelfProfilePayload) =>
      withPending('self-profile', async () => {
        const updated = await updateSelfProfile(payload);
        setGraph((prev) => ({
          ...prev,
          nodes: prev.nodes.map((n) =>
            n.kind === 'SELF' ? { ...n, firstName: updated.firstName, lastName: updated.lastName, about: updated.bio } : n
          ),
        }));
        setSelfProfile(updated);
      }, 'Could not save your profile.'),
    [withPending]
  );

  // --- F4 share requests ---
  const handleSendShareRequest = useCallback(
    (payload: SendShareRequestPayload) =>
      withPending('send-share-request', async () => {
        await sendShareRequest(payload);
        await refreshShareRequests();
      }, 'Could not send this request.'),
    [withPending, refreshShareRequests]
  );

  const handleRespondToShareRequest = useCallback(
    (id: string, payload: RespondToShareRequestPayload) =>
      withPending(`respond-${id}`, async () => {
        await respondToShareRequest(id, payload);
        await refreshShareRequests();
        // A Connect accept can add a new registered contact/edge on your side; an Allow-view
        // accept can add a SHARED overlay — either way, only the server knows exactly what
        // changed, so just refetch (per the brief: "Refetch the graph after an accept").
        if (payload.connect || payload.allowView) {
          await loadData();
        }
      }, 'Could not respond to this request.'),
    [withPending, refreshShareRequests, loadData]
  );

  const handleCancelShareRequest = useCallback(
    (id: string) =>
      withPending(`cancel-request-${id}`, async () => {
        await cancelShareRequest(id);
        await refreshShareRequests();
      }, 'Could not cancel this request.'),
    [withPending, refreshShareRequests]
  );

  // --- F7 settings ---
  const handleUpdatePrivacy = useCallback(
    (value: boolean) =>
      withPending('update-privacy', async () => {
        await updatePrivacy(value);
        setSelfProfile((prev) => (prev ? { ...prev, discoverableInSharedGraphs: value } : prev));
      }, 'Could not update this setting.'),
    [withPending]
  );

  // --- F5 interactive share mode ---
  const [shareMode, setShareMode] = useState<ShareModeState | null>(null);

  const enterShareMode = useCallback((share: Share) => {
    setShareMode({
      shareId: share.id,
      viewerName: share.viewerName,
      hidden: new Set(share.hiddenContactIds ?? []),
      locked: new Set(share.lockedContactIds),
      flags: {
        shareAbout: share.shareAbout,
        shareTags: share.shareTags,
        shareNotes: share.shareNotes,
        sharePhone: share.sharePhone,
      },
    });
  }, []);

  const cancelShareMode = useCallback(() => setShareMode(null), []);

  // Tapping a node while in share mode toggles it shared <-> hidden — only for your own
  // contacts; SELF and locked (opted-out) REGISTERED contacts are not toggleable.
  const toggleShareModeContact = useCallback(
    (contactId: string) => {
      if (!shareMode) return;
      if (shareMode.locked.has(contactId)) return;
      const target = nodesById.get(contactId);
      if (!target || target.kind === 'SELF' || !target.editable) return;
      setShareMode((prev) => {
        if (!prev) return prev;
        const nextHidden = new Set(prev.hidden);
        if (nextHidden.has(contactId)) nextHidden.delete(contactId);
        else nextHidden.add(contactId);
        return { ...prev, hidden: nextHidden };
      });
    },
    [shareMode, nodesById]
  );

  const setShareModeFlag = useCallback((key: keyof UpdateSharePayload, value: boolean) => {
    setShareMode((prev) => (prev ? { ...prev, flags: { ...prev.flags, [key]: value } } : prev));
  }, []);

  const saveShareMode = useCallback(
    () =>
      withPending('save-share-mode', async () => {
        if (!shareMode) return;
        const { shareId, hidden, flags } = shareMode;
        await Promise.all([
          setShareHiddenContacts(shareId, [...hidden]),
          updateShare(shareId, flags),
        ]);
        await refreshShares();
        setShareMode(null);
      }, 'Could not save sharing changes.'),
    [withPending, shareMode, refreshShares]
  );

  const revokeShare = useCallback(
    (shareId: string) =>
      withPending(`revoke-share-${shareId}`, async () => {
        await deleteShare(shareId);
        await refreshShares();
        setShareMode((prev) => (prev && prev.shareId === shareId ? null : prev));
      }, 'Could not revoke this share.'),
    [withPending, refreshShares]
  );

  // The ids the canvas should *draw* as "Hidden User" while share mode is active (hidden/locked
  // contacts) — rendering-only, never a different `graphData` object: `forceGraphData` itself is
  // always what's handed to ForceGraph2D, in share mode or not, so toggling a node never hands
  // the graph a structurally new object and never re-triggers STATIC_LAYOUT (see mapping.ts).
  const shareModePreviewIds = useMemo(() => {
    if (!shareMode) return null;
    return applyShareModePreview(forceGraphData, shareMode.hidden, shareMode.locked);
  }, [forceGraphData, shareMode]);

  // --- F6 "Other's graphs" (read-only) ---
  const [viewingShare, setViewingShare] = useState<Share | null>(null);
  const [viewingGraph, setViewingGraph] = useState<Graph | null>(null);
  const [viewingGraphLoading, setViewingGraphLoading] = useState(false);
  const [viewingGraphError, setViewingGraphError] = useState<string | null>(null);

  const viewingForceGraphData = useMemo(
    () => (viewingGraph ? graphToForceGraphData(viewingGraph) : null),
    [viewingGraph]
  );

  const openOtherGraph = useCallback(async (share: Share) => {
    setViewingShare(share);
    setViewingGraph(null);
    setViewingGraphError(null);
    setViewingGraphLoading(true);
    try {
      const g = await fetchShareGraph(share.id);
      setViewingGraph(g);
    } catch (err) {
      setViewingGraphError(getSafeErrorMessage(err, "Could not load this person's graph."));
    } finally {
      setViewingGraphLoading(false);
    }
  }, []);

  const closeOtherGraph = useCallback(() => {
    setViewingShare(null);
    setViewingGraph(null);
    setViewingGraphError(null);
  }, []);

  const removeOtherGraph = useCallback(
    (shareId: string) =>
      withPending(`remove-share-${shareId}`, async () => {
        await deleteShare(shareId);
        await refreshShares();
        setViewingShare((prev) => (prev && prev.id === shareId ? null : prev));
        if (viewingShare?.id === shareId) {
          setViewingGraph(null);
        }
      }, 'Could not remove this share.'),
    [withPending, refreshShares, viewingShare]
  );

  // Escape (or a mobile "back"/close affordance calling the same setter) closes whatever's
  // currently "open," most-transient first: the search dropdown, then the selected card, then an
  // open find-path result.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (showSuggestions) {
        setShowSuggestions(false);
        return;
      }
      if (selectedId) {
        clearSelection();
        return;
      }
      if (activePath) {
        handleClearPath();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showSuggestions, selectedId, activePath, clearSelection, handleClearPath]);

  return {
    // data
    graph,
    forceGraphData,
    nodesById,
    selfNode,
    ownContacts,
    linkedIdsFor,
    pathBreadcrumb,
    pathLinkTarget,
    searchMatches,
    // selection/path state
    selectedNode,
    highlightNodes,
    highlightLinks,
    activePath,
    // ui state
    searchTerm,
    setSearchTerm,
    showSuggestions,
    setShowSuggestions,
    searchMode,
    setSearchMode,
    tagCriteria,
    setTagCriteria,
    tagMatchIds,
    isLoading,
    initError,
    actionError,
    setActionError,
    // actions
    loadData,
    selectNode,
    clearSelection,
    handleClearPath,
    handleFindPath,
    focusUser,
    handleSelectSearchResult,
    handleLocateMe,
    handleGlobalZoom,
    handleZoomStep,
    handleCreateContact,
    handleUpdateContact,
    handleDeleteContact,
    handleLinkContacts,
    handleUnlinkContacts,
    updateContactTags,
    updateContactNote,
    saveContactNote,
    pendingActionIds,
    isActionPending,
    // SELF profile editing
    handleUpdateSelfProfile,
    // F4 share requests
    shareRequests,
    pendingIncomingCount,
    refreshShareRequests,
    handleSendShareRequest,
    handleRespondToShareRequest,
    handleCancelShareRequest,
    // F7 settings
    selfProfile,
    handleUpdatePrivacy,
    // F5/F6 shares
    shares,
    refreshShares,
    // F5 interactive share mode
    shareMode,
    shareModePreviewIds,
    enterShareMode,
    cancelShareMode,
    toggleShareModeContact,
    setShareModeFlag,
    saveShareMode,
    revokeShare,
    // F6 "Other's graphs"
    viewingShare,
    viewingGraph,
    viewingForceGraphData,
    viewingGraphLoading,
    viewingGraphError,
    openOtherGraph,
    closeOtherGraph,
    removeOtherGraph,
  };
};

export type GraphController = ReturnType<typeof useGraphController>;

// Re-exported for views that only need a display name off a GraphNode.
export { contactFullName };
