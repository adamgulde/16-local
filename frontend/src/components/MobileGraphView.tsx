import { useCallback, useRef, useState, type CSSProperties } from 'react';
import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d';
import { fullName } from '../services/userService';
import type { User, Node } from '../services/userService';
import { useGraphController } from '../graph/useGraphController';
import {
  drawGrid,
  drawNode,
  linkColorFor,
  linkLineDashFor,
  paintNodePointerArea,
  useGraphPhysics,
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
  CloseIcon,
  SlidersIcon,
} from './Icons';

interface MobileGraphViewProps {
  currentUser: User;
  onLogout: () => void;
}

type Sheet = 'card' | 'path' | 'notifications' | 'settings' | 'search' | null;

const ZOOM_STEP_FACTOR = 1.6;

// Real touch targets (44pt minimum, Apple HIG) — desktop's small inline-styled buttons don't
// carry over to a touch UI.
const iconButtonStyle: CSSProperties = {
  minWidth: 44,
  minHeight: 44,
  fontSize: '20px',
  background: 'rgba(28,28,30,0.9)',
  border: '1px solid #3a3a40',
  borderRadius: '22px',
  color: '#f0f0f0',
  position: 'relative',
};

const fabActionStyle: CSSProperties = {
  minWidth: 44,
  minHeight: 44,
  padding: '0 14px',
  background: 'rgba(28,28,30,0.95)',
  border: '1px solid #3a3a40',
  borderRadius: '22px',
  color: '#f0f0f0',
  whiteSpace: 'nowrap',
};

