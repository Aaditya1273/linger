import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SendDialog } from './SendDialog';

const OWNER = `0x${'a'.repeat(64)}`;
const OTHER = `0x${'b'.repeat(64)}`;

vi.mock('@mysten/dapp-kit-react', () => ({
  useCurrentAccount: () => ({ address: OWNER }),
  useCurrentClient: () => ({}),
  useCurrentWallet: () => null,
  useDAppKit: () => ({}),
}));

vi.mock('../hooks/useWalletFunds', () => ({
  useWalletFunds: () => ({
    available: 10_102,
    walletBaseUnits: 10_102_000_000n,
    wrapper: null,
    refresh: vi.fn(),
  }),
}));

describe('SendDialog form', () => {
  it('echoes the typed amount on the CTA so the user confirms the number they press', () => {
    render(<SendDialog open onClose={() => {}} />);
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^Amount/), { target: { value: '100' } });
    expect(screen.getByRole('button', { name: 'Send 100.00 dUSDC' })).toBeInTheDocument();
  });

  it('keeps the plain CTA while the amount exceeds Available, with the inline error', () => {
    render(<SendDialog open onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText(/^Amount/), { target: { value: '999999' } });

    expect(screen.getByText('Amount exceeds your Available balance.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });

  it('warns on a self-send without blocking it', () => {
    render(<SendDialog open onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText('Recipient address'), { target: { value: OWNER } });
    expect(screen.getByText(/your own address/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Recipient address'), { target: { value: OTHER } });
    expect(screen.queryByText(/your own address/)).not.toBeInTheDocument();
  });

  it('fills the exact Available balance via Max and via the balance hint', () => {
    render(<SendDialog open onClose={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: 'Max' }));
    expect(screen.getByLabelText(/^Amount/)).toHaveValue('10102');

    fireEvent.change(screen.getByLabelText(/^Amount/), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /Available: 10,102\.00 dUSDC/ }));
    expect(screen.getByLabelText(/^Amount/)).toHaveValue('10102');
  });
});
