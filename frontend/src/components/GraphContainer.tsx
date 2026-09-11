import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d';
import { fullName } from '../services/userService';
import type { User, Node } from '../services/userService';
import { useGraphController } from '../graph/useGraphController';
import {
  drawGrid,
  drawNode,
  drawPathArrow,
  linkColorFor,
  linkLineDashFor,
  paintNodePointerArea,
  useGraphPhysics,
} from '../graph/rendering';
import type { GNode, GLink, LinkExtra } from '../graph/rendering';
import { UserCard } from './UserCard';
import { formatPhoneNumberDisplay } from '../utils/phoneUtils';
import {
  SearchIcon,
  MailboxIcon,
  SettingsIcon,
  TargetIcon,
  PlusIcon,
  MinusIcon,
  MaximizeIcon,
  SlidersIcon,
  CloseIcon,
  TagIcon,
} from './Icons';
import { fetchAllTags, type Tag } from '../services/tagService';
import { searchUsersApi } from '../services/userService';

interface GraphContainerProps {
  currentUser: User;
  onLogout: () => void;
}

const ZOOM_STEP_FACTOR = 1.6;

const floatingPanelStyle: CSSProperties = {
  background: 'rgba(28, 28, 30, 0.94)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  border: '1px solid #3a3a40',
  borderRadius: '12px',
  boxShadow: '0 12px 32px rgba(0, 0, 0, 0.65)',
  color: '#f0f0f0',
};

const hudBtnStyle: CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: '20px',
  background: 'rgba(28, 28, 30, 0.9)',
  backdropFilter: 'blur(12px)',
  border: '1px solid #3a3a40',
  color: '#f0f0f0',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
  transition: 'background 0.2s',
};

