import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';

const BombComponent = () => {
  throw new Error('Explosion with internal stack trace details');
};

const SafeComponent = () => <div>Safe Content</div>;

describe('ErrorBoundary', () => {
  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <SafeComponent />
      </ErrorBoundary>
    );

    expect(screen.getByText('Safe Content')).toBeInTheDocument();
  });

  it('renders clean fallback without displaying raw error text or stack traces when a child crashes', () => {
    // Suppress console.warn during test
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <BombComponent />
      </ErrorBoundary>
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText(/An unexpected display error occurred/i)).toBeInTheDocument();
    // Ensure raw error message or stack trace is NOT rendered to the user
    expect(screen.queryByText(/Explosion with internal stack trace details/i)).not.toBeInTheDocument();

    consoleWarnSpy.mockRestore();
  });

  it('renders custom fallback when provided', () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(
      <ErrorBoundary fallback={<div>Custom Safe Fallback</div>}>
        <BombComponent />
      </ErrorBoundary>
    );

    expect(screen.getByText('Custom Safe Fallback')).toBeInTheDocument();
    expect(screen.queryByText(/Explosion/i)).not.toBeInTheDocument();

    consoleWarnSpy.mockRestore();
  });
});
