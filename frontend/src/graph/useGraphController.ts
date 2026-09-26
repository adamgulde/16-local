import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { ForceGraphMethods } from 'react-force-graph-2d';
import { fetchUsers, transformToGraphData, fullName, fetchReach, disconnectUser, updateAutoRejectSetting, type GraphData, type SearchMode, type TagCriteria } from '../services/userService';
import { EMPTY_TAG_CRITERIA, useUserSearch } from '../hooks/useUserSearch';
import type { User, ReachResponse } from '../services/userService';
import { fetchAllTags, type TagsUpdate } from '../services/tagService';
import { sendRequest, fetchMyRequests, acceptRequest, declineRequest, findPath } from '../services/requestService';
import { getSafeErrorMessage } from '../services/apiClient';
import type { ConnectionRequest } from '../services/types';
import { computeDistanceFromMe } from './rendering';
import type { DisplayLink, GNode, GLink } from './rendering';

const GLOBAL_ZOOM_PADDING = 40;
const LOCATE_ME_ZOOM = 4;

interface Topology {
  graph: GraphData;
  distanceFromMe: Map<string, number>;
}
const EMPTY_TOPOLOGY: Topology = { graph: { nodes: [], links: [] }, distanceFromMe: new Map() };

/**
 * Every piece of state, derived data, and handler the graph UI needs — deliberately holds no
 * opinion on layout or presentation, so the desktop (GraphContainer) and mobile (MobileGraphView)
 * renderers can both wrap it in whatever chrome fits their screen without the underlying
 * behavior (physics, search, path-stays-open selection) ever drifting apart
 * between the two.
 */
