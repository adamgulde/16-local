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
  strength: 3 as const,
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
