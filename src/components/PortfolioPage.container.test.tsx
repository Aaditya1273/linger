import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnkerProductNoteRecord } from '../sui/ankerPortfolio';
import { PortfolioPage } from './PortfolioPage';

const OWNER = `0x${'a'.repeat(64)}`;

const walletState = vi.hoisted(() => ({
  account: { address: `0x${'a'.repeat(64)}` } as { address: string } | null,
  connectWallet: vi.fn(),
  disconnectWallet: vi.fn(),
}));

const ankerConfig = vi.hoisted(() => ({ packageId: '0xconfigured' }));

const portfolioState = vi.hoisted(() => ({ notes: [] as unknown[] }));
const marketStatesState = vi.hoisted(() => ({ byMarketId: {} as Record<string, unknown> }));
const claimAllState = vi.hoisted(() => ({ claimableCount: 0, claimAll: vi.fn() }));

vi.mock('lucide-react', () => ({
  ArrowUpRight: () => <span data-testid="icon" />,
  Check: () => <span data-testid="icon" />,
  ChevronDown: () => <span data-testid="icon" />,
  Copy: () => <span data-testid="icon" />,
  Info: () => <span data-testid="icon" />,
  LogOut: () => <span data-testid="icon" />,
  QrCode: () => <span data-testid="icon" />,
  RefreshCw: () => <span data-testid="icon" />,
  Sparkles: () => <span data-testid="icon" />,
}));

vi.mock('@mysten/dapp-kit-react', () => ({
  useCurrentAccount: () => walletState.account,
  useCurrentClient: () => ({}),
  useCurrentWallet: () => null,
  useDAppKit: () => ({
    connectWallet: walletState.connectWallet,
    disconnectWallet: walletState.disconnectWallet,
  }),
  useWallets: () => [],
}));

vi.mock('../sui/ankerTransactions', () => ({
  DEFAULT_ANKER_CONFIG: ankerConfig,
}));

vi.mock('./AppHeader', () => ({
  AppHeader: () => <header data-testid="app-header" />,
}));

vi.mock('./AppFooter', () => ({
  AppFooter: () => <footer data-testid="app-footer" />,
}));

vi.mock('./ReceiveDialog', () => ({
  ReceiveDialog: ({ open }: { open: boolean }) => (open ? <div data-testid="receive-dialog" /> : null),
}));

vi.mock('./SendDialog', () => ({
  SendDialog: ({ open }: { open: boolean }) => (open ? <div data-testid="send-dialog" /> : null),
}));

vi.mock('./ClaimSuccessDialog', () => ({
  ClaimSuccessDialog: () => null,
}));

vi.mock('./PortfolioClaimAction', () => ({
  ClaimActionView: () => null,
  claimActionViewModel: vi.fn(),
  claimEstimateForNote: vi.fn(),
  useClaimAllNotes: () => ({
    isPending: false,
    digest: null,
    error: null,
    claimableCount: claimAllState.claimableCount,
    claimAll: claimAllState.claimAll,
  }),
}));

vi.mock('./PortfolioProductNoteCard', () => ({
  ProductNoteCard: ({ note }: { note: { noteId: string } }) => <article data-testid={`card-${note.noteId}`} />,
  SubscriptionDigestValue: () => null,
  depositedCashText: vi.fn(),
  noteStatusBadge: vi.fn(),
}));

vi.mock('../hooks/useProductNoteMarketStates', () => ({
  useProductNoteMarketStates: () => ({ byMarketId: marketStatesState.byMarketId }),
}));

vi.mock('../hooks/useProductNoteEventIndex', () => ({
  useProductNoteEventIndex: () => ({ data: undefined }),
}));

vi.mock('../hooks/useWalletFunds', () => ({
  useWalletFunds: () => ({
    available: 200,
    inPosition: 800,
    totalAssets: 1_000,
    walletBaseUnits: 200_000_000n,
    wrapper: null,
    refresh: vi.fn(),
  }),
}));

const openNote = {
  noteId: `0x${'1'.repeat(64)}`,
  status: 'open',
  principal: 800,
  coupon: 12.34,
  feeBps: 1_000,
  redeemedPayout: 0,
  redeemedFee: 0,
  oracleId: `0x${'2'.repeat(64)}`,
  expiryMs: Date.now() + 86_400_000,
} as AnkerProductNoteRecord;

const redeemedNote = {
  noteId: `0x${'3'.repeat(64)}`,
  status: 'redeemed',
  principal: 500,
  coupon: 8,
  redeemedPayout: 540,
  redeemedFee: 5.4,
  oracleId: `0x${'4'.repeat(64)}`,
  expiryMs: Date.now() - 86_400_000,
} as AnkerProductNoteRecord;

