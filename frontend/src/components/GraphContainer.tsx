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
import { DraggableCard } from './DraggableCard';
import { ShareRequestsPanel } from './ShareRequestsPanel';
import { SharingSettingsPanel } from './SharingSettingsPanel';
import { ShareModePanel } from './ShareModePanel';
import { OtherGraphView } from './OtherGraphView';
import { formatPhoneNumberDisplay } from '../utils/phoneUtils';
import {
  SearchIcon,
  MailboxIcon,
  SettingsIcon,
  TargetIcon,
  PlusIcon,
  MinusIcon,
  MaximizeIcon,
  CloseIcon,
  ColumnsIcon,
  GridIcon,
} from './Icons';
import { SearchModeToggle } from './tags/SearchModeToggle';
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
  const c = useGraphController(fgRef);
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
  const [showAddPerson, setShowAddPerson] = useState(false);
  const [frontCard, setFrontCard] = useState<'user' | 'path' | 'add'>('user');

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

  useGraphPhysics(fgRef, c.forceGraphData.links);

  if (c.isLoading) {
    return (
      <div style={{ width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#121214', color: '#9a9a9a' }}>
        Loading your graph...
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

  const selected = c.selectedNode;

  return (
    <div ref={graphWrapperRef} style={{ width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden', background: '#121214' }}>
      {/* 100% Viewport Canvas, hidden until laid out and centered */}
      <div style={{ visibility: graphReady ? 'visible' : 'hidden' }}>
        <ForceGraph2D<GNode, GLink>
          ref={fgRef}
          width={graphSize.width}
          height={graphSize.height}
          graphData={c.forceGraphData}
          backgroundColor="#121214"
          enableNodeDrag={false}
          {...STATIC_LAYOUT}
          d3VelocityDecay={0.4}
          onEngineStop={handleEngineStop}
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
          onNodeClick={(node) => (c.shareMode ? c.toggleShareModeContact(String(node.id)) : c.selectNode(String(node.id)))}
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
              loading={false}
              rows={pickerRows('regular', false)}
              layout="dropdown"
              placeholder={GRAPH_SEARCH_PLACEHOLDERS.tags}
              inputStyle={{ fontSize: '14px' }}
            >
              {c.searchMatches.length > 0 && (
                <div style={{ marginTop: '8px', maxHeight: '160px', overflowY: 'auto' }}>
                  {c.searchMatches.slice(0, 20).map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => {
                        c.handleSelectSearchResult(n.id);
                        tagQueryRef.current?.close();
                      }}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 4px', background: 'none', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.06)', color: '#f0f0f0', fontSize: '12px', cursor: 'pointer' }}
                    >
                      {contactFullName(n)}
                    </button>
                  ))}
                </div>
              )}
            </TagQueryField>
          ) : (
            <input
              type="text"
              placeholder={GRAPH_SEARCH_PLACEHOLDERS[c.searchMode]}
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
          <SearchModeToggle mode={c.searchMode} onChange={c.setSearchMode} modes={GRAPH_SEARCH_MODES} />

          {/* Contact suggestions for the text modes */}
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
              {c.searchMatches.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => {
                    c.handleSelectSearchResult(n.id);
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
                  <span style={{ fontWeight: 500 }}>{contactFullName(n)}</span>
                  {n.phoneNumber && <span style={{ color: '#9a9a9a', fontSize: '11px' }}>{formatPhoneNumberDisplay(n.phoneNumber)}</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ flex: 1 }} />

        {/* Add person */}
        <button
          type="button"
          onClick={() => {
            setShowAddPerson(true);
            setFrontCard('add');
          }}
          style={{
            ...floatingPanelStyle,
            pointerEvents: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 14px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 600,
          }}
        >
          <PlusIcon size={14} /> Add person
        </button>

        {/* User Identity pill */}
        <button
          onClick={() => c.selfNode && c.focusUser(c.selfNode.id)}
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
          <span style={{ fontSize: '13px', fontWeight: 500 }}>{currentUser.firstName} {currentUser.lastName}</span>
        </button>

        {/* Mailbox / Share requests (F4) */}
        <div style={{ pointerEvents: 'auto', position: 'relative' }}>
          <button
            onClick={() => {
              setShowNotifications((prev) => !prev);
              setShowSettings(false);
            }}
            aria-label="Share requests"
            style={{ ...hudBtnStyle, borderColor: showNotifications ? '#3d8bff' : '#3a3a40', position: 'relative' }}
          >
            <MailboxIcon size={20} />
            {c.pendingIncomingCount > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: -2,
                  right: -2,
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
          {showNotifications && (
            <div style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: '320px', maxHeight: '70vh', overflowY: 'auto', ...floatingPanelStyle, padding: '14px', zIndex: 35 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontWeight: 'bold', fontSize: '14px' }}>Share requests</span>
                <button onClick={() => setShowNotifications(false)} style={{ background: 'none', border: 'none', color: '#9a9a9a', cursor: 'pointer', padding: 0 }}>
                  <CloseIcon size={16} />
                </button>
              </div>
              <ShareRequestsPanel
                shareRequests={c.shareRequests}
                placeholders={c.ownContacts.filter((n) => n.kind === 'PLACEHOLDER')}
                onSend={c.handleSendShareRequest}
                onRespond={c.handleRespondToShareRequest}
                onCancel={c.handleCancelShareRequest}
                isBusy={c.isActionPending}
              />
            </div>
          )}
        </div>

        {/* Settings (includes F5/F6/F7 sharing settings) */}
        <div style={{ pointerEvents: 'auto', position: 'relative' }}>
          <button
            onClick={() => {
              setShowSettings((prev) => !prev);
              setShowNotifications(false);
            }}
            aria-label="Settings"
            style={{ ...hudBtnStyle, borderColor: showSettings ? '#3d8bff' : '#3a3a40' }}
          >
            <SettingsIcon size={20} />
          </button>
          {showSettings && (
            <div style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: '320px', maxHeight: '70vh', overflowY: 'auto', ...floatingPanelStyle, padding: '16px', zIndex: 35 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <span style={{ fontWeight: 'bold', fontSize: '15px' }}>Preferences</span>
                <button onClick={() => setShowSettings(false)} style={{ background: 'none', border: 'none', color: '#9a9a9a', cursor: 'pointer', padding: 0 }}>
                  <CloseIcon size={16} />
                </button>
              </div>
              <div style={{ marginBottom: '14px' }}>
                <button
                  type="button"
                  onClick={() => c.loadData()}
                  style={{ width: '100%', padding: '6px 10px', background: 'rgba(61, 139, 255, 0.12)', border: '1px solid #3a3a40', borderRadius: '6px', color: '#6ab0ff', cursor: 'pointer', fontSize: '12px', fontWeight: 500 }}
                >
                  Refresh Graph Now
                </button>
              </div>
              <div style={{ borderTop: '1px solid #3a3a40', paddingTop: '12px', marginBottom: '12px' }}>
                <SharingSettingsPanel
                  shares={c.shares}
                  selfProfile={c.selfProfile}
                  onEditShare={(share) => {
                    c.enterShareMode(share);
                    setShowSettings(false);
                  }}
                  onOpenOtherGraph={(share) => {
                    c.openOtherGraph(share);
                    setShowSettings(false);
                  }}
                  onRemoveOtherGraph={c.removeOtherGraph}
                  onUpdatePrivacy={c.handleUpdatePrivacy}
                  isBusy={c.isActionPending}
                />
              </div>
              <div style={{ borderTop: '1px solid #3a3a40', paddingTop: '12px' }}>
                <a
                  href="/instructions"
                  target="_blank"
                  rel="noreferrer"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', textAlign: 'center', padding: '8px', background: '#2c2c2e', border: '1px solid #3a3a40', borderRadius: '6px', color: '#6ab0ff', textDecoration: 'none', fontSize: '13px', fontWeight: 500 }}
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
          <button onClick={() => c.setActionError(null)} style={{ background: 'none', border: 'none', color: '#ff6b6b', cursor: 'pointer' }}>
            <CloseIcon size={14} />
          </button>
        </div>
      )}

      {/* Floating Add Person card */}
      {showAddPerson && (
        <DraggableCard
          id="add-person-card"
          initialX={20}
          initialY={72}
          width={360}
          dragHandleText="Add Person (drag to move)"
          zIndex={frontCard === 'add' ? 35 : 24}
          onBringToFront={() => setFrontCard('add')}
        >
          <AddPersonForm
            onSubmit={(payload) => {
              c.handleCreateContact(payload);
              setShowAddPerson(false);
            }}
            onClose={() => setShowAddPerson(false)}
            style={{ background: 'transparent', border: 'none' }}
          />
        </DraggableCard>
      )}

      {/* Floating Selected ContactCard Overlay (Draggable) */}
      {selected && (
        <DraggableCard
          id="user-card"
          initialX={20}
          initialY={72}
          width={380}
          dragHandleText="Contact (drag to move)"
          zIndex={frontCard === 'user' ? 35 : 25}
          onBringToFront={() => setFrontCard('user')}
        >
          <ContactCard
            node={selected}
            ownContacts={c.ownContacts}
            linkedIds={c.linkedIdsFor(selected.id)}
            onClose={c.clearSelection}
            onUpdate={(payload) => c.handleUpdateContact(selected.id, payload)}
            onUpdateSelf={c.handleUpdateSelfProfile}
            onDelete={() => c.handleDeleteContact(selected.id)}
            onLink={(otherId) => c.handleLinkContacts(selected.id, otherId)}
            onUnlink={(otherId) => c.handleUnlinkContacts(selected.id, otherId)}
            onTagsChange={(update) => c.updateContactTags(selected.id, update)}
            onNoteChange={(note) => c.updateContactNote(selected.id, note)}
            onSaveNote={c.saveContactNote}
            onFindPath={() => c.handleFindPath(selected.id)}
            busy={c.isActionPending(selected.id)}
            style={{ background: 'transparent', border: 'none' }}
          />
        </DraggableCard>
      )}

      {/* Floating Active Path Card (Draggable, side-by-side with ContactCard) */}
      {c.activePath && c.pathBreadcrumb.length > 0 && (
        <DraggableCard
          id="path-card"
          initialX={selected ? 420 : 20}
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
              <button onClick={c.handleClearPath} style={{ background: 'none', border: 'none', color: '#9a9a9a', cursor: 'pointer', padding: 0 }}>
                <CloseIcon size={16} />
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {c.pathBreadcrumb.map((hop) => (
                <button
                  key={hop.id}
                  onClick={() => c.focusUser(hop.id)}
                  style={{ background: 'none', border: 'none', color: '#6ab0ff', cursor: 'pointer', textDecoration: 'underline', padding: 0, textAlign: 'left', fontSize: '13px' }}
                >
                  {contactFullName(hop)}
                </button>
              ))}
            </div>
          </div>
        </DraggableCard>
      )}

      {/* Floating HUD Controls in Bottom-Right */}
      <div style={{ position: 'absolute', bottom: 24, right: 20, zIndex: 20, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '10px' }}>
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

      {/* F5: interactive share-mode panel, while editing what a viewer sees */}
      {c.shareMode && (
        <div style={{ position: 'absolute', bottom: 24, left: 20, width: '360px', zIndex: 40, ...floatingPanelStyle }}>
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
