import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { RefObject } from 'react';
import type { ForceGraphMethods } from 'react-force-graph-2d';
import type { Graph } from '../services/graphService';
import type { Share, SharesResponse, ShareRequestsResponse, SelfProfile } from '../services/shareService';
import { useGraphController } from './useGraphController';
import type { GNode, GLink } from './rendering';

const graphApi = vi.hoisted(() => ({
  fetchGraph: vi.fn(),
  fetchShareGraph: vi.fn(),
}));
vi.mock('../services/graphService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/graphService')>()),
  ...graphApi,
}));

const contactApi = vi.hoisted(() => ({
  createContact: vi.fn(),
  updateContact: vi.fn(),
  deleteContact: vi.fn(),
  putContactNote: vi.fn(),
  linkContacts: vi.fn(),
  unlinkContacts: vi.fn(),
}));
vi.mock('../services/contactService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/contactService')>()),
  ...contactApi,
}));

const tagApi = vi.hoisted(() => ({ fetchAllTags: vi.fn() }));
vi.mock('../services/tagService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/tagService')>()),
  ...tagApi,
}));

const shareApi = vi.hoisted(() => ({
  sendShareRequest: vi.fn(),
  fetchShareRequests: vi.fn(),
  respondToShareRequest: vi.fn(),
  cancelShareRequest: vi.fn(),
  fetchShares: vi.fn(),
  updateShare: vi.fn(),
  setShareHiddenContacts: vi.fn(),
  deleteShare: vi.fn(),
  updatePrivacy: vi.fn(),
  fetchSelfProfile: vi.fn(),
  updateSelfProfile: vi.fn(),
}));
vi.mock('../services/shareService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/shareService')>()),
  ...shareApi,
}));

const baseGraph: Graph = {
  nodes: [
    { id: 'self', kind: 'SELF', firstName: 'You', lastName: '', about: 'Old bio', phoneNumber: null, tags: [], note: '', profile: null, linkedUserId: null, source: null, editable: true },
    { id: 'c1', kind: 'PLACEHOLDER', firstName: 'Dana', lastName: 'Price', about: '', phoneNumber: null, tags: [], note: '', profile: null, linkedUserId: null, source: null, editable: true },
    { id: 'c2', kind: 'REGISTERED', firstName: 'Riley', lastName: 'Chen', about: '', phoneNumber: null, tags: [], note: '', profile: null, linkedUserId: 'u-riley', source: null, editable: true },
  ],
  edges: [
    { source: 'self', target: 'c1', kind: 'DIRECT', shareId: null },
    { source: 'self', target: 'c2', kind: 'DIRECT', shareId: null },
  ],
};

const emptyShareRequests: ShareRequestsResponse = { incoming: [], outgoing: [] };
const emptyShares: SharesResponse = { sharedByMe: [], sharedWithMe: [] };
const selfProfile: SelfProfile = {
  id: 'self',
  firstName: 'You',
  lastName: '',
  bio: 'Old bio',
  inviteCode: 'ABC123',
  discoverableInSharedGraphs: false,
};

const testShare: Share = {
  id: 'share-1',
  sharerUserId: 'self',
  sharerName: 'You',
  viewerUserId: 'viewer-1',
  viewerName: 'Jamie Fox',
  shareAbout: false,
  shareTags: false,
  shareNotes: false,
  sharePhone: false,
  hiddenContactIds: [],
  lockedContactIds: ['c2'],
  createdAt: new Date().toISOString(),
};

const fgRef = { current: undefined } as RefObject<ForceGraphMethods<GNode, GLink> | undefined>;

const setup = async () => {
  const hook = renderHook(() => useGraphController(fgRef));
  await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
  return hook;
};

