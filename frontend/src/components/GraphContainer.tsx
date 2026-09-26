import { useCallback, useRef, useState, type CSSProperties } from 'react';
import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d';
import { fullName, formatRelativeTime } from '../services/userService';
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
  STATIC_LAYOUT,
} from '../graph/rendering';
import type { GNode, GLink, LinkExtra } from '../graph/rendering';
import { UserCard } from './UserCard';
import { DraggableCard } from './DraggableCard';
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
  ColumnsIcon,
  GridIcon,
} from './Icons';
import { SearchModeToggle } from './tags/SearchModeToggle';
import { SEARCH_PLACEHOLDERS } from './tags/searchModes';
import { TagQueryField, type TagQueryFieldHandle } from './tags/TagQueryField';
import { pickerRows } from './tags/tagTheme';

interface GraphContainerProps {
  currentUser: User;
  onSwitchToColumns?: () => void;
  initialFocusUserId?: string | null;
  initialFindPathTargetId?: string | null;
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

export const GraphContainer = ({
  currentUser,
  onSwitchToColumns,
  initialFocusUserId,
  initialFindPathTargetId,
}: GraphContainerProps) => {
  const fgRef = useRef<ForceGraphMethods<GNode, GLink> | undefined>(undefined);
  const c = useGraphController(currentUser, fgRef);
  const hasOrientedRef = useRef(false);
  const tagQueryRef = useRef<TagQueryFieldHandle>(null);
  const [graphReady, setGraphReady] = useState(false);

  // The engine first stops once the static layout is final (see STATIC_LAYOUT). Only then is the
  // camera placed — instantly — and the canvas revealed, so nothing moves when the graph appears.
  const handleEngineStop = () => {
    if (hasOrientedRef.current) return;
    hasOrientedRef.current = true;
    if (initialFocusUserId) c.focusUser(initialFocusUserId, 0);
    else if (initialFindPathTargetId) c.handleFindPath(initialFindPathTargetId);
    else c.handleLocateMe(0);
    setGraphReady(true);
  };

  const graphResizeObserverRef = useRef<ResizeObserver | null>(null);
  const [graphSize, setGraphSize] = useState({ width: window.innerWidth, height: window.innerHeight });

  // Floating Popover UI states
  const [showNotifications, setShowNotifications] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showDistanceSlider, setShowDistanceSlider] = useState(false);
  const [frontCard, setFrontCard] = useState<'user' | 'path'>('user');

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
      {/* 100% Viewport Canvas, hidden until laid out and centered */}
      <div style={{ visibility: graphReady ? 'visible' : 'hidden' }}>
        <ForceGraph2D<Node, LinkExtra>
          ref={fgRef}
          width={graphSize.width}
          height={graphSize.height}
          graphData={c.graphData}
          backgroundColor="#121214"
          enableNodeDrag={false}
          {...STATIC_LAYOUT}
          d3VelocityDecay={0.4}
          onEngineStop={handleEngineStop}
          onRenderFramePre={(ctx, globalScale) => drawGrid(ctx, globalScale)}
          nodeCanvasObject={(node, ctx, globalScale) =>
            drawNode(node, ctx, globalScale, {
              currentUserId: currentUser.id,
              distanceFromMe: c.distanceFromMe,
              highlightNodes: c.highlightNodes,
              activePath: c.activePath,
              maxDistance: c.maxDistance,
              filterNodes: c.tagMatchIds,
            })
          }
          linkColor={(link) =>
            linkColorFor(link as GLink, {
              highlightLinks: c.highlightLinks,
              activePath: c.activePath,
              maxDistance: c.maxDistance,
              distanceFromMe: c.distanceFromMe,
              filterNodes: c.tagMatchIds,
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
          }}
        />
      </div>

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
        {/* View Switcher Pill */}
        {onSwitchToColumns && (
          <div
            style={{
              ...floatingPanelStyle,
              pointerEvents: 'auto',
              display: 'flex',
              alignItems: 'center',
              padding: '3px',
              gap: '2px',
            }}
          >
            <button
              type="button"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '6px 12px',
                borderRadius: '8px',
                border: 'none',
                background: '#3d8bff',
                color: '#fff',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'default',
              }}
              title="Graph View (Active)"
            >
              <GridIcon size={14} />
              Graph
            </button>
            <button
              type="button"
              onClick={onSwitchToColumns}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '6px 12px',
                borderRadius: '8px',
                border: 'none',
                background: 'transparent',
                color: '#9a9a9a',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
              title="Switch to Columns View"
            >
              <ColumnsIcon size={14} />
              Columns
            </button>
          </div>
        )}

        {/* Search bar: one mode at a time. Tags mode swaps the text input for tag tokens and
            opens the tag picker, whose width is capped at the bar's own width. */}
        <div style={{ ...floatingPanelStyle, pointerEvents: 'auto', padding: '6px 8px 6px 12px', display: 'flex', alignItems: 'center', gap: '8px', position: 'relative', minWidth: '360px', maxWidth: '520px', flex: '1 1 auto', fontSize: '14px' }}>
          <SearchIcon size={18} color="#9a9a9a" style={{ flexShrink: 0 }} />
          {c.searchMode === 'tags' ? (
            <TagQueryField
              ref={tagQueryRef}
              criteria={c.tagCriteria}
              onChange={c.setTagCriteria}
              matchCount={c.tagMatchIds ? c.tagMatchIds.size : null}
              loading={c.searchLoading}
              rows={pickerRows('regular', false)}
              layout="dropdown"
              placeholder={SEARCH_PLACEHOLDERS.tags}
              inputStyle={{ fontSize: '14px' }}
            >
              {c.searchMatches.length > 0 && (
                <div style={{ marginTop: '8px', maxHeight: '160px', overflowY: 'auto' }}>
                  {c.searchMatches.slice(0, 20).map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => {
                        c.handleSelectSearchResult(u.id);
                        tagQueryRef.current?.close();
                      }}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 4px', background: 'none', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.06)', color: '#f0f0f0', fontSize: '12px', cursor: 'pointer' }}
                    >
                      {fullName(u)}
                    </button>
                  ))}
                </div>
              )}
            </TagQueryField>
          ) : (
            <input
              type="text"
              placeholder={SEARCH_PLACEHOLDERS[c.searchMode]}
              value={c.searchTerm}
              onChange={(e) => {
                c.setSearchTerm(e.target.value);
                c.setShowSuggestions(true);
              }}
              onFocus={() => c.setShowSuggestions(true)}
              onBlur={() => c.setShowSuggestions(false)}
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
          )}
          <SearchModeToggle mode={c.searchMode} onChange={c.setSearchMode} />

          {/* People suggestions for the text modes */}
          {c.searchMode !== 'tags' && c.showSuggestions && c.searchMatches.length > 0 && (
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
                    c.setShowSuggestions(false);
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
                width: '380px',
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
                    padding: '6px 4px',
                    borderRadius: '6px',
                    border: '1px solid #3a3a40',
                    background: c.requestsTab === 'received' ? '#2a3f5f' : 'transparent',
                    color: '#f0f0f0',
                    fontSize: '11px',
                    fontWeight: c.requestsTab === 'received' ? 'bold' : 'normal',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Incoming ({c.receivedRequests.length})
                </button>
                <button
                  onClick={() => c.setRequestsTab('sent')}
                  style={{
                    flex: 1,
                    padding: '6px 4px',
                    borderRadius: '6px',
                    border: '1px solid #3a3a40',
                    background: c.requestsTab === 'sent' ? '#2a3f5f' : 'transparent',
                    color: '#f0f0f0',
                    fontSize: '11px',
                    fontWeight: c.requestsTab === 'sent' ? 'bold' : 'normal',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Outgoing ({c.sentRequests.length})
                </button>
                <button
                  onClick={() => c.setRequestsTab('newUsers')}
                  style={{
                    flex: 1,
                    padding: '6px 4px',
                    borderRadius: '6px',
                    border: '1px solid #3a3a40',
                    background: c.requestsTab === 'newUsers' ? '#2a3f5f' : 'transparent',
                    color: '#f0f0f0',
                    fontSize: '11px',
                    fontWeight: c.requestsTab === 'newUsers' ? 'bold' : 'normal',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  New Users ({c.newUsers.length})
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
                            disabled={c.isActionPending(req.id)}
                            style={{ padding: '3px 8px', fontSize: '11px', background: '#2e7d32', color: 'white', border: 'none', borderRadius: '4px', cursor: c.isActionPending(req.id) ? 'not-allowed' : 'pointer' }}
                          >
                            {c.isActionPending(req.id) ? 'Accepting...' : 'Accept'}
                          </button>
                          <button
                            onClick={() => c.handleDeclineRequest(req.id)}
                            disabled={c.isActionPending(req.id)}
                            style={{ padding: '3px 8px', fontSize: '11px', background: '#d32f2f', color: 'white', border: 'none', borderRadius: '4px', cursor: c.isActionPending(req.id) ? 'not-allowed' : 'pointer' }}
                          >
                            {c.isActionPending(req.id) ? 'Declining...' : 'Decline'}
                          </button>
                        </div>
                      </div>
                    ))
                  )
                ) : c.requestsTab === 'sent' ? (
                  c.sentRequests.length === 0 ? (
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
                  )
                ) : (
                  c.newUsers.length === 0 ? (
                    <p style={{ color: '#9a9a9a', fontSize: '13px', margin: '8px 0', textAlign: 'center' }}>No new users yet</p>
                  ) : (
                    c.newUsers.map((u) => {
                      const isConnected = c.connectedUserIds.has(u.id);
                      const isSent = c.sentRequestUserIds.has(u.id);
                      const incomingReqId = c.receivedRequestMap.get(u.id);

                      return (
                        <div
                          key={u.id}
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
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <button
                              onClick={() => {
                                c.focusUser(u.id);
                                setShowNotifications(false);
                              }}
                              style={{
                                background: 'none',
                                border: 'none',
                                padding: 0,
                                cursor: 'pointer',
                                color: '#6ab0ff',
                                fontWeight: 500,
                                textAlign: 'left',
                                fontSize: '13px',
                              }}
                            >
                              {fullName(u)}
                            </button>
                            <span style={{ fontSize: '11px', color: '#9a9a9a' }}>
                              {formatRelativeTime(u.createdAt)}
                            </span>
                          </div>
                          <div>
                            {isConnected ? (
                              <span
                                style={{
                                  fontSize: '11px',
                                  color: '#4caf50',
                                  background: 'rgba(76, 175, 80, 0.1)',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  border: '1px solid rgba(76, 175, 80, 0.3)',
                                }}
                              >
                                Connected
                              </span>
                            ) : incomingReqId ? (
                              <button
                                onClick={() => c.handleAcceptRequest(incomingReqId)}
                                disabled={c.isActionPending(incomingReqId)}
                                style={{
                                  padding: '3px 8px',
                                  fontSize: '11px',
                                  background: '#2e7d32',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '4px',
                                  cursor: c.isActionPending(incomingReqId) ? 'not-allowed' : 'pointer',
                                }}
                              >
                                {c.isActionPending(incomingReqId) ? 'Accepting...' : 'Accept'}
                              </button>
                            ) : isSent ? (
                              <span style={{ fontSize: '11px', color: '#9a9a9a' }}>Requested</span>
                            ) : (
                              <button
                                onClick={() => c.handleSendRequest(u.id)}
                                disabled={c.isActionPending(u.id)}
                                style={{
                                  padding: '3px 8px',
                                  fontSize: '11px',
                                  background: '#2a5f9e',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '4px',
                                  cursor: c.isActionPending(u.id) ? 'not-allowed' : 'pointer',
                                }}
                              >
                                {c.isActionPending(u.id) ? 'Connecting...' : '+ Connect'}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )
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
                  disabled={c.isUpdatingAutoReject}
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
                    cursor: c.isUpdatingAutoReject ? 'not-allowed' : 'pointer',
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

              {/* Manual refresh: the graph never updates in the background */}
              <div style={{ borderTop: '1px solid #3a3a40', paddingTop: '12px', marginBottom: '14px' }}>
                <button
                  type="button"
                  onClick={() => c.loadData()}
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    background: 'rgba(61, 139, 255, 0.12)',
                    border: '1px solid #3a3a40',
                    borderRadius: '6px',
                    color: '#6ab0ff',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: 500,
                  }}
                >
                  Refresh Graph Now
                </button>
              </div>

              {/* Instructions & Help */}
              <div style={{ borderTop: '1px solid #3a3a40', paddingTop: '12px' }}>
                <a
                  href="/instructions"
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    textAlign: 'center',
                    padding: '8px',
                    background: '#2c2c2e',
                    border: '1px solid #3a3a40',
                    borderRadius: '6px',
                    color: '#6ab0ff',
                    textDecoration: 'none',
                    fontSize: '13px',
                    fontWeight: 500,
                  }}
                >
                  📖 View Instructions & Guide
                </a>
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

      {/* Floating Selected UserCard Overlay (Draggable) */}
      {c.selectedUser && (
        <DraggableCard
          id="user-card"
          initialX={20}
          initialY={72}
          width={380}
          dragHandleText="User Profile (drag to move)"
          zIndex={frontCard === 'user' ? 35 : 25}
          onBringToFront={() => setFrontCard('user')}
        >
          <UserCard
            user={c.selectedUser}
            relationshipNames={c.getRelationshipNames(c.selectedUser.relationships)}
            onClose={c.clearSelection}
            onSendRequest={() => c.handleSendRequest(c.selectedUser!.id)}
            showSendRequest={c.selectedUser.id !== currentUser.id && !c.connectedUserIds.has(c.selectedUser.id)}
            isRequestPending={c.sentRequestUserIds.has(c.selectedUser.id)}
            isSendingRequest={c.isActionPending(c.selectedUser.id)}
            hasIncomingRequest={c.receivedRequestUserIds.has(c.selectedUser.id)}
            onAcceptRequest={() => {
              const reqId = c.receivedRequestMap.get(c.selectedUser!.id);
              if (reqId) c.handleAcceptRequest(reqId);
            }}
            isAcceptingRequest={
              c.isActionPending(c.selectedUser.id) ||
              Boolean(c.receivedRequestMap.get(c.selectedUser.id) && c.isActionPending(c.receivedRequestMap.get(c.selectedUser.id)!))
            }
            onFindPath={() => c.handleFindPath(c.selectedUser!.id)}
            showFindPath={c.selectedUser.id !== currentUser.id}
            onDisconnect={() => c.handleDisconnect(c.selectedUser!.id)}
            showDisconnect={c.selectedUser.id !== currentUser.id && c.connectedUserIds.has(c.selectedUser.id)}
            isDisconnecting={c.isActionPending(c.selectedUser.id)}
            onSelectNode={(nodeId: string) => c.focusUser(nodeId)}
            isCurrentUser={c.selectedUser.id === currentUser.id}
            onBioUpdated={(newBio) => c.handleBioUpdated(c.selectedUser!.id, newBio)}
            onTagsChange={(update) => c.updateUserTags(c.selectedUser!.id, update)}
            onNoteChange={(note) => c.updateUserNote(c.selectedUser!.id, note)}
            style={{ background: 'transparent', border: 'none' }}
          />
        </DraggableCard>
      )}

      {/* Floating Active Path Card (Draggable, side-by-side with UserCard) */}
      {c.activePath && c.pathBreadcrumb.length > 0 && (
        <DraggableCard
          id="path-card"
          initialX={c.selectedUser ? 420 : 20}
          initialY={72}
          width={360}
          dragHandleText="Shortest Path (drag to move)"
          borderColor="#ff6b6b"
          zIndex={frontCard === 'path' ? 35 : 26}
          onBringToFront={() => setFrontCard('path')}
        >
          <div style={{ padding: '14px' }}>
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
              {c.pathBreadcrumb.map((hop) => (
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
                  {`${fullName(hop)}`}
                </button>
              ))}
            </div>
          </div>
        </DraggableCard>
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
              boxSizing: 'border-box',
              padding: '14px 16px',
              width: '230px',
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
              style={{
                width: '100%',
                margin: '0',
                padding: '0',
                boxSizing: 'border-box',
                cursor: 'pointer',
                accentColor: '#3d8bff',
                display: 'block',
              }}
            />
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '0 8px',
                fontSize: '10px',
                color: '#9a9a9a',
                marginTop: '6px',
                boxSizing: 'border-box',
              }}
            >
              <span style={{ width: 0, display: 'flex', justifyContent: 'center', overflow: 'visible' }}>1</span>
              <span style={{ width: 0, display: 'flex', justifyContent: 'center', overflow: 'visible' }}>2</span>
              <span style={{ width: 0, display: 'flex', justifyContent: 'center', overflow: 'visible' }}>3</span>
              <span style={{ width: 0, display: 'flex', justifyContent: 'center', overflow: 'visible' }}>4</span>
              <span style={{ width: 0, display: 'flex', justifyContent: 'center', overflow: 'visible' }}>5</span>
              <span style={{ width: 0, display: 'flex', justifyContent: 'center', overflow: 'visible' }}>6</span>
              <span style={{ width: 0, display: 'flex', justifyContent: 'center', overflow: 'visible' }}>All</span>
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
          <SlidersIcon size={18} color="#6ab0ff" />
        </button>

        <button onClick={() => c.handleLocateMe()} title="Locate Me" style={hudBtnStyle}>
          <TargetIcon size={18} color="#6ab0ff" />
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
    </div>
  );
};