export const GraphContainer = ({ currentUser, onLogout }: GraphContainerProps) => {
  const fgRef = useRef<ForceGraphMethods<GNode, GLink> | undefined>(undefined);
  const c = useGraphController(currentUser, fgRef);

  const graphResizeObserverRef = useRef<ResizeObserver | null>(null);
  const [graphSize, setGraphSize] = useState({ width: window.innerWidth, height: window.innerHeight });

  // Floating Popover UI states
  const [showNotifications, setShowNotifications] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showDistanceSlider, setShowDistanceSlider] = useState(false);
  const [showTagFilter, setShowTagFilter] = useState(false);

  // Tag filter state
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [tagCategoryFilter, setTagCategoryFilter] = useState<'ALL' | 'GLOBAL' | 'CUSTOM'>('ALL');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [filteredUserIds, setFilteredUserIds] = useState<Set<string> | null>(null);

  useEffect(() => {
    fetchAllTags().then(setAvailableTags).catch(() => {});
  }, []);

  // Update filteredUserIds when selectedTag or tagCategoryFilter changes
  useEffect(() => {
    if (!selectedTag && tagCategoryFilter === 'ALL') {
      setFilteredUserIds(null);
      return;
    }

    if (selectedTag) {
      searchUsersApi(selectedTag, false, true)
        .then((matched) => {
          setFilteredUserIds(new Set(matched.map((u) => u.id)));
        })
        .catch(() => setFilteredUserIds(null));
    } else if (tagCategoryFilter === 'GLOBAL') {
      // Find all users matching any global tag label
      const globalLabels = availableTags.filter((t) => t.category !== 'CUSTOM').map((t) => t.label);
      Promise.all(globalLabels.slice(0, 5).map((l) => searchUsersApi(l, false, true)))
        .then((batches) => {
          const ids = new Set<string>();
          batches.forEach((batch) => batch.forEach((u) => ids.add(u.id)));
          setFilteredUserIds(ids);
        })
        .catch(() => setFilteredUserIds(null));
    } else if (tagCategoryFilter === 'CUSTOM') {
      // Find users matching custom tags
      const customLabels = availableTags.filter((t) => t.category === 'CUSTOM').map((t) => t.label);
      if (customLabels.length === 0) {
        setFilteredUserIds(new Set());
      } else {
        Promise.all(customLabels.map((l) => searchUsersApi(l, false, true)))
          .then((batches) => {
            const ids = new Set<string>();
            batches.forEach((batch) => batch.forEach((u) => ids.add(u.id)));
            setFilteredUserIds(ids);
          })
          .catch(() => setFilteredUserIds(null));
      }
    }
  }, [selectedTag, tagCategoryFilter, availableTags]);

  const graphWrapperRef = useCallback((node: HTMLDivElement | null) => {
    graphResizeObserverRef.current?.disconnect();
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        setGraphSize({ width, height });
      }
    });
    observer.observe(node);
    graphResizeObserverRef.current = observer;
  }, []);

  useGraphPhysics(fgRef, c.graphData.links, c.distanceFromMe);

  if (c.isLoading) {
    return (
      <div style={{ width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#121214', color: '#9a9a9a' }}>
        Loading directory...
      </div>
    );
  }

  if (c.initError) {
    return (
      <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#121214' }}>
        <p style={{ color: '#ff6b6b' }}>{c.initError}</p>
        <button onClick={c.loadData} style={{ padding: '8px 16px', background: '#2c2c2e', color: '#fff', border: '1px solid #3a3a40', borderRadius: '6px', cursor: 'pointer' }}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div ref={graphWrapperRef} style={{ width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden', background: '#121214' }}>
      {/* 100% Viewport Canvas */}
      <ForceGraph2D<Node, LinkExtra>
        ref={fgRef}
        width={graphSize.width}
        height={graphSize.height}
        graphData={c.graphData}
        backgroundColor="#121214"
        onRenderFramePre={(ctx, globalScale) => drawGrid(ctx, globalScale)}
        nodeCanvasObject={(node, ctx, globalScale) =>
          drawNode(node, ctx, globalScale, {
            currentUserId: currentUser.id,
            distanceFromMe: c.distanceFromMe,
            highlightNodes: c.highlightNodes,
            activePath: c.activePath,
            maxDistance: c.maxDistance,
            filterNodes: filteredUserIds,
          })
        }
        linkColor={(link) =>
          linkColorFor(link as GLink, {
            highlightLinks: c.highlightLinks,
            activePath: c.activePath,
            maxDistance: c.maxDistance,
            distanceFromMe: c.distanceFromMe,
            filterNodes: filteredUserIds,
          })
        }
        linkLineDash={(link) => linkLineDashFor(link as GLink)}
        nodePointerAreaPaint={paintNodePointerArea}
        linkCanvasObjectMode={() => 'after'}
        linkCanvasObject={(link, ctx, globalScale) =>
          drawPathArrow(link as GLink, ctx, globalScale, c.pathLinkTarget)
        }
        onNodeClick={(node) => c.selectNode(String(node.id))}
        onBackgroundClick={() => {
          c.clearSelection();
          setShowNotifications(false);
          setShowSettings(false);
          setShowTagFilter(false);
        }}
      />

      {/* Floating Top Bar */}
      <header
        style={{
          position: 'absolute',
          top: 12,
          left: 16,
          right: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          zIndex: 20,
          pointerEvents: 'none',
        }}
      >
        {/* Search Bar with Names & Tags checkboxes */}
        <div style={{ ...floatingPanelStyle, pointerEvents: 'auto', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '10px', position: 'relative', minWidth: '320px', maxWidth: '480px', flex: '1 1 auto' }}>
          <SearchIcon size={18} color="#9a9a9a" />
          <input
            type="text"
            placeholder="Search network..."
            value={c.searchTerm}
            onChange={(e) => {
              c.setSearchTerm(e.target.value);
              c.setShowSuggestions(true);
            }}
            onFocus={() => c.setShowSuggestions(true)}
            style={{
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#f0f0f0',
              fontSize: '14px',
              flex: 1,
              minWidth: '100px',
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#9a9a9a', borderLeft: '1px solid #3a3a40', paddingLeft: '8px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '3px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={c.searchNames}
                onChange={(e) => c.setSearchNames(e.target.checked)}
                style={{ cursor: 'pointer', accentColor: '#3d8bff' }}
              />
              Names
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '3px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={c.searchTags}
                onChange={(e) => c.setSearchTags(e.target.checked)}
                style={{ cursor: 'pointer', accentColor: '#3d8bff' }}
              />
              Tags
            </label>
          </div>

          {/* Search suggestions dropdown */}
          {c.showSuggestions && c.searchMatches.length > 0 && (
            <div
              onMouseDown={(e) => e.preventDefault()}
              style={{
                position: 'absolute',
                top: 'calc(100% + 8px)',
                left: 0,
                right: 0,
                ...floatingPanelStyle,
                maxHeight: '260px',
                overflowY: 'auto',
                zIndex: 30,
              }}
            >
              {c.searchMatches.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => {
                    c.handleSelectSearchResult(u.id);
                  }}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    width: '100%',
                    padding: '10px 14px',
                    background: 'none',
                    border: 'none',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                    color: '#f0f0f0',
                    fontSize: '13px',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span style={{ fontWeight: 500 }}>{fullName(u)}</span>
                  {u.phoneNumber && <span style={{ color: '#9a9a9a', fontSize: '11px' }}>{formatPhoneNumberDisplay(u.phoneNumber)}</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Tag Filter Button */}
        <div style={{ pointerEvents: 'auto', position: 'relative' }}>
          <button
            onClick={() => {
              setShowTagFilter((prev) => !prev);
              setShowNotifications(false);
              setShowSettings(false);
            }}
            style={{
              ...floatingPanelStyle,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 12px',
              fontSize: '13px',
              cursor: 'pointer',
              color: selectedTag || tagCategoryFilter !== 'ALL' ? '#6ab0ff' : '#f0f0f0',
              borderColor: selectedTag || tagCategoryFilter !== 'ALL' ? '#3d8bff' : '#3a3a40',
            }}
          >
            <TagIcon size={16} />
            <span>
              {selectedTag
                ? `Tag: ${selectedTag}`
                : tagCategoryFilter === 'GLOBAL'
                ? 'Global Tags'
                : tagCategoryFilter === 'CUSTOM'
                ? 'Custom Tags'
                : 'All Tags'}
            </span>
          </button>

          {showTagFilter && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 8px)',
                left: 0,
                width: '260px',
                ...floatingPanelStyle,
                padding: '12px',
                zIndex: 30,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#9a9a9a', textTransform: 'uppercase' }}>Filter Tags</span>
                {(selectedTag || tagCategoryFilter !== 'ALL') && (
                  <button
                    onClick={() => {
                      setSelectedTag(null);
                      setTagCategoryFilter('ALL');
                    }}
                    style={{ background: 'none', border: 'none', color: '#ff6b6b', fontSize: '11px', cursor: 'pointer' }}
                  >
                    Reset
                  </button>
                )}
              </div>

              {/* Category tabs */}
              <div style={{ display: 'flex', gap: '4px', marginBottom: '10px' }}>
                {(['ALL', 'GLOBAL', 'CUSTOM'] as const).map((cat) => (
                  <button
                    key={cat}
                    onClick={() => {
                      setTagCategoryFilter(cat);
                      setSelectedTag(null);
                    }}
                    style={{
                      flex: 1,
                      padding: '4px 6px',
                      fontSize: '11px',
                      borderRadius: '4px',
                      border: '1px solid #3a3a40',
                      background: tagCategoryFilter === cat ? '#2a3f5f' : 'transparent',
                      color: tagCategoryFilter === cat ? '#fff' : '#9a9a9a',
                      cursor: 'pointer',
                    }}
                  >
                    {cat === 'ALL' ? 'All' : cat === 'GLOBAL' ? 'Global' : 'Custom'}
                  </button>
                ))}
              </div>

              {/* Tag list */}
              <div style={{ maxHeight: '180px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {availableTags
                  .filter((t) => tagCategoryFilter === 'ALL' || (tagCategoryFilter === 'GLOBAL' ? t.category !== 'CUSTOM' : t.category === 'CUSTOM'))
                  .map((t) => (
                    <button
                      key={t.id}
                      onClick={() => {
                        setSelectedTag(selectedTag === t.label ? null : t.label);
                        setShowTagFilter(false);
                      }}
                      style={{
                        padding: '6px 8px',
                        borderRadius: '6px',
                        border: selectedTag === t.label ? '1px solid #3d8bff' : '1px solid transparent',
                        background: selectedTag === t.label ? 'rgba(61, 139, 255, 0.15)' : 'transparent',
                        color: selectedTag === t.label ? '#6ab0ff' : '#f0f0f0',
                        fontSize: '12px',
                        cursor: 'pointer',
                        textAlign: 'left',
                        display: 'flex',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span>{t.label}</span>
                      <span style={{ color: '#6a6a70', fontSize: '10px' }}>{t.category}</span>
                    </button>
                  ))}
              </div>
            </div>
          )}
        </div>

        <div style={{ flex: 1 }} />

        {/* User Identity pill */}
        <button
          onClick={() => c.focusUser(currentUser.id)}
          style={{
            ...floatingPanelStyle,
            pointerEvents: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 12px',
            cursor: 'pointer',
          }}
        >
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: '12px',
              background: '#3d8bff',
              color: 'white',
              fontWeight: 'bold',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {currentUser.firstName[0]}
          </div>
          <span style={{ fontSize: '13px', fontWeight: 500 }}>{fullName(currentUser)}</span>
        </button>

        {/* Mailbox / Notifications Button */}
        <div style={{ pointerEvents: 'auto', position: 'relative' }}>
          <button
            onClick={() => {
              setShowNotifications((prev) => !prev);
              setShowSettings(false);
              setShowTagFilter(false);
            }}
            aria-label="Notifications"
            style={{
              ...hudBtnStyle,
              position: 'relative',
              borderColor: showNotifications ? '#3d8bff' : '#3a3a40',
            }}
          >
            <MailboxIcon size={20} color={c.receivedRequests.length > 0 ? '#6ab0ff' : 'currentColor'} />
            {c.receivedRequests.length > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: -4,
                  right: -4,
                  background: '#d32f2f',
                  color: 'white',
                  borderRadius: '10px',
                  minWidth: 18,
                  height: 18,
                  fontSize: '11px',
                  fontWeight: 'bold',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0 4px',
                  border: '2px solid #121214',
                }}
              >
                {c.receivedRequests.length}
              </span>
            )}
          </button>

          {/* Floating Notifications Popover */}
          {showNotifications && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 8px)',
                right: 0,
                width: '340px',
                ...floatingPanelStyle,
                padding: '14px',
                zIndex: 35,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <span style={{ fontWeight: 'bold', fontSize: '14px' }}>Notifications</span>
                <button
                  onClick={() => setShowNotifications(false)}
                  style={{ background: 'none', border: 'none', color: '#9a9a9a', cursor: 'pointer', padding: 0 }}
                >
                  <CloseIcon size={16} />
                </button>
              </div>

              <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
                <button
                  onClick={() => c.setRequestsTab('received')}
                  style={{
                    flex: 1,
                    padding: '6px 10px',
                    borderRadius: '6px',
                    border: '1px solid #3a3a40',
                    background: c.requestsTab === 'received' ? '#2a3f5f' : 'transparent',
                    color: '#f0f0f0',
                    fontSize: '12px',
                    fontWeight: c.requestsTab === 'received' ? 'bold' : 'normal',
                    cursor: 'pointer',
                  }}
                >
                  Incoming ({c.receivedRequests.length})
                </button>
                <button
                  onClick={() => c.setRequestsTab('sent')}
                  style={{
                    flex: 1,
                    padding: '6px 10px',
                    borderRadius: '6px',
                    border: '1px solid #3a3a40',
                    background: c.requestsTab === 'sent' ? '#2a3f5f' : 'transparent',
                    color: '#f0f0f0',
                    fontSize: '12px',
                    fontWeight: c.requestsTab === 'sent' ? 'bold' : 'normal',
                    cursor: 'pointer',
                  }}
                >
                  Outgoing ({c.sentRequests.length})
                </button>
              </div>

              <div style={{ maxHeight: '240px', overflowY: 'auto' }}>
                {c.requestsTab === 'received' ? (
                  c.receivedRequests.length === 0 ? (
                    <p style={{ color: '#9a9a9a', fontSize: '13px', margin: '8px 0', textAlign: 'center' }}>No incoming requests</p>
                  ) : (
                    c.receivedRequests.map((req) => (
                      <div
                        key={req.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '8px 10px',
                          border: '1px solid #3a3a40',
                          borderRadius: '6px',
                          marginBottom: '6px',
                          background: 'rgba(255,255,255,0.03)',
                        }}
                      >
                        <button
                          onClick={() => {
                            c.focusUser(req.sender.id);
                            setShowNotifications(false);
                          }}
                          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#6ab0ff', fontWeight: 500, textAlign: 'left', fontSize: '13px' }}
                        >
                          {fullName(req.sender)}
                        </button>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            onClick={() => c.handleAcceptRequest(req.id)}
                            style={{ padding: '3px 8px', fontSize: '11px', background: '#2e7d32', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                          >
                            Accept
                          </button>
                          <button
                            onClick={() => c.handleDeclineRequest(req.id)}
                            style={{ padding: '3px 8px', fontSize: '11px', background: '#d32f2f', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                          >
                            Decline
                          </button>
                        </div>
                      </div>
                    ))
                  )
                ) : c.sentRequests.length === 0 ? (
                  <p style={{ color: '#9a9a9a', fontSize: '13px', margin: '8px 0', textAlign: 'center' }}>No outgoing requests</p>
                ) : (
                  c.sentRequests.map((req) => (
                    <div
                      key={req.id}
                      style={{
                        padding: '8px 10px',
                        border: '1px solid #3a3a40',
                        borderRadius: '6px',
                        marginBottom: '6px',
                        background: 'rgba(255,255,255,0.03)',
                      }}
                    >
                      <button
                        onClick={() => {
                          c.focusUser(req.receiver.id);
                          setShowNotifications(false);
                        }}
                        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#6ab0ff', fontWeight: 500, textAlign: 'left', fontSize: '13px' }}
                      >
                        {fullName(req.receiver)}
                      </button>
                      <span style={{ fontSize: '11px', color: '#9a9a9a', marginLeft: '8px' }}>Pending</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Settings Button */}
        <div style={{ pointerEvents: 'auto', position: 'relative' }}>
          <button
            onClick={() => {
              setShowSettings((prev) => !prev);
              setShowNotifications(false);
              setShowTagFilter(false);
            }}
            aria-label="Settings"
            style={{
              ...hudBtnStyle,
              borderColor: showSettings ? '#3d8bff' : '#3a3a40',
            }}
          >
            <SettingsIcon size={20} />
          </button>

          {/* Floating Settings Popover */}
          {showSettings && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 8px)',
                right: 0,
                width: '320px',
                ...floatingPanelStyle,
                padding: '16px',
                zIndex: 35,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <span style={{ fontWeight: 'bold', fontSize: '15px' }}>Preferences</span>
                <button
                  onClick={() => setShowSettings(false)}
                  style={{ background: 'none', border: 'none', color: '#9a9a9a', cursor: 'pointer', padding: 0 }}
                >
                  <CloseIcon size={16} />
                </button>
              </div>

              {/* Auto-reject degree selector */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>
                  Auto-Reject Threshold
                </label>
                <p style={{ fontSize: '11px', color: '#9a9a9a', margin: '0 0 6px' }}>
                  Automatically reject connection requests from users farther than N hops away.
                </p>
                <select
                  value={c.autoRejectDegree ?? 'off'}
                  onChange={(e) => {
                    const val = e.target.value === 'off' ? null : Number(e.target.value);
                    c.handleUpdateAutoReject(val);
                  }}
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    background: '#1c1c1e',
                    border: '1px solid #3a3a40',
                    borderRadius: '6px',
                    color: '#f0f0f0',
                    fontSize: '13px',
                  }}
                >
                  <option value="off">Off (Allow from anyone)</option>
                  <option value="1">1 hop (Friends only)</option>
                  <option value="2">2 hops (Friends of friends)</option>
                  <option value="3">3 hops (3 degrees)</option>
                  <option value="4">4 hops (4 degrees)</option>
                  <option value="5">5 hops (5 degrees)</option>
                  <option value="6">6 hops (6 degrees)</option>
                </select>
              </div>

              {/* Show pending toggle */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={c.showPendingConnections}
                    onChange={(e) => c.setShowPendingConnections(e.target.checked)}
                    style={{ cursor: 'pointer', accentColor: '#3d8bff' }}
                  />
                  Show pending connections on graph
                </label>
              </div>

              {/* View Mode & Reach */}
              <div style={{ borderTop: '1px solid #3a3a40', paddingTop: '12px', marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
                  Network Reach
                </label>
                <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                  <button
                    onClick={() => c.setViewMode('global')}
                    style={{
                      flex: 1,
                      padding: '5px',
                      fontSize: '12px',
                      background: c.viewMode === 'global' ? '#2a3f5f' : '#2c2c2e',
                      border: '1px solid #3a3a40',
                      borderRadius: '4px',
                      color: '#fff',
                      cursor: 'pointer',
                    }}
                  >
                    Global
                  </button>
                  <button
                    onClick={() => c.setViewMode('personal')}
                    style={{
                      flex: 1,
                      padding: '5px',
                      fontSize: '12px',
                      background: c.viewMode === 'personal' ? '#2a3f5f' : '#2c2c2e',
                      border: '1px solid #3a3a40',
                      borderRadius: '4px',
                      color: '#fff',
                      cursor: 'pointer',
                    }}
                  >
                    Personal
                  </button>
                </div>
                {c.viewMode === 'personal' && (
                  <div style={{ fontSize: '12px', color: '#9a9a9a' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                      <span>Degree:</span>
                      <select
                        value={c.degree}
                        onChange={(e) => c.setDegree(Number(e.target.value))}
                        style={{ background: '#1c1c1e', border: '1px solid #3a3a40', color: '#fff', borderRadius: '4px' }}
                      >
                        {[1, 2, 3, 4, 5, 6].map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                    </div>
                    {c.reach && (
                      <p style={{ margin: '4px 0 0', color: '#f0f0f0' }}>
                        <strong>{c.reach.percentage.toFixed(1)}%</strong> of network reachable ({c.reach.reachableCount} people)
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Logout button */}
              <div style={{ borderTop: '1px solid #3a3a40', paddingTop: '12px' }}>
                <button
                  onClick={onLogout}
                  style={{
                    width: '100%',
                    padding: '8px',
                    background: '#3a1414',
                    border: '1px solid #ff6b6b',
                    borderRadius: '6px',
                    color: '#ff6b6b',
                    fontSize: '13px',
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  Log out
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Floating Action Error Toast */}
      {c.actionError && (
        <div
          style={{
            position: 'absolute',
            top: 72,
            left: '50%',
            transform: 'translateX(-50%)',
            ...floatingPanelStyle,
            background: 'rgba(58, 20, 20, 0.95)',
            borderColor: '#ff6b6b',
            color: '#ff6b6b',
            padding: '8px 16px',
            zIndex: 40,
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '13px',
          }}
        >
          <span>{c.actionError}</span>
          <button
            onClick={() => c.setActionError(null)}
            style={{ background: 'none', border: 'none', color: '#ff6b6b', cursor: 'pointer' }}
          >
            <CloseIcon size={14} />
          </button>
        </div>
      )}

      {/* Floating Selected UserCard Overlay */}
      {c.selectedUser && (
        <div
          style={{
            position: 'absolute',
            top: 72,
            left: 16,
            width: '380px',
            maxHeight: 'calc(100vh - 90px)',
            overflowY: 'auto',
            ...floatingPanelStyle,
            zIndex: 25,
          }}
        >
          <UserCard
            user={c.selectedUser}
            relationshipNames={c.getRelationshipNames(c.selectedUser.relationships)}
            onClose={c.clearSelection}
            onSendRequest={() => c.handleSendRequest(c.selectedUser!.id)}
            showSendRequest={c.selectedUser.id !== currentUser.id && !currentUser.relationships.includes(c.selectedUser.id)}
            onFindPath={() => c.handleFindPath(c.selectedUser!.id)}
            showFindPath={c.selectedUser.id !== currentUser.id && !currentUser.relationships.includes(c.selectedUser.id)}
            onDisconnect={() => c.handleDisconnect(c.selectedUser!.id)}
            showDisconnect={c.selectedUser.id !== currentUser.id && currentUser.relationships.includes(c.selectedUser.id)}
            onSelectNode={(nodeId: string) => c.focusUser(nodeId)}
            isCurrentUser={c.selectedUser.id === currentUser.id}
          />
        </div>
      )}

      {/* Floating Active Path Card */}
      {c.activePath && c.pathBreadcrumb.length > 0 && (
        <div
          style={{
            position: 'absolute',
            bottom: 24,
            left: 16,
            maxWidth: '360px',
            ...floatingPanelStyle,
            borderColor: '#ff6b6b',
            padding: '12px 14px',
            zIndex: 22,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#ff6b6b' }}>Shortest Path</span>
            <button
              onClick={c.handleClearPath}
              style={{ background: 'none', border: 'none', color: '#9a9a9a', cursor: 'pointer', padding: 0 }}
            >
              <CloseIcon size={16} />
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {c.pathBreadcrumb.map((hop, index) => (
              <button
                key={hop.id}
                onClick={() => c.focusUser(hop.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#6ab0ff',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  padding: 0,
                  textAlign: 'left',
                  fontSize: '13px',
                }}
              >
                {index + 1}. {fullName(hop)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Floating HUD Controls in Bottom-Right */}
      <div
        style={{
          position: 'absolute',
          bottom: 24,
          right: 20,
          zIndex: 20,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: '10px',
        }}
      >
        {/* Max Distance Slider Flyout */}
        {showDistanceSlider && (
          <div
            style={{
              ...floatingPanelStyle,
              padding: '12px 16px',
              width: '220px',
              marginBottom: '4px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: 'bold' }}>Max Distance</span>
              <span style={{ fontSize: '12px', color: '#6ab0ff', fontWeight: 600 }}>
                {c.maxDistance === Infinity ? 'Unlimited' : `${c.maxDistance} hop${c.maxDistance > 1 ? 's' : ''}`}
              </span>
            </div>
            <input
              type="range"
              min="1"
              max="7"
              step="1"
              value={c.maxDistance === Infinity ? 7 : c.maxDistance}
              onChange={(e) => {
                const val = Number(e.target.value);
                c.setMaxDistance(val === 7 ? Infinity : val);
              }}
              style={{ width: '100%', cursor: 'pointer', accentColor: '#3d8bff' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#9a9a9a', marginTop: '4px' }}>
              <span>1</span>
              <span>2</span>
              <span>3</span>
              <span>4</span>
              <span>5</span>
              <span>6</span>
              <span>All</span>
            </div>
          </div>
        )}

        <button
          onClick={() => setShowDistanceSlider((prev) => !prev)}
          title="Filter by Connection Distance"
          style={{
            ...hudBtnStyle,
            borderColor: showDistanceSlider || c.maxDistance !== Infinity ? '#3d8bff' : '#3a3a40',
            color: c.maxDistance !== Infinity ? '#6ab0ff' : '#f0f0f0',
          }}
        >
          <SlidersIcon size={18} />
        </button>

        <button onClick={c.handleLocateMe} title="Locate Me" style={hudBtnStyle}>
          <TargetIcon size={18} />
        </button>

        <button onClick={() => c.handleZoomStep(ZOOM_STEP_FACTOR)} title="Zoom In" style={hudBtnStyle}>
          <PlusIcon size={18} />
        </button>

        <button onClick={() => c.handleZoomStep(1 / ZOOM_STEP_FACTOR)} title="Zoom Out" style={hudBtnStyle}>
          <MinusIcon size={18} />
        </button>

        <button onClick={c.handleGlobalZoom} title="Global Zoom" style={hudBtnStyle}>
          <MaximizeIcon size={18} />
        </button>
      </div>

      {/* Discreet FPS Counter in Bottom-Left */}
      <div
        style={{
          position: 'absolute',
          bottom: 8,
          left: 12,
          color: 'rgba(0, 255, 128, 0.6)',
          background: 'rgba(0,0,0,0.4)',
          fontFamily: 'monospace',
          fontSize: '11px',
          padding: '2px 6px',
          borderRadius: '4px',
          pointerEvents: 'none',
        }}
      >
        {c.fps} fps
      </div>
    </div>
  );
};
