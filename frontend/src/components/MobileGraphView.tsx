import { useCallback, useRef, useState, type CSSProperties } from 'react';
import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d';
import type { User } from '../services/userService';
import { useGraphController } from '../graph/useGraphController';
import { contactFullName } from '../graph/mapping';
import { GRAPH_SEARCH_MODES, GRAPH_SEARCH_PLACEHOLDERS } from '../graph/graphSearch';
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
import type { GNode, GLink } from '../graph/rendering';
import { ContactCard } from './ContactCard';
import { AddPersonForm } from './AddPersonForm';
import { BottomSheet } from './BottomSheet';
import { ShareRequestsPanel } from './ShareRequestsPanel';
import { SharingSettingsPanel } from './SharingSettingsPanel';
import { ShareModePanel } from './ShareModePanel';
import { OtherGraphView } from './OtherGraphView';
import {
  SearchIcon,
  MailboxIcon,
  SettingsIcon,
  TargetIcon,
  PlusIcon,
  MinusIcon,
  MaximizeIcon,
  ColumnsIcon,
  GridIcon,
} from './Icons';
import { SearchModeToggle } from './tags/SearchModeToggle';
import { TagQueryField } from './tags/TagQueryField';
import { pickerRows } from './tags/tagTheme';
import { formatPhoneNumberDisplay } from '../utils/phoneUtils';

interface MobileGraphViewProps {
  currentUser: User;
  onSwitchToColumns?: () => void;
  initialFocusUserId?: string | null;
  initialFindPathTargetId?: string | null;
}

