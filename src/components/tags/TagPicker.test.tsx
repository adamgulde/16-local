import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TagPicker } from './TagPicker';
import type { Tag } from '../../services/tagService';
import { buildTagIndex, disambiguator, searchTags } from '../../utils/tagTree';

const node = (id: string, label: string, parentId: string | null, extra: Partial<Tag> = {}): Tag => ({
  id,
  label,
  parentId,
  category: '',
  level: 1,
  icon: null,
  displayOrder: 0,
  fullPath: label,
  hasChildren: false,
  selectable: parentId !== null,
  selfOnly: false,
  ...extra,
});

// Personal Interests > Music > Jazz ; Education > Major > Music ; Age Range {self} > 30–39
const TAGS: Tag[] = [
  node('interests', 'Personal Interests', null, { hasChildren: true, icon: 'heart' }),
  node('music', 'Music', 'interests', { hasChildren: true, fullPath: 'Personal Interests › Music' }),
  node('jazz', 'Jazz', 'music', { fullPath: 'Personal Interests › Music › Jazz' }),
  node('education', 'Education', null, { hasChildren: true }),
  node('major', 'Major', 'education', { hasChildren: true }),
  node('music-major', 'Music', 'major', { fullPath: 'Education › Major › Music' }),
  node('age', 'Age Range', null, { hasChildren: true, selfOnly: true }),
  node('age30', '30–39', 'age', { selfOnly: true }),
];

const renderPicker = (props: Partial<Parameters<typeof TagPicker>[0]> = {}) => {
  const onPick = vi.fn();
  render(<TagPicker tags={TAGS} query="" appliedIds={new Set()} onPick={onPick} rows={7} {...props} />);
  return { onPick };
};

describe('tagTree', () => {
  const index = buildTagIndex(TAGS);

  it('ranks label prefixes before path-only matches and never suggests categories', () => {
    const results = searchTags(index, 'mu', { include: () => true });
    expect(results.map((t) => t.id)).toEqual(['music', 'music-major', 'jazz']);
    expect(searchTags(index, 'personal', { include: () => true }).map((t) => t.id)).not.toContain('interests');
  });

  it('scopes suggestions to the browsed node', () => {
    expect(searchTags(index, 'music', { withinId: 'education', include: () => true }).map((t) => t.id)).toEqual(['music-major']);
  });

  it('disambiguates duplicate labels with the parent', () => {
    const visible = [index.byId.get('music')!, index.byId.get('music-major')!];
    expect(disambiguator(visible[1], visible, index)).toBe('Major');
    expect(disambiguator(index.byId.get('jazz')!, [index.byId.get('jazz')!], index)).toBeNull();
  });
});

describe('TagPicker', () => {
  it('opens one category at a time and drills into subcategories', () => {
    const { onPick } = renderPicker();

    fireEvent.click(screen.getByRole('tab', { name: /Personal Interests/ }));
    expect(screen.getByRole('tab', { name: /Personal Interests/ })).toHaveAttribute('aria-selected', 'true');

    // "Music" has children: its chevron drills in, its label selects it.
    fireEvent.click(screen.getByRole('button', { name: 'Show tags under Music' }));
    fireEvent.click(screen.getByRole('button', { name: 'Jazz' }));
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: 'jazz' }));

    fireEvent.click(screen.getByRole('tab', { name: /Education/ }));
    expect(screen.getByRole('tab', { name: /Personal Interests/ })).toHaveAttribute('aria-selected', 'false');
  });

  it('hides self-only categories when tagging someone else', () => {
    renderPicker({ excludeSelfOnly: true });
    expect(screen.queryByRole('tab', { name: /Age Range/ })).not.toBeInTheDocument();
  });

  it('offers a custom tag only once a category is chosen when one is required', () => {
    const onCreateCustom = vi.fn();
    renderPicker({ query: 'Bebop', onCreateCustom, customNeedsParent: true });
    expect(screen.getByText(/Pick a category to add “Bebop”/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /Personal Interests/ }));
    fireEvent.click(screen.getByRole('button', { name: /Add “Bebop” to Personal Interests/ }));
    expect(onCreateCustom).toHaveBeenCalledWith('Bebop', expect.objectContaining({ id: 'interests' }));
  });

  it('shows applied tags as pressed', () => {
    renderPicker({ query: 'jazz', appliedIds: new Set(['jazz']) });
    expect(screen.getByRole('button', { name: 'Jazz' })).toHaveAttribute('aria-pressed', 'true');
  });
});