vi.mock('../hooks/useAnkerPortfolio', () => ({
  useAnkerPortfolio: () => ({
    data: portfolioState.notes,
    isPending: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

describe('PortfolioPage wallet band (connected)', () => {
  beforeEach(() => {
    walletState.account = { address: OWNER };
    ankerConfig.packageId = '0xconfigured';
    portfolioState.notes = [openNote, redeemedNote];
    marketStatesState.byMarketId = {};
    claimAllState.claimableCount = 0;
    vi.clearAllMocks();
  });

  it('shows Total Assets = Available + In Position, the tiles, and the wallet actions', () => {
    render(<PortfolioPage />);

    // Total Assets (总资产) = 200 Available + 800 In Position — expected
    // rewards are never counted in; they render three times (desktop hero pill
    // + desktop tile + the phone rewards line, which CSS gates per viewport),
    // net of the 10% fee (12.34 × 0.9) like the Cumulative tile beside them.
    expect(screen.getByText('Total assets')).toBeInTheDocument();
    expect(screen.getByText(/1,000/)).toBeInTheDocument();
    expect(screen.getAllByText(/11\.11/)).toHaveLength(3);
    expect(screen.queryByText(/12\.34/)).not.toBeInTheDocument();
    expect(screen.getByText('Expected rewards')).toBeInTheDocument();

    // Desktop tile + the phone proportion-bar legend.
    expect(screen.getAllByText('Available')).toHaveLength(2);
    expect(screen.getAllByText('In position')).toHaveLength(2);
    // Cumulative Rewards (累计收益): net payout − principal over claimed
    // positions = 540 − 5.4 − 500 — on the desktop tile and the phone
    // rewards line.
    expect(screen.getByText('Cumulative rewards')).toBeInTheDocument();
    expect(screen.getAllByText(/\+34\.6/)).toHaveLength(2);

    expect(screen.getByRole('button', { name: /Receive/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Send/ })).toBeInTheDocument();

    // Position vocabulary, never Note (ADR-free glossary rule).
    expect(screen.getByText('Your positions')).toBeInTheDocument();
    expect(screen.queryByText(/Your Notes/)).not.toBeInTheDocument();

    // No "All" view: the list opens on the first non-empty bucket (Active
    // here — nothing is ready), and settled history stays behind its own tab.
    expect(screen.getByTestId(`card-${openNote.noteId}`)).toBeInTheDocument();
    expect(screen.queryByTestId(`card-${redeemedNote.noteId}`)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /Completed/ }));
    expect(screen.getByTestId(`card-${redeemedNote.noteId}`)).toBeInTheDocument();
    expect(screen.queryByTestId(`card-${openNote.noteId}`)).not.toBeInTheDocument();
  });

  it('offers one batch claim in the Ready view once two or more positions are claimable', () => {
    const settledMarketId = `0x${'6'.repeat(64)}`;
    const settledExpiryMs = Date.now() - 60_000;
    const readyA = {
      ...openNote,
      noteId: `0x${'7'.repeat(64)}`,
      oracleId: settledMarketId,
      expiryMs: settledExpiryMs,
    } as AnkerProductNoteRecord;
    const readyB = {
      ...openNote,
      noteId: `0x${'8'.repeat(64)}`,
      oracleId: settledMarketId,
      expiryMs: settledExpiryMs,
    } as AnkerProductNoteRecord;
    portfolioState.notes = [readyA, readyB, redeemedNote];
    marketStatesState.byMarketId = {
      [settledMarketId]: {
        expiryMarketId: settledMarketId,
        expiryMs: settledExpiryMs,
        settlementPrice: 66_000,
        settlementPriceBaseUnits: 66_000_000_000_000n,
        settledAtMs: settledExpiryMs + 1,
      },
    };
    claimAllState.claimableCount = 2;
    render(<PortfolioPage />);

    // Ready is the default view (first non-empty bucket), and the batch row
    // sits above the list there — one signature instead of two.
    fireEvent.click(screen.getByRole('button', { name: 'Claim all (2)' }));
    expect(claimAllState.claimAll).toHaveBeenCalledTimes(1);

    // The batch action belongs to the Ready view only.
    fireEvent.click(screen.getByRole('tab', { name: /Completed/ }));
    expect(screen.queryByRole('button', { name: 'Claim all (2)' })).not.toBeInTheDocument();
  });

  it('keeps the settlement note behind the heading ⓘ disclosure', () => {
    render(<PortfolioPage />);

    // Platform mechanics, not per-position decision info — hidden until asked.
    expect(screen.queryByText(/On testnet this settles in dUSDC/)).not.toBeInTheDocument();

    const toggle = screen.getByRole('button', { name: 'How settlement works' });
    fireEvent.click(toggle);
    expect(screen.getByText(/On testnet this settles in dUSDC/)).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(toggle);
    expect(screen.queryByText(/On testnet this settles in dUSDC/)).not.toBeInTheDocument();
  });

  it('opens the shared Send dialog from the wallet band', () => {
    render(<PortfolioPage />);
    expect(screen.queryByTestId('send-dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Send/ }));
    expect(screen.getByTestId('send-dialog')).toBeInTheDocument();
  });

  // Disconnect is no longer a Portfolio concern: the top-bar account chip's
  // sheet owns sign-out on phones (see WalletAccountControl.test.tsx).
  it('renders the config error without losing the wallet band', () => {
    ankerConfig.packageId = '0x0';
    render(<PortfolioPage />);

    expect(screen.getByText(/contract package is not configured/i)).toBeVisible();
    expect(screen.getByText('Total assets')).toBeInTheDocument();
  });

  it('lets a disconnected user start the wallet connection flow from Portfolio', () => {
    walletState.account = null;
    render(<PortfolioPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    expect(screen.getByRole('dialog', { name: 'Sign in' })).toBeVisible();
  });
});