type Sheet = 'card' | 'path' | 'notifications' | 'settings' | 'search' | 'addPerson' | null;

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
  const c = useGraphController(fgRef);
  const hasOrientedRef = useRef(false);

  const [graphReady, setGraphReady] = useState(false);

  const handleEngineStop = () => {
    if (hasOrientedRef.current) return;
    hasOrientedRef.current = true;
    if (initialFocusUserId) c.focusUser(initialFocusUserId, 0);
    else if (initialFindPathTargetId) c.handleFindPath(initialFindPathTargetId);
    else c.handleLocateMe(0);
    setGraphReady(true);
  };

  const resizeObserverRef = useRef<ResizeObserver | null>(null);
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

  useGraphPhysics(fgRef, c.forceGraphData.links);

  const [activeSheet, setActiveSheet] = useState<Sheet>(null);

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
    (targetId: string) => {
      c.handleFindPath(targetId);
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
    return (
      <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#121214', color: '#9a9a9a' }}>
        Loading your graph...
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

  const selected = c.selectedNode;

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
      <div style={{ visibility: graphReady ? 'visible' : 'hidden' }}>
        <ForceGraph2D<GNode, GLink>
          ref={fgRef}
          width={canvasSize.width}
          height={canvasSize.height}
          graphData={c.forceGraphData}
          backgroundColor="#121214"
          enableNodeDrag={false}
          {...STATIC_LAYOUT}
          onEngineStop={handleEngineStop}
          d3VelocityDecay={0.4}
          onRenderFramePre={(ctx, globalScale) => drawGrid(ctx, globalScale)}
          nodeCanvasObject={(node, ctx, globalScale) =>
            drawNode(node, ctx, globalScale, {
              highlightNodes: c.highlightNodes,
              activePath: c.activePath,
              filterNodes: c.tagMatchIds,
              previewHiddenIds: c.shareModePreviewIds,
            })
          }
          linkColor={(link) =>
            linkColorFor(link as GLink, {
              highlightLinks: c.highlightLinks,
              activePath: c.activePath,
              filterNodes: c.tagMatchIds,
            })
          }
          linkLineDash={(link) => linkLineDashFor(link as GLink)}
          nodePointerAreaPaint={paintNodePointerArea}
          linkCanvasObjectMode={() => 'after'}
          linkCanvasObject={(link, ctx, globalScale) =>
            drawPathArrow(link as GLink, ctx, globalScale, c.pathLinkTarget)
          }
          onNodeClick={(node) => (c.shareMode ? c.toggleShareModeContact(String(node.id)) : selectAndShowCard(String(node.id)))}
          onBackgroundClick={() => {
            if (activeSheet === 'card') closeCardSheet();
          }}
        />
      </div>

      {/* TOP-LEFT CORNER: Search & Add Person & View Switcher */}
      <div style={{ position: 'absolute', top: 'max(12px, env(safe-area-inset-top, 12px))', left: 'max(12px, env(safe-area-inset-left, 12px))', display: 'flex', alignItems: 'center', gap: '8px', zIndex: 25 }}>
        {onSwitchToColumns && (
          <button
            style={{ ...cornerButtonStyle, background: 'rgba(61, 139, 255, 0.18)', borderColor: '#3d8bff', color: '#6ab0ff' }}
            onClick={onSwitchToColumns}
            aria-label="Switch to Miller Columns"
            title="Columns View"
          >
            <ColumnsIcon size={20} />
          </button>
        )}
        <button style={cornerButtonStyle} onClick={() => setActiveSheet('search')} aria-label="Search" title="Search">
          <SearchIcon size={20} />
          {c.tagMatchIds && <span style={{ position: 'absolute', top: 4, right: 4, width: 8, height: 8, borderRadius: '4px', background: '#3d8bff' }} />}
        </button>
        <button style={cornerButtonStyle} onClick={() => setActiveSheet('addPerson')} aria-label="Add person" title="Add person">
          <PlusIcon size={20} />
        </button>
      </div>

      {/* TOP-RIGHT CORNER: User Identity, Share requests, Settings */}
      <div style={{ position: 'absolute', top: 'max(12px, env(safe-area-inset-top, 12px))', right: 'max(12px, env(safe-area-inset-right, 12px))', display: 'flex', alignItems: 'center', gap: '8px', zIndex: 25 }}>
        <button
          style={{ ...cornerButtonStyle, borderColor: '#3d8bff', color: '#6ab0ff', fontWeight: 'bold', fontSize: '15px' }}
          onClick={() => c.selfNode && focusAndShowCard(c.selfNode.id)}
          aria-label="My Profile"
          title="My Profile"
        >
          {currentUser.firstName ? currentUser.firstName[0].toUpperCase() : 'U'}
        </button>
        <button style={cornerButtonStyle} onClick={() => setActiveSheet('notifications')} aria-label="Share requests" title="Share requests">
          <MailboxIcon size={20} />
          {c.pendingIncomingCount > 0 && (
            <span
              style={{
                position: 'absolute',
                top: 2,
                right: 2,
                minWidth: 16,
                height: 16,
                padding: '0 4px',
                borderRadius: '8px',
                background: '#ff6b6b',
                color: '#fff',
                fontSize: '10px',
                fontWeight: 'bold',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {c.pendingIncomingCount}
            </span>
          )}
        </button>
        <button style={cornerButtonStyle} onClick={() => setActiveSheet('settings')} aria-label="Settings" title="Settings">
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
            style={{ background: 'rgba(255, 107, 107, 0.2)', border: '1px solid rgba(255, 107, 107, 0.5)', borderRadius: '12px', padding: '2px 8px', color: '#ff9e9e', cursor: 'pointer', fontWeight: 600, fontSize: '12px' }}
          >
            Details
          </button>
          <button
            type="button"
            onClick={c.handleClearPath}
            style={{ background: 'none', border: 'none', color: '#9a9a9a', cursor: 'pointer', fontSize: '14px', padding: '0 0 0 4px', display: 'flex', alignItems: 'center', lineHeight: 1 }}
            title="Clear path"
          >
            ✕
          </button>
        </div>
      )}

      {/* Path chip if active (bottom-left) */}
      {c.activePath !== null && (
        <div style={{ position: 'absolute', bottom: 'max(16px, env(safe-area-inset-bottom, 16px))', left: 'max(16px, env(safe-area-inset-left, 16px))', zIndex: 25 }}>
          <button
            onClick={() => setActiveSheet('path')}
            style={{ ...cornerButtonStyle, width: 'auto', minWidth: 44, padding: '0 12px', gap: '6px', fontSize: '12px', fontWeight: 600, color: '#ff6b6b', borderColor: '#ff6b6b', background: 'rgba(58, 20, 20, 0.92)' }}
          >
            ● Path ({c.pathBreadcrumb.length - 1} hops)
          </button>
        </div>
      )}

      {/* BOTTOM-RIGHT CORNER: Navigation HUD (Locate, Zoom In, Zoom Out, Global Zoom) */}
      <div style={{ position: 'absolute', bottom: 'max(16px, env(safe-area-inset-bottom, 16px))', right: 'max(16px, env(safe-area-inset-right, 16px))', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', zIndex: 25 }}>
        <button style={cornerButtonStyle} onClick={() => c.handleLocateMe()} aria-label="Locate Me" title="Locate Me">
          <TargetIcon size={20} />
        </button>
        <button style={cornerButtonStyle} onClick={() => c.handleZoomStep(ZOOM_STEP_FACTOR)} aria-label="Zoom In" title="Zoom In">
          <PlusIcon size={20} />
        </button>
        <button style={cornerButtonStyle} onClick={() => c.handleZoomStep(1 / ZOOM_STEP_FACTOR)} aria-label="Zoom Out" title="Zoom Out">
          <MinusIcon size={20} />
        </button>
        <button style={cornerButtonStyle} onClick={c.handleGlobalZoom} aria-label="Global Zoom" title="Global Zoom">
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
          <SearchModeToggle mode={c.searchMode} onChange={c.setSearchMode} modes={GRAPH_SEARCH_MODES} size="md" />
        </div>
        {c.searchMode === 'tags' ? (
          <div style={{ marginBottom: '14px', fontSize: '16px' }}>
            <TagQueryField
              criteria={c.tagCriteria}
              onChange={c.setTagCriteria}
              matchCount={c.tagMatchIds ? c.tagMatchIds.size : null}
              loading={false}
              rows={pickerRows('regular', true)}
              layout="inline"
              placeholder={GRAPH_SEARCH_PLACEHOLDERS.tags}
              inputStyle={{ padding: '10px 12px', background: '#1c1c1e', border: '1px solid #3a3a40', borderRadius: '8px' }}
            />
          </div>
        ) : (
          <input
            autoFocus
            type="text"
            placeholder={GRAPH_SEARCH_PLACEHOLDERS[c.searchMode]}
            value={c.searchTerm}
            onChange={(e) => c.setSearchTerm(e.target.value)}
            style={{ padding: '12px', width: '100%', boxSizing: 'border-box', marginBottom: '14px', background: '#1c1c1e', border: '1px solid #3a3a40', color: '#fff', borderRadius: '8px', fontSize: '16px' }}
          />
        )}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {c.searchMatches.map((n) => (
            <button
              key={n.id}
              onClick={() => {
                focusAndShowCard(n.id);
                c.setSearchTerm('');
                setActiveSheet('card');
              }}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', textAlign: 'left', padding: '12px 6px', minHeight: 48, background: 'none', border: 'none', borderBottom: '1px solid #2c2c2e', color: '#f0f0f0', cursor: 'pointer' }}
            >
              <span style={{ fontWeight: 500, fontSize: '14px' }}>{contactFullName(n)}</span>
              {n.phoneNumber && <span style={{ color: '#9a9a9a', fontSize: '12px' }}>{formatPhoneNumberDisplay(n.phoneNumber)}</span>}
            </button>
          ))}
          {c.searchMode !== 'tags' && c.searchTerm.trim() !== '' && c.searchMatches.length === 0 && (
            <div style={{ color: '#9a9a9a', fontSize: '13px', padding: '16px 0', textAlign: 'center' }}>No matches found</div>
          )}
        </div>
      </BottomSheet>

      {/* Share requests (F4) */}
      <BottomSheet open={activeSheet === 'notifications'} onClose={() => setActiveSheet(null)} title="Share requests">
        <ShareRequestsPanel
          shareRequests={c.shareRequests}
          placeholders={c.ownContacts.filter((n) => n.kind === 'PLACEHOLDER')}
          onSend={c.handleSendShareRequest}
          onRespond={c.handleRespondToShareRequest}
          onCancel={c.handleCancelShareRequest}
          isBusy={c.isActionPending}
        />
      </BottomSheet>

      {/* Settings sheet */}
      <BottomSheet open={activeSheet === 'settings'} onClose={() => setActiveSheet(null)} title="Settings">
        {onSwitchToColumns && (
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '8px' }}>Interface View</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="button" style={tabButtonStyle(true)} title="Interactive Graph View">
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
        <button
          type="button"
          onClick={() => {
            c.loadData();
            setActiveSheet(null);
          }}
          style={{ ...fabActionStyle, width: '100%', borderColor: '#3a3a40', color: '#6ab0ff', background: 'rgba(61, 139, 255, 0.12)' }}
        >
          Refresh Graph Now
        </button>
        <div style={{ borderTop: '1px solid #3a3a40', marginTop: '14px', paddingTop: '14px' }}>
          <SharingSettingsPanel
            shares={c.shares}
            selfProfile={c.selfProfile}
            onEditShare={(share) => {
              c.enterShareMode(share);
              setActiveSheet(null);
            }}
            onOpenOtherGraph={(share) => {
              c.openOtherGraph(share);
              setActiveSheet(null);
            }}
            onRemoveOtherGraph={c.removeOtherGraph}
            onUpdatePrivacy={c.handleUpdatePrivacy}
            isBusy={c.isActionPending}
          />
        </div>
        <a
          href="/instructions"
          target="_blank"
          rel="noopener noreferrer"
          style={{ ...fabActionStyle, display: 'block', textAlign: 'center', textDecoration: 'none', marginTop: '10px', width: '100%', boxSizing: 'border-box', borderColor: '#3a3a40', color: '#f0f0f0', background: '#2c2c2e' }}
        >
          📖 Instructions & Guide
        </a>
      </BottomSheet>

      {/* Add person sheet */}
      <BottomSheet open={activeSheet === 'addPerson'} onClose={() => setActiveSheet(null)} title="Add Person" maxHeight="85dvh">
        <AddPersonForm
          onImportContacts={c.handleImportContacts}
          nodes={c.graph.nodes}
          compact
          onSubmit={(payload) => {
            c.handleCreateContact(payload);
            setActiveSheet(null);
          }}
          onClose={() => setActiveSheet(null)}
          style={{ background: 'transparent', border: 'none', padding: 0 }}
        />
      </BottomSheet>

      {/* Selected-contact card */}
      <BottomSheet open={activeSheet === 'card' && selected !== null} onClose={closeCardSheet}>
        {selected && (
          <>
            {c.activePath && (
              <button onClick={() => setActiveSheet('path')} style={{ ...fabActionStyle, marginBottom: '10px', color: '#ff6b6b', borderColor: '#ff6b6b' }}>
                ← Back to path
              </button>
            )}
            <ContactCard
              node={selected}
              ownContacts={c.ownContacts}
              linkedIds={c.linkedIdsFor(selected.id)}
              onClose={closeCardSheet}
              onUpdate={(payload) => c.handleUpdateContact(selected.id, payload)}
              onUpdateSelf={c.handleUpdateSelfProfile}
              onDelete={() => {
                c.handleDeleteContact(selected.id);
                closeCardSheet();
              }}
              onLink={(otherId) => c.handleLinkContacts(selected.id, otherId)}
              onUnlink={(otherId) => c.handleUnlinkContacts(selected.id, otherId)}
              onTagsChange={(update) => c.updateContactTags(selected.id, update)}
              onNoteChange={(note) => c.updateContactNote(selected.id, note)}
              onSaveNote={c.saveContactNote}
              onFindPath={() => findPathAndShowSheet(selected.id)}
              busy={c.isActionPending(selected.id)}
              compact
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
                style={{ background: 'none', border: 'none', color: '#6ab0ff', textDecoration: 'underline', padding: '4px 0', minHeight: 32, fontSize: '13px', cursor: 'pointer', textAlign: 'left' }}
              >
                {contactFullName(hop)}
              </button>
            </div>
          ))}
        </div>
        <button style={{ ...fabActionStyle, marginTop: '10px', width: '100%', minHeight: 38, fontSize: '13px' }} onClick={() => { c.handleClearPath(); setActiveSheet(null); }}>
          Clear path
        </button>
      </BottomSheet>

      {/* F5: interactive share-mode panel, while editing what a viewer sees */}
      {c.shareMode && (
        <div
          style={{
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 45,
            background: 'rgba(28, 28, 30, 0.96)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            borderTop: '1px solid #3a3a40',
            borderRadius: '16px 16px 0 0',
            maxHeight: '60dvh',
            overflowY: 'auto',
          }}
        >
          <ShareModePanel
            shareMode={c.shareMode}
            onToggleFlag={c.setShareModeFlag}
            onSave={c.saveShareMode}
            onCancel={c.cancelShareMode}
            onRevoke={() => c.revokeShare(c.shareMode!.shareId)}
            isBusy={c.isActionPending}
          />
        </div>
      )}

      {/* F6: read-only view of a graph shared with you */}
      {c.viewingShare && (
        <OtherGraphView
          share={c.viewingShare}
          data={c.viewingForceGraphData}
          loading={c.viewingGraphLoading}
          error={c.viewingGraphError}
          onClose={c.closeOtherGraph}
        />
      )}
    </div>
  );
};
