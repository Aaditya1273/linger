import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { recordSubscriptionDigest } from '../sui/subscriptionDigestStore';
import { SubscriptionDigestValue, depositedCashText, claimEstimateForNote } from './PortfolioPage';
import { ProductNoteCard } from './PortfolioProductNoteCard';
import type { AnkerProductNoteRecord } from '../sui/ankerPortfolio';
import type { ProductNoteEventIndexEntry } from '../sui/productNoteEvents';
import type { PredictMarketState } from '../deepbook/predictMarketState';

vi.mock('@mysten/dapp-kit-react', () => ({
  useCurrentAccount: () => null,
  useCurrentClient: () => ({}),
  useCurrentWallet: () => null,
  useDAppKit: () => ({ signTransaction: vi.fn() }),
}));


function noteFixture(overrides: Partial<AnkerProductNoteRecord> = {}): AnkerProductNoteRecord {
  return {
    noteId: `0x${'c'.repeat(64)}`,
    productType: 'dual-investment',
    productId: 'dual-demo',
    owner: `0x${'a'.repeat(64)}`,
    wrapperId: `0x${'b'.repeat(64)}`,
    oracleId: `0x${'5'.repeat(64)}`,
    expiryMs: 1_000,
    principal: 5,
    principalBaseUnits: 5_000_000n,
    reserve: 4.936412,
    reserveBaseUnits: 4_936_412n,
    coupon: 0.007453,
    couponBaseUnits: 7_453n,
    targetPrice: 65_500,
    floorPrice: 64_667,
    lowerBound: 0,
    upperBound: 0,
    isBullish: false,
    usesMockCurrentDeposit: false,
    apr: 0.916,
    feeBps: 1_000,
    legs: [{ strike: 64_667, quantity: 0.063588, quantityBaseUnits: 63_588n, cost: 0.056135, costBaseUnits: 56_135n }],
    orderIds: [11n],
    status: 'open',
    redeemedPayout: 0,
    redeemedPayoutBaseUnits: 0n,
    redeemedFee: 0,
    redeemedFeeBaseUnits: 0n,
    ...overrides,
  };
}

