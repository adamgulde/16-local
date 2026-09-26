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
import { BottomSheet } from './BottomSheet';
import {
  SearchIcon,
  MailboxIcon,
  SettingsIcon,
  TargetIcon,
  PlusIcon,
  MinusIcon,
  MaximizeIcon,
  SlidersIcon,
  ColumnsIcon,
  GridIcon,
} from './Icons';
import { SearchModeToggle } from './tags/SearchModeToggle';
import { SEARCH_PLACEHOLDERS } from './tags/searchModes';
import { TagQueryField } from './tags/TagQueryField';
import { pickerRows } from './tags/tagTheme';
import { formatPhoneNumberDisplay } from '../utils/phoneUtils';

interface MobileGraphViewProps {
  currentUser: User;
  onSwitchToColumns?: () => void;
  initialFocusUserId?: string | null;
  initialFindPathTargetId?: string | null;
}


type Sheet = 'card' | 'path' | 'notifications' | 'settings' | 'search' | null;

const ZOOM_STEP_FACTOR = 1.6;

// Corner floating circular glass buttons with 44px minimum touch targets
const cornerButtonStyle: CSSProperties = {
  width: 44,
  height: 44,
  minWidth: 44,
  minHeight: 44,
  borderRadius: '22px',
  background: 'rgba(28, 28, 30, 0.92)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  border: '1px solid #3a3a40',
  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.45)',
  color: '#f0f0f0',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  padding: 0,
  position: 'relative',
  touchAction: 'manipulation',
};

const tabButtonStyle = (active: boolean): CSSProperties => ({
  flex: 1,
  padding: '10px 8px',
  minHeight: 44,
  borderRadius: '8px',
  border: '1px solid',
  borderColor: active ? '#3d8bff' : '#3a3a40',
  background: active ? 'rgba(61, 139, 255, 0.15)' : '#2c2c2e',
  color: active ? '#6ab0ff' : '#9a9a9a',
  fontSize: '13px',
  fontWeight: 600,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  touchAction: 'manipulation',
});

const fabActionStyle: CSSProperties = {
  minHeight: 44,
  padding: '0 16px',
  background: '#2c2c2e',
  border: '1px solid #3a3a40',
  borderRadius: '8px',
  color: '#f0f0f0',
  fontSize: '13px',
  fontWeight: 500,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  whiteSpace: 'nowrap',
  touchAction: 'manipulation',
};

