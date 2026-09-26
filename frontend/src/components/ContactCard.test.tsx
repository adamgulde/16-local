import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ContactCard } from './ContactCard';
import type { GraphNode } from '../services/graphService';

const tagsApi = vi.hoisted(() => ({
  fetchAllTags: vi.fn(),
  fetchTagsForUser: vi.fn(),
}));
vi.mock('../services/tagService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/tagService')>()),
  ...tagsApi,
}));

const baseNode: GraphNode = {
  id: 'c1',
  kind: 'PLACEHOLDER',
  firstName: 'Dana',
  lastName: 'Price',
  about: 'Met at a conference.',
  phoneNumber: null,
  tags: [],
  note: '',
  profile: null,
  linkedUserId: null,
  source: null,
  editable: true,
};

beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation((media: string) => ({
    matches: false,
    media,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  tagsApi.fetchAllTags.mockResolvedValue([]);
  tagsApi.fetchTagsForUser.mockResolvedValue([]);
});

afterEach(() => vi.clearAllMocks());

const noop = () => {};
const noopAsync = async () => {};

describe('ContactCard', () => {
  it('renders edit/link/delete actions for an editable (own) contact', () => {
    render(
      <ContactCard
        node={baseNode}
        ownContacts={[]}
        linkedIds={new Set()}
        onClose={noop}
        onUpdate={noop}
        onDelete={noop}
        onLink={noop}
        onUnlink={noop}
        onTagsChange={noop}
        onNoteChange={noop}
        onSaveNote={noopAsync}
        onFindPath={noop}
      />
    );

    expect(screen.getByText('Dana Price')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Link to…' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Delete/ })).toBeInTheDocument();
    expect(screen.getByText('Met at a conference.')).toBeInTheDocument();
  });

  it('renders read-only for a shared (not-yours) node — no edit/link/delete', () => {
    const shared: GraphNode = {
      ...baseNode,
      id: 'c2',
      editable: false,
      source: { shareId: 's1', sharerUserId: 'u1', sharerName: 'Sam Rivera' },
    };
    render(
      <ContactCard
        node={shared}
        ownContacts={[]}
        linkedIds={new Set()}
        onClose={noop}
        onUpdate={noop}
        onDelete={noop}
        onLink={noop}
        onUnlink={noop}
        onTagsChange={noop}
        onNoteChange={noop}
        onSaveNote={noopAsync}
        onFindPath={noop}
      />
    );

    expect(screen.getByText('via Sam Rivera')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Link to…' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Delete/ })).not.toBeInTheDocument();
    // Find Path is still offered — that's a client-side graph action, not an edit.
    expect(screen.getByRole('button', { name: 'Find Path' })).toBeInTheDocument();
  });

  it('renders the shared Note and Phone (when included), plus "Their profile" for a linked user, in the read-only card', () => {
    const shared: GraphNode = {
      ...baseNode,
      id: 'c2',
      kind: 'REGISTERED',
      editable: false,
      phoneNumber: '+15551234567',
      note: 'Follow up re: internship',
      linkedUserId: 'u-jordan',
      profile: { bio: 'I like hiking.', tags: [] },
      source: { shareId: 's1', sharerUserId: 'u1', sharerName: 'Sam Rivera' },
    };
    render(
      <ContactCard
        node={shared}
        ownContacts={[]}
        linkedIds={new Set()}
        onClose={noop}
        onUpdate={noop}
        onDelete={noop}
        onLink={noop}
        onUnlink={noop}
        onTagsChange={noop}
        onNoteChange={noop}
        onSaveNote={noopAsync}
        onFindPath={noop}
      />
    );

    expect(screen.getByText('Follow up re: internship')).toBeInTheDocument();
    expect(screen.getByText('+1 555-123-4567')).toBeInTheDocument();
    expect(screen.getByText('Their profile')).toBeInTheDocument();
    expect(screen.getByText('I like hiking.')).toBeInTheDocument();
  });

  it('falls back to consistent "not shared" copy for every read-only section left out of the share', () => {
    const shared: GraphNode = {
      ...baseNode,
      id: 'c2',
      about: '',
      editable: false,
      source: { shareId: 's1', sharerUserId: 'u1', sharerName: 'Sam Rivera' },
    };
    render(
      <ContactCard
        node={shared}
        ownContacts={[]}
        linkedIds={new Set()}
        onClose={noop}
        onUpdate={noop}
        onDelete={noop}
        onLink={noop}
        onUnlink={noop}
        onTagsChange={noop}
        onNoteChange={noop}
        onSaveNote={noopAsync}
        onFindPath={noop}
      />
    );

    expect(screen.getByText('Nothing written yet.')).toBeInTheDocument(); // About
    expect(screen.getByText('No tags shared.')).toBeInTheDocument();
    expect(screen.getByText('No note shared.')).toBeInTheDocument();
    expect(screen.getByText('No phone shared.')).toBeInTheDocument();
  });

  it('renders only "Hidden User" for a HIDDEN node, with no actions at all', () => {
    const hidden: GraphNode = {
      ...baseNode,
      id: 'c3',
      kind: 'HIDDEN',
      firstName: 'Hidden',
      lastName: 'User',
      editable: false,
      source: { shareId: 's1', sharerUserId: 'u1', sharerName: 'Sam Rivera' },
    };
    render(
      <ContactCard
        node={hidden}
        ownContacts={[]}
        linkedIds={new Set()}
        onClose={noop}
        onUpdate={noop}
        onDelete={noop}
        onLink={noop}
        onUnlink={noop}
        onTagsChange={noop}
        onNoteChange={noop}
        onSaveNote={noopAsync}
        onFindPath={noop}
      />
    );

    expect(screen.getByText('Hidden User')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Find Path' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  });

  it('caps the SELF bio editor at 2,000 characters (users.bio DB column limit)', () => {
    const selfNode: GraphNode = {
      ...baseNode,
      id: 'self-1',
      kind: 'SELF',
      firstName: 'You',
      lastName: '',
      about: 'Short bio.',
    };
    render(
      <ContactCard
        node={selfNode}
        ownContacts={[]}
        linkedIds={new Set()}
        onClose={noop}
        onUpdate={noop}
        onUpdateSelf={noop}
        onDelete={noop}
        onLink={noop}
        onUnlink={noop}
        onTagsChange={noop}
        onNoteChange={noop}
        onSaveNote={noopAsync}
        onFindPath={noop}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const textarea = screen.getByPlaceholderText('Your bio…') as HTMLTextAreaElement;
    expect(textarea.maxLength).toBe(2000);

    fireEvent.change(textarea, { target: { value: 'a'.repeat(2500) } });
    expect(textarea.value.length).toBe(2000);
    expect(screen.getByText('2000/2000')).toBeInTheDocument();
  });

  it('does not cap a contact\'s "about" editor at 2,000 characters — only the self bio has a DB limit', () => {
    render(
      <ContactCard
        node={baseNode}
        ownContacts={[]}
        linkedIds={new Set()}
        onClose={noop}
        onUpdate={noop}
        onDelete={noop}
        onLink={noop}
        onUnlink={noop}
        onTagsChange={noop}
        onNoteChange={noop}
        onSaveNote={noopAsync}
        onFindPath={noop}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const textarea = screen.getByPlaceholderText('About this person…') as HTMLTextAreaElement;
    expect(textarea.maxLength).toBe(-1);

    fireEvent.change(textarea, { target: { value: 'a'.repeat(2500) } });
    expect(textarea.value.length).toBe(2500);
  });
});
