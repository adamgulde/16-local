import { useCallback, useRef, useState } from 'react';
import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d';
import { fullName } from '../services/userService';
import type { User, Node } from '../services/userService';
import { useGraphController } from '../graph/useGraphController';
import {
  drawNode,
  drawPathArrow,
  linkColorFor,
  linkLineDashFor,
  paintNodePointerArea,
  useGraphPhysics,
} from '../graph/rendering';
import type { GNode, GLink, LinkExtra } from '../graph/rendering';
import { UserCard } from './UserCard';
import { CollapsibleSection } from './CollapsibleSection';

interface GraphContainerProps {
  currentUser: User;
  onLogout: () => void;
}

const ZOOM_STEP_FACTOR = 1.6;

export const GraphContainer = ({ currentUser, onLogout }: GraphContainerProps) => {
  const fgRef = useRef<ForceGraphMethods<GNode, GLink> | undefined>(undefined);
  const c = useGraphController(currentUser, fgRef);

  const graphResizeObserverRef = useRef<ResizeObserver | null>(null);
  const [graphSize, setGraphSize] = useState({ width: 0, height: 0 });

  // A callback ref (rather than useRef + useEffect) so the observer attaches whenever this
  // div actually mounts — including when it wasn't present on the very first render because
  // the component was still showing the loading state.
  const graphWrapperRef = useCallback((node: HTMLDivElement | null) => {
    graphResizeObserverRef.current?.disconnect();
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setGraphSize({ width, height });
    });
    observer.observe(node);
    graphResizeObserverRef.current = observer;
  }, []);

  useGraphPhysics(fgRef, c.graphData.links, c.distanceFromMe);

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

  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '10px', background: '#1c1c1e', borderBottom: '1px solid #3a3a40', display: 'flex', gap: '10px', alignItems: 'center', position: 'relative' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <input
            type="text"
            placeholder="Search users..."
            value={c.searchTerm}
            onChange={(e) => {
              c.setSearchTerm(e.target.value);
              c.setShowSuggestions(true);
            }}
            onFocus={() => c.setShowSuggestions(true)}
            onBlur={() => c.setShowSuggestions(false)}
            style={{ padding: '8px', width: '100%', boxSizing: 'border-box' }}
          />
          {c.showSuggestions && c.searchMatches.length > 0 && (
            <div
              // Prevent the input's onBlur from firing before the click below registers.
              onMouseDown={(e) => e.preventDefault()}
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                zIndex: 30,
                background: '#1c1c1e',
                border: '1px solid #3a3a40',
                borderRadius: '4px',
                boxShadow: '0 2px 6px rgba(0,0,0,0.6)',
                maxHeight: '260px',
                overflowY: 'auto',
              }}
            >
              {c.searchMatches.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => c.handleSelectSearchResult(u.id)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '8px 10px',
                    background: 'none',
                    border: 'none',
                    borderBottom: '1px solid #3a3a40',
                    cursor: 'pointer',
                  }}
                >
                  {fullName(u)}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={() => c.focusUser(currentUser.id)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', color: '#6ab0ff' }}
        >
          {fullName(currentUser)}
        </button>
        <button onClick={onLogout}>Log out</button>
      </div>
      {c.actionError && (
        <div style={{ padding: '8px 10px', background: '#3a1414', color: '#ff6b6b' }}>
          {c.actionError}
          <button onClick={() => c.setActionError(null)} style={{ marginLeft: '10px' }}>
            Dismiss
          </button>
        </div>
      )}
      <div style={{ flex: 1, display: 'flex', position: 'relative', minHeight: 0 }}>
        {/* Docked detail panel: the selected user's card, always reserving its width so the
            canvas never resizes/jumps as selection changes. */}
        <div style={{ width: '400px', background: '#1c1c1e', borderRight: '1px solid #3a3a40', padding: '14px', overflowY: 'auto', minHeight: 0 }}>
          {c.selectedUser ? (
            <UserCard
              user={c.selectedUser}
              relationshipNames={c.getRelationshipNames(c.selectedUser.relationships)}
              onClose={c.clearSelection}
              onSendRequest={() => c.handleSendRequest(c.selectedUser!.id)}
              showSendRequest={c.selectedUser.id !== currentUser.id && !currentUser.relationships.includes(c.selectedUser.id)}
              onFindPath={() => c.handleFindPath(c.selectedUser!.id)}
              showFindPath={c.selectedUser.id !== currentUser.id && !currentUser.relationships.includes(c.selectedUser.id)}
              onSelectNode={(nodeId: string) => c.focusUser(nodeId)}
              isCurrentUser={c.selectedUser.id === currentUser.id}
            />
          ) : (
            <p style={{ color: '#9a9a9a' }}>Select a user on the graph to see their details.</p>
          )}
        </div>

        <div ref={graphWrapperRef} style={{ flex: 1, position: 'relative' }}>
          <ForceGraph2D<Node, LinkExtra>
            ref={fgRef}
            width={graphSize.width}
            height={graphSize.height}
            graphData={c.graphData}
            backgroundColor="#000000"
            nodeCanvasObject={(node, ctx, globalScale) =>
              drawNode(node, ctx, globalScale, {
                currentUserId: currentUser.id,
                distanceFromMe: c.distanceFromMe,
                highlightNodes: c.highlightNodes,
                activePath: c.activePath,
              })
            }
            linkColor={(link) =>
              linkColorFor(link as GLink, { highlightLinks: c.highlightLinks, activePath: c.activePath })
            }
            linkLineDash={(link) => linkLineDashFor(link as GLink)}
            nodePointerAreaPaint={paintNodePointerArea}
            linkCanvasObjectMode={() => 'after'}
            linkCanvasObject={(link, ctx, globalScale) =>
              drawPathArrow(link as GLink, ctx, globalScale, c.pathLinkTarget)
            }
            onNodeClick={(node) => c.selectNode(String(node.id))}
            onBackgroundClick={c.clearSelection}
          />
          <div
            style={{
              position: 'absolute',
              bottom: 8,
              left: 8,
              zIndex: 10,
              color: '#0f0',
              background: 'rgba(0,0,0,0.6)',
              font: '11px monospace',
              padding: '2px 6px',
              borderRadius: '3px',
              pointerEvents: 'none',
            }}
          >
            {c.fps} fps
          </div>
        </div>

        {/* Docked accordion: Notifications stacked above View, both collapsible so neither
            hogs space when the other is what's actually needed. */}
        <div style={{ width: '280px', background: '#1c1c1e', borderLeft: '1px solid #3a3a40', padding: '0 10px', overflowY: 'auto', minHeight: 0 }}>
          <CollapsibleSection title="Notifications" badge={c.receivedRequests.length} defaultOpen={false}>
            <div style={{ display: 'flex', gap: '5px', marginBottom: '10px' }}>
              <button
                onClick={() => c.setRequestsTab('received')}
                style={{ fontWeight: c.requestsTab === 'received' ? 'bold' : 'normal' }}
                aria-pressed={c.requestsTab === 'received'}
              >
                Incoming ({c.receivedRequests.length})
              </button>
              <button
                onClick={() => c.setRequestsTab('sent')}
                style={{ fontWeight: c.requestsTab === 'sent' ? 'bold' : 'normal' }}
                aria-pressed={c.requestsTab === 'sent'}
              >
                Outgoing ({c.sentRequests.length})
              </button>
            </div>
            {c.requestsTab === 'received'
              ? c.receivedRequests.map((req) => (
                  <div
                    key={req.id}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid #3a3a40', margin: '5px 0', padding: '8px 10px', borderRadius: '4px' }}
                  >
                    <button
                      onClick={() => c.focusUser(req.sender.id)}
                      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline', color: '#6ab0ff', fontWeight: 'bold' }}
                    >
                      {fullName(req.sender)}
                    </button>
                    <div style={{ display: 'flex', gap: '5px' }}>
                      <button onClick={() => c.handleAcceptRequest(req.id)}>Accept</button>
                      <button onClick={() => c.handleDeclineRequest(req.id)}>Decline</button>
                    </div>
                  </div>
                ))
              : c.sentRequests.map((req) => (
                  <div key={req.id} style={{ textAlign: 'left', border: '1px solid #3a3a40', margin: '5px 0', padding: '8px 10px', borderRadius: '4px' }}>
                    <button
                      onClick={() => c.focusUser(req.receiver.id)}
                      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline', color: '#6ab0ff', fontWeight: 'bold' }}
                    >
                      {fullName(req.receiver)}
                    </button>
                  </div>
                ))}
          </CollapsibleSection>

          <CollapsibleSection title="View" defaultOpen={false}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
              <button onClick={c.handleLocateMe}>Locate Me</button>
              <button onClick={c.handleGlobalZoom}>Global Zoom</button>
              <button onClick={() => c.handleZoomStep(ZOOM_STEP_FACTOR)}>Zoom In</button>
              <button onClick={() => c.handleZoomStep(1 / ZOOM_STEP_FACTOR)}>Zoom Out</button>
            </div>
            <label style={{ display: 'block', marginTop: '8px' }}>
              <input
                type="checkbox"
                checked={c.showPendingConnections}
                onChange={(e) => c.setShowPendingConnections(e.target.checked)}
              />{' '}
              Show pending connections
            </label>
          </CollapsibleSection>

          <CollapsibleSection title="Path">
            {c.pathBreadcrumb.length > 0 ? (
              <>
                <button onClick={c.handleClearPath} style={{ marginBottom: '8px' }}>
                  Close
                </button>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
                  {c.pathBreadcrumb.map((hop, index) => (
                    <button
                      key={hop.id}
                      onClick={() => c.focusUser(hop.id)}
                      style={{ background: 'none', border: 'none', color: '#6ab0ff', cursor: 'pointer', textDecoration: 'underline', padding: 0, textAlign: 'left' }}
                    >
                      {index + 1}. {fullName(hop)}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p style={{ margin: 0, color: '#9a9a9a', fontSize: '13px', textAlign: 'left' }}>
                Find Path on another person to find the fewest connections to them.
              </p>
            )}
          </CollapsibleSection>
        </div>
      </div>
      <div style={{ padding: '10px', background: '#1c1c1e', borderTop: '1px solid #3a3a40', display: 'flex', gap: '15px', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '5px' }}>
          <button
            onClick={() => c.setViewMode('global')}
            style={{ fontWeight: c.viewMode === 'global' ? 'bold' : 'normal' }}
            aria-pressed={c.viewMode === 'global'}
          >
            Global View
          </button>
          <button
            onClick={() => c.setViewMode('personal')}
            style={{ fontWeight: c.viewMode === 'personal' ? 'bold' : 'normal' }}
            aria-pressed={c.viewMode === 'personal'}
          >
            Personal View
          </button>
        </div>
        {c.viewMode === 'personal' && (
          <>
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
            {c.reachLoading && <span>Calculating...</span>}
            {c.reachError && <span style={{ color: '#ff6b6b' }}>{c.reachError}</span>}
            {!c.reachLoading && !c.reachError && c.reach && (
              <span>
                <strong>{c.reach.percentage.toFixed(1)}%</strong> of the network ({c.reach.reachableCount} of{' '}
                {c.reach.totalUsers - 1} other users) is within {c.degree} degree{c.degree > 1 ? 's' : ''} of you
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
};
