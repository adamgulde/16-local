import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TagSection } from './TagSection';
import type { TagAssignment } from '../../services/tagService';

const api = vi.hoisted(() => ({
  fetchTagsForUser: vi.fn(),
  fetchAllTags: vi.fn(),
  removeTagFromUser: vi.fn(),
}));
vi.mock('../../services/tagService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/tagService')>()),
  ...api,
}));

const jazz: TagAssignment = {
  id: 'assignment-1',
  category: 'Personal Interests',
  label: 'Jazz',
  isSelfTag: true,
  isMine: true,
  kind: 'SELF',
  tagId: 'jazz',
  parentId: 'music',
  level: 3,
  icon: 'heart',
  fullPath: 'Personal Interests › Music › Jazz',
};

beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation((media: string) => ({
    matches: false,
    media,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  api.fetchAllTags.mockResolvedValue([]);
  api.fetchTagsForUser.mockResolvedValue([jazz]);
  api.removeTagFromUser.mockResolvedValue(undefined);
});

afterEach(() => vi.clearAllMocks());

describe('TagSection', () => {
  it('shows tags loaded with the directory without requesting them', () => {
    render(<TagSection subjectId="u1" isCurrentUser tags={[jazz]} onTagsChange={vi.fn()} />);

    expect(screen.getByText('Jazz')).toBeInTheDocument();
    expect(api.fetchTagsForUser).not.toHaveBeenCalled();
  });

  it('fetches them itself in views without the directory', async () => {
    render(<TagSection subjectId="u1" isCurrentUser />);

    expect(await screen.findByText('Jazz')).toBeInTheDocument();
    expect(api.fetchTagsForUser).toHaveBeenCalledWith('u1');
  });

  it('hands edits back to the directory as functional updates', async () => {
    const onTagsChange = vi.fn();
    render(<TagSection subjectId="u1" isCurrentUser tags={[jazz]} onTagsChange={onTagsChange} />);

    fireEvent.click(screen.getByRole('button', { name: /Add tags/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove Jazz' }));

    await waitFor(() => expect(onTagsChange).toHaveBeenCalledTimes(1));
    const update = onTagsChange.mock.calls[0][0];
    expect(update([jazz])).toEqual([]);
    expect(api.fetchTagsForUser).not.toHaveBeenCalled();
  });
});
