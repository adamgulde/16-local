import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Instructions } from './Instructions';

describe('Instructions', () => {
  it('explains that data stays on the phone and covers closeness', () => {
    render(<Instructions />);
    expect(screen.getByText('How 16 Local works')).toBeTruthy();
    expect(screen.getByText(/stored on this phone/)).toBeTruthy();
    expect(screen.getByText('Closeness')).toBeTruthy();
  });
});