export const MobileGraphView = ({ currentUser, onLogout }: MobileGraphViewProps) => {
  const fgRef = useRef<ForceGraphMethods<GNode, GLink> | undefined>(undefined);
  const c = useGraphController(currentUser, fgRef);

  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const rootRef = useCallback((node: HTMLDivElement | null) => {
    resizeObserverRef.current?.disconnect();
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setCanvasSize({ width, height });
    });
    observer.observe(node);
    resizeObserverRef.current = observer;
  }, []);

  useGraphPhysics(fgRef, c.graphData.links, c.distanceFromMe);

  const [activeSheet, setActiveSheet] = useState<Sheet>(null);
  const [fabOpen, setFabOpen] = useState(false);

  // Tapping a node (on the graph, a search result, a breadcrumb, a UserCard connection link)
  // always shows that person's card. Per the mobile design decision, this does NOT discard an
  // open path — selectNode already leaves activePath alone unless the tapped node is off-path,
  // and the card sheet always offers a way back to the path when one exists (see below).
  const selectAndShowCard = useCallback(
    (id: string) => {
      c.selectNode(id);
      setActiveSheet('card');
    },
    [c]
  );

  const focusAndShowCard = useCallback(
    (id: string) => {
      c.focusUser(id);
      setActiveSheet('card');
    },
    [c]
  );

  const findPathAndShowSheet = useCallback(
    async (targetId: string) => {
      await c.handleFindPath(targetId);
      setActiveSheet('path');
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
    return <div style={{ padding: '2rem' }}>Loading directory...</div>;
  }

  if (c.initError) {
    return (
      <div style={{ padding: '2rem' }}>
        <p style={{ color: '#ff6b6b' }}>{c.initError}</p>
        <button onClick={c.loadData}>Retry</button>
      </div>
    );
  }

  const showPathChip = c.activePath !== null && activeSheet !== 'path';

  return (
    <div ref={rootRef} style={{ position: 'relative', width: '100%', height: '100vh', overflow: 'hidden', background: '#121214' }}>
      <ForceGraph2D<Node, LinkExtra>
        ref={fgRef}
        width={canvasSize.width}
        height={canvasSize.height}
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
          })
        }
        linkColor={(link) =>
          linkColorFor(link as GLink, {
            highlightLinks: c.highlightLinks,
            activePath: c.activePath,
            maxDistance: c.maxDistance,
            distanceFromMe: c.distanceFromMe,
          })
        }
        linkLineDash={(link) => linkLineDashFor(link as GLink)}
        nodePointerAreaPaint={paintNodePointerArea}
        onNodeClick={(node) => selectAndShowCard(String(node.id))}
        onBackgroundClick={() => {
          if (activeSheet === 'card') closeCardSheet();
        }}
      />

      {/* Top bar */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 15, display: 'flex', gap: '8px', alignItems: 'center', padding: '10px 12px' }}>
        <button style={iconButtonStyle} onClick={() => setActiveSheet('search')} aria-label="Search">
          <SearchIcon size={20} />
        </button>
        <div style={{ flex: 1 }} />
        <button style={{ ...iconButtonStyle, color: '#6ab0ff', fontSize: '14px', fontWeight: 'bold' }} onClick={() => focusAndShowCard(currentUser.id)}>
          {currentUser.firstName[0]}
        </button>
        <button style={iconButtonStyle} onClick={() => setActiveSheet('notifications')} aria-label="Notifications">
          <MailboxIcon size={20} />
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
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 4px',
              }}
            >
              {c.receivedRequests.length}
            </span>
          )}
        </button>
        <button style={iconButtonStyle} onClick={() => setActiveSheet('settings')} aria-label="Settings">
          <SettingsIcon size={20} />
        </button>
      </div>

      {/* Path chip: reachable at any time a path is open but its sheet isn't the active one */}
      {showPathChip && (
        <button
          onClick={() => setActiveSheet('path')}
          style={{
            position: 'absolute',
            bottom: 70,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 15,
            ...fabActionStyle,
            color: '#ff6b6b',
            borderColor: '#ff6b6b',
          }}
        >
          ● Path open — view
        </button>
      )}

      {/* Expandable FAB: view controls */}
      <div style={{ position: 'absolute', bottom: 16, right: 16, zIndex: 15, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
        {fabOpen && (
          <>
            <button style={{ ...fabActionStyle, display: 'flex', alignItems: 'center', gap: '6px' }} onClick={() => { c.handleZoomStep(1 / ZOOM_STEP_FACTOR); }}>
              <MinusIcon size={16} /> Zoom Out
            </button>
            <button style={{ ...fabActionStyle, display: 'flex', alignItems: 'center', gap: '6px' }} onClick={() => { c.handleZoomStep(ZOOM_STEP_FACTOR); }}>
              <PlusIcon size={16} /> Zoom In
            </button>
            <button style={{ ...fabActionStyle, display: 'flex', alignItems: 'center', gap: '6px' }} onClick={() => { c.handleGlobalZoom(); setFabOpen(false); }}>
              <MaximizeIcon size={16} /> Global Zoom
            </button>
            <button style={{ ...fabActionStyle, display: 'flex', alignItems: 'center', gap: '6px' }} onClick={() => { c.handleLocateMe(); setFabOpen(false); }}>
              <TargetIcon size={16} /> Locate Me
            </button>
          </>
        )}
        <button
          style={{ ...iconButtonStyle, width: 52, height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setFabOpen((v) => !v)}
          aria-label="View controls"
        >
          {fabOpen ? <CloseIcon size={22} /> : <SlidersIcon size={22} />}
        </button>
      </div>

      {c.actionError && (
        <div style={{ position: 'absolute', top: 64, left: 12, right: 12, zIndex: 16, padding: '8px 10px', background: '#3a1414', color: '#ff6b6b', borderRadius: '8px' }}>
          {c.actionError}
          <button onClick={() => c.setActionError(null)} style={{ marginLeft: '10px' }}>
            Dismiss
          </button>
        </div>
      )}

      {/* Search overlay */}
      <BottomSheet open={activeSheet === 'search'} onClose={() => setActiveSheet(null)} title="Search">
        <input
          autoFocus
          type="text"
          placeholder="Search users or tags..."
          value={c.searchTerm}
          onChange={(e) => c.setSearchTerm(e.target.value)}
          style={{ padding: '10px', width: '100%', boxSizing: 'border-box', marginBottom: '8px', background: '#1c1c1e', border: '1px solid #3a3a40', color: '#fff', borderRadius: '6px' }}
        />
        <div style={{ display: 'flex', gap: '16px', marginBottom: '12px', fontSize: '13px', color: '#9a9a9a' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={c.searchNames}
              onChange={(e) => c.setSearchNames(e.target.checked)}
              style={{ accentColor: '#3d8bff' }}
            />
            Names
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={c.searchTags}
              onChange={(e) => c.setSearchTags(e.target.checked)}
              style={{ accentColor: '#3d8bff' }}
            />
            Tags
          </label>
        </div>
        {c.searchMatches.map((u) => (
          <button
            key={u.id}
            onClick={() => {
              focusAndShowCard(u.id);
              c.setSearchTerm('');
              setActiveSheet('card');
            }}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              padding: '12px 6px',
              minHeight: 44,
              background: 'none',
              border: 'none',
              borderBottom: '1px solid #3a3a40',
              color: '#f0f0f0',
            }}
          >
            {fullName(u)}
          </button>
        ))}
      </BottomSheet>

      {/* Notifications drawer */}
      <BottomSheet open={activeSheet === 'notifications'} onClose={() => setActiveSheet(null)} title="Notifications">
        <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
          <button
            onClick={() => c.setRequestsTab('received')}
            style={{ ...fabActionStyle, fontWeight: c.requestsTab === 'received' ? 'bold' : 'normal' }}
          >
            Incoming ({c.receivedRequests.length})
          </button>
          <button
            onClick={() => c.setRequestsTab('sent')}
            style={{ ...fabActionStyle, fontWeight: c.requestsTab === 'sent' ? 'bold' : 'normal' }}
          >
            Outgoing ({c.sentRequests.length})
          </button>
        </div>
        {c.requestsTab === 'received'
          ? c.receivedRequests.map((req) => (
              <div key={req.id} style={{ border: '1px solid #3a3a40', margin: '6px 0', padding: '10px', borderRadius: '8px' }}>
                <button
                  onClick={() => focusAndShowCard(req.sender.id)}
                  style={{ background: 'none', border: 'none', color: '#6ab0ff', fontWeight: 'bold', textDecoration: 'underline' }}
                >
                  {fullName(req.sender)}
                </button>
                <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                  <button style={fabActionStyle} onClick={() => c.handleAcceptRequest(req.id)}>
                    Accept
                  </button>
                  <button style={fabActionStyle} onClick={() => c.handleDeclineRequest(req.id)}>
                    Decline
                  </button>
                </div>
              </div>
            ))
          : c.sentRequests.map((req) => (
              <div key={req.id} style={{ textAlign: 'left', border: '1px solid #3a3a40', margin: '6px 0', padding: '10px', borderRadius: '8px' }}>
                <button
                  onClick={() => focusAndShowCard(req.receiver.id)}
                  style={{ background: 'none', border: 'none', color: '#6ab0ff', fontWeight: 'bold', textDecoration: 'underline' }}
                >
                  {fullName(req.receiver)}
                </button>
              </div>
            ))}
      </BottomSheet>

      {/* Settings sheet */}
      <BottomSheet open={activeSheet === 'settings'} onClose={() => setActiveSheet(null)} title="Settings">
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

        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
          <button style={{ ...fabActionStyle, fontWeight: c.viewMode === 'global' ? 'bold' : 'normal' }} onClick={() => c.setViewMode('global')}>
            Global View
          </button>
          <button style={{ ...fabActionStyle, fontWeight: c.viewMode === 'personal' ? 'bold' : 'normal' }} onClick={() => c.setViewMode('personal')}>
            Personal View
          </button>
        </div>
        {c.viewMode === 'personal' && (
          <div style={{ marginBottom: '12px' }}>
            <label>
              Degree:{' '}
              <select value={c.degree} onChange={(e) => c.setDegree(Number(e.target.value))}>
                {[1, 2, 3, 4, 5, 6].map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <div style={{ marginTop: '6px' }}>
              {c.reachLoading && <span>Calculating...</span>}
              {c.reachError && <span style={{ color: '#ff6b6b' }}>{c.reachError}</span>}
              {!c.reachLoading && !c.reachError && c.reach && (
                <span>
                  <strong>{c.reach.percentage.toFixed(1)}%</strong> of the network within {c.degree} degree
                  {c.degree > 1 ? 's' : ''} of you
                </span>
              )}
            </div>
          </div>
        )}
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', minHeight: 44 }}>
          <input
            type="checkbox"
            checked={c.showPendingConnections}
            onChange={(e) => c.setShowPendingConnections(e.target.checked)}
          />
          Show pending connections
        </label>
        <button onClick={onLogout} style={{ ...fabActionStyle, marginTop: '12px', borderColor: '#ff6b6b', color: '#ff6b6b' }}>
          Log out
        </button>
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
              showSendRequest={c.selectedUser.id !== currentUser.id && !currentUser.relationships.includes(c.selectedUser.id)}
              onFindPath={() => findPathAndShowSheet(c.selectedUser!.id)}
              showFindPath={c.selectedUser.id !== currentUser.id && !currentUser.relationships.includes(c.selectedUser.id)}
              onDisconnect={() => c.handleDisconnect(c.selectedUser!.id)}
              showDisconnect={c.selectedUser.id !== currentUser.id && currentUser.relationships.includes(c.selectedUser.id)}
              onSelectNode={(nodeId: string) => selectAndShowCard(nodeId)}
              isCurrentUser={c.selectedUser.id === currentUser.id}
            />
          </>
        )}
      </BottomSheet>

      {/* Path breadcrumb */}
      <BottomSheet open={activeSheet === 'path' && c.activePath !== null} onClose={closePathSheet} title="Path">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
          {c.pathBreadcrumb.map((hop, index) => (
            <div key={hop.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
              <button
                onClick={() => selectAndShowCard(hop.id)}
                style={{ background: 'none', border: 'none', color: '#6ab0ff', textDecoration: 'underline', padding: '6px 0', minHeight: 44 }}
              >
                {fullName(hop)}
              </button>
              {index < c.pathBreadcrumb.length - 1 && <span style={{ color: '#9a9a9a' }}>↓</span>}
            </div>
          ))}
        </div>
        <button style={{ ...fabActionStyle, marginTop: '10px' }} onClick={() => { c.handleClearPath(); setActiveSheet(null); }}>
          Clear path
        </button>
      </BottomSheet>
    </div>
  );
};
