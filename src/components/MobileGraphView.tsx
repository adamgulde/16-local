import { useCallback, useRef, useState, type CSSProperties } from 'react';
import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d';
import { useGraphController } from '../graph/useGraphController';
import { contactFullName } from '../graph/mapping';
import { GRAPH_SEARCH_MODES, GRAPH_SEARCH_PLACEHOLDERS } from '../graph/graphSearch';
import {
  drawGrid,
  drawNode,
  drawPathArrow,
  linkColorFor,
  paintNodePointerArea,
  useGraphPhysics,
  STATIC_LAYOUT,
} from '../graph/rendering';
import { LinkPanel } from './LinkPanel';
import { MultiSelectPanel } from './MultiSelectPanel';
import type { GNode, GLink } from '../graph/rendering';
import { ContactCard } from './ContactCard';
import { AddPersonForm } from './AddPersonForm';
import { BottomSheet } from './BottomSheet';
import { Instructions } from './Instructions';
import { SearchIcon, SettingsIcon, TargetIcon, PlusIcon, MinusIcon, MaximizeIcon, SelectIcon } from './Icons';
import { SearchModeToggle } from './tags/SearchModeToggle';
import { TagQueryField } from './tags/TagQueryField';
import { formatPhoneNumberDisplay } from '../utils/phoneUtils';
import { APP_VERSION } from '../version';

type Sheet = 'card' | 'path' | 'settings' | 'search' | 'addPerson' | 'help' | null;

const ZOOM_STEP_FACTOR = 1.6;
const LINK_MODE_BACKGROUND = '#0d2236';
// cooldownTicks must be set explicitly: when the static layout's cooldownTicks: 0 is dropped from the
// props, the library keeps the last value, which would stop every later update after one tick.
const ANIMATED_LAYOUT = { warmupTicks: 0, cooldownTicks: Infinity } as const;

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

