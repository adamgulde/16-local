import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { User, FriendSummary } from '../../services/userService';
import { fullName, searchUsersApi, disconnectUser } from '../../services/userService';
import { sendRequest, fetchMyRequests } from '../../services/requestService';
import type { ConnectionRequest } from '../../services/types';
import { MillerColumn } from './MillerColumn';
import { UserCard } from '../UserCard';
import { BottomSheet } from '../BottomSheet';
import {
  SearchIcon,
  ColumnsIcon,
  GridIcon,
  ChevronRightIcon,
  ChevronLeftIcon,
  CloseIcon,
} from '../Icons';

interface MillerColumnsViewProps {
  currentUser: User;
  onSwitchToGraph: (focusUserId?: string, findPathTargetId?: string) => void;
  isMobile?: boolean;
}

interface PathItem {
  user: FriendSummary | User;
  depth: number;
}

export const MillerColumnsView = ({
  currentUser,
  onSwitchToGraph,
  isMobile = false,
}: MillerColumnsViewProps) => {
  // Navigation path: path[0] is selected in Column 0, path[1] selected in Column 1, etc.
  const [path, setPath] = useState<PathItem[]>([]);

  // Inspected user for the rightmost panel / mobile bottom sheet
  const [inspectedUser, setInspectedUser] = useState<User | FriendSummary | null>(null);
  const [showMobileInspector, setShowMobileInspector] = useState(false);
  const [showInspectorPanel, setShowInspectorPanel] = useState(true);

  // Global search inside Miller view
  const [globalSearch, setGlobalSearch] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [showSearchResults, setShowSearchResults] = useState(false);

  // Requests state for pending requests check
  const [requests, setRequests] = useState<ConnectionRequest[]>([]);

  // User name cache for relationship lists
  const [userNameCache, setUserNameCache] = useState<Map<string, string>>(() => {
    const map = new Map<string, string>();
    map.set(currentUser.id, fullName(currentUser));
    return map;
  });

  const scrollTrackRef = useRef<HTMLDivElement>(null);

  // Load connection requests to show pending status
  const loadRequests = useCallback(async () => {
    try {
      const data = await fetchMyRequests();
      setRequests(data);
    } catch {
      // Ignore
    }
  }, []);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  // Search network
  useEffect(() => {
    if (!globalSearch.trim()) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(() => {
      searchUsersApi(globalSearch.trim(), true, true)
        .then((res) => setSearchResults(res))
        .catch(() => {});
    }, 250);
    return () => clearTimeout(timer);
  }, [globalSearch]);

  // Helper to get pending request for a user
  const isRequestPending = useCallback(
    (targetId: string) => {
      return requests.some(
        (r) => r.receiver.id === targetId && r.sender.id === currentUser.id && r.status === 'PENDING'
      );
    },
    [requests, currentUser.id]
  );

  // Cache user names whenever a user is selected or found
  const rememberUserName = useCallback((id: string, name: string) => {
    setUserNameCache((prev) => {
      if (prev.get(id) === name) return prev;
      const next = new Map(prev);
      next.set(id, name);
      return next;
    });
  }, []);

  // Handle selecting a user in column at given depth
  const handleSelectUser = useCallback(
    (user: FriendSummary, depth: number) => {
      rememberUserName(user.id, fullName(user));

      setPath((prev) => {
        // Truncate path up to depth and append selected user
        const newPath = prev.slice(0, depth);
        newPath.push({ user, depth });
        return newPath;
      });

      setInspectedUser(user);
      if (isMobile) {
        // On mobile, tapping drills down into next depth
      } else {
        // Smooth scroll to the right to reveal newly added column
        setTimeout(() => {
          if (scrollTrackRef.current) {
            scrollTrackRef.current.scrollTo({
              left: scrollTrackRef.current.scrollWidth,
              behavior: 'smooth',
            });
          }
        }, 100);
      }
    },
    [rememberUserName, isMobile]
  );

  // Handle explicitly inspecting a user (e.g. mobile info button or search hit)
  const handleInspectUser = useCallback(
    (user: FriendSummary | User) => {
      rememberUserName(user.id, fullName(user));
      setInspectedUser(user);
      if (isMobile) {
        setShowMobileInspector(true);
      } else {
        setShowInspectorPanel(true);
      }
    },
    [rememberUserName, isMobile]
  );

  // Navigate back one level on mobile
  const handleMobileBack = useCallback(() => {
    setPath((prev) => {
      if (prev.length === 0) return prev;
      const next = prev.slice(0, prev.length - 1);
      const last = next[next.length - 1];
      setInspectedUser(last ? last.user : null);
      return next;
    });
  }, []);

  // Jump to specific breadcrumb
  const handleBreadcrumbClick = useCallback((index: number) => {
    if (index === -1) {
      setPath([]);
      setInspectedUser(null);
      return;
    }
    setPath((prev) => {
      const next = prev.slice(0, index + 1);
      const last = next[next.length - 1];
      setInspectedUser(last ? last.user : null);
      return next;
    });
  }, []);

  const [pendingActionIds, setPendingActionIds] = useState<Set<string>>(new Set());
  const pendingActionIdsRef = useRef<Set<string>>(new Set());

  // Handle connection request
  const handleSendRequest = async (targetId: string) => {
    if (pendingActionIdsRef.current.has(targetId)) return;
    pendingActionIdsRef.current.add(targetId);
    setPendingActionIds(new Set(pendingActionIdsRef.current));
    try {
      await sendRequest(targetId);
      await loadRequests();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Failed to send request');
    } finally {
      setTimeout(() => {
        pendingActionIdsRef.current.delete(targetId);
        setPendingActionIds(new Set(pendingActionIdsRef.current));
      }, 300);
    }
  };

  // Handle disconnect
  const handleDisconnect = async (targetId: string) => {
    if (pendingActionIdsRef.current.has(targetId)) return;
    if (!confirm('Are you sure you want to disconnect?')) return;
    pendingActionIdsRef.current.add(targetId);
    setPendingActionIds(new Set(pendingActionIdsRef.current));
    try {
      await disconnectUser(targetId);
      // Reload path
      setPath((prev) => [...prev]);
      if (inspectedUser && inspectedUser.id === targetId) {
        setInspectedUser((prev) => (prev ? { ...prev, relationships: prev.relationships.filter((r) => r !== currentUser.id) } : null));
      }
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Failed to disconnect');
    } finally {
      setTimeout(() => {
        pendingActionIdsRef.current.delete(targetId);
        setPendingActionIds(new Set(pendingActionIdsRef.current));
      }, 300);
    }
  };

  const handleBioUpdated = (newBio: string) => {
    setInspectedUser((prev) => (prev ? { ...prev, bio: newBio } : prev));
    if (inspectedUser?.id === currentUser.id) {
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
  };

  // Active target for current mobile depth
  const currentMobileOwner = useMemo(() => {
    if (path.length === 0) {
      return { id: currentUser.id, name: 'My Connections' };
    }
    const current = path[path.length - 1];
    return {
      id: current.user.id,
      name: `${current.user.firstName}'s Connections`,
    };
  }, [path, currentUser]);

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: '#121214',
        color: '#f0f0f0',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Top Header Bar */}
      <header
        style={{
          height: 56,
          background: 'rgba(28, 28, 30, 0.96)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderBottom: '1px solid #3a3a40',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: isMobile ? '0 10px' : '0 20px',
          zIndex: 30,
          gap: 12,
          flexShrink: 0,
        }}
      >
        {/* Left: Brand / View Mode Switcher Pill */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* View Switcher Pill */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              background: '#2c2c2e',
              borderRadius: '8px',
              padding: '3px',
              border: '1px solid #3a3a40',
            }}
          >
            <button
              type="button"
              onClick={() => onSwitchToGraph()}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '5px 10px',
                borderRadius: '6px',
                border: 'none',
                background: 'transparent',
                color: '#9a9a9a',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
              title="Switch to Interactive Graph View"
            >
              <GridIcon size={14} />
              {!isMobile && 'Graph'}
            </button>
            <button
              type="button"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '5px 10px',
                borderRadius: '6px',
                border: 'none',
                background: '#3d8bff',
                color: '#fff',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'default',
              }}
              title="Columns View (Active)"
            >
              <ColumnsIcon size={14} />
              {!isMobile && 'Columns'}
            </button>
          </div>
        </div>

        {/* Center: Global Search */}
        <div
          style={{
            position: 'relative',
            flex: '0 1 360px',
            minWidth: isMobile ? 120 : 220,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              background: '#242426',
              border: '1px solid #3a3a40',
              borderRadius: '8px',
              padding: '6px 10px',
              gap: '8px',
            }}
          >
            <SearchIcon size={15} color="#9a9a9a" />
            <input
              type="text"
              placeholder="Search people..."
              value={globalSearch}
              onChange={(e) => {
                setGlobalSearch(e.target.value);
                setShowSearchResults(true);
              }}
              onFocus={() => setShowSearchResults(true)}
              style={{
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: '#fff',
                fontSize: '13px',
                width: '100%',
              }}
            />
            {globalSearch && (
              <button
                type="button"
                onClick={() => {
                  setGlobalSearch('');
                  setShowSearchResults(false);
                }}
                style={{ background: 'none', border: 'none', color: '#9a9a9a', cursor: 'pointer', padding: 0 }}
              >
                <CloseIcon size={14} />
              </button>
            )}
          </div>

          {/* Search Dropdown */}
          {showSearchResults && searchResults.length > 0 && (
            <div
              onMouseDown={(e) => e.preventDefault()}
              style={{
                position: 'absolute',
                top: 'calc(100% + 6px)',
                left: 0,
                right: 0,
                background: '#1c1c1e',
                border: '1px solid #3a3a40',
                borderRadius: '8px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                maxHeight: '260px',
                overflowY: 'auto',
                zIndex: 40,
              }}
            >
              {searchResults.map((user) => (
                <div
                  key={user.id}
                  onClick={() => {
                    handleInspectUser(user);
                    setShowSearchResults(false);
                  }}
                  style={{
                    padding: '8px 12px',
                    borderBottom: '1px solid #2c2c2e',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#2c2c2e')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <span style={{ fontSize: '13px', fontWeight: 500 }}>{fullName(user)}</span>
                  <span style={{ fontSize: '11px', color: '#6ab0ff' }}>Inspect →</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: User / Guide */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {!isMobile && (
            <button
              type="button"
              onClick={() => setShowInspectorPanel((prev) => !prev)}
              style={{
                padding: '6px 10px',
                background: showInspectorPanel ? '#2c2c2e' : 'transparent',
                border: '1px solid #3a3a40',
                borderRadius: '6px',
                color: '#d0d0d0',
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              {showInspectorPanel ? 'Hide Inspector' : 'Show Inspector'}
            </button>
          )}

          <a
            href="/instructions"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: '6px 10px',
              background: '#2c2c2e',
              border: '1px solid #3a3a40',
              borderRadius: '6px',
              color: '#d0d0d0',
              fontSize: '12px',
              textDecoration: 'none',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
            }}
          >
            {isMobile ? 'Guide' : 'Instructions'}
          </a>
        </div>
      </header>

      {/* Breadcrumb Path Bar */}
      <div
        style={{
          background: '#18181a',
          borderBottom: '1px solid #2c2c2e',
          padding: isMobile ? '8px 12px' : '8px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          overflowX: 'auto',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        {isMobile && path.length > 0 && (
          <button
            type="button"
            onClick={handleMobileBack}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '3px',
              background: '#2c2c2e',
              border: '1px solid #3a3a40',
              borderRadius: '6px',
              color: '#fff',
              fontSize: '12px',
              fontWeight: 600,
              padding: '4px 10px',
              cursor: 'pointer',
              marginRight: '6px',
            }}
          >
            <ChevronLeftIcon size={14} /> Back
          </button>
        )}

        <button
          type="button"
          onClick={() => handleBreadcrumbClick(-1)}
          style={{
            background: 'none',
            border: 'none',
            color: path.length === 0 ? '#3d8bff' : '#9a9a9a',
            fontSize: '12px',
            fontWeight: path.length === 0 ? 600 : 400,
            cursor: 'pointer',
            padding: '2px 4px',
            borderRadius: '4px',
          }}
        >
          You ({fullName(currentUser)})
        </button>

        {path.map((item, idx) => (
          <div key={item.user.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: '#4a4a50', display: 'flex', alignItems: 'center' }}>
              <ChevronRightIcon size={13} />
            </span>
            <button
              type="button"
              onClick={() => handleBreadcrumbClick(idx)}
              style={{
                background: 'none',
                border: 'none',
                color: idx === path.length - 1 ? '#3d8bff' : '#9a9a9a',
                fontSize: '12px',
                fontWeight: idx === path.length - 1 ? 600 : 400,
                cursor: 'pointer',
                padding: '2px 4px',
                borderRadius: '4px',
              }}
            >
              {fullName(item.user)}
            </button>
          </div>
        ))}
      </div>

      {/* Main Content Area */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* If Mobile: Show single drill-down column */}
        {isMobile ? (
          <div style={{ flex: 1, height: '100%', overflow: 'hidden' }}>
            <MillerColumn
              key={currentMobileOwner.id}
              ownerId={currentMobileOwner.id}
              ownerName={currentMobileOwner.name}
              depth={path.length}
              selectedUserId={null}
              onSelectUser={(user, depth) => handleSelectUser(user, depth)}
              onInspectUser={handleInspectUser}
              currentUserId={currentUser.id}
              isMobile={true}
              disabledUserIds={new Set([currentUser.id, ...path.map((p) => p.user.id)])}
            />
          </div>
        ) : (
          /* If Desktop: Show cascading side-by-side columns with horizontal scroll */
          <div
            ref={scrollTrackRef}
            style={{
              flex: 1,
              display: 'flex',
              overflowX: 'auto',
              overflowY: 'hidden',
              height: '100%',
              scrollBehavior: 'smooth',
            }}
          >
            {/* Column 0: Root (My Friends) */}
            <MillerColumn
              key={currentUser.id}
              ownerId={currentUser.id}
              ownerName="My Connections"
              depth={0}
              selectedUserId={path[0]?.user.id || null}
              onSelectUser={(user, depth) => handleSelectUser(user, depth)}
              onInspectUser={handleInspectUser}
              currentUserId={currentUser.id}
              width={310}
              disabledUserIds={new Set([currentUser.id])}
            />

            {/* Cascading Columns for each path step */}
            {path.map((item, idx) => {
              const nextSelectedId = path[idx + 1]?.user.id || null;
              const disabledIds = new Set([
                currentUser.id,
                ...path.slice(0, idx + 1).map((p) => p.user.id),
              ]);
              return (
                <MillerColumn
                  key={item.user.id}
                  ownerId={item.user.id}
                  ownerName={`${item.user.firstName}'s Connections`}
                  depth={idx + 1}
                  selectedUserId={nextSelectedId}
                  onSelectUser={(user, depth) => handleSelectUser(user, depth)}
                  onInspectUser={handleInspectUser}
                  currentUserId={currentUser.id}
                  width={310}
                  disabledUserIds={disabledIds}
                />
              );
            })}
          </div>
        )}

        {/* Dedicated Rightmost Inspector Panel (Desktop) */}
        {!isMobile && showInspectorPanel && inspectedUser && (
          <aside
            style={{
              width: 360,
              minWidth: 360,
              height: '100%',
              background: '#1c1c1e',
              borderLeft: '1px solid #3a3a40',
              display: 'flex',
              flexDirection: 'column',
              overflowY: 'auto',
              zIndex: 10,
            }}
          >
            <UserCard
              user={inspectedUser}
              relationshipNames={(inspectedUser.relationships || []).map(
                (id) => userNameCache.get(id) || `${id.slice(0, 8)}...`
              )}
              onClose={() => setInspectedUser(null)}
              onFindPath={() => onSwitchToGraph(undefined, inspectedUser.id)}
              showFindPath={inspectedUser.id !== currentUser.id}
              onSendRequest={() => handleSendRequest(inspectedUser.id)}
              showSendRequest={
                inspectedUser.id !== currentUser.id &&
                !(inspectedUser.relationships || []).includes(currentUser.id) &&
                !(currentUser.relationships || []).includes(inspectedUser.id)
              }
              isRequestPending={isRequestPending(inspectedUser.id)}
              isSendingRequest={pendingActionIds.has(inspectedUser.id)}
              onDisconnect={() => handleDisconnect(inspectedUser.id)}
              showDisconnect={
                inspectedUser.id !== currentUser.id &&
                ((inspectedUser.relationships || []).includes(currentUser.id) ||
                  (currentUser.relationships || []).includes(inspectedUser.id))
              }
              isDisconnecting={pendingActionIds.has(inspectedUser.id)}
              onSelectNode={(nodeId) => {
                // If clicked a relationship inside UserCard, find in cache or inspect
                onSwitchToGraph(nodeId);
              }}
              isCurrentUser={inspectedUser.id === currentUser.id}
              onBioUpdated={handleBioUpdated}
              style={{
                background: 'transparent',
                border: 'none',
                borderRadius: 0,
                height: 'auto',
              }}
            />
          </aside>
        )}
      </div>

      {/* Mobile Inspector Bottom Sheet */}
      {isMobile && inspectedUser && (
        <BottomSheet
          open={showMobileInspector}
          title={fullName(inspectedUser)}
          onClose={() => setShowMobileInspector(false)}
        >
          <div style={{ padding: '4px' }}>
            <UserCard
              user={inspectedUser}
              relationshipNames={(inspectedUser.relationships || []).map(
                (id) => userNameCache.get(id) || `${id.slice(0, 8)}...`
              )}
              onClose={() => setShowMobileInspector(false)}
              onFindPath={() => {
                setShowMobileInspector(false);
                onSwitchToGraph(undefined, inspectedUser.id);
              }}
              showFindPath={inspectedUser.id !== currentUser.id}
              onSendRequest={() => handleSendRequest(inspectedUser.id)}
              showSendRequest={
                inspectedUser.id !== currentUser.id &&
                !(inspectedUser.relationships || []).includes(currentUser.id) &&
                !(currentUser.relationships || []).includes(inspectedUser.id)
              }
              isRequestPending={isRequestPending(inspectedUser.id)}
              isSendingRequest={pendingActionIds.has(inspectedUser.id)}
              onDisconnect={() => handleDisconnect(inspectedUser.id)}
              showDisconnect={
                inspectedUser.id !== currentUser.id &&
                ((inspectedUser.relationships || []).includes(currentUser.id) ||
                  (currentUser.relationships || []).includes(inspectedUser.id))
              }
              isDisconnecting={pendingActionIds.has(inspectedUser.id)}
              onSelectNode={(nodeId) => {
                setShowMobileInspector(false);
                onSwitchToGraph(nodeId);
              }}
              isCurrentUser={inspectedUser.id === currentUser.id}
              onBioUpdated={handleBioUpdated}
              compact={true}
              style={{
                background: 'transparent',
                border: 'none',
                borderRadius: 0,
                padding: 0,
              }}
            />
          </div>
        </BottomSheet>
      )}
    </div>
  );
};
