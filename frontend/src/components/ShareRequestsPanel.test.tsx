import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ShareRequestsPanel } from './ShareRequestsPanel';
import type { ShareRequestsResponse } from '../services/shareService';

const noopBusy = () => false;

describe('ShareRequestsPanel — neutral confirmation (no enumeration)', () => {
  it('shows the same confirmation after sending by phone number as by invite code', () => {
    const onSend = vi.fn();
    const empty: ShareRequestsResponse = { incoming: [], outgoing: [] };

    const { rerender } = render(
      <ShareRequestsPanel shareRequests={empty} placeholders={[]} onSend={onSend} onRespond={vi.fn()} onCancel={vi.fn()} isBusy={noopBusy} />
    );
    fireEvent.change(screen.getByPlaceholderText('Phone number'), { target: { value: '+15551234567' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }));
    expect(onSend).toHaveBeenCalledWith({ phoneNumber: '+15551234567', inviteCode: undefined, placeholderContactId: undefined });
    const messageA = screen.getByText(/If they're on the app/).textContent;

    rerender(
      <ShareRequestsPanel shareRequests={empty} placeholders={[]} onSend={onSend} onRespond={vi.fn()} onCancel={vi.fn()} isBusy={noopBusy} />
    );
    fireEvent.change(screen.getByPlaceholderText('…or invite code'), { target: { value: 'CODE123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }));
    expect(onSend).toHaveBeenCalledWith({ phoneNumber: undefined, inviteCode: 'CODE123', placeholderContactId: undefined });
    const messageB = screen.getByText(/If they're on the app/).textContent;

    // Identical regardless of whether the request could possibly have matched an account —
    // the UI never signals that (PLAN.md §1.7 / S2).
    expect(messageA).toBe(messageB);
  });

  it('requires a phone number or invite code before sending', () => {
    const onSend = vi.fn();
    render(
      <ShareRequestsPanel
        shareRequests={{ incoming: [], outgoing: [] }}
        placeholders={[]}
        onSend={onSend}
        onRespond={vi.fn()}
        onCancel={vi.fn()}
        isBusy={noopBusy}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }));
    expect(onSend).not.toHaveBeenCalled();
    expect(screen.getByText('Enter a phone number or invite code.')).toBeInTheDocument();
  });
});

describe('ShareRequestsPanel — incoming respond payloads', () => {
  const withIncoming: ShareRequestsResponse = {
    incoming: [{ id: 'req-1', direction: 'INCOMING', counterpartName: 'Robin Ellis', placeholderName: null, createdAt: new Date().toISOString(), status: 'PENDING' }],
    outgoing: [],
  };

  it('Accept sends the checked combination of connect/allowView', () => {
    const onRespond = vi.fn();
    render(
      <ShareRequestsPanel shareRequests={withIncoming} placeholders={[]} onSend={vi.fn()} onRespond={onRespond} onCancel={vi.fn()} isBusy={noopBusy} />
    );
    fireEvent.click(screen.getByLabelText('Connect with them'));
    fireEvent.click(screen.getByLabelText('Let them view my graph'));
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    expect(onRespond).toHaveBeenCalledWith('req-1', { connect: true, allowView: true });
  });

  it('Accept is disabled until at least one checkbox is checked', () => {
    render(
      <ShareRequestsPanel shareRequests={withIncoming} placeholders={[]} onSend={vi.fn()} onRespond={vi.fn()} onCancel={vi.fn()} isBusy={noopBusy} />
    );
    expect(screen.getByRole('button', { name: 'Accept' })).toBeDisabled();
    fireEvent.click(screen.getByLabelText('Connect with them'));
    expect(screen.getByRole('button', { name: 'Accept' })).not.toBeDisabled();
  });

  it('Decline always sends {connect:false, allowView:false}', () => {
    const onRespond = vi.fn();
    render(
      <ShareRequestsPanel shareRequests={withIncoming} placeholders={[]} onSend={vi.fn()} onRespond={onRespond} onCancel={vi.fn()} isBusy={noopBusy} />
    );
    fireEvent.click(screen.getByLabelText('Connect with them'));
    fireEvent.click(screen.getByRole('button', { name: 'Decline' }));
    expect(onRespond).toHaveBeenCalledWith('req-1', { connect: false, allowView: false });
  });
});

describe('ShareRequestsPanel — outgoing', () => {
  it('Cancel calls onCancel with the request id', () => {
    const onCancel = vi.fn();
    const withOutgoing: ShareRequestsResponse = {
      incoming: [],
      outgoing: [{ id: 'req-out-1', direction: 'OUTGOING', counterpartName: null, placeholderName: null, createdAt: new Date().toISOString(), status: 'PENDING' }],
    };
    render(
      <ShareRequestsPanel shareRequests={withOutgoing} placeholders={[]} onSend={vi.fn()} onRespond={vi.fn()} onCancel={onCancel} isBusy={noopBusy} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledWith('req-out-1');
  });

  it('shows the attached placeholder name when the sender offered one', () => {
    const withPlaceholder: ShareRequestsResponse = {
      incoming: [],
      outgoing: [
        {
          id: 'req-out-2',
          direction: 'OUTGOING',
          counterpartName: null,
          placeholderName: 'Dana Price',
          createdAt: new Date().toISOString(),
          status: 'PENDING',
        },
      ],
    };
    render(
      <ShareRequestsPanel shareRequests={withPlaceholder} placeholders={[]} onSend={vi.fn()} onRespond={vi.fn()} onCancel={vi.fn()} isBusy={noopBusy} />
    );
    expect(screen.getByText('You attached: Dana Price')).toBeInTheDocument();
  });
});
