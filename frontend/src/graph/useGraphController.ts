import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { ForceGraphMethods } from 'react-force-graph-2d';
import { fetchUsers, transformToGraphData, fullName, fetchReach, disconnectUser, updateAutoRejectSetting, searchUsersApi } from '../services/userService';
import type { User, ReachResponse } from '../services/userService';
import { sendRequest, fetchMyRequests, acceptRequest, declineRequest, findPath } from '../services/requestService';
import { extractErrorMessage } from '../services/apiClient';
import type { ConnectionRequest } from '../services/types';
import { computeDistanceFromMe } from './rendering';
import type { DisplayLink, GNode, GLink } from './rendering';

const GLOBAL_ZOOM_PADDING = 40;
const LOCATE_ME_ZOOM = 4;
const POLL_INTERVAL_MS = 5000;

// True only if the two lists are the same requests in the same states — ignores array order,
// which the backend doesn't guarantee is stable across two separate queries.
const requestsEqual = (a: ConnectionRequest[], b: ConnectionRequest[]): boolean => {
  if (a.length !== b.length) return false;
  const key = (r: ConnectionRequest) => `${r.id}:${r.status}`;
  const aKeys = new Set(a.map(key));
  return b.every((r) => aKeys.has(key(r)));
};

// Checks if the user directory or graph topology changed (membership or connections)
const usersEqual = (a: User[], b: User[]): boolean => {
  if (a.length !== b.length) return false;
  const aMap = new Map(a.map((u) => [u.id, u]));
  for (const uB of b) {
    const uA = aMap.get(uB.id);
    if (!uA) return false;
    if (uA.firstName !== uB.firstName || uA.lastName !== uB.lastName) return false;
    if (uA.relationships.length !== uB.relationships.length) return false;
    const aRels = new Set(uA.relationships);
    if (!uB.relationships.every((r) => aRels.has(r))) return false;
  }
  return true;
};

