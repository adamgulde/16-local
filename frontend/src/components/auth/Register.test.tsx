import { describe, expect, it, vi, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Register } from './Register';

const api = vi.hoisted(() => ({
  initiateSignUpOtp: vi.fn(),
  verifySignUpOtp: vi.fn(),
  register: vi.fn(),
  validateInviteCode: vi.fn(),
}));
vi.mock('../../services/authService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/authService')>()),
  ...api,
}));

afterEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

const fillPhoneAndContinue = () => {
  fireEvent.change(screen.getByPlaceholderText('+1 ___-___-____'), { target: { value: '5551234567' } });
  fireEvent.click(screen.getByRole('button', { name: /Continue/ }));
};

describe('Register (S2 no-enumeration copy)', () => {
  it('shows the same neutral copy after sending, whether or not the number is eligible', async () => {
    api.initiateSignUpOtp.mockResolvedValueOnce(undefined);
    render(
      <MemoryRouter>
        <Register onLogin={vi.fn()} />
      </MemoryRouter>
    );

    fillPhoneAndContinue();

    await waitFor(() => expect(api.initiateSignUpOtp).toHaveBeenCalled());
    expect(await screen.findByText("If this number can be used here, we've sent a code.")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'sign in' })).toHaveAttribute('href', '/login');
  });

  it('shows a Retry-After-aware message on 429', async () => {
    api.initiateSignUpOtp.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 429, headers: { 'retry-after': '10' } },
    });
    render(
      <MemoryRouter>
        <Register onLogin={vi.fn()} />
      </MemoryRouter>
    );

    fillPhoneAndContinue();

    expect(await screen.findByText('Too many attempts. Please wait 10s and try again.')).toBeInTheDocument();
  });
});
