import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Instructions } from './Instructions';

// jsdom has no matchMedia (used by useIsMobile); stub it. Instructions itself draws to a raw
// <canvas> (not react-force-graph-2d), and jsdom's canvas.getContext('2d') returns null without a
// canvas backend installed, so the physics/render loop simply no-ops — nothing further to stub.
beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation((media: string) => ({
    matches: false,
    media,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
});

const renderInstructions = () =>
  render(
    <MemoryRouter>
      <Instructions currentUser={null} />
    </MemoryRouter>
  );

describe('Instructions (F9) — private-network HUD tutorial', () => {
  it('renders all 5 sections without errors, in order, using fictional demo names', () => {
    renderInstructions();

    const titles = [
      'Your Private Graph',
      'Tags & Notes',
      'Share Requests',
      'Share Mode & Hidden Users',
      "Other's Graphs & Search",
    ];

    for (const title of titles.slice(0, -1)) {
      expect(screen.getByText(title)).toBeInTheDocument();
      fireEvent.click(screen.getByText('Next'));
    }
    expect(screen.getByText(titles[titles.length - 1])).toBeInTheDocument();

    // No leftover fake real-person names (e.g. "Elon Musk") from the old global-map demo.
    expect(screen.queryByText(/Elon Musk/)).not.toBeInTheDocument();
  });

  it('step 1 demonstrates the private graph: placeholder vs registered contacts', () => {
    renderInstructions();
    expect(screen.getByText('Your Private Graph')).toBeInTheDocument();
    expect(screen.getByText(/placeholder/i)).toBeInTheDocument();
    expect(screen.getByText(/registered/i)).toBeInTheDocument();
  });

  it('step 3 (share requests) lets you accept with independent connect/allow-view choices', () => {
    renderInstructions();
    fireEvent.click(screen.getByText('Next'));
    fireEvent.click(screen.getByText('Next'));
    expect(screen.getByText('Share Requests')).toBeInTheDocument();

    fireEvent.click(screen.getByTitle('Share requests'));
    expect(screen.getByText('Priya Anand')).toBeInTheDocument();
    expect(screen.getByLabelText('Connect with her')).toBeInTheDocument();
    expect(screen.getByLabelText('Let her view my graph')).toBeInTheDocument();
  });

  it('step 4 (share mode) explains Hidden Users and locked third parties', () => {
    renderInstructions();
    fireEvent.click(screen.getByText('Next'));
    fireEvent.click(screen.getByText('Next'));
    fireEvent.click(screen.getByText('Next'));
    expect(screen.getByText('Share Mode & Hidden Users')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Edit what Riley sees'));
    expect(screen.getByText('Dana Price')).toBeInTheDocument();
    expect(screen.getByText('Casey Alvarez')).toBeInTheDocument();
    expect(screen.getByText('Hidden User (locked)')).toBeInTheDocument();
  });

  it("step 5 offers Other's graphs and unlocks the columns view switcher", () => {
    renderInstructions();
    fireEvent.click(screen.getByText('Next'));
    fireEvent.click(screen.getByText('Next'));
    fireEvent.click(screen.getByText('Next'));
    fireEvent.click(screen.getByText('Next'));
    expect(screen.getByText("Other's Graphs & Search")).toBeInTheDocument();
    const columnsButton = screen.getByRole('button', { name: /Columns/ });
    expect(columnsButton).toBeInTheDocument();

    fireEvent.click(columnsButton);
    expect(screen.getByText("Other's graphs")).toBeInTheDocument();
    expect(screen.getByText('MY CONTACTS')).toBeInTheDocument();
  });
});