beforeEach(() => {
  graphApi.fetchGraph.mockResolvedValue(structuredClone(baseGraph));
  graphApi.fetchShareGraph.mockResolvedValue(structuredClone(baseGraph));
  tagApi.fetchAllTags.mockResolvedValue([]);
  shareApi.fetchShareRequests.mockResolvedValue(structuredClone(emptyShareRequests));
  shareApi.fetchShares.mockResolvedValue(structuredClone(emptyShares));
  shareApi.fetchSelfProfile.mockResolvedValue(structuredClone(selfProfile));
  shareApi.updateSelfProfile.mockResolvedValue({ ...selfProfile, firstName: 'New', bio: 'New bio' });
  shareApi.updatePrivacy.mockResolvedValue(undefined);
  shareApi.respondToShareRequest.mockResolvedValue(undefined);
  shareApi.setShareHiddenContacts.mockResolvedValue(undefined);
  shareApi.updateShare.mockResolvedValue({ ...testShare, shareAbout: true });
  shareApi.deleteShare.mockResolvedValue(undefined);
});

afterEach(() => vi.clearAllMocks());

describe('useGraphController — SELF profile editing', () => {
  it('PATCHes /api/users/me (via updateSelfProfile), never /api/contacts, and updates the SELF node', async () => {
    const { result } = await setup();

    await act(async () => {
      await result.current.handleUpdateSelfProfile({ firstName: 'New', bio: 'New bio' });
    });

    expect(shareApi.updateSelfProfile).toHaveBeenCalledWith({ firstName: 'New', bio: 'New bio' });
    expect(contactApi.updateContact).not.toHaveBeenCalled();
    expect(result.current.selfNode?.firstName).toBe('New');
    expect(result.current.selfNode?.about).toBe('New bio');
  });
});

describe('useGraphController — F4 respond payloads', () => {
  it('sends {connect:true, allowView:true} for a full accept', async () => {
    const { result } = await setup();
    await act(async () => {
      await result.current.handleRespondToShareRequest('req-1', { connect: true, allowView: true });
    });
    expect(shareApi.respondToShareRequest).toHaveBeenCalledWith('req-1', { connect: true, allowView: true });
  });

  it('sends {connect:true, allowView:false} for connect-only', async () => {
    const { result } = await setup();
    await act(async () => {
      await result.current.handleRespondToShareRequest('req-1', { connect: true, allowView: false });
    });
    expect(shareApi.respondToShareRequest).toHaveBeenCalledWith('req-1', { connect: true, allowView: false });
  });

  it('decline sends {connect:false, allowView:false}', async () => {
    const { result } = await setup();
    await act(async () => {
      await result.current.handleRespondToShareRequest('req-1', { connect: false, allowView: false });
    });
    expect(shareApi.respondToShareRequest).toHaveBeenCalledWith('req-1', { connect: false, allowView: false });
    // A decline never re-fetches the graph — nothing changed on your side.
    expect(graphApi.fetchGraph).toHaveBeenCalledTimes(1);
  });

  it('refetches the graph after an accept (connect or allowView true)', async () => {
    const { result } = await setup();
    await act(async () => {
      await result.current.handleRespondToShareRequest('req-1', { connect: false, allowView: true });
    });
    expect(graphApi.fetchGraph).toHaveBeenCalledTimes(2);
  });
});

describe('useGraphController — F7 privacy toggle', () => {
  it('PUTs the new value via updatePrivacy', async () => {
    const { result } = await setup();
    await act(async () => {
      await result.current.handleUpdatePrivacy(true);
    });
    expect(shareApi.updatePrivacy).toHaveBeenCalledWith(true);
    expect(result.current.selfProfile?.discoverableInSharedGraphs).toBe(true);
  });
});

