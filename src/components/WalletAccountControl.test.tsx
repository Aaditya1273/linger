import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WalletAccountControl } from './WalletAccountControl';

const walletState = vi.hoisted(() => ({
  account: null as { address: string } | null,
  identity: null as
    | { kind: 'social'; email: string | null }
    | { kind: 'extension'; name: string; icon: null }
    | null,
  disconnectWallet: vi.fn(),
}));

vi.mock('@mysten/dapp-kit-react', () => ({
  useCurrentAccount: () => walletState.account,
  useDAppKit: () => ({ disconnectWallet: walletState.disconnectWallet }),
}));

vi.mock('../hooks/useWalletFunds', () => ({
  useWalletFunds: () => ({ available: 100, inPosition: 200, totalAssets: 300 }),
}));

vi.mock('../hooks/useWalletIdentity', () => ({
  useWalletIdentity: () => walletState.identity,
}));

vi.mock('./WalletConnectButton', () => ({
  WalletConnectButton: ({ children }: { children?: React.ReactNode }) => (
    <button type="button">{children}</button>
  ),
}));

vi.mock('./ReceiveDialog', () => ({ ReceiveDialog: () => null }));
vi.mock('./SendDialog', () => ({ SendDialog: () => null }));

describe('WalletAccountControl responsive entry points', () => {
  beforeEach(() => {
    walletState.account = null;
    walletState.identity = null;
    walletState.disconnectWallet.mockClear();
  });

  afterEach(() => cleanup());

  it('routes a disconnected mobile user to the localized Portfolio wallet hub', () => {
    render(<WalletAccountControl locale="en" />);

    expect(screen.getByRole('link', { name: 'View Portfolio' })).toHaveAttribute(
      'href',
      '/en/app/portfolio#wallet-portfolio',
    );
    expect(screen.getByRole('button', { name: 'Connect' })).toBeInTheDocument();
  });

  it('gives a connected mobile user an account chip whose sheet owns identity and sign-out', () => {
    walletState.account = { address: `0x${'a'.repeat(64)}` };
    walletState.identity = { kind: 'extension', name: 'Slush', icon: null };
    render(<WalletAccountControl locale="zh-CN" />);

    // The chip is named by its visible identity label (address for an
    // extension wallet, the email for zkLogin).
    const chip = screen.getByRole('button', { name: '0xaaaa...aaaa' });
    fireEvent.click(chip);

    const sheet = screen.getByRole('dialog', { name: '钱包账户' });
    expect(sheet).toBeInTheDocument();
    // The Total assets snapshot mirrors Portfolio (same useWalletFunds source),
    // with quick Receive/Send and the drill-in link to the full page.
    expect(screen.getByText('总资产')).toBeInTheDocument();
    expect(screen.getByText('300.00')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '收款' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '转出' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '查看持仓' })).toHaveAttribute('href', '/zh-CN/app/portfolio');
    // Network is a badge beside the address chip; the sheet has no explorer
    // row — that depth lives on Portfolio.
    expect(screen.getByText('Sui Testnet')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /在浏览器中查看全部记录/ })).not.toBeInTheDocument();
    // The address chip itself is the copy control.
    expect(screen.getByRole('button', { name: '复制地址' })).toHaveTextContent('0xaaaa...aaaa');

    fireEvent.click(screen.getByRole('button', { name: '退出登录' }));
    expect(walletState.disconnectWallet).toHaveBeenCalledTimes(1);
  });

  it('shows a zkLogin chip as the email prefix only, keeping the full email for assistive tech', () => {
    walletState.account = { address: `0x${'a'.repeat(64)}` };
    walletState.identity = { kind: 'social', email: 'ailcj8023@gmail.com' };
    render(<WalletAccountControl locale="zh-CN" />);

    // The Google mark already names the provider — the domain is noise the
    // chip drops, while aria-label keeps the full identity.
    const chip = screen.getByRole('button', { name: 'ailcj8023@gmail.com' });
    expect(chip).toHaveTextContent('ailcj8023');
    expect(chip.querySelector('.mobile-account-chip-label')?.textContent).toBe('ailcj8023');
  });

  it('retains the desktop account trigger and its disconnect', () => {
    walletState.account = { address: `0x${'a'.repeat(64)}` };
    render(<WalletAccountControl locale="zh-CN" />);

    const desktopTrigger = screen.getByRole('button', { name: '钱包账户' });
    fireEvent.click(desktopTrigger);
    expect(screen.getByRole('button', { name: '断开连接' })).toBeInTheDocument();
  });
});