/**
 * Every piece of state, derived data, and handler the graph UI needs — deliberately holds no
 * opinion on layout or presentation, so the desktop (GraphContainer) and mobile (MobileGraphView)
 * renderers can both wrap it in whatever chrome fits their screen without the underlying
 * behavior (physics, search, path-stays-open selection, live polling) ever drifting apart
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
  const [searchNames, setSearchNames] = useState(true);
  const [searchTags, setSearchTags] = useState(true);
  const [selectedTagFilter, setSelectedTagFilter] = useState<string | null>(null);
  const [autoRejectDegree, setAutoRejectDegree] = useState<number | null>(currentUser.maxConnectionDegree ?? null);
  const [hasGraphUpdate, setHasGraphUpdate] = useState(false);
  const [autoApplyUpdates, setAutoApplyUpdates] = useState(false);
  const pendingUsersRef = useRef<User[] | null>(null);
  const pendingRequestsRef = useRef<ConnectionRequest[] | null>(null);

  const distanceFromMe = useMemo(() => computeDistanceFromMe(users, currentUser.id), [users, currentUser.id]);

  // Confirmed connections come straight off each user's relationships. Pending ones are only
  // ever the current user's own (fetchMyRequests is self-scoped by construction), which is
  // also exactly the privacy rule we want: nobody else's in-progress requests show on the graph.
  // Split from the pending-link overlay below so that with the (default-off) toggle disabled,
  // graphData depends on `users` alone — a `requests` change (e.g. the live poll) never
  // recomputes it, and ForceGraph2D never sees a "new" graphData object to reset/rejiggle over.
  const baseGraphData = useMemo(() => transformToGraphData(users), [users]);

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

  // Search with debounce across names and/or tags based on checkboxes
  const [searchMatches, setSearchMatches] = useState<User[]>([]);
  useEffect(() => {
    const term = searchTerm.trim();
    if (!term || (!searchNames && !searchTags)) {
      setSearchMatches([]);
      return;
    }
    let active = true;
    const timer = setTimeout(() => {
      searchUsersApi(term, searchNames, searchTags)
        .then((results) => {
          if (active) setSearchMatches(results.slice(0, 8));
        })
        .catch(() => {
          if (active && searchNames) {
            const lower = term.toLowerCase();
            setSearchMatches(users.filter((u) => fullName(u).toLowerCase().includes(lower)).slice(0, 8));
          }
        });
    }, 200);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [searchTerm, searchNames, searchTags, users]);

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

  const loadData = useCallback(async () => {
    try {
      const [usersData, requestsData] = await Promise.all([fetchUsers(), fetchMyRequests()]);
      setUsers(usersData);
      setRequests(requestsData);
      setInitError(null);
      setHasGraphUpdate(false);
      pendingUsersRef.current = null;
      pendingRequestsRef.current = null;
    } catch {
      setInitError('Could not load the directory. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleRefreshGraph = useCallback(() => {
    if (pendingUsersRef.current) {
      setUsers(pendingUsersRef.current);
      pendingUsersRef.current = null;
      if (pendingRequestsRef.current) {
        setRequests(pendingRequestsRef.current);
        pendingRequestsRef.current = null;
      }
      setHasGraphUpdate(false);
    } else {
      loadData();
    }
  }, [loadData]);

  const dismissGraphUpdate = useCallback(() => {
    setHasGraphUpdate(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, [loadData]);

  // Refreshes the graph when the user returns to the tab after a long inactive/background state
  useEffect(() => {
    const handleTabActive = () => {
      if (document.visibilityState === 'visible') {
        loadData();
      }
    };
    document.addEventListener('visibilitychange', handleTabActive);
    window.addEventListener('focus', handleTabActive);
    return () => {
      document.removeEventListener('visibilitychange', handleTabActive);
      window.removeEventListener('focus', handleTabActive);
    };
  }, [loadData]);

  // Polls for changes made by other users (a request they sent you, one they accepted, or new
  // users/connections added to the network).
  useEffect(() => {
    const timer = window.setInterval(async () => {
      try {
        const [requestsData, usersData] = await Promise.all([
          fetchMyRequests(),
          fetchUsers(),
        ]);

        // Always update requests so notification bell and incoming requests are immediately accurate
        setRequests((prev) => (requestsEqual(prev, requestsData) ? prev : requestsData));

        // Check if users or graph topology has changed compared to currently rendered users
        setUsers((currentUsers) => {
          if (currentUsers.length === 0) return usersData;
          const changed = !usersEqual(currentUsers, usersData);
          if (changed) {
            if (autoApplyUpdates) {
              setHasGraphUpdate(false);
              return usersData;
            } else {
              pendingUsersRef.current = usersData;
              pendingRequestsRef.current = requestsData;
              setHasGraphUpdate(true);
              return currentUsers;
            }
          }
          return currentUsers;
        });
      } catch {
        // Silent failure in background poll
      }
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [autoApplyUpdates]);

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
    (id: string) => {
      selectNode(id);
      const node = graphData.nodes.find((n) => n.id === id) as GNode | undefined;
      if (node && node.x != null && node.y != null) {
        fgRef.current?.centerAt(node.x, node.y, 500);
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

  const handleLocateMe = useCallback(() => {
    const node = graphData.nodes.find((n) => n.id === currentUser.id) as GNode | undefined;
    if (!node || node.x == null || node.y == null) return;
    fgRef.current?.centerAt(node.x, node.y, 800);
    fgRef.current?.zoom(LOCATE_ME_ZOOM, 800);
  }, [graphData, currentUser.id, fgRef]);

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
        setActionError(extractErrorMessage(err) || 'Could not send connection request.');
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
    searchNames,
    setSearchNames,
    searchTags,
    setSearchTags,
    maxDistance,
    setMaxDistance,
    selectedTagFilter,
    setSelectedTagFilter,
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
    pendingActionIds,
    isActionPending,
    isUpdatingAutoReject,
    hasGraphUpdate,
    autoApplyUpdates,
    setAutoApplyUpdates,
    handleRefreshGraph,
    dismissGraphUpdate,
    newUsers,
    connectedUserIds,
    sentRequestUserIds,
    receivedRequestUserIds,
    receivedRequestMap,
  };
};

export type GraphController = ReturnType<typeof useGraphController>;
