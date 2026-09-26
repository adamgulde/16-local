import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MillerColumn, type MillerColumnEntry } from './MillerColumn';

const noop = () => {};

const renderColumn = (entries: MillerColumnEntry[]) =>
  render(<MillerColumn title="Contacts" entries={entries} selectedId={null} onSelect={noop} />);

describe('MillerColumn avatar initials', () => {
  it('only takes initials from words starting with a letter/digit — a parenthetical annotation never contributes', () => {
    renderColumn([{ id: '1', label: 'Blake (met at gym)' }]);
    // Previously rendered "B(" — the "(" from the annotation must never show up as an initial.
    expect(screen.queryByText('B(')).not.toBeInTheDocument();
    expect(screen.getByText('BA')).toBeInTheDocument();
  });

  it('takes the first letter of each of the first two ordinary words', () => {
    renderColumn([{ id: '1', label: 'Dana Price' }]);
    expect(screen.getByText('DP')).toBeInTheDocument();
  });

  it('handles a single-word label', () => {
    renderColumn([{ id: '1', label: 'Cher' }]);
    expect(screen.getByText('C')).toBeInTheDocument();
  });
});
