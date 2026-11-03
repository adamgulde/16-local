import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { RefObject } from 'react';
import type { ForceGraphMethods } from 'react-force-graph-2d';
import { useGraphController } from './useGraphController';
import { initDataLayer } from '../data/store';
import { openNodeDb } from '../data/testing/nodeDb';
import type { GNode, GLink } from './rendering';

const fgRef = { current: undefined } as RefObject<ForceGraphMethods<GNode, GLink> | undefined>;

const setup = async () => {
  await initDataLayer(openNodeDb());
  const hook = renderHook(() => useGraphController(fgRef));
  await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
  return hook;
};

describe('useGraphController (local data)', () => {
  it('loads your graph with you at the centre and the tag dictionary', async () => {
    const { result } = await setup();
    expect(result.current.selfNode?.kind).toBe('SELF');
    expect(result.current.graph.nodes).toHaveLength(1);
    expect(result.current.initError).toBeNull();
  });

  it('adds a contact with a direct edge from you, at default closeness', async () => {
    const { result } = await setup();
    await act(() => result.current.handleCreateContact({ firstName: 'Bea', lastName: 'Cruz' }));
    const created = result.current.graph.nodes.find((n) => n.firstName === 'Bea');
    expect(created).toMatchObject({ kind: 'PLACEHOLDER', strength: 3 });
    expect(result.current.graph.edges).toContainEqual({ source: 'self', target: created!.id, kind: 'DIRECT' });
  });

  it('changes a contact’s closeness and keeps it on the node', async () => {
    const { result } = await setup();
    await act(() => result.current.handleCreateContact({ firstName: 'Cy' }));
    const id = result.current.graph.nodes.find((n) => n.firstName === 'Cy')!.id;
    await act(() => result.current.handleUpdateContact(id, { strength: 5 }));
    expect(result.current.graph.nodes.find((n) => n.id === id)?.strength).toBe(5);
  });

  it('links two contacts, finds a path through them, and unlinks', async () => {
    const { result } = await setup();
    await act(() => result.current.handleCreateContact({ firstName: 'Di' }));
    await act(() => result.current.handleCreateContact({ firstName: 'Eli' }));
    const [di, eli] = ['Di', 'Eli'].map((name) => result.current.graph.nodes.find((n) => n.firstName === name)!.id);

    await act(() => result.current.handleLinkContacts(di, eli));
    expect(result.current.graph.edges.some((e) => e.kind === 'LINK')).toBe(true);

    // Every contact is directly connected to you, so the shortest path to anyone is one hop.
    act(() => result.current.handleFindPath(eli));
    expect(result.current.activePath).toEqual(['self', eli]);

    await act(() => result.current.handleUnlinkContacts(di, eli));
    expect(result.current.graph.edges.some((e) => e.kind === 'LINK')).toBe(false);
  });

  it('reports when there is no path to someone not in your graph', async () => {
    const { result } = await setup();
    act(() => result.current.handleFindPath('not-a-person'));
    expect(result.current.activePath).toBeNull();
    expect(result.current.actionError).toBe('Could not find a path to this person.');
  });

  it('deletes a contact and removes its edges', async () => {
    const { result } = await setup();
    await act(() => result.current.handleCreateContact({ firstName: 'Hal' }));
    const id = result.current.graph.nodes.find((n) => n.firstName === 'Hal')!.id;
    await act(() => result.current.handleDeleteContact(id));
    expect(result.current.graph.nodes.some((n) => n.id === id)).toBe(false);
    expect(result.current.graph.edges.some((e) => e.target === id || e.source === id)).toBe(false);
  });

  it('updates your own profile and the SELF node', async () => {
    const { result } = await setup();
    await act(() => result.current.handleUpdateSelfProfile({ firstName: 'Ada', lastName: 'Lovelace' }));
    const self = result.current.graph.nodes.find((n) => n.kind === 'SELF');
    expect(self).toMatchObject({ firstName: 'Ada', lastName: 'Lovelace' });
  });
});
