import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Graph } from '../../services/graphService';
import type { Share, SharesResponse, ShareRequestsResponse, SelfProfile } from '../../services/shareService';
import type { User } from '../../services/userService';
import { MillerColumnsView } from './MillerColumnsView';

const graphApi = vi.hoisted(() => ({
  fetchGraph: vi.fn(),
  fetchShareGraph: vi.fn(),
}));
vi.mock('../../services/graphService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/graphService')>()),
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
vi.mock('../../services/contactService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/contactService')>()),
  ...contactApi,
}));

const tagApi = vi.hoisted(() => ({ fetchAllTags: vi.fn() }));
vi.mock('../../services/tagService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/tagService')>()),
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
vi.mock('../../services/shareService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/shareService')>()),
  ...shareApi,
}));

const currentUser: User = {
  id: 'self',
  firstName: 'You',
  lastName: 'Person',
  phoneNumber: null,
  bio: '',
};

const ownGraph: Graph = {
  nodes: [
    { id: 'self', kind: 'SELF', firstName: 'You', lastName: 'Person', about: '', phoneNumber: null, tags: [], note: '', profile: null, linkedUserId: null, source: null, editable: true },
    { id: 'c1', kind: 'PLACEHOLDER', firstName: 'Dana', lastName: 'Price', about: '', phoneNumber: null, tags: [], note: '', profile: null, linkedUserId: null, source: null, editable: true },
    { id: 'c2', kind: 'REGISTERED', firstName: 'Riley', lastName: 'Chen', about: '', phoneNumber: null, tags: [], note: '', profile: null, linkedUserId: 'u-riley', source: null, editable: true },
  ],
  edges: [
    { source: 'self', target: 'c1', kind: 'DIRECT', shareId: null },
    { source: 'self', target: 'c2', kind: 'DIRECT', shareId: null },
  ],
};

const rileyShare: Share = {
  id: 'share-riley',
  sharerUserId: 'u-riley',
  sharerName: 'Riley Chen',
  viewerUserId: 'self',
  viewerName: 'You Person',
  shareAbout: false,
  shareTags: false,
  shareNotes: false,
  sharePhone: false,
  hiddenContactIds: null,
  lockedContactIds: [],
  createdAt: new Date().toISOString(),
};

const rileyGraph: Graph = {
  nodes: [
    { id: 'riley-self', kind: 'SELF', firstName: 'Riley', lastName: 'Chen', about: '', phoneNumber: null, tags: [], note: '', profile: null, linkedUserId: null, source: null, editable: false },
    { id: 'riley-c1', kind: 'PLACEHOLDER', firstName: 'Morgan', lastName: 'Lee', about: '', phoneNumber: null, tags: [], note: '', profile: null, linkedUserId: null, source: { shareId: 'share-riley', sharerUserId: 'u-riley', sharerName: 'Riley Chen' }, editable: false },
    { id: 'riley-hidden', kind: 'HIDDEN', firstName: 'Hidden', lastName: 'User', about: '', phoneNumber: null, tags: [], note: '', profile: null, linkedUserId: null, source: { shareId: 'share-riley', sharerUserId: 'u-riley', sharerName: 'Riley Chen' }, editable: false },
  ],
  edges: [],
};

const emptyShareRequests: ShareRequestsResponse = { incoming: [], outgoing: [] };
const selfProfile: SelfProfile = {
  id: 'self',
  firstName: 'You',
  lastName: 'Person',
  bio: '',
  inviteCode: 'ABC123',
  discoverableInSharedGraphs: false,
};

beforeEach(() => {
  // jsdom has neither matchMedia (used by useIsMobile, via TagSection) nor Element.scrollTo (used
  // to reveal a newly-opened column) — stub both.
  window.matchMedia = vi.fn().mockImplementation((media: string) => ({
    matches: false,
    media,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  Element.prototype.scrollTo = vi.fn();
  graphApi.fetchGraph.mockResolvedValue(structuredClone(ownGraph));
  graphApi.fetchShareGraph.mockResolvedValue(structuredClone(rileyGraph));
  tagApi.fetchAllTags.mockResolvedValue([]);
  shareApi.fetchShareRequests.mockResolvedValue(structuredClone(emptyShareRequests));
  const sharesResponse: SharesResponse = { sharedByMe: [], sharedWithMe: [structuredClone(rileyShare)] };
  shareApi.fetchShares.mockResolvedValue(sharesResponse);
  shareApi.fetchSelfProfile.mockResolvedValue(structuredClone(selfProfile));
});

afterEach(() => vi.clearAllMocks());

describe('MillerColumnsView (F8) — private-network model', () => {
  it("renders your own contacts (excluding SELF) in the root column, sorted by name", async () => {
    render(<MillerColumnsView currentUser={currentUser} onSwitchToGraph={vi.fn()} />);

    await waitFor(() => expect(screen.getByText('Dana Price')).toBeInTheDocument());
    expect(screen.getByText('Riley Chen')).toBeInTheDocument();
    expect(screen.queryByText('You Person')).not.toBeInTheDocument();

    // "Other's graphs" is also offered as a root entry.
    expect(screen.getByText("Other's graphs")).toBeInTheDocument();
  });

  it("drills from a REGISTERED contact into that person's shared graph, read-only, with HIDDEN nodes as 'Hidden User'", async () => {
    render(<MillerColumnsView currentUser={currentUser} onSwitchToGraph={vi.fn()} />);

    await waitFor(() => expect(screen.getByText('Riley Chen')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Riley Chen'));

    await waitFor(() => expect(graphApi.fetchShareGraph).toHaveBeenCalledWith('share-riley'));
    await waitFor(() => expect(screen.getByText('Morgan Lee')).toBeInTheDocument());
    expect(screen.getByText('Hidden User')).toBeInTheDocument();

    // Selecting the shared contact shows a read-only card — no Edit affordance.
    fireEvent.click(screen.getByText('Morgan Lee'));
    const card = await screen.findByRole('heading', { name: 'Morgan Lee' });
    const cardContainer = card.closest('.contact-card') as HTMLElement;
    expect(within(cardContainer).queryByText('Edit')).not.toBeInTheDocument();
  });

  it("reaches the same shared graph via the standalone \"Other's graphs\" root entry", async () => {
    render(<MillerColumnsView currentUser={currentUser} onSwitchToGraph={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("Other's graphs")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Other's graphs"));

    // Both the root column (your own "Riley Chen" contact) and the new "Other's graphs" list
    // (the sharer "Riley Chen") are visible side-by-side on desktop — pick the second occurrence,
    // which belongs to the shares list.
    await waitFor(() => expect(screen.getAllByText('Riley Chen').length).toBeGreaterThanOrEqual(2));
    const matches = screen.getAllByText('Riley Chen');
    fireEvent.click(matches[matches.length - 1]);

    await waitFor(() => expect(graphApi.fetchShareGraph).toHaveBeenCalledWith('share-riley'));
    await waitFor(() => expect(screen.getByText('Morgan Lee')).toBeInTheDocument());
  });
});