export const useGraphController = (
  currentUser: User,
  fgRef: RefObject<ForceGraphMethods<GNode, GLink> | undefined>
) => {
  const [users, setUsers] = useState<User[]>([]);
  const [requests, setRequests] = useState<ConnectionRequest[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  const [highlightNodes, setHighlightNodes] = useState<Set<string>>(new Set());
  const [highlightLinks, setHighlightLinks] = useState<Set<string>>(new Set());
  // The currently-open find-path result, as an ordered list of hop ids. Kept separate from
  // highlightNodes/highlightLinks (which it also drives) purely so selecting a node can tell
  // "is this node part of an open path" and decide whether to keep it open — regardless of
  // whether the tap/click came from the graph itself, a breadcrumb, or a UserCard link.
  const [activePath, setActivePath] = useState<string[] | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showPendingConnections, setShowPendingConnections] = useState(false);
  const [requestsTab, setRequestsTab] = useState<'received' | 'sent' | 'newUsers'>('received');

  const [maxDistance, setMaxDistance] = useState<number>(Infinity);
  const [searchMode, setSearchMode] = useState<SearchMode>('names');
  const [tagCriteria, setTagCriteria] = useState<TagCriteria>(EMPTY_TAG_CRITERIA);
  const [autoRejectDegree, setAutoRejectDegree] = useState<number | null>(currentUser.maxConnectionDegree ?? null);
  // Rebuilt only when the directory is fetched. The layout depends on nothing but who exists and
  // who's connected, so editing a bio or tags never hands ForceGraph2D a new graphData to re-lay-out.
  const [topology, setTopology] = useState<Topology>(EMPTY_TOPOLOGY);
  const { graph: baseGraphData, distanceFromMe } = topology;

  // Confirmed connections come straight off each user's relationships. Pending ones are only
  // ever the current user's own (fetchMyRequests is self-scoped by construction), which is
  // also exactly the privacy rule we want: nobody else's in-progress requests show on the graph.
  // Kept apart from the pending-link overlay below so that with the (default-off) toggle
  // disabled, a `requests` change never produces a new graphData object.
  const graphData = useMemo(() => {
    if (!showPendingConnections) return baseGraphData;
    const seen = new Set(baseGraphData.links.map((l) => [l.source, l.target].sort().join('-')));
    const pendingLinks: DisplayLink[] = [];
    requests.forEach((req) => {
      if (req.status !== 'PENDING') return;
      const key = [req.sender.id, req.receiver.id].sort().join('-');
      if (seen.has(key)) return;
      seen.add(key);
      pendingLinks.push({ source: req.sender.id, target: req.receiver.id, pending: true });
    });
    return { nodes: baseGraphData.nodes, links: [...baseGraphData.links, ...pendingLinks] };
  }, [baseGraphData, requests, showPendingConnections]);

  // One search mode at a time. Text modes feed the suggestion dropdown; Tags mode also dims
  // every node that doesn't match, so the graph itself becomes the result list.
  const userSearch = useUserSearch(searchMode, searchTerm, tagCriteria);
  const searchMatches = useMemo(() => {
    if (searchMode === 'tags') return userSearch.results;
    if (userSearch.error && searchMode === 'names') {
      const lower = searchTerm.trim().toLowerCase();
      return users.filter((u) => fullName(u).toLowerCase().includes(lower)).slice(0, 8);
    }
    return userSearch.results.slice(0, 8);
  }, [searchMode, searchTerm, userSearch.results, userSearch.error, users]);
  const tagMatchIds = useMemo(
    () => (searchMode === 'tags' && userSearch.active ? new Set(userSearch.results.map((u) => u.id)) : null),
    [searchMode, userSearch.active, userSearch.results]
  );

  // Only PENDING requests are actionable/notification-worthy — once accepted or declined
  // (by either party), the outcome is already reflected elsewhere (the graph connection, or
  // simply nothing), so it drops out of the notification list rather than lingering as a
  // "Name — ACCEPTED" line with no more actions to take on it.
  const sentRequests = useMemo(
    () => requests.filter((req) => req.sender.id === currentUser.id && req.status === 'PENDING'),
    [requests, currentUser.id]
  );
  const receivedRequests = useMemo(
    () => requests.filter((req) => req.receiver.id === currentUser.id && req.status === 'PENDING'),
    [requests, currentUser.id]
  );

  // New users sorted by creation timestamp descending (newest first)
  const newUsers = useMemo(() => {
    return [...users]
      .filter((u) => u.id !== currentUser.id)
      .sort((a, b) => {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return timeB - timeA;
      });
  }, [users, currentUser.id]);

  const connectedUserIds = useMemo(() => {
    const me = users.find((u) => u.id === currentUser.id);
    return new Set(me?.relationships ?? currentUser.relationships ?? []);
  }, [users, currentUser.id, currentUser.relationships]);

  const sentRequestUserIds = useMemo(() => {
    return new Set(sentRequests.map((r) => r.receiver.id));
  }, [sentRequests]);

  const receivedRequestUserIds = useMemo(() => {
    return new Set(receivedRequests.map((r) => r.sender.id));
  }, [receivedRequests]);

  const receivedRequestMap = useMemo(() => {
    return new Map(receivedRequests.map((r) => [r.sender.id, r.id]));
  }, [receivedRequests]);

  const getRelationshipNames = useCallback(
    (relationshipIds: string[]) =>
      relationshipIds
        .map((id) => users.find((u) => u.id === id))
        .filter((u): u is User => Boolean(u))
        .map(fullName),
    [users]
  );

  const pathBreadcrumb = useMemo(() => {
    if (!activePath) return [];
    return activePath.map((id) => users.find((u) => u.id === id)).filter((u): u is User => Boolean(u));
  }, [activePath, users]);

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

  // Everything the graph shows arrives in this one load: people (with their tags), your requests,
  // and the tag dictionary. There's no background refresh — only this initial load, your own
  // actions, and the manual "Refresh Graph Now" re-run it.
  const loadData = useCallback(async () => {
    try {
      const [usersData, requestsData] = await Promise.all([fetchUsers(), fetchMyRequests(), fetchAllTags()]);
      setUsers(usersData);
      setTopology({
        graph: transformToGraphData(usersData),
        distanceFromMe: computeDistanceFromMe(usersData, currentUser.id),
      });
      setRequests(requestsData);
      setInitError(null);
    } catch {
      setInitError('Could not load the directory. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [currentUser.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, [loadData]);

  // Selecting a node: if a path is currently open and this node is one of its hops, leave the
  // path (and its highlight) exactly as-is. Otherwise, close any open path and highlight just
  // this node's direct neighbors instead.
  const selectNode = useCallback(
    (nodeId: string) => {
      const user = users.find((u) => u.id === nodeId);
      if (!user) return;
      setSelectedUser(user);
      setActionError(null);

      if (activePath && activePath.includes(nodeId)) {
        return;
      }

      setActivePath(null);
      const neighbors = new Set<string>([nodeId]);
      const links = new Set<string>();
      graphData.links.forEach((link) => {
        if (link.source === nodeId || link.target === nodeId) {
          links.add(`${link.source}-${link.target}`);
          neighbors.add(link.source);
          neighbors.add(link.target);
        }
      });
      setHighlightNodes(neighbors);
      setHighlightLinks(links);
    },
    [users, activePath, graphData]
  );

  // Deselecting (closing the UserCard, tapping/clicking empty background) should never discard
  // an open path — only clear the neighbor-highlight when there isn't one, otherwise every node
  // is left dimmed with nothing marked as "the path" anymore.
  const clearSelection = useCallback(() => {
    setSelectedUser(null);
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
    async (targetId: string) => {
      setActionError(null);
      try {
        const ids = await findPath(currentUser.id, targetId);
        if (ids.length === 0) {
          setActionError('Could not find a path to this user.');
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
      } catch {
        setActionError('Could not find a path to this user.');
      }
    },
    [currentUser.id, fgRef]
  );

  // Selects a user (wherever their name appears — notifications, breadcrumb, a UserCard
  // connection link) and pans to them on the graph, keeping the current zoom level rather than
  // jumping to whatever scale would fit their connections.
  const focusUser = useCallback(
    (id: string, durationMs = 500) => {
      selectNode(id);
      const node = graphData.nodes.find((n) => n.id === id) as GNode | undefined;
      if (node && node.x != null && node.y != null) {
        fgRef.current?.centerAt(node.x, node.y, durationMs);
      }
    },
    [selectNode, graphData, fgRef]
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
      const node = graphData.nodes.find((n) => n.id === currentUser.id) as GNode | undefined;
      if (!node || node.x == null || node.y == null) return;
      fgRef.current?.centerAt(node.x, node.y, durationMs);
      fgRef.current?.zoom(LOCATE_ME_ZOOM, durationMs);
    },
    [graphData, currentUser.id, fgRef]
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

  // --- Global/Personal view + reach% ---
  const [viewMode, setViewMode] = useState<'global' | 'personal'>('global');
  const [degree, setDegree] = useState(1);
  const [reach, setReach] = useState<ReachResponse | null>(null);
  const [reachLoading, setReachLoading] = useState(false);
  const [reachError, setReachError] = useState<string | null>(null);
  const reachSeqRef = useRef(0);

  const loadReach = useCallback(async (userId: string, forDegree: number) => {
    const seq = ++reachSeqRef.current;
    setReachLoading(true);
    setReachError(null);
    try {
      const data = await fetchReach(userId, forDegree);
      if (seq !== reachSeqRef.current) return;
      setReach(data);
    } catch {
      if (seq !== reachSeqRef.current) return;
      setReachError('Could not load network reach.');
    } finally {
      if (seq === reachSeqRef.current) setReachLoading(false);
    }
  }, []);

  useEffect(() => {
    if (viewMode !== 'personal') return;
    const timer = window.setTimeout(() => {
      loadReach(currentUser.id, degree);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [viewMode, degree, currentUser.id, loadReach]);

  // --- Request actions ---
  const [pendingActionIds, setPendingActionIds] = useState<Set<string>>(new Set());
  const pendingActionIdsRef = useRef<Set<string>>(new Set());

  const isActionPending = useCallback(
    (id: string) => pendingActionIds.has(id),
    [pendingActionIds]
  );

  const handleSendRequest = useCallback(
    async (receiverId: string) => {
      if (pendingActionIdsRef.current.has(receiverId)) return;
      pendingActionIdsRef.current.add(receiverId);
      setPendingActionIds(new Set(pendingActionIdsRef.current));
      setActionError(null);
      try {
        await sendRequest(receiverId);
        await loadData();
      } catch (err) {
        setActionError(getSafeErrorMessage(err, 'Could not send connection request.'));
      } finally {
        setTimeout(() => {
          pendingActionIdsRef.current.delete(receiverId);
          setPendingActionIds(new Set(pendingActionIdsRef.current));
        }, 300);
      }
    },
    [loadData]
  );

  const handleAcceptRequest = useCallback(
    async (requestId: string) => {
      if (pendingActionIdsRef.current.has(requestId)) return;
      pendingActionIdsRef.current.add(requestId);
      setPendingActionIds(new Set(pendingActionIdsRef.current));
      setActionError(null);
      try {
        await acceptRequest(requestId);
        await loadData();
      } catch {
        setActionError('Could not accept connection request.');
      } finally {
        setTimeout(() => {
          pendingActionIdsRef.current.delete(requestId);
          setPendingActionIds(new Set(pendingActionIdsRef.current));
        }, 300);
      }
    },
    [loadData]
  );

  const handleDeclineRequest = useCallback(
    async (requestId: string) => {
      if (pendingActionIdsRef.current.has(requestId)) return;
      pendingActionIdsRef.current.add(requestId);
      setPendingActionIds(new Set(pendingActionIdsRef.current));
      setActionError(null);
      try {
        await declineRequest(requestId);
        await loadData();
      } catch {
        setActionError('Could not decline connection request.');
      } finally {
        setTimeout(() => {
          pendingActionIdsRef.current.delete(requestId);
          setPendingActionIds(new Set(pendingActionIdsRef.current));
        }, 300);
      }
    },
    [loadData]
  );

  const handleDisconnect = useCallback(
    async (targetUserId: string) => {
      if (pendingActionIdsRef.current.has(targetUserId)) return;
      pendingActionIdsRef.current.add(targetUserId);
      setPendingActionIds(new Set(pendingActionIdsRef.current));
      setActionError(null);
      try {
        await disconnectUser(targetUserId);
        await loadData();
        if (selectedUser?.id === targetUserId) {
          setSelectedUser(null);
          clearSelection();
        }
      } catch {
        setActionError('Could not disconnect user.');
      } finally {
        setTimeout(() => {
          pendingActionIdsRef.current.delete(targetUserId);
          setPendingActionIds(new Set(pendingActionIdsRef.current));
        }, 300);
      }
    },
    [loadData, selectedUser, clearSelection]
  );

  const updatingAutoRejectRef = useRef(false);
  const [isUpdatingAutoReject, setIsUpdatingAutoReject] = useState(false);

  const handleUpdateAutoReject = useCallback(
    async (degreeLimit: number | null) => {
      if (updatingAutoRejectRef.current) return;
      updatingAutoRejectRef.current = true;
      setIsUpdatingAutoReject(true);
      setActionError(null);
      try {
        await updateAutoRejectSetting(degreeLimit);
        setAutoRejectDegree(degreeLimit);
      } catch {
        setActionError('Could not update auto-reject setting.');
      } finally {
        setTimeout(() => {
          updatingAutoRejectRef.current = false;
          setIsUpdatingAutoReject(false);
        }, 300);
      }
    },
    []
  );

  const handleBioUpdated = useCallback(
    (userId: string, newBio: string) => {
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, bio: newBio } : u)));
      if (userId === currentUser.id) {
        const stored = localStorage.getItem('authUser');
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            localStorage.setItem('authUser', JSON.stringify({ ...parsed, bio: newBio }));
          } catch {
            // ignore
          }
        }
      }
    },
    [currentUser.id]
  );

  // Only `users` (and the open card's copy) change: the graph itself is untouched by tag edits.
  const updateUserTags = useCallback((userId: string, update: TagsUpdate) => {
    const apply = (u: User): User => (u.id === userId ? { ...u, tags: update(u.tags ?? []) } : u);
    setUsers((prev) => prev.map(apply));
    setSelectedUser((prev) => (prev ? apply(prev) : prev));
  }, []);

  const updateUserNote = useCallback((userId: string, note: string) => {
    const apply = (u: User): User => (u.id === userId ? { ...u, note } : u);
    setUsers((prev) => prev.map(apply));
    setSelectedUser((prev) => (prev ? apply(prev) : prev));
  }, []);

  // Escape (or a mobile "back"/close affordance calling the same setter) closes whatever's
  // currently "open," most-transient first: the search dropdown, then the selected-user card,
  // then an open find-path result.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (showSuggestions) {
        setShowSuggestions(false);
        return;
      }
      if (selectedUser) {
        clearSelection();
        return;
      }
      if (activePath) {
        handleClearPath();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showSuggestions, selectedUser, activePath, clearSelection, handleClearPath]);

  return {
    // data
    users,
    requests,
    graphData,
    distanceFromMe,
    sentRequests,
    receivedRequests,
    pathBreadcrumb,
    pathLinkTarget,
    searchMatches,
    getRelationshipNames,
    // selection/path state
    selectedUser,
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
    searchLoading: userSearch.loading,
    maxDistance,
    setMaxDistance,
    autoRejectDegree,
    isLoading,
    initError,
    actionError,
    setActionError,
    showPendingConnections,
    setShowPendingConnections,
    requestsTab,
    setRequestsTab,
    viewMode,
    setViewMode,
    degree,
    setDegree,
    reach,
    reachLoading,
    reachError,
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
    handleSendRequest,
    handleAcceptRequest,
    handleDeclineRequest,
    handleDisconnect,
    handleUpdateAutoReject,
    handleBioUpdated,
    updateUserTags,
    updateUserNote,
    pendingActionIds,
    isActionPending,
    isUpdatingAutoReject,
    newUsers,
    connectedUserIds,
    sentRequestUserIds,
    receivedRequestUserIds,
    receivedRequestMap,
  };
};

export type GraphController = ReturnType<typeof useGraphController>;
