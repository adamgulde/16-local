import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ForceGraphMethods } from 'react-force-graph-2d';
import type { User } from '../../services/userService';
import type { Share } from '../../services/shareService';
import type { GraphNode } from '../../services/graphService';
import type { GNode, GLink } from '../../graph/rendering';
import { useGraphController } from '../../graph/useGraphController';
import { contactFullName } from '../../graph/mapping';
import { formatPhoneNumberDisplay } from '../../utils/phoneUtils';
import { MillerColumn, type MillerColumnEntry } from './MillerColumn';
import { ContactCard } from '../ContactCard';
import { AddPersonForm } from '../AddPersonForm';
import { BottomSheet } from '../BottomSheet';
import { ChevronRightIcon, ChevronLeftIcon, CloseIcon, ColumnsIcon, GridIcon, PlusIcon } from '../Icons';

interface MillerColumnsViewProps {
  currentUser: User;
  onSwitchToGraph: (focusUserId?: string, findPathTargetId?: string) => void;
  isMobile?: boolean;
}

// What's selected at a given depth of the Miller trail (PLAN.md §5 F8, rebuilt on the private-
// network model). Two independent routes end up looking at a "shared contacts" column: drilling
// into one of your own REGISTERED contacts who also shares their graph with you, or the
// standalone "Other's graphs" root entry (any `sharedWithMe` share at all, whether or not it's
// tied to one of your own contacts). Either way the column beneath it is always a leaf — no
// re-sharing, so a shared contact never has children of its own.
type PathItem =
  | { type: 'own-contact'; node: GraphNode }
  | { type: 'other-graphs' }
  | { type: 'share'; share: Share }
  | { type: 'shared-contact'; node: GraphNode; share: Share };

const idOf = (item: PathItem): string => {
  switch (item.type) {
    case 'share':
      return `share:${item.share.id}`;
    case 'other-graphs':
      return 'other-graphs';
    default:
      return item.node.id;
  }
};

const labelOf = (item: PathItem): string => {
  switch (item.type) {
    case 'share':
      return item.share.sharerName;
    case 'other-graphs':
      return "Other's graphs";
    case 'shared-contact':
      return item.node.kind === 'HIDDEN' ? 'Hidden User' : contactFullName(item.node);
    default:
      return contactFullName(item.node);
  }
};

const badgeFor = (node: GraphNode): string | undefined => {
  if (node.kind === 'PLACEHOLDER') return 'placeholder';
  if (node.kind === 'REGISTERED') return 'registered';
  if (node.kind === 'HIDDEN') return 'hidden';
  return undefined;
};

const noop = () => {};
const noopAsync = async () => {};
const EMPTY_CONTACTS: GraphNode[] = [];
const EMPTY_IDS = new Set<string>();

