import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { ForceGraphMethods } from 'react-force-graph-2d';
import { fetchGraph, fetchSelfProfile, updateSelf, type Graph, type GraphNode, type SelfProfile } from '../services/graphService';
import {
  createContact,
  deleteContact,
  importContacts,
  linkContacts,
  unlinkContacts,
  updateContact,
  type CreateContactPayload,
  type UpdateContactPayload,
} from '../services/contactService';
import { fetchAllTags, type TagsUpdate } from '../services/tagService';
import { putContactNote } from '../services/contactService';
import { buildTagIndex } from '../utils/tagTree';
import { getSafeErrorMessage } from '../utils/errors';
import { graphToForceGraphData, contactFullName } from './mapping';
import { EMPTY_TAG_CRITERIA, findPathBFS, searchGraphNodes, type GraphSearchMode, type TagCriteria } from './graphSearch';
import type { GNode, GLink } from './rendering';

export type { GraphSearchMode as SearchMode };

const GLOBAL_ZOOM_PADDING = 40;
const LOCATE_ME_ZOOM = 4;
const EMPTY_GRAPH: Graph = { nodes: [], edges: [] };

/**
 * Every piece of state, derived data and handler the graph UI needs. It holds no opinion on layout
 * or presentation, so the desktop and mobile views share one implementation of physics, search,
 * and path selection.
 */
export const useGraphController = (fgRef: RefObject<ForceGraphMethods<GNode, GLink> | undefined>) => {
  const [graph, setGraph] = useState<Graph>(EMPTY_GRAPH);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [highlightNodes, setHighlightNodes] = useState<Set<string>>(new Set());
  const [highlightLinks, setHighlightLinks] = useState<Set<string>>(new Set());
  // The open find-path result as an ordered list of hop ids.
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

  const [selfProfile, setSelfProfile] = useState<SelfProfile | null>(null);

  const nodesById = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph]);
  const selectedNode = selectedId ? (nodesById.get(selectedId) ?? null) : null;
  const selfNode = useMemo(() => graph.nodes.find((n) => n.kind === 'SELF') ?? null, [graph]);

  // Rebuilt only when the graph is (re)fetched or edited. Editing a contact's about/tags never hands
  // ForceGraph2D a new graphData, so the layout doesn't re-run.
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

  // Everyone except you: the pool offered by "Link to…".
  const ownContacts = useMemo(() => graph.nodes.filter((n) => n.kind !== 'SELF'), [graph]);

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

  // For each hop, the forward node in path order, keyed by the unordered pair (see drawPathArrow).
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

  // Everything the graph shows arrives in this one load: the graph, the tag dictionary and your
  // own profile. There's no background refresh; only this load and the Settings refresh re-run it.
  const loadData = useCallback(async () => {
    try {
      const [graphData, tags, profile] = await Promise.all([fetchGraph(), fetchAllTags(), fetchSelfProfile()]);
      setGraph(graphData);
      setTagDictionary(tags);
      setSelfProfile(profile);
      setInitError(null);
    } catch {
      setInitError('Could not load your graph. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, [loadData]);

  // Selecting a node: if a path is open and this node is one of its hops, leave the path as-is.
  // Otherwise close any open path and highlight this node's direct neighbours.
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

  // Deselecting never discards an open path; only the neighbour highlight is cleared, and only when
  // there's no path.
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

  // Selects a node (from search, the breadcrumb, or a card) and pans to it, keeping the zoom level.
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

  // --- Contact CRUD and linking ---
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

  const addContactsToGraph = useCallback((nodes: GraphNode[]) => {
    setGraph((prev) => {
      const self = prev.nodes.find((n) => n.kind === 'SELF');
      return {
        nodes: [...prev.nodes, ...nodes],
        edges: self
          ? [...prev.edges, ...nodes.map((n) => ({ source: self.id, target: n.id, kind: 'DIRECT' as const }))]
          : prev.edges,
      };
    });
  }, []);

  const handleCreateContact = useCallback(
    (payload: CreateContactPayload) =>
      withPending(
        'create-contact',
        async () => {
          addContactsToGraph([await createContact(payload)]);
        },
        'Could not add this person.'
      ),
    [withPending, addContactsToGraph]
  );

  // Bulk import. Not routed through withPending: the import panel shows its own progress and errors.
  // Whatever landed is merged in even if a later chunk fails, since earlier chunks are already saved.
  const handleImportContacts = useCallback(
    async (payloads: CreateContactPayload[], onProgress?: (done: number) => void) => {
      const created: GraphNode[] = [];
      try {
        const result = await importContacts(payloads, onProgress, (chunk) => created.push(...chunk));
        addContactsToGraph(result.created);
        return result;
      } catch (err) {
        if (created.length > 0) addContactsToGraph(created);
        throw err;
      }
    },
    [addContactsToGraph]
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
          setGraph((prev) => ({ ...prev, edges: [...prev.edges, { source: a, target: b, kind: 'LINK' }] }));
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

  // Tag and note edits only change `graph.nodes`; the layout is untouched.
  const updateContactTags = useCallback((id: string, update: TagsUpdate) => {
    setGraph((prev) => ({ ...prev, nodes: prev.nodes.map((n) => (n.id === id ? { ...n, tags: update(n.tags) } : n)) }));
  }, []);

  const updateContactNote = useCallback((id: string, note: string) => {
    setGraph((prev) => ({ ...prev, nodes: prev.nodes.map((n) => (n.id === id ? { ...n, note } : n)) }));
  }, []);

  const saveContactNote = useCallback(async (id: string, content: string) => {
    await putContactNote(id, content);
  }, []);

  // --- Your own profile ---
  const handleUpdateSelfProfile = useCallback(
    (payload: Partial<SelfProfile>) =>
      withPending(
        'self-profile',
        async () => {
          await updateSelf(payload);
          const profile = await fetchSelfProfile();
          setSelfProfile(profile);
          setGraph((prev) => ({
            ...prev,
            nodes: prev.nodes.map((n) =>
              n.kind === 'SELF' ? { ...n, firstName: profile.firstName, lastName: profile.lastName, about: profile.about } : n
            ),
          }));
        },
        'Could not save your profile.'
      ),
    [withPending]
  );

  // Escape closes whatever's open, most transient first: the search dropdown, the selected card,
  // then an open path.
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
    selfProfile,
    ownContacts,
    linkedIdsFor,
    pathBreadcrumb,
    pathLinkTarget,
    searchMatches,
    // selection and path state
    selectedNode,
    highlightNodes,
    highlightLinks,
    activePath,
    // search UI state
    searchTerm,
    setSearchTerm,
    showSuggestions,
    setShowSuggestions,
    searchMode,
    setSearchMode,
    tagCriteria,
    setTagCriteria,
    tagMatchIds,
    // status
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
    handleImportContacts,
    handleUpdateContact,
    handleDeleteContact,
    handleLinkContacts,
    handleUnlinkContacts,
    updateContactTags,
    updateContactNote,
    saveContactNote,
    isActionPending,
    handleUpdateSelfProfile,
  };
};

export type GraphController = ReturnType<typeof useGraphController>;

export { contactFullName };
