import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TagSection } from './TagSection';
import type { Tag } from '../../services/tagService';

const api = vi.hoisted(() => ({
  addTagToUser: vi.fn(),
  removeTagFromUser: vi.fn(),
  fetchAllTags: vi.fn(),
  peekAllTags: vi.fn(),
}));
vi.mock('../../services/tagService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/tagService')>()),
  ...api,
}));

const jazz: Tag = { id: 'jazz', label: 'Jazz' };
const chess: Tag = { id: 'chess', label: 'Chess' };

beforeEach(() => {
  api.fetchAllTags.mockResolvedValue([jazz, chess]);
  api.peekAllTags.mockReturnValue([jazz, chess]);
  api.removeTagFromUser.mockResolvedValue(undefined);
  api.addTagToUser.mockResolvedValue([jazz, chess]);
});

afterEach(() => vi.clearAllMocks());

describe('TagSection', () => {
  it('shows the person’s tags', () => {
    render(<TagSection subjectId="p1" tags={[jazz]} onTagsChange={vi.fn()} />);
    expect(screen.getByText('Jazz')).toBeInTheDocument();
  });

  it('removes a tag and reports the new list', async () => {
    const onTagsChange = vi.fn();
    render(<TagSection subjectId="p1" tags={[jazz]} onTagsChange={onTagsChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Jazz' }));
    await waitFor(() => expect(onTagsChange).toHaveBeenCalledTimes(1));
    expect(api.removeTagFromUser).toHaveBeenCalledWith('p1', 'jazz');
    expect(onTagsChange.mock.calls[0][0]([jazz])).toEqual([]);
  });

  it('suggests existing tags the person does not have yet, and applies one by id', async () => {
    const onTagsChange = vi.fn();
    render(<TagSection subjectId="p1" tags={[jazz]} onTagsChange={onTagsChange} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Add a tag' }), { target: { value: 'ch' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Chess' }));
    await waitFor(() => expect(api.addTagToUser).toHaveBeenCalledWith('p1', { tagId: 'chess' }));
  });

  it('offers to create a new tag when the typed name is not in the list', async () => {
    render(<TagSection subjectId="p1" tags={[]} onTagsChange={vi.fn()} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Add a tag' }), { target: { value: 'Pottery' } });
    fireEvent.click(await screen.findByRole('button', { name: /Create “Pottery”/ }));
    await waitFor(() => expect(api.addTagToUser).toHaveBeenCalledWith('p1', { label: 'Pottery' }));
  });
});