export const MillerColumnsView = ({ currentUser, onSwitchToGraph, isMobile = false }: MillerColumnsViewProps) => {
  const fgRef = useRef<ForceGraphMethods<GNode, GLink> | undefined>(undefined);
  const c = useGraphController(fgRef);

  const [path, setPath] = useState<PathItem[]>([]);
  const [showAddPerson, setShowAddPerson] = useState(false);
  const [showInspectorPanel, setShowInspectorPanel] = useState(true);
  const scrollTrackRef = useRef<HTMLDivElement>(null);

  // Column 1 (PLAN.md §3): your own contacts — nodes you created, `source == null`, never SELF —
  // sorted by name. `ownContacts` from the controller already filters to exactly this set.
  const ownContactsSorted = useMemo(
    () => [...c.ownContacts].sort((a, b) => contactFullName(a).localeCompare(contactFullName(b))),
    [c.ownContacts]
  );

  const rootEntries: MillerColumnEntry[] = useMemo(
    () => [
      {
        id: 'other-graphs',
        label: "Other's graphs",
        sublabel: `${c.shares.sharedWithMe.length} shared with you`,
        hasChildren: true,
      },
      ...ownContactsSorted.map((n) => ({
        id: n.id,
        label: contactFullName(n),
        sublabel: n.phoneNumber ? formatPhoneNumberDisplay(n.phoneNumber) : undefined,
        badge: badgeFor(n),
        hasChildren: Boolean(
          n.kind === 'REGISTERED' && n.linkedUserId && c.shares.sharedWithMe.some((s) => s.sharerUserId === n.linkedUserId)
        ),
      })),
    ],
    [ownContactsSorted, c.shares.sharedWithMe]
  );

  // The one share whose contacts should currently be loaded, wherever it was reached from in the
  // trail — there's only ever one such branch open, since a shared contact is always a leaf.
  const desiredShare = useMemo(() => {
    for (const item of path) {
      if (item.type === 'share') return item.share;
      if (item.type === 'own-contact' && item.node.kind === 'REGISTERED' && item.node.linkedUserId) {
        const found = c.shares.sharedWithMe.find((s) => s.sharerUserId === item.node.linkedUserId);
        if (found) return found;
      }
    }
    return null;
  }, [path, c.shares.sharedWithMe]);

  useEffect(() => {
    if (!desiredShare) {
      c.closeOtherGraph();
      return;
    }
    if (c.viewingShare?.id !== desiredShare.id) {
      c.openOtherGraph(desiredShare);
    }
    // Only re-run when the desired share changes: openOtherGraph/closeOtherGraph are stable
    // (useCallback, no deps) and c.viewingShare is read rather than depended on, so this doesn't
    // re-fire the moment the fetch it just kicked off resolves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desiredShare]);

  // GET /api/shares/{id}/graph (read-only) — HIDDEN nodes render as "Hidden User" same as
  // everywhere else, and this never lists the sharer themselves (SELF), just their contacts.
  const sharedContactEntries: MillerColumnEntry[] = useMemo(() => {
    if (!desiredShare || c.viewingShare?.id !== desiredShare.id || !c.viewingGraph) return [];
    return [...c.viewingGraph.nodes]
      .filter((n) => n.kind !== 'SELF')
      .sort((a, b) => labelOf({ type: 'shared-contact', node: a, share: desiredShare }).localeCompare(labelOf({ type: 'shared-contact', node: b, share: desiredShare })))
      .map((n) => ({
        id: n.id,
        label: n.kind === 'HIDDEN' ? 'Hidden User' : contactFullName(n),
        badge: n.kind === 'HIDDEN' ? 'hidden' : badgeFor(n),
      }));
  }, [desiredShare, c.viewingShare, c.viewingGraph]);

  // Column contents "below" a given selection — null means that selection is a leaf.
  const nextColumnFor = useCallback(
    (item: PathItem): { title: string; entries: MillerColumnEntry[]; loading: boolean; error: string | null } | null => {
      if (item.type === 'own-contact') {
        if (item.node.kind !== 'REGISTERED' || !item.node.linkedUserId) return null;
        const share = c.shares.sharedWithMe.find((s) => s.sharerUserId === item.node.linkedUserId);
        if (!share) return null;
        return {
          title: `${contactFullName(item.node)}'s shared contacts`,
          entries: sharedContactEntries,
          loading: c.viewingGraphLoading,
          error: c.viewingGraphError,
        };
      }
      if (item.type === 'other-graphs') {
        return {
          title: "Other's graphs",
          entries: c.shares.sharedWithMe.map((s) => ({ id: `share:${s.id}`, label: s.sharerName, hasChildren: true })),
          loading: false,
          error: null,
        };
      }
      if (item.type === 'share') {
        return {
          title: `${item.share.sharerName}'s shared contacts`,
          entries: sharedContactEntries,
          loading: c.viewingGraphLoading,
          error: c.viewingGraphError,
        };
      }
      return null;
    },
    [c.shares.sharedWithMe, sharedContactEntries, c.viewingGraphLoading, c.viewingGraphError]
  );

  const columnAt = useCallback(
    (depth: number) => {
      if (depth === 0) return { title: 'My contacts', entries: rootEntries, loading: false, error: null as string | null };
      const parent = path[depth - 1];
      if (!parent) return null;
      return nextColumnFor(parent);
    },
    [path, rootEntries, nextColumnFor]
  );

  const columns = useMemo(() => {
    const out: { depth: number; title: string; entries: MillerColumnEntry[]; loading: boolean; error: string | null }[] = [];
    for (let depth = 0; depth <= path.length; depth++) {
      const col = columnAt(depth);
      if (!col) break;
      out.push({ depth, ...col });
    }
    return out;
  }, [path.length, columnAt]);

  const selectEntry = useCallback(
    (depth: number, id: string) => {
      setPath((prev) => {
        const parent = depth > 0 ? prev[depth - 1] : null;
        let item: PathItem | null = null;

        if (depth === 0) {
          if (id === 'other-graphs') item = { type: 'other-graphs' };
          else {
            const node = ownContactsSorted.find((n) => n.id === id);
            if (node) item = { type: 'own-contact', node };
          }
        } else if (parent) {
          if (parent.type === 'own-contact') {
            const share = desiredShare;
            const node = c.viewingGraph?.nodes.find((n) => n.id === id);
            if (node && share) item = { type: 'shared-contact', node, share };
          } else if (parent.type === 'other-graphs') {
            const shareId = id.startsWith('share:') ? id.slice('share:'.length) : id;
            const share = c.shares.sharedWithMe.find((s) => s.id === shareId);
            if (share) item = { type: 'share', share };
          } else if (parent.type === 'share') {
            const node = c.viewingGraph?.nodes.find((n) => n.id === id);
            if (node) item = { type: 'shared-contact', node, share: parent.share };
          }
        }

        if (!item) return prev;
        const next = prev.slice(0, depth);
        next.push(item);
        return next;
      });

      if (!isMobile) {
        setTimeout(() => {
          scrollTrackRef.current?.scrollTo({ left: scrollTrackRef.current.scrollWidth, behavior: 'smooth' });
        }, 100);
      }
    },
    [ownContactsSorted, desiredShare, c.viewingGraph, c.shares.sharedWithMe, isMobile]
  );

  const handleBreadcrumbClick = useCallback((index: number) => {
    setPath((prev) => (index === -1 ? [] : prev.slice(0, index + 1)));
  }, []);

  const handleMobileBack = useCallback(() => {
    setPath((prev) => (prev.length === 0 ? prev : prev.slice(0, prev.length - 1)));
  }, []);

  const selected = path[path.length - 1] ?? null;
  const selectedNode = selected && (selected.type === 'own-contact' || selected.type === 'shared-contact') ? selected.node : null;
  const selectedIsEditable = selected?.type === 'own-contact';

  const handleCloseInspector = useCallback(() => {
    setPath((prev) => (selectedNode ? prev.slice(0, prev.length - 1) : prev));
  }, [selectedNode]);

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

  const renderContactCard = (compact: boolean) => {
    if (!selectedNode) return null;
    if (selectedIsEditable) {
      return (
        <ContactCard
          node={selectedNode}
          ownContacts={c.ownContacts}
          linkedIds={c.linkedIdsFor(selectedNode.id)}
          onClose={handleCloseInspector}
          onUpdate={(payload) => c.handleUpdateContact(selectedNode.id, payload)}
          onDelete={() => {
            c.handleDeleteContact(selectedNode.id);
            handleCloseInspector();
          }}
          onLink={(otherId) => c.handleLinkContacts(selectedNode.id, otherId)}
          onUnlink={(otherId) => c.handleUnlinkContacts(selectedNode.id, otherId)}
          onTagsChange={(update) => c.updateContactTags(selectedNode.id, update)}
          onNoteChange={(note) => c.updateContactNote(selectedNode.id, note)}
          onSaveNote={c.saveContactNote}
          onFindPath={() => onSwitchToGraph(undefined, selectedNode.id)}
          busy={c.isActionPending(selectedNode.id)}
          compact={compact}
          style={{ background: 'transparent', border: 'none' }}
        />
      );
    }
    // A shared/hidden node from someone else's graph — always read-only (PLAN.md §1.4: never a
    // copy you can edit).
    return (
      <ContactCard
        node={selectedNode}
        ownContacts={EMPTY_CONTACTS}
        linkedIds={EMPTY_IDS}
        onClose={handleCloseInspector}
        onUpdate={noop}
        onDelete={noop}
        onLink={noop}
        onUnlink={noop}
        onTagsChange={noop}
        onNoteChange={noop}
        onSaveNote={noopAsync}
        onFindPath={() => onSwitchToGraph(undefined, selectedNode.id)}
        compact={compact}
        style={{ background: 'transparent', border: 'none' }}
      />
    );
  };

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', background: '#121214', color: '#f0f0f0', overflow: 'hidden', position: 'relative' }}>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', background: '#2c2c2e', borderRadius: '8px', padding: '3px', border: '1px solid #3a3a40' }}>
            <button
              type="button"
              onClick={() => onSwitchToGraph()}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '5px 10px', borderRadius: '6px', border: 'none', background: 'transparent', color: '#9a9a9a', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
              title="Switch to Interactive Graph View"
            >
              <GridIcon size={14} />
              {!isMobile && 'Graph'}
            </button>
            <button
              type="button"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '5px 10px', borderRadius: '6px', border: 'none', background: '#3d8bff', color: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'default' }}
              title="Columns View (Active)"
            >
              <ColumnsIcon size={14} />
              {!isMobile && 'Columns'}
            </button>
          </div>
        </div>

        <div style={{ flex: 1 }} />

        <button
          type="button"
          onClick={() => setShowAddPerson(true)}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', background: '#2c2c2e', border: '1px solid #3a3a40', borderRadius: '8px', color: '#f0f0f0', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}
        >
          <PlusIcon size={14} /> {!isMobile && 'Add person'}
        </button>

        {!isMobile && (
          <button
            type="button"
            onClick={() => setShowInspectorPanel((prev) => !prev)}
            style={{ padding: '6px 10px', background: showInspectorPanel ? '#2c2c2e' : 'transparent', border: '1px solid #3a3a40', borderRadius: '6px', color: '#d0d0d0', fontSize: '12px', cursor: 'pointer' }}
          >
            {showInspectorPanel ? 'Hide Inspector' : 'Show Inspector'}
          </button>
        )}

        <a
          href="/instructions"
          target="_blank"
          rel="noopener noreferrer"
          style={{ padding: '6px 10px', background: '#2c2c2e', border: '1px solid #3a3a40', borderRadius: '6px', color: '#d0d0d0', fontSize: '12px', textDecoration: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}
        >
          {isMobile ? 'Guide' : 'Instructions'}
        </a>
      </header>

      {/* Breadcrumb Path Bar */}
      <div style={{ background: '#18181a', borderBottom: '1px solid #2c2c2e', padding: isMobile ? '8px 12px' : '8px 20px', display: 'flex', alignItems: 'center', gap: '8px', overflowX: 'auto', whiteSpace: 'nowrap', flexShrink: 0 }}>
        {isMobile && path.length > 0 && (
          <button
            type="button"
            onClick={handleMobileBack}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', background: '#2c2c2e', border: '1px solid #3a3a40', borderRadius: '6px', color: '#fff', fontSize: '12px', fontWeight: 600, padding: '4px 10px', cursor: 'pointer', marginRight: '6px' }}
          >
            <ChevronLeftIcon size={14} /> Back
          </button>
        )}

        <button
          type="button"
          onClick={() => handleBreadcrumbClick(-1)}
          style={{ background: 'none', border: 'none', color: path.length === 0 ? '#3d8bff' : '#9a9a9a', fontSize: '12px', fontWeight: path.length === 0 ? 600 : 400, cursor: 'pointer', padding: '2px 4px', borderRadius: '4px' }}
        >
          You ({currentUser.firstName} {currentUser.lastName})
        </button>

        {path.map((item, idx) => (
          <div key={idOf(item)} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: '#4a4a50', display: 'flex', alignItems: 'center' }}>
              <ChevronRightIcon size={13} />
            </span>
            <button
              type="button"
              onClick={() => handleBreadcrumbClick(idx)}
              style={{ background: 'none', border: 'none', color: idx === path.length - 1 ? '#3d8bff' : '#9a9a9a', fontSize: '12px', fontWeight: idx === path.length - 1 ? 600 : 400, cursor: 'pointer', padding: '2px 4px', borderRadius: '4px' }}
            >
              {labelOf(item)}
            </button>
          </div>
        ))}
      </div>

      {/* Main Content Area */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
        {isMobile ? (
          <div style={{ flex: 1, height: '100%', overflow: 'hidden' }}>
            {columns.length > 0 && (
              <MillerColumn
                key={columns[columns.length - 1].depth}
                title={columns[columns.length - 1].title}
                entries={columns[columns.length - 1].entries}
                loading={columns[columns.length - 1].loading}
                error={columns[columns.length - 1].error}
                selectedId={path[columns[columns.length - 1].depth] ? idOf(path[columns[columns.length - 1].depth]) : null}
                onSelect={(id) => selectEntry(columns[columns.length - 1].depth, id)}
                isMobile
              />
            )}
          </div>
        ) : (
          <div ref={scrollTrackRef} style={{ flex: 1, display: 'flex', overflowX: 'auto', overflowY: 'hidden', height: '100%', scrollBehavior: 'smooth' }}>
            {columns.map((col) => (
              <MillerColumn
                key={col.depth}
                title={col.title}
                entries={col.entries}
                loading={col.loading}
                error={col.error}
                selectedId={path[col.depth] ? idOf(path[col.depth]) : null}
                onSelect={(id) => selectEntry(col.depth, id)}
                width={310}
              />
            ))}
          </div>
        )}

        {/* Dedicated Rightmost Inspector Panel (Desktop) */}
        {!isMobile && showInspectorPanel && selectedNode && (
          <aside style={{ width: 380, minWidth: 380, height: '100%', background: '#1c1c1e', borderLeft: '1px solid #3a3a40', display: 'flex', flexDirection: 'column', overflowY: 'auto', zIndex: 10 }}>
            {renderContactCard(false)}
          </aside>
        )}
        {!isMobile && showInspectorPanel && !selectedNode && selected && (
          <aside style={{ width: 380, minWidth: 380, height: '100%', background: '#1c1c1e', borderLeft: '1px solid #3a3a40', display: 'flex', flexDirection: 'column', padding: '16px', zIndex: 10 }}>
            <p style={{ color: '#8e8e93', fontSize: '13px' }}>
              {selected.type === 'other-graphs' ? 'Pick a share to browse its contacts.' : `Pick a contact from ${selected.type === 'share' ? selected.share.sharerName : ''}'s shared graph.`}
            </p>
          </aside>
        )}
      </div>

      {/* Mobile Inspector Bottom Sheet */}
      {isMobile && (
        <BottomSheet open={Boolean(selectedNode)} onClose={handleCloseInspector}>
          <div style={{ padding: '4px' }}>{renderContactCard(true)}</div>
        </BottomSheet>
      )}

      {/* Add person */}
      {isMobile ? (
        <BottomSheet open={showAddPerson} onClose={() => setShowAddPerson(false)} title="Add Person">
          <AddPersonForm
            compact
            onSubmit={(payload) => {
              c.handleCreateContact(payload);
              setShowAddPerson(false);
            }}
            onClose={() => setShowAddPerson(false)}
            style={{ background: 'transparent', border: 'none', padding: 0 }}
          />
        </BottomSheet>
      ) : (
        showAddPerson && (
          <div style={{ position: 'absolute', top: 72, left: 20, width: 360, zIndex: 40 }}>
            <AddPersonForm
              onSubmit={(payload) => {
                c.handleCreateContact(payload);
                setShowAddPerson(false);
              }}
              onClose={() => setShowAddPerson(false)}
            />
          </div>
        )
      )}

      {/* Floating Action Error Toast */}
      {c.actionError && (
        <div
          style={{
            position: 'fixed',
            top: 72,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(58, 20, 20, 0.95)',
            border: '1px solid #ff6b6b',
            borderRadius: '8px',
            color: '#ff6b6b',
            padding: '8px 16px',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '13px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
          }}
        >
          <span>{c.actionError}</span>
          <button onClick={() => c.setActionError(null)} style={{ background: 'none', border: 'none', color: '#ff6b6b', cursor: 'pointer', padding: 0 }}>
            <CloseIcon size={14} />
          </button>
        </div>
      )}
    </div>
  );
};
