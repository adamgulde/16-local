import { describe, expect, it, vi, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Login } from './Login';

const api = vi.hoisted(() => ({
  initiateSignInOtp: vi.fn(),
  verifySignInOtp: vi.fn(),
}));
vi.mock('../../services/authService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/authService')>()),
  ...api,
}));

afterEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

const fillPhoneAndSubmit = () => {
  fireEvent.change(screen.getByPlaceholderText('+1 ___-___-____'), { target: { value: '5551234567' } });
  fireEvent.click(screen.getByRole('button', { name: /Send Verification Code/ }));
};

describe('Login (S2 no-enumeration copy)', () => {
  it('shows the same neutral copy after sending, whether or not the number is eligible', async () => {
    api.initiateSignInOtp.mockResolvedValueOnce(undefined);
    render(
      <MemoryRouter>
        <Login onLogin={vi.fn()} />
      </MemoryRouter>
    );

    fillPhoneAndSubmit();

    await waitFor(() => expect(api.initiateSignInOtp).toHaveBeenCalled());
    expect(await screen.findByText("If this number can be used here, we've sent a code.")).toBeInTheDocument();
    expect(screen.getByText(/You may need to/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'sign up' })).toHaveAttribute('href', '/register');
  });

  it('shows a Retry-After-aware message on 429', async () => {
    api.initiateSignInOtp.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 429, headers: { 'retry-after': '45' } },
    });
    render(
      <MemoryRouter>
        <Login onLogin={vi.fn()} />
      </MemoryRouter>
    );

    fillPhoneAndSubmit();

    expect(await screen.findByText('Too many attempts. Please wait 45s and try again.')).toBeInTheDocument();
  });

  it('falls back to a generic rate-limit message when Retry-After is absent', async () => {
    api.initiateSignInOtp.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 429, headers: {} },
    });
    render(
      <MemoryRouter>
        <Login onLogin={vi.fn()} />
      </MemoryRouter>
    );

    fillPhoneAndSubmit();

    expect(await screen.findByText('Too many attempts. Please wait and try again.')).toBeInTheDocument();
  });
});
