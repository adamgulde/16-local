import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { OtherGraphView } from './OtherGraphView';
import type { Share } from '../services/shareService';

// react-force-graph-2d isn't unit-tested anywhere in this codebase (it needs a real canvas) — stub
// it to a lightweight component that just captures whatever props it was given, so this test can
// assert the read-only contract (no click handlers at all) without touching canvas internals.
type CapturedProps = ComponentProps<typeof import('react-force-graph-2d').default>;
let captured: CapturedProps | null = null;
vi.mock('react-force-graph-2d', () => ({
  default: (props: CapturedProps) => {
    captured = props;
    return <div data-testid="mock-force-graph" />;
  },
}));

const share: Share = {
  id: 'share-1',
  sharerUserId: 'u1',
  sharerName: 'Sam Rivera',
  viewerUserId: 'self',
  viewerName: 'You',
  shareAbout: false,
  shareTags: false,
  shareNotes: false,
  sharePhone: false,
  hiddenContactIds: null,
  lockedContactIds: [],
  createdAt: new Date().toISOString(),
};

describe('OtherGraphView — read-only "Other\'s graphs" (F6)', () => {
  it('shows the read-only banner with the sharer\'s name', () => {
    render(<OtherGraphView share={share} data={{ nodes: [], links: [] }} loading={false} error={null} onClose={vi.fn()} />);
    expect(screen.getByText("Viewing Sam Rivera's graph — read only")).toBeInTheDocument();
  });

  it('renders no click/edit handlers on the graph at all — no way to select or modify a node', () => {
    render(<OtherGraphView share={share} data={{ nodes: [], links: [] }} loading={false} error={null} onClose={vi.fn()} />);
    expect(captured?.onNodeClick).toBeUndefined();
    expect(captured?.onBackgroundClick).toBeUndefined();
    expect(captured?.enableNodeDrag).toBe(false);
  });

  it('shows a loading state while the graph is being fetched', () => {
    render(<OtherGraphView share={share} data={null} loading error={null} onClose={vi.fn()} />);
    expect(screen.getByText(/Loading Sam Rivera's graph/)).toBeInTheDocument();
    expect(screen.queryByTestId('mock-force-graph')).not.toBeInTheDocument();
  });

  it('surfaces a load error instead of a blank graph', () => {
    render(<OtherGraphView share={share} data={null} loading={false} error="Could not load this person's graph." onClose={vi.fn()} />);
    expect(screen.getByText("Could not load this person's graph.")).toBeInTheDocument();
  });
});