export const MobileGraphView = () => {
  const fgRef = useRef<ForceGraphMethods<GNode, GLink> | undefined>(undefined);
  const c = useGraphController(fgRef);
  const hasOrientedRef = useRef(false);

  const [graphReady, setGraphReady] = useState(false);

  const handleEngineStop = () => {
    if (hasOrientedRef.current) return;
    hasOrientedRef.current = true;
    c.handleLocateMe(0);
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

  useGraphPhysics(fgRef, c.forceGraphData, graphReady);

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
  const canvasBackground = c.linkFromId ? LINK_MODE_BACKGROUND : '#121214';
  const linkFrom = c.linkFromId ? c.nodesById.get(c.linkFromId) ?? null : null;
  const selectedNodes = c.graph.nodes.filter((n) => c.multiIds.has(n.id));
  const selfInitial = c.selfProfile?.firstName?.[0]?.toUpperCase() ?? 'M';

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
        background: canvasBackground,
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
          backgroundColor={canvasBackground}
          enableNodeDrag={false}
          {...(graphReady ? ANIMATED_LAYOUT : STATIC_LAYOUT)}
          onEngineStop={handleEngineStop}
          d3VelocityDecay={0.4}
          onRenderFramePre={(ctx, globalScale) => drawGrid(ctx, globalScale)}
          nodeCanvasObject={(node, ctx, globalScale) =>
            drawNode(node, ctx, globalScale, {
              highlightNodes: c.highlightNodes,
              activePath: c.activePath,
              filterNodes: c.tagMatchIds,
              selectedIds: c.multiIds,
            })
          }
          linkColor={(link) =>
            linkColorFor(link as GLink, {
              highlightLinks: c.highlightLinks,
              activePath: c.activePath,
              filterNodes: c.tagMatchIds,
            })
          }
          nodePointerAreaPaint={paintNodePointerArea}
          linkCanvasObjectMode={() => 'after'}
          linkCanvasObject={(link, ctx, globalScale) => drawPathArrow(link as GLink, ctx, globalScale, c.pathLinkTarget)}
          onNodeClick={(node) => {
            const inMode = Boolean(c.linkFromId) || c.selectMode;
            c.handleNodeTap(String(node.id));
            if (!inMode) setActiveSheet('card');
          }}
          onBackgroundClick={() => {
            if (activeSheet === 'card') closeCardSheet();
          }}
        />
      </div>

      {/* TOP-LEFT: search and add person */}
      <div style={{ position: 'absolute', top: 'max(12px, env(safe-area-inset-top, 12px))', left: 'max(12px, env(safe-area-inset-left, 12px))', display: 'flex', alignItems: 'center', gap: '8px', zIndex: 25 }}>
        <button style={cornerButtonStyle} onClick={() => setActiveSheet('search')} aria-label="Search" title="Search">
          <SearchIcon size={20} />
          {c.tagMatchIds && <span style={{ position: 'absolute', top: 4, right: 4, width: 8, height: 8, borderRadius: '4px', background: '#3d8bff' }} />}
        </button>
        <button
          style={{ ...cornerButtonStyle, borderColor: c.selectMode ? '#3d8bff' : '#3a3a40', color: c.selectMode ? '#6ab0ff' : '#f0f0f0' }}
          onClick={c.toggleSelectMode}
          aria-label={c.selectMode ? 'Done selecting' : 'Select people'}
          aria-pressed={c.selectMode}
          title={c.selectMode ? 'Done selecting' : 'Select people'}
        >
          <SelectIcon size={20} />
        </button>
        <button style={cornerButtonStyle} onClick={() => setActiveSheet('addPerson')} aria-label="Add person" title="Add person">
          <PlusIcon size={20} />
        </button>
      </div>

      {/* TOP-RIGHT: your profile and settings */}
      <div style={{ position: 'absolute', top: 'max(12px, env(safe-area-inset-top, 12px))', right: 'max(12px, env(safe-area-inset-right, 12px))', display: 'flex', alignItems: 'center', gap: '8px', zIndex: 25 }}>
        <button
          style={{ ...cornerButtonStyle, borderColor: '#3d8bff', color: '#6ab0ff', fontWeight: 'bold', fontSize: '15px' }}
          onClick={() => c.selfNode && focusAndShowCard(c.selfNode.id)}
          aria-label="My Profile"
          title="My Profile"
        >
          {selfInitial}
        </button>
        <button style={cornerButtonStyle} onClick={() => setActiveSheet('settings')} aria-label="Settings" title="Settings">
          <SettingsIcon size={20} />
        </button>
      </div>

      {/* ACTIVE PATH BANNER */}
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

      {/* Path chip (bottom-left) */}
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

      {/* BOTTOM-RIGHT: navigation */}
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

      {/* Search */}
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

      {/* Settings */}
      <BottomSheet open={activeSheet === 'settings'} onClose={() => setActiveSheet(null)} title="Settings">
        <button
          type="button"
          onClick={() => {
            c.loadData();
            setActiveSheet(null);
          }}
          style={{ ...fabActionStyle, width: '100%', borderColor: '#3a3a40', color: '#6ab0ff', background: 'rgba(61, 139, 255, 0.12)' }}
        >
          Reload graph
        </button>
        <button
          type="button"
          onClick={() => setActiveSheet('help')}
          style={{ ...fabActionStyle, width: '100%', marginTop: '10px' }}
        >
          How it works
        </button>
        <p style={{ margin: '14px 0 0', fontSize: 11, color: '#6b6b70', textAlign: 'center' }}>16 Local v{APP_VERSION}</p>
      </BottomSheet>

      <BottomSheet open={activeSheet === 'help'} onClose={() => setActiveSheet(null)} title="How it works" maxHeight="85dvh">
        <Instructions />
      </BottomSheet>

      {/* Add person */}
      <BottomSheet open={activeSheet === 'addPerson'} onClose={() => setActiveSheet(null)} title="Add Person" maxHeight="85dvh">
        <AddPersonForm
          onImportContacts={c.handleImportContacts}
          nodes={c.graph.nodes}
          showClose={false}
          compact
          onSubmit={(payload) => {
            c.handleCreateContact(payload);
            setActiveSheet(null);
          }}
          onClose={() => setActiveSheet(null)}
          style={{ background: 'transparent', border: 'none', padding: 0 }}
        />
      </BottomSheet>

      {/* Link panel, pinned to the bottom so the graph stays tappable above it */}
      {linkFrom && (
        <div style={{ position: 'absolute', left: 'max(12px, env(safe-area-inset-left, 12px))', right: 'max(12px, env(safe-area-inset-right, 12px))', bottom: 'max(12px, env(safe-area-inset-bottom, 12px))', zIndex: 40 }}>
          <LinkPanel
            from={linkFrom}
            contacts={c.ownContacts}
            linkedIds={c.linkedIdsFor(linkFrom.id)}
            onToggle={(id) => c.handleNodeTap(id)}
            onDone={c.endLinking}
            busy={c.isActionPending(linkFrom.id)}
            heading={c.linkIsNewPerson ? `Connect ${contactFullName(linkFrom)} to someone else?` : undefined}
            compact
          />
        </div>
      )}

      {/* Select panel, pinned to the bottom */}
      {c.selectMode && (
        <div style={{ position: 'absolute', left: 'max(12px, env(safe-area-inset-left, 12px))', right: 'max(12px, env(safe-area-inset-right, 12px))', bottom: 'max(12px, env(safe-area-inset-bottom, 12px))', zIndex: 40 }}>
          <MultiSelectPanel
            selected={selectedNodes}
            onCloseness={c.handleBulkCloseness}
            onAddTag={c.handleBulkAddTag}
            onDelete={c.handleBulkDelete}
            onClose={c.toggleSelectMode}
            busy={c.isActionPending('bulk-closeness') || c.isActionPending('bulk-delete') || c.isActionPending('bulk-tag')}
            compact
          />
        </div>
      )}

      {/* Selected contact */}
      <BottomSheet open={activeSheet === 'card' && selected !== null && !linkFrom && !c.selectMode} onClose={closeCardSheet}>
        {selected && (
          <>
            {c.activePath && (
              <button onClick={() => setActiveSheet('path')} style={{ ...fabActionStyle, marginBottom: '10px', color: '#ff6b6b', borderColor: '#ff6b6b' }}>
                ← Back to path
              </button>
            )}
            <ContactCard
              node={selected}
              onClose={closeCardSheet}
              onUpdate={(payload) => c.handleUpdateContact(selected.id, payload)}
              onUpdateSelf={c.handleUpdateSelfProfile}
              onDelete={() => {
                c.handleDeleteContact(selected.id);
                closeCardSheet();
              }}
              onStartLink={() => {
                setActiveSheet(null);
                c.beginLinking(selected.id);
              }}
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

      {/* Path details */}
      <BottomSheet open={activeSheet === 'path' && c.activePath !== null} onClose={() => setActiveSheet(null)} title="Path Details">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px' }}>
          {c.pathBreadcrumb.map((hop) => (
            <button
              key={hop.id}
              onClick={() => selectAndShowCard(hop.id)}
              style={{ background: 'none', border: 'none', color: '#6ab0ff', textDecoration: 'underline', padding: '4px 0', minHeight: 32, fontSize: '13px', cursor: 'pointer', textAlign: 'left' }}
            >
              {contactFullName(hop)}
            </button>
          ))}
        </div>
        <button
          style={{ ...fabActionStyle, marginTop: '10px', width: '100%', minHeight: 38, fontSize: '13px' }}
          onClick={() => {
            c.handleClearPath();
            setActiveSheet(null);
          }}
        >
          Clear path
        </button>
      </BottomSheet>
    </div>
  );
};