function renderWithQuery(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('claimEstimateForNote', () => {
  it('uses reserve plus coupon when no option leg payout has been realized yet', () => {
    expect(claimEstimateForNote(noteFixture())).toEqual({
      grossPayout: 4.943865,
      feeAmount: 0.000745,
      netPayout: 4.94312,
    });
  });
});

describe('ProductNoteCard', () => {
  it('shows reward APR after the note fee bps', () => {
    const note = noteFixture();

    renderWithQuery(
      <ProductNoteCard
        note={note}
        onClaimSuccess={() => {}}
      />,
    );

    expect(screen.getByText('82.44% APR')).toBeVisible();
    expect(screen.queryByText('91.6% APR')).not.toBeInTheDocument();
  });

  it('expands into the outcome fork with the deposit-only BTC conversion and a separate reward line', () => {
    renderWithQuery(<ProductNoteCard note={noteFixture()} onClaimSuccess={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: 'Details' }));

    expect(screen.getByText('BTC ends < $65,500')).toBeVisible();
    // 5 dUSDC deposit ÷ $65,500 target — the coupon must never inflate the BTC figure.
    const btcLine = screen.getByText('≈ 0.000076 BTC');
    expect(btcLine).toBeVisible();
    // Same dashed affordance + testnet tip as the product-page "You receive" line.
    expect(btcLine).toHaveClass('di-equiv-note');
    expect(btcLine).toHaveAttribute('data-tip', expect.stringMatching(/testnet/i));
    // The coupon survives the below branch as its own dUSDC line, net of the fee.
    expect(screen.getByText('+ 0.01 dUSDC reward')).toBeVisible();
    expect(screen.queryByText('Payout range')).not.toBeInTheDocument();
    expect(screen.queryByText('On-chain proof')).not.toBeInTheDocument();
    expect(screen.queryByText('Not indexed')).not.toBeInTheDocument();
  });

  it('keeps Claim separate from the optional details disclosure', () => {
    const note = noteFixture();
    const marketState: PredictMarketState = {
      expiryMarketId: note.oracleId,
      expiryMs: note.expiryMs,
      settlementPrice: 66_000,
      settlementPriceBaseUnits: 66_000_000_000_000n,
    };
    renderWithQuery(
      <ProductNoteCard note={note} marketState={marketState} onClaimSuccess={() => {}} />,
    );

    const details = screen.getByRole('button', { name: 'Details' });
    expect(details).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(screen.getByRole('button', { name: 'Claim payout' }));
    expect(details).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(details);
    expect(details).toHaveAttribute('aria-expanded', 'true');
  });

  it('renders the phone compact row whose tap opens the detail sheet', () => {
    // Phone tree: useIsMobile reads this query once per render.
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(max-width: 767px)',
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    const note = noteFixture();
    const marketState: PredictMarketState = {
      expiryMarketId: note.oracleId,
      expiryMs: note.expiryMs,
      settlementPrice: 66_000,
      settlementPriceBaseUnits: 66_000_000_000_000n,
    };
    renderWithQuery(
      <ProductNoteCard note={note} marketState={marketState} onClaimSuccess={() => {}} />,
    );

    // Two-line row: product + strike identity plus the money flow; Claim
    // inline; no accordion toggle.
    expect(screen.getByText('Buy Low @ $65,500')).toBeVisible();
    // Settled flow: deposit → the settlement-engine payout (5 + coupon − fee).
    expect(screen.getByText(/5\.00 → 5\.01 dUSDC/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Claim' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Claim payout' })).not.toBeInTheDocument();

    // The detail lives in the bottom sheet: fork, stats, and the full Claim.
    fireEvent.click(screen.getByText('Buy Low @ $65,500'));
    expect(screen.getByRole('dialog', { name: 'Details' })).toBeVisible();
    expect(screen.getByText('BTC ended ≥ $65,500')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Claim payout' })).toBeVisible();
  });

  it('reads every settled-card figure from the actual settlement, never the subscription-time estimate', () => {
    // On-chain fee (0.05) deliberately differs from the coupon-based estimate
    // (10% of 0.26 ≈ 0.03): the reward must satisfy the card identity
    // "settled amount − deposit = reward" against the recorded settlement.
    const note = noteFixture({
      principal: 200,
      principalBaseUnits: 200_000_000n,
      coupon: 0.26,
      couponBaseUnits: 260_000n,
      targetPrice: 62_000,
      status: 'redeemed',
      redeemedPayout: 200.26,
      redeemedPayoutBaseUnits: 200_260_000n,
      redeemedFee: 0.05,
      redeemedFeeBaseUnits: 50_000n,
    });

    renderWithQuery(<ProductNoteCard note={note} onClaimSuccess={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Details' }));

    // Header reward, won branch, and the dimmed branch's reward line agree:
    // 200.00 + 0.21 = 200.21.
    expect(screen.getByText('+0.21')).toBeVisible();
    expect(screen.getByText('You received')).toBeVisible();
    expect(screen.getByText('200.21 dUSDC')).toBeVisible();
    expect(screen.getByText('+ 0.21 dUSDC reward')).toBeVisible();
    // No fee line on the card — the breakdown lives in the claim dialog.
    expect(screen.queryByText(/10% of reward/)).not.toBeInTheDocument();
    expect(screen.queryByText('+0.23')).not.toBeInTheDocument();
  });

  it('keeps "above amount − deposit = reward" even when ladder dust shrinks the above payout', () => {
    // Pre-lot-identity note: reserve + legs reconstruct 197.99, not 198.00.
    // Above branch: 185.266125 + 12.72 + 1.60 − 0.16 fee = 199.426125. The
    // reward must read 1.43 (= 199.43 − 198.00), not net coupon 1.44.
    const note = noteFixture({
      principal: 198,
      principalBaseUnits: 198_000_000n,
      reserve: 185.266125,
      reserveBaseUnits: 185_266_125n,
      coupon: 1.6,
      couponBaseUnits: 1_600_000n,
      targetPrice: 64_500,
      legs: [59_884, 60_570, 61_256, 61_942, 62_628, 63_314].map((strike) => ({
        strike,
        quantity: 2.12,
        quantityBaseUnits: 2_120_000n,
        cost: 0,
        costBaseUnits: 0n,
      })),
    });

    renderWithQuery(<ProductNoteCard note={note} onClaimSuccess={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Details' }));

    expect(screen.getByText('199.43 dUSDC')).toBeVisible();
    expect(screen.getByText('+1.43')).toBeVisible();
    expect(screen.getByText('+ 1.43 dUSDC reward')).toBeVisible();
    expect(screen.queryByText('+1.44')).not.toBeInTheDocument();
    expect(screen.queryByText('+ 1.44 dUSDC reward')).not.toBeInTheDocument();
  });
});

describe('SubscriptionDigestValue', () => {
  it('shows a locally indexed subscription transaction digest for the note quote hash', async () => {
    recordSubscriptionDigest({
      owner: `0x${'a'.repeat(64)}`,
      quoteHash: '0xquote',
      digest: '0x1234567890abcdef',
    });

    render(<SubscriptionDigestValue owner={`0x${'a'.repeat(64)}`} quoteHash="0xquote" />);

    expect(await screen.findByText('0x123456...abcdef')).toBeVisible();
  });

  it('prefers the on-chain event-indexed subscription digest over the local cache', () => {
    recordSubscriptionDigest({
      owner: `0x${'a'.repeat(64)}`,
      quoteHash: '0xquote',
      digest: '0xlocal1234567890',
    });

    render(
      <SubscriptionDigestValue
        owner={`0x${'a'.repeat(64)}`}
        quoteHash="0xquote"
        eventDigest="0xabcdef1234567890"
      />,
    );

    expect(screen.getByText('0xabcdef...567890')).toBeVisible();
  });
});

describe('depositedCashText', () => {
  it('prefers event-indexed deposited cash from ProductSubscribed events', () => {
    const entry: ProductNoteEventIndexEntry = {
      noteId: `0x${'c'.repeat(64)}`,
      transactionDigests: [],
      allocatedPositions: [],
      principalBaseUnits: 5_250_000n,
    };

    expect(depositedCashText(noteFixture(), entry)).toBe('5.25');
  });

  it('falls back to the owned ProductNote principal before subscription events are indexed', () => {
    expect(depositedCashText(noteFixture())).toBe('5.00');
  });
});