export const MobileGraphView = ({
  currentUser,
  onSwitchToColumns,
  initialFocusUserId,
  initialFindPathTargetId,
}: MobileGraphViewProps) => {
  const fgRef = useRef<ForceGraphMethods<GNode, GLink> | undefined>(undefined);
  const c = useGraphController(currentUser, fgRef);
  const hasOrientedRef = useRef(false);

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

  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  // Starts at the viewport size (the root is fixed full-screen) so the instant initial centering
  // happens on a real-sized canvas; a 0×0 one would pin the target to its top-left corner.
  const [canvasSize, setCanvasSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  const rootRef = useCallback((node: HTMLDivElement | null) => {
    resizeObserverRef.current?.disconnect();
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        setCanvasSize({ width, height });
      }
    });
    observer.observe(node);
    resizeObserverRef.current = observer;
  }, []);

  useGraphPhysics(fgRef, c.graphData.links, c.distanceFromMe);

  const [activeSheet, setActiveSheet] = useState<Sheet>(null);
  const [showDistancePopup, setShowDistancePopup] = useState(false);

  const selectAndShowCard = useCallback(
    (id: string) => {
      c.selectNode(id);
      setActiveSheet('card');
      setShowDistancePopup(false);
    },
    [c]
  );

  const focusAndShowCard = useCallback(
    (id: string) => {
      c.focusUser(id);
      setActiveSheet('card');
      setShowDistancePopup(false);
    },
    [c]
  );

  const findPathAndShowSheet = useCallback(
    async (targetId: string) => {
      await c.handleFindPath(targetId);
      setActiveSheet('path');
      setShowDistancePopup(false);
    },
    [c]
  );

  const closeCardSheet = useCallback(() => {
    c.clearSelection();
    setActiveSheet(null);
  }, [c]);

  const closePathSheet = useCallback(() => {
    setActiveSheet(null);
  }, []);

  if (c.isLoading) {
    return (
      <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#121214', color: '#9a9a9a' }}>
        Loading directory...
      </div>
    );
  }

  if (c.initError) {
    return (
      <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#121214' }}>
        <p style={{ color: '#ff6b6b' }}>{c.initError}</p>
        <button onClick={c.loadData} style={{ padding: '8px 16px', background: '#2c2c2e', color: '#fff', border: '1px solid #3a3a40', borderRadius: '6px' }}>Retry</button>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100%',
        height: '100%',
        maxHeight: '100dvh',
        overflow: 'hidden',
        background: '#121214',
        touchAction: 'none',
        userSelect: 'none',
      }}
    >
      {/* Hidden until laid out and centered */}
      <div style={{ visibility: graphReady ? 'visible' : 'hidden' }}>
        <ForceGraph2D<Node, LinkExtra>
          ref={fgRef}
          width={canvasSize.width}
          height={canvasSize.height}
          graphData={c.graphData}
          backgroundColor="#121214"
          enableNodeDrag={false}
          {...STATIC_LAYOUT}
          onEngineStop={handleEngineStop}
          d3VelocityDecay={0.4}
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
          onNodeClick={(node) => selectAndShowCard(String(node.id))}
          onBackgroundClick={() => {
            if (activeSheet === 'card') closeCardSheet();
            setShowDistancePopup(false);
          }}
        />
      </div>

      {/* TOP-LEFT CORNER: Search & Tag Filter & View Switcher */}
      <div
        style={{
          position: 'absolute',
          top: 'max(12px, env(safe-area-inset-top, 12px))',
          left: 'max(12px, env(safe-area-inset-left, 12px))',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          zIndex: 25,
        }}
      >
        {onSwitchToColumns && (
          <button
            style={{
              ...cornerButtonStyle,
              background: 'rgba(61, 139, 255, 0.18)',
              borderColor: '#3d8bff',
              color: '#6ab0ff',
            }}
            onClick={onSwitchToColumns}
            aria-label="Switch to Miller Columns"
            title="Columns View"
          >
            <ColumnsIcon size={20} />
          </button>
        )}
        <button
          style={cornerButtonStyle}
          onClick={() => {
            setActiveSheet('search');
            setShowDistancePopup(false);
          }}
          aria-label="Search"
          title="Search"
        >
          <SearchIcon size={20} />
          {c.tagMatchIds && (
            <span style={{ position: 'absolute', top: 4, right: 4, width: 8, height: 8, borderRadius: '4px', background: '#3d8bff' }} />
          )}
        </button>
      </div>

      {/* TOP-RIGHT CORNER: User Identity, Mailbox, Settings */}
      <div
        style={{
          position: 'absolute',
          top: 'max(12px, env(safe-area-inset-top, 12px))',
          right: 'max(12px, env(safe-area-inset-right, 12px))',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          zIndex: 25,
        }}
      >
        <button
          style={{
            ...cornerButtonStyle,
            borderColor: '#3d8bff',
            color: '#6ab0ff',
            fontWeight: 'bold',
            fontSize: '15px',
          }}
          onClick={() => {
            focusAndShowCard(currentUser.id);
            setShowDistancePopup(false);
          }}
          aria-label="My Profile"
          title="My Profile"
        >
          {currentUser.firstName ? currentUser.firstName[0].toUpperCase() : 'U'}
        </button>
        <button
          style={cornerButtonStyle}
          onClick={() => {
            setActiveSheet('notifications');
            setShowDistancePopup(false);
          }}
          aria-label="Notifications"
          title="Notifications"
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
                border: '2px solid #1c1c1e',
              }}
            >
              {c.receivedRequests.length}
            </span>
          )}
        </button>
        <button
          style={cornerButtonStyle}
          onClick={() => {
            setActiveSheet('settings');
            setShowDistancePopup(false);
          }}
          aria-label="Settings"
          title="Settings"
        >
          <SettingsIcon size={20} />
        </button>
      </div>

      {/* ACTIVE PATH FLOATING BANNER */}
      {c.activePath && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(max(12px, env(safe-area-inset-top, 12px)) + 52px)',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 30,
            background: 'rgba(38, 16, 16, 0.96)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: '1px solid #ff6b6b',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6), 0 0 12px rgba(255, 107, 107, 0.3)',
            borderRadius: '24px',
            padding: '8px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            color: '#f0f0f0',
            fontSize: '13px',
            maxWidth: 'calc(100vw - 32px)',
            whiteSpace: 'nowrap',
          }}
        >
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ff6b6b', display: 'inline-block', boxShadow: '0 0 6px #ff6b6b', flexShrink: 0 }} />
          <span>Active Path: {c.pathBreadcrumb.length - 1} hops</span>
          <button
            type="button"
            onClick={() => setActiveSheet('path')}
            style={{
              background: 'rgba(255, 107, 107, 0.2)',
              border: '1px solid rgba(255, 107, 107, 0.5)',
              borderRadius: '12px',
              padding: '2px 8px',
              color: '#ff9e9e',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '12px',
            }}
          >
            Details
          </button>
          <button
            type="button"
            onClick={c.handleClearPath}
            style={{
              background: 'none',
              border: 'none',
              color: '#9a9a9a',
              cursor: 'pointer',
              fontSize: '14px',
              padding: '0 0 0 4px',
              display: 'flex',
              alignItems: 'center',
              lineHeight: 1,
            }}
            title="Clear path"
          >
            ✕
          </button>
        </div>
      )}

      {/* BOTTOM-LEFT CORNER: Distance Controls & Path Chip */}
      <div
        style={{
          position: 'absolute',
          bottom: 'max(16px, env(safe-area-inset-bottom, 16px))',
          left: 'max(16px, env(safe-area-inset-left, 16px))',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: '8px',
          zIndex: 25,
        }}
      >
        {/* Distance slider popover */}
        {showDistancePopup && (
          <div
            style={{
              background: 'rgba(28, 28, 30, 0.96)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: '1px solid #3a3a40',
              boxSizing: 'border-box',
              borderRadius: '12px',
              padding: '14px 16px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
              width: '230px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              marginBottom: '4px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 600, color: '#f0f0f0' }}>
              <span>Max Distance</span>
              <span style={{ color: '#6ab0ff' }}>
                {c.maxDistance === Infinity ? 'Unlimited' : `${c.maxDistance} hops`}
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
                margin: 0,
                padding: 0,
                boxSizing: 'border-box',
                accentColor: '#3d8bff',
                height: '24px',
                cursor: 'pointer',
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

        {/* Path chip if active */}
        {c.activePath !== null && (
          <button
            onClick={() => setActiveSheet('path')}
            style={{
              ...cornerButtonStyle,
              width: 'auto',
              minWidth: 44,
              padding: '0 12px',
              gap: '6px',
              fontSize: '12px',
              fontWeight: 600,
              color: '#ff6b6b',
              borderColor: '#ff6b6b',
              background: 'rgba(58, 20, 20, 0.92)',
            }}
          >
            ● Path ({c.pathBreadcrumb.length - 1} hops)
          </button>
        )}

        {/* Distance toggle button */}
        <button
          style={{
            ...cornerButtonStyle,
            width: 'auto',
            minWidth: 44,
            padding: '0 12px',
            gap: '6px',
            fontSize: '12px',
            fontWeight: 600,
            color: c.maxDistance !== Infinity ? '#6ab0ff' : '#f0f0f0',
            borderColor: c.maxDistance !== Infinity ? '#3d8bff' : '#3a3a40',
          }}
          onClick={() => setShowDistancePopup((prev) => !prev)}
          aria-label="Max connection distance"
          title="Max connection distance"
        >
          <SlidersIcon size={18} />
          <span>{c.maxDistance === Infinity ? 'All' : `${c.maxDistance}h`}</span>
        </button>
      </div>

      {/* BOTTOM-RIGHT CORNER: Navigation HUD (Locate, Zoom In, Zoom Out, Global Zoom) */}
      <div
        style={{
          position: 'absolute',
          bottom: 'max(16px, env(safe-area-inset-bottom, 16px))',
          right: 'max(16px, env(safe-area-inset-right, 16px))',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '8px',
          zIndex: 25,
        }}
      >
        <button
          style={cornerButtonStyle}
          onClick={() => c.handleLocateMe()}
          aria-label="Locate Me"
          title="Locate Me"
        >
          <TargetIcon size={20} />
        </button>
        <button
          style={cornerButtonStyle}
          onClick={() => c.handleZoomStep(ZOOM_STEP_FACTOR)}
          aria-label="Zoom In"
          title="Zoom In"
        >
          <PlusIcon size={20} />
        </button>
        <button
          style={cornerButtonStyle}
          onClick={() => c.handleZoomStep(1 / ZOOM_STEP_FACTOR)}
          aria-label="Zoom Out"
          title="Zoom Out"
        >
          <MinusIcon size={20} />
        </button>
        <button
          style={cornerButtonStyle}
          onClick={c.handleGlobalZoom}
          aria-label="Global Zoom"
          title="Global Zoom"
        >
          <MaximizeIcon size={20} />
        </button>
      </div>

      {c.actionError && (
        <div style={{ position: 'absolute', top: 64, left: 12, right: 12, zIndex: 35, padding: '8px 12px', background: '#3a1414', border: '1px solid #ff6b6b', color: '#ff6b6b', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
          <span>{c.actionError}</span>
          <button onClick={() => c.setActionError(null)} style={{ background: 'none', border: 'none', color: '#ff6b6b', cursor: 'pointer', padding: '0 4px', fontSize: '16px' }}>
            ✕
          </button>
        </div>
      )}

      {/* Search overlay */}
      <BottomSheet open={activeSheet === 'search'} onClose={() => setActiveSheet(null)} title="Search">
        <div style={{ display: 'flex', marginBottom: '10px' }}>
          <SearchModeToggle mode={c.searchMode} onChange={c.setSearchMode} size="md" />
        </div>
        {c.searchMode === 'tags' ? (
          <div style={{ marginBottom: '14px', fontSize: '16px' }}>
            <TagQueryField
              criteria={c.tagCriteria}
              onChange={c.setTagCriteria}
              matchCount={c.tagMatchIds ? c.tagMatchIds.size : null}
              loading={c.searchLoading}
              rows={pickerRows('regular', true)}
              layout="inline"
              placeholder={SEARCH_PLACEHOLDERS.tags}
              inputStyle={{ padding: '10px 12px', background: '#1c1c1e', border: '1px solid #3a3a40', borderRadius: '8px' }}
            />
          </div>
        ) : (
          <input
            autoFocus
            type="text"
            placeholder={SEARCH_PLACEHOLDERS[c.searchMode]}
            value={c.searchTerm}
            onChange={(e) => c.setSearchTerm(e.target.value)}
            style={{ padding: '12px', width: '100%', boxSizing: 'border-box', marginBottom: '14px', background: '#1c1c1e', border: '1px solid #3a3a40', color: '#fff', borderRadius: '8px', fontSize: '16px' }}
          />
        )}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {c.searchMatches.map((u) => (
            <button
              key={u.id}
              onClick={() => {
                focusAndShowCard(u.id);
                c.setSearchTerm('');
                setActiveSheet('card');
              }}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                width: '100%',
                textAlign: 'left',
                padding: '12px 6px',
                minHeight: 48,
                background: 'none',
                border: 'none',
                borderBottom: '1px solid #2c2c2e',
                color: '#f0f0f0',
                cursor: 'pointer',
              }}
            >
              <span style={{ fontWeight: 500, fontSize: '14px' }}>{fullName(u)}</span>
              {u.phoneNumber && (
                <span style={{ color: '#9a9a9a', fontSize: '12px' }}>
                  {formatPhoneNumberDisplay(u.phoneNumber)}
                </span>
              )}
            </button>
          ))}
          {c.searchMode !== 'tags' && c.searchTerm.trim() !== '' && c.searchMatches.length === 0 && (
            <div style={{ color: '#9a9a9a', fontSize: '13px', padding: '16px 0', textAlign: 'center' }}>
              No matches found
            </div>
          )}
        </div>
      </BottomSheet>

      {/* Notifications drawer */}
      <BottomSheet open={activeSheet === 'notifications'} onClose={() => setActiveSheet(null)} title="Notifications">
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
          <button
            onClick={() => c.setRequestsTab('received')}
            style={tabButtonStyle(c.requestsTab === 'received')}
          >
            Incoming ({c.receivedRequests.length})
          </button>
          <button
            onClick={() => c.setRequestsTab('sent')}
            style={tabButtonStyle(c.requestsTab === 'sent')}
          >
            Outgoing ({c.sentRequests.length})
          </button>
          <button
            onClick={() => c.setRequestsTab('newUsers')}
            style={tabButtonStyle(c.requestsTab === 'newUsers')}
          >
            New Users ({c.newUsers.length})
          </button>
        </div>
        {c.requestsTab === 'received' ? (
          c.receivedRequests.length === 0 ? (
            <div style={{ color: '#9a9a9a', fontSize: '13px', padding: '16px 0', textAlign: 'center' }}>
              No incoming requests
            </div>
          ) : (
            c.receivedRequests.map((req) => (
              <div key={req.id} style={{ border: '1px solid #3a3a40', margin: '6px 0', padding: '12px', borderRadius: '8px', background: '#242426' }}>
                <button
                  onClick={() => focusAndShowCard(req.sender.id)}
                  style={{ background: 'none', border: 'none', color: '#6ab0ff', fontWeight: 'bold', textDecoration: 'underline', fontSize: '14px', cursor: 'pointer', padding: 0 }}
                >
                  {fullName(req.sender)}
                </button>
                <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                  <button
                    disabled={c.isActionPending(req.id)}
                    style={{ ...fabActionStyle, background: '#2a5f9e', borderColor: '#3d8bff', color: '#fff', flex: 1, cursor: c.isActionPending(req.id) ? 'not-allowed' : 'pointer' }}
                    onClick={() => c.handleAcceptRequest(req.id)}
                  >
                    {c.isActionPending(req.id) ? 'Accepting...' : 'Accept'}
                  </button>
                  <button
                    disabled={c.isActionPending(req.id)}
                    style={{ ...fabActionStyle, borderColor: '#d32f2f', color: '#ff6b6b', flex: 1, cursor: c.isActionPending(req.id) ? 'not-allowed' : 'pointer' }}
                    onClick={() => c.handleDeclineRequest(req.id)}
                  >
                    {c.isActionPending(req.id) ? 'Declining...' : 'Decline'}
                  </button>
                </div>
              </div>
            ))
          )
        ) : c.requestsTab === 'sent' ? (
          c.sentRequests.length === 0 ? (
            <div style={{ color: '#9a9a9a', fontSize: '13px', padding: '16px 0', textAlign: 'center' }}>
              No outgoing requests
            </div>
          ) : (
            c.sentRequests.map((req) => (
              <div key={req.id} style={{ textAlign: 'left', border: '1px solid #3a3a40', margin: '6px 0', padding: '12px', borderRadius: '8px', background: '#242426' }}>
                <button
                  onClick={() => focusAndShowCard(req.receiver.id)}
                  style={{ background: 'none', border: 'none', color: '#6ab0ff', fontWeight: 'bold', textDecoration: 'underline', fontSize: '14px', cursor: 'pointer', padding: 0 }}
                >
                  {fullName(req.receiver)}
                </button>
                <div style={{ color: '#9a9a9a', fontSize: '12px', marginTop: '4px' }}>Pending acceptance</div>
              </div>
            ))
          )
        ) : (
          c.newUsers.length === 0 ? (
            <div style={{ color: '#9a9a9a', fontSize: '13px', padding: '16px 0', textAlign: 'center' }}>
              No new users yet
            </div>
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
                    border: '1px solid #3a3a40',
                    margin: '6px 0',
                    padding: '12px',
                    borderRadius: '8px',
                    background: '#242426',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    <button
                      onClick={() => focusAndShowCard(u.id)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#6ab0ff',
                        fontWeight: 'bold',
                        textDecoration: 'underline',
                        fontSize: '14px',
                        cursor: 'pointer',
                        padding: 0,
                        textAlign: 'left',
                      }}
                    >
                      {fullName(u)}
                    </button>
                    <span style={{ color: '#9a9a9a', fontSize: '12px' }}>
                      {formatRelativeTime(u.createdAt)}
                    </span>
                  </div>
                  <div>
                    {isConnected ? (
                      <span
                        style={{
                          fontSize: '12px',
                          color: '#4caf50',
                          background: 'rgba(76, 175, 80, 0.1)',
                          padding: '4px 8px',
                          borderRadius: '6px',
                          border: '1px solid rgba(76, 175, 80, 0.3)',
                        }}
                      >
                        Connected
                      </span>
                    ) : incomingReqId ? (
                      <button
                        disabled={c.isActionPending(incomingReqId)}
                        style={{
                          ...fabActionStyle,
                          minHeight: 36,
                          padding: '0 12px',
                          background: '#2a5f9e',
                          borderColor: '#3d8bff',
                          color: '#fff',
                          cursor: c.isActionPending(incomingReqId) ? 'not-allowed' : 'pointer',
                        }}
                        onClick={() => c.handleAcceptRequest(incomingReqId)}
                      >
                        {c.isActionPending(incomingReqId) ? 'Accepting...' : 'Accept'}
                      </button>
                    ) : isSent ? (
                      <span style={{ fontSize: '12px', color: '#9a9a9a' }}>Pending</span>
                    ) : (
                      <button
                        disabled={c.isActionPending(u.id)}
                        style={{
                          ...fabActionStyle,
                          minHeight: 36,
                          padding: '0 12px',
                          background: '#2a5f9e',
                          borderColor: '#3d8bff',
                          color: '#fff',
                          cursor: c.isActionPending(u.id) ? 'not-allowed' : 'pointer',
                        }}
                        onClick={() => c.handleSendRequest(u.id)}
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
      </BottomSheet>

      {/* Settings sheet */}
      <BottomSheet open={activeSheet === 'settings'} onClose={() => setActiveSheet(null)} title="Settings">
        {/* Interface View Switcher */}
        {onSwitchToColumns && (
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '8px' }}>
              Interface View
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                style={tabButtonStyle(true)}
                title="Interactive Graph View"
              >
                <GridIcon size={14} style={{ marginRight: 6 }} /> Graph
              </button>
              <button
                type="button"
                style={tabButtonStyle(false)}
                onClick={() => {
                  setActiveSheet(null);
                  onSwitchToColumns();
                }}
                title="Traditional Miller Columns View"
              >
                <ColumnsIcon size={14} style={{ marginRight: 6 }} /> Columns
              </button>
            </div>
          </div>
        )}

        {/* Auto-Reject Threshold */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '4px' }}>
            Auto-Reject Threshold
          </label>
          <p style={{ fontSize: '12px', color: '#9a9a9a', margin: '0 0 6px' }}>
            Automatically reject requests from users farther than N hops away.
          </p>
          <select
            value={c.autoRejectDegree ?? 'off'}
            onChange={(e) => {
              const val = e.target.value === 'off' ? null : Number(e.target.value);
              c.handleUpdateAutoReject(val);
            }}
            style={{ width: '100%', padding: '8px', background: '#1c1c1e', border: '1px solid #3a3a40', color: '#f0f0f0', borderRadius: '6px', minHeight: 44 }}
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

        {/* Max Distance Slider */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 'bold', marginBottom: '4px' }}>
            <span>Max Connection Distance</span>
            <span style={{ color: '#6ab0ff' }}>{c.maxDistance === Infinity ? 'Unlimited' : `${c.maxDistance} hops`}</span>
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
            style={{ width: '100%', accentColor: '#3d8bff', height: 32 }}
          />
        </div>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
          <button style={tabButtonStyle(c.viewMode === 'global')} onClick={() => c.setViewMode('global')}>
            Global View
          </button>
          <button style={tabButtonStyle(c.viewMode === 'personal')} onClick={() => c.setViewMode('personal')}>
            Personal View
          </button>
        </div>
        {c.viewMode === 'personal' && (
          <div style={{ marginBottom: '14px', background: '#242426', padding: '12px', borderRadius: '8px', border: '1px solid #3a3a40' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
              <span>Degree:</span>
              <select
                value={c.degree}
                onChange={(e) => c.setDegree(Number(e.target.value))}
                style={{ padding: '6px 12px', background: '#1c1c1e', border: '1px solid #3a3a40', color: '#f0f0f0', borderRadius: '6px', minHeight: 40 }}
              >
                {[1, 2, 3, 4, 5, 6].map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <div style={{ marginTop: '8px', fontSize: '13px', color: '#f0f0f0' }}>
              {c.reachLoading && <span>Calculating...</span>}
              {c.reachError && <span style={{ color: '#ff6b6b' }}>{c.reachError}</span>}
              {!c.reachLoading && !c.reachError && c.reach && (
                <span>
                  <strong style={{ color: '#6ab0ff' }}>{c.reach.percentage.toFixed(1)}%</strong> of the network within {c.degree} degree
                  {c.degree > 1 ? 's' : ''} of you
                </span>
              )}
            </div>
          </div>
        )}
        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', minHeight: 44, cursor: 'pointer', fontSize: '13px' }}>
          <input
            type="checkbox"
            checked={c.showPendingConnections}
            onChange={(e) => c.setShowPendingConnections(e.target.checked)}
            style={{ accentColor: '#3d8bff', width: 18, height: 18 }}
          />
          Show pending connections
        </label>
        <button
          type="button"
          onClick={() => {
            c.loadData();
            setActiveSheet(null);
          }}
          style={{ ...fabActionStyle, marginTop: '8px', width: '100%', borderColor: '#3a3a40', color: '#6ab0ff', background: 'rgba(61, 139, 255, 0.12)' }}
        >
          Refresh Graph Now
        </button>
        <a
          href="/instructions"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            ...fabActionStyle,
            display: 'block',
            textAlign: 'center',
            textDecoration: 'none',
            marginTop: '10px',
            width: '100%',
            boxSizing: 'border-box',
            borderColor: '#3a3a40',
            color: '#f0f0f0',
            background: '#2c2c2e',
          }}
        >
          📖 Instructions & Guide
        </a>
      </BottomSheet>

      {/* Selected-user card */}
      <BottomSheet open={activeSheet === 'card' && c.selectedUser !== null} onClose={closeCardSheet}>
        {c.selectedUser && (
          <>
            {c.activePath && (
              <button
                onClick={() => setActiveSheet('path')}
                style={{ ...fabActionStyle, marginBottom: '10px', color: '#ff6b6b', borderColor: '#ff6b6b' }}
              >
                ← Back to path
              </button>
            )}
            <UserCard
              user={c.selectedUser}
              relationshipNames={c.getRelationshipNames(c.selectedUser.relationships)}
              onClose={closeCardSheet}
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
              onFindPath={() => findPathAndShowSheet(c.selectedUser!.id)}
              showFindPath={c.selectedUser.id !== currentUser.id}
              onDisconnect={() => c.handleDisconnect(c.selectedUser!.id)}
              showDisconnect={c.selectedUser.id !== currentUser.id && c.connectedUserIds.has(c.selectedUser.id)}
              isDisconnecting={c.isActionPending(c.selectedUser.id)}
              onSelectNode={(nodeId: string) => selectAndShowCard(nodeId)}
              isCurrentUser={c.selectedUser.id === currentUser.id}
              onBioUpdated={(newBio) => c.handleBioUpdated(c.selectedUser!.id, newBio)}
              onTagsChange={(update) => c.updateUserTags(c.selectedUser!.id, update)}
              onNoteChange={(note) => c.updateUserNote(c.selectedUser!.id, note)}
              compact={true}
            />
          </>
        )}
      </BottomSheet>

      {/* Path breadcrumb */}
      <BottomSheet open={activeSheet === 'path' && c.activePath !== null} onClose={closePathSheet} title="Path Details">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px' }}>
          {c.pathBreadcrumb.map((hop) => (
            <div key={hop.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', width: '100%' }}>
              <button
                onClick={() => selectAndShowCard(hop.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#6ab0ff',
                  textDecoration: 'underline',
                  padding: '4px 0',
                  minHeight: 32,
                  fontSize: '13px',
                  // fontWeight: index === 0 || index === c.pathBreadcrumb.length - 1 ? 600 : 400,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                {`${fullName(hop)}`}
              </button>
              {/* { < c.pathBreadcrumb.length - 1 && <span style={{ color: '#9a9a9a', paddingLeft: '4px', fontSize: '11px', lineHeight: '12px' }}>↓</span>} */}
            </div>
          ))}
        </div>
        <button style={{ ...fabActionStyle, marginTop: '10px', width: '100%', minHeight: 38, fontSize: '13px' }} onClick={() => { c.handleClearPath(); setActiveSheet(null); }}>
          Clear path
        </button>
      </BottomSheet>
    </div>
  );
};