describe('useGraphController — F5 share-mode state machine', () => {
  it('toggles an own contact between shared and hidden', async () => {
    const { result } = await setup();
    act(() => result.current.enterShareMode(testShare));
    expect(result.current.shareMode?.hidden.has('c1')).toBe(false);

    act(() => result.current.toggleShareModeContact('c1'));
    expect(result.current.shareMode?.hidden.has('c1')).toBe(true);

    act(() => result.current.toggleShareModeContact('c1'));
    expect(result.current.shareMode?.hidden.has('c1')).toBe(false);
  });

  it('never toggles a locked (opted-out registered) contact', async () => {
    const { result } = await setup();
    act(() => result.current.enterShareMode(testShare));
    act(() => result.current.toggleShareModeContact('c2'));
    expect(result.current.shareMode?.hidden.has('c2')).toBe(false);
  });

  it('never toggles SELF', async () => {
    const { result } = await setup();
    act(() => result.current.enterShareMode(testShare));
    act(() => result.current.toggleShareModeContact('self'));
    expect(result.current.shareMode?.hidden.has('self')).toBe(false);
  });

  it('entering/toggling share mode never hands the graph a structurally new graphData — node identity and positions are untouched', async () => {
    const { result } = await setup();
    const forceGraphDataBefore = result.current.forceGraphData;
    const nodesBefore = forceGraphDataBefore.nodes;

    act(() => result.current.enterShareMode(testShare));
    expect(result.current.forceGraphData).toBe(forceGraphDataBefore);
    expect(result.current.forceGraphData.nodes).toBe(nodesBefore);

    act(() => result.current.toggleShareModeContact('c1'));
    expect(result.current.forceGraphData).toBe(forceGraphDataBefore);
    expect(result.current.forceGraphData.nodes).toBe(nodesBefore);

    act(() => result.current.toggleShareModeContact('c1'));
    expect(result.current.forceGraphData).toBe(forceGraphDataBefore);

    act(() => result.current.cancelShareMode());
    expect(result.current.forceGraphData).toBe(forceGraphDataBefore);
  });

  it('preview ids are exactly the toggled + locked contacts, and every link endpoint id still resolves in forceGraphData.nodes', async () => {
    const { result } = await setup();
    act(() => result.current.enterShareMode(testShare));

    // c2 is locked from the start (testShare.lockedContactIds); toggle c1 hidden too.
    expect(result.current.shareModePreviewIds?.has('c2')).toBe(true);
    act(() => result.current.toggleShareModeContact('c1'));
    expect(result.current.shareModePreviewIds).toEqual(new Set(['c1', 'c2']));

    const nodeIds = new Set(result.current.forceGraphData.nodes.map((n) => n.id));
    result.current.forceGraphData.links.forEach((l) => {
      expect(nodeIds.has(l.source)).toBe(true);
      expect(nodeIds.has(l.target)).toBe(true);
    });
  });

  it('Save sends the full hidden set (PUT hidden-contacts) plus the flags (PATCH), then exits', async () => {
    const { result } = await setup();
    act(() => result.current.enterShareMode(testShare));
    act(() => result.current.toggleShareModeContact('c1'));
    act(() => result.current.setShareModeFlag('shareAbout', true));

    await act(async () => {
      await result.current.saveShareMode();
    });

    expect(shareApi.setShareHiddenContacts).toHaveBeenCalledWith('share-1', ['c1']);
    expect(shareApi.updateShare).toHaveBeenCalledWith('share-1', {
      shareAbout: true,
      shareTags: false,
      shareNotes: false,
      sharePhone: false,
    });
    expect(result.current.shareMode).toBeNull();
  });

  it('Cancel exits without saving anything', async () => {
    const { result } = await setup();
    act(() => result.current.enterShareMode(testShare));
    act(() => result.current.toggleShareModeContact('c1'));

    act(() => result.current.cancelShareMode());

    expect(result.current.shareMode).toBeNull();
    expect(shareApi.setShareHiddenContacts).not.toHaveBeenCalled();
    expect(shareApi.updateShare).not.toHaveBeenCalled();
  });
});

describe("useGraphController — F6 Other's graphs", () => {
  it('loads a read-only Graph via GET /api/shares/{id}/graph', async () => {
    const { result } = await setup();
    await act(async () => {
      await result.current.openOtherGraph(testShare);
    });
    expect(graphApi.fetchShareGraph).toHaveBeenCalledWith('share-1');
    expect(result.current.viewingGraph).not.toBeNull();
    expect(result.current.viewingShare).toEqual(testShare);
  });
});
