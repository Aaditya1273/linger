import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DualInvestmentPage, QuoteRiskSummary } from './DualInvestmentPage';
import { BuyLowControls, ReferenceTable } from './DualInvestmentQuoteSections';
import { DualInvestmentConfirm, ReturnOverview } from './DualInvestmentQuoteDetail';
import type { ReactNode } from 'react';
import type { BinanceDualInvestmentProduct } from '../deepbook/binanceDualInvestment';
import type { DualInvestmentScanRow } from '../products/dualInvestmentScan';
import type { DualInvestmentInput, OracleMarket, StructuredProductQuote } from '../products/types';

const mocks = vi.hoisted(() => ({
  buildVerifiedDualInvestmentQuote: vi.fn(),
  buildIndicativeDualInvestmentQuote: vi.fn(),
  refetchScan: vi.fn(),
  binanceProducts: [] as BinanceDualInvestmentProduct[],
  subscriptionBalance: null as number | null,
  marketData: undefined as
    | {
        data: {
          market: OracleMarket;
          productOracles: Array<{ oracle_id: string; expiry: number; group: string }>;
          selectedOracleId?: string;
        };
      }
    | undefined,
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('next/dynamic', () => ({
  default: () => () => <button className="wallet-loading">Connect Wallet</button>,
}));

vi.mock('lucide-react', () => ({
  RefreshCw: () => <span data-testid="refresh-icon" />,
  Info: ({ 'aria-label': ariaLabel }: { 'aria-label'?: string }) => (
    <span aria-label={ariaLabel} data-testid="info-icon" />
  ),
  ChevronDown: () => <span data-testid="chevron-icon" />,
  ChevronRight: () => <span data-testid="chevron-right-icon" />,
  Rows3: () => <span data-testid="rows-icon" />,
  ArrowDownUp: () => <span data-testid="dual-investment-icon" />,
  Briefcase: () => <span data-testid="portfolio-icon" />,
  ChartLine: () => <span data-testid="analytics-icon" />,
  Github: () => <span data-testid="github-icon" />,
  Send: () => <span data-testid="send-icon" />,
  Camera: () => <span data-testid="camera-icon" />,
  Globe: () => <span data-testid="globe-icon" />,
  Wallet: () => <span data-testid="wallet-icon" />,
  Check: () => <span data-testid="check-icon" />,
  Megaphone: () => <span data-testid="megaphone-icon" />,
}));

vi.mock('../hooks/useMarketData', () => ({
  MARKET_REFETCH_INTERVAL_MS: 15_000,
  useMarketData: () => mocks.marketData,
}));

vi.mock('../hooks/useDualInvestmentScan', () => ({
  buildVerifiedDualInvestmentQuote: mocks.buildVerifiedDualInvestmentQuote,
  buildIndicativeDualInvestmentQuote: mocks.buildIndicativeDualInvestmentQuote,
  useDualInvestmentScan: () => ({
    data: [],
    isFetching: false,
    dataUpdatedAt: 1,
    refetch: mocks.refetchScan,
  }),
}));

vi.mock('../hooks/useBinanceDualInvestment', () => ({
  useBinanceDualInvestment: () => ({
    data: mocks.binanceProducts,
    isFetching: false,
    error: null,
  }),
}));

vi.mock('../hooks/useSubscriptionFunds', () => ({
  useSubscriptionFunds: () => ({ balance: mocks.subscriptionBalance }),
}));

vi.mock('./TargetBuyExecutionPanel', () => ({
  TargetBuyExecutionPanel: ({
    quote,
    onSubscribeSuccess,
  }: {
    quote: StructuredProductQuote;
    onSubscribeSuccess: (confirmation: { quote: StructuredProductQuote; digest: string }) => void;
  }) => (
    <div data-testid="execution-panel">
      <button type="button" onClick={() => onSubscribeSuccess({ quote, digest: '0xsubscribed' })}>
        mock-subscribe-success
      </button>
    </div>
  ),
}));

function quoteFixture(): StructuredProductQuote {
  return {
    id: 'dual-demo',
    productType: 'dual-investment',
    title: 'Target Buy BTC at 66,000',
    principal: 5,
    oracle: {
      predictId: '0x1',
      oracleId: '0x2',
      underlyingAsset: 'BTC',
      expiryMs: Date.now() + 7 * 86_400_000,
      minStrike: 50_000,
      tickSize: 1,
      status: 'active',
      spot: 66_172,
      forward: 66_167,
      spotTimestampMs: 1,
      sviTimestampMs: 1,
      serverLagSeconds: 1,
    },
    legs: [
      {
        id: 'up-64667',
        instrumentType: 'binary-up',
        oracleId: '0x2',
        expiryMs: 1,
        strike: 64_667,
        isUp: true,
        quantity: 0.063588,
        description: 'UP 64,667',
        askPrice: 0.88,
        askCost: 0.056135,
        redeemPreview: 0,
        quoteTimestampMs: 1,
        executable: true,
      },
    ],
    totalLegCost: 0.056135,
    reserve: 4.936412,
    coupon: 0.007453,
    apr: 0.916,
    executable: true,
    scenarios: [],
  };
}

function marketFixture(overrides: Partial<OracleMarket> = {}): OracleMarket {
  return {
    predictId: '0x1',
    oracleId: '0x2',
    underlyingAsset: 'BTC',
    expiryMs: Date.now() + 7 * 24 * 60 * 60_000,
    minStrike: 50_000,
    tickSize: 500,
    status: 'active',
    spot: 66_172,
    forward: 66_167,
    spotTimestampMs: 1,
    sviTimestampMs: 1,
    serverLagSeconds: 1,
    ...overrides,
  };
}

function pageQuoteFixture({
  market = marketFixture(),
  productInput,
  coupon,
}: {
  market?: OracleMarket;
  productInput?: DualInvestmentInput;
  coupon: number;
}): StructuredProductQuote {
  const input = productInput ?? { principal: 5, targetPrice: 65_500, floorPrice: 63_000, targetLegCount: 6 };
  return {
    id: `dual-${coupon}`,
    productType: 'dual-investment',
    title: `Target Buy BTC at ${input.targetPrice}`,
    principal: input.principal,
    oracle: market,
    legs: [
      {
        id: 'up-63000',
        instrumentType: 'binary-up',
        oracleId: market.oracleId,
        expiryMs: market.expiryMs,
        strike: 63_000,
        isUp: true,
        quantity: 0.01,
        description: 'UP 63,000',
        askPrice: 0.4,
        askCost: 0.16,
        redeemPreview: 0,
        quoteTimestampMs: Date.now(),
        executable: true,
      },
    ],
    totalLegCost: 0.16,
    reserve: 4.82,
    coupon,
    targetPrice: input.targetPrice,
    floorPrice: input.floorPrice,
    apr: 1.5,
    executable: true,
    scenarios: [],
  };
}

describe('QuoteRiskSummary', () => {
  it('renders quote validity, max-cost slippage, and liquidity risk next to payout risk', () => {
    render(<QuoteRiskSummary quote={quoteFixture()} />);

    expect(screen.getByText('Minimum Payout')).toBeVisible();
    expect(screen.getByText('Quote Validity')).toBeVisible();
    expect(screen.getByText('30s')).toBeVisible();
    expect(screen.getByText('Slippage Limit')).toBeVisible();
    expect(screen.getByText('1% max cost')).toBeVisible();
    expect(screen.getByText('Liquidity')).toBeVisible();
    expect(screen.getByText('Verified')).toBeVisible();
  });
});

describe('Dual Investment APR display', () => {
  it('sizes the amount from balance-percent chips once a balance is known', () => {
    const onPrincipalChange = vi.fn();
    render(
      <BuyLowControls
        market={marketFixture()}
        principal={500}
        targetPrice={65_500}
        availableBalance={1234.56}
        onPrincipalChange={onPrincipalChange}
        onTargetChange={() => undefined}
      />,
    );

    // Available funds ride the Amount label line (no "Balance" label).
    expect(screen.getByText('1,234.56 dUSDC')).toBeVisible();
    expect(screen.queryByText('Balance')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '50%' }));
    expect(onPrincipalChange).toHaveBeenLastCalledWith(617);

    fireEvent.click(screen.getByRole('button', { name: 'Max' }));
    expect(onPrincipalChange).toHaveBeenLastCalledWith(1234);
  });

  it('hides the percent chips while no balance is available', () => {
    render(
      <BuyLowControls
        market={marketFixture()}
        principal={500}
        targetPrice={65_500}
        onPrincipalChange={() => undefined}
        onTargetChange={() => undefined}
      />,
    );

    expect(screen.queryByRole('button', { name: '50%' })).not.toBeInTheDocument();
    expect(screen.queryByText('Balance')).not.toBeInTheDocument();
  });


  it('flags amounts over the connected balance with a visible error', () => {
    render(
      <BuyLowControls
        market={marketFixture()}
        principal={500}
        targetPrice={65_500}
        availableBalance={102}
        onPrincipalChange={() => undefined}
        onTargetChange={() => undefined}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(/exceeds your available balance of 102.00 dUSDC/);
  });

  it('keeps the confirm block to the subscribe CTA without a reward recap', () => {
    const quote = pageQuoteFixture({ coupon: 12.71 });
    const productInput = { principal: 5, targetPrice: 65_500, floorPrice: 63_000, targetLegCount: 6 };

    render(
      <DualInvestmentConfirm
        quote={quote}
        productInput={productInput}
        subscribeQuote={null}
        isVerifying={false}
        onSubscribeSuccess={() => {}}
      />,
    );

    // Reward / settle recap lives in the return overview — confirm is CTA only.
    expect(screen.queryByText('+12.71 dUSDC')).not.toBeInTheDocument();
    expect(screen.queryByText('Settles')).not.toBeInTheDocument();
    expect(screen.queryByText('Estimated reward')).not.toBeInTheDocument();
  });

  it('shows the below outcome conversion as receipt arithmetic', () => {
    const quote = pageQuoteFixture({ coupon: 0.03 });
    const productInput = { principal: 5, targetPrice: 65_500, floorPrice: 63_000, targetLegCount: 6 };

    render(<ReturnOverview quote={quote} productInput={productInput} />);

    // Total ÷ Buy Low price = You receive — the division is visible, not prose.
    // (Above card keeps an invisible twin row for horizontal alignment.)
    const divideRow = document.querySelector('.return-outcome.is-below .return-receipt-row.is-divide');
    expect(divideRow).not.toBeNull();
    expect(divideRow).toHaveTextContent('÷ Buy Low price');
    // Target label on the chart + the divisor row in the receipt (+ spacer twin).
    expect(screen.getAllByText('$65,500').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('You receive').length).toBeGreaterThanOrEqual(2);
  });

  it('keeps the execution panel mounted when subscribeQuote briefly unmatches', async () => {
    // Success dialog state is local to TargetBuyExecutionPanel — parent must not
    // unmount it across live re-verify gaps for the same product inputs.
    const quote = pageQuoteFixture({ coupon: 0.03 });
    const productInput = { principal: 5, targetPrice: 65_500, floorPrice: 63_000, targetLegCount: 6 };

    const { rerender } = render(
      <DualInvestmentConfirm
        quote={quote}
        productInput={productInput}
        subscribeQuote={quote}
        isVerifying={false}
        onSubscribeSuccess={() => {}}
      />,
    );
    expect(screen.getByTestId('execution-panel')).toBeVisible();

    rerender(
      <DualInvestmentConfirm
        quote={quote}
        productInput={productInput}
        subscribeQuote={null}
        isVerifying={true}
        onSubscribeSuccess={() => {}}
      />,
    );
    expect(screen.getByTestId('execution-panel')).toBeVisible();

    // Changing product inputs without a new quote drops the sticky panel.
    rerender(
      <DualInvestmentConfirm
        quote={quote}
        productInput={{ ...productInput, targetPrice: 64_000 }}
        subscribeQuote={null}
        isVerifying={true}
        onSubscribeSuccess={() => {}}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByTestId('execution-panel')).not.toBeInTheDocument();
  });

  it('drops the sticky execution panel when the oracle changes under identical product inputs', async () => {
    // The previous market's quote must not stay subscribable through the
    // re-verify gap after switching oracles with coincidentally equal inputs.
    const productInput = { principal: 5, targetPrice: 65_500, floorPrice: 63_000, targetLegCount: 6 };
    const quote = pageQuoteFixture({ productInput, coupon: 0.03 });

    const { rerender } = render(
      <DualInvestmentConfirm
        quote={quote}
        productInput={productInput}
        subscribeQuote={quote}
        isVerifying={false}
        onSubscribeSuccess={() => {}}
      />,
    );
    expect(screen.getByTestId('execution-panel')).toBeVisible();

    const otherMarket = marketFixture({ predictId: '0x8', oracleId: '0x9' });
    const otherQuote = pageQuoteFixture({ market: otherMarket, productInput, coupon: 0.03 });
    rerender(
      <DualInvestmentConfirm
        quote={otherQuote}
        productInput={productInput}
        subscribeQuote={null}
        isVerifying={true}
        onSubscribeSuccess={() => {}}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByTestId('execution-panel')).not.toBeInTheDocument();
  });

  it('headlines the net APR as the display stat in the card heading', () => {
    // 7-day tenor (marketFixture default) — APR is the primary rate display.
    // Net-of-fee basis: fixture apr 1.5 gross → 1.35 net of the 10% coupon fee.
    const productInput = { principal: 5, targetPrice: 65_500, floorPrice: 63_000, targetLegCount: 6 };
    const quote = pageQuoteFixture({ productInput, coupon: 0.05 });

    render(<ReturnOverview quote={quote} productInput={productInput} />);

    expect(screen.getByText('Est. Net APR')).toBeVisible();
    expect(screen.getByText('135.00%')).toBeVisible();
    expect(screen.getByText('Live quote')).toBeVisible();
    // The receipts stay pure amounts — the gross Reward − Fee lines are the
    // on-screen audit trail for the net headline.
    expect(screen.getAllByText('Reward').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Fee (10% of reward)').length).toBeGreaterThanOrEqual(1);
  });

  it('headlines per-period yield with a reference APR for sub-day tenors (ADR-0002)', () => {
    const market = marketFixture({ expiryMs: Date.now() + 2 * 3_600_000 });
    const productInput = { principal: 5, targetPrice: 65_500, floorPrice: 63_000, targetLegCount: 6 };
    const quote = pageQuoteFixture({ market, productInput, coupon: 0.05 });

    render(<ReturnOverview quote={quote} productInput={productInput} />);

    // 0.045 net coupon on 5 principal → 90 bps for the period; the annualized
    // figure rides along as a muted line, mirroring the Turbo table cells.
    expect(screen.getByText('Per-period yield')).toBeVisible();
    expect(screen.getByText('90 bps')).toBeVisible();
    expect(screen.getByText('Ref. APR ≈ 135.00%')).toBeVisible();
    expect(screen.queryByText('Est. Net APR')).not.toBeInTheDocument();
  });

  it('shows period return and reference APR in the Turbo reference table', () => {
    const market = marketFixture({
      expiryMs: Date.now() + 2 * 3_600_000,
      admissionTickSize: 1,
      tickSize: 0.01,
    });
    const productInput = { principal: 5, targetPrice: 64_000, floorPrice: 59_000, targetLegCount: 6 };
    const rows: DualInvestmentScanRow[] = [
      {
        input: productInput,
        quote: pageQuoteFixture({ market, productInput, coupon: 0.02 }),
      },
    ];

    render(
      <ReferenceTable
        market={market}
        rows={rows}
        activeTargetPrice={64_000}
        isFetching={false}
        onSelect={() => undefined}
        onRefresh={() => undefined}
      />,
    );

    expect(screen.getByRole('columnheader', { name: /Per-period yield/ })).toBeVisible();
    // 0.02 coupon on 5 principal = 40 bps gross → 36 bps net of the 10% fee.
    expect(within(screen.getByRole('table')).getByText('36 bps')).toBeVisible();
    expect(screen.getByText('Ref. APR ≈ 135.00%')).toBeVisible();
    expect(screen.queryByRole('columnheader', { name: 'Binance APR' })).not.toBeInTheDocument();
  });

  it('shows matched Binance APR with edge and methodology', () => {
    const market = marketFixture({ expiryMs: Date.UTC(2026, 7, 22) });
    const productInput = { principal: 5, targetPrice: 64_000, floorPrice: 59_000, targetLegCount: 6 };
    const rows: DualInvestmentScanRow[] = [
      {
        input: productInput,
        quote: pageQuoteFixture({ market, productInput, coupon: 0.02 }),
      },
    ];
    const binanceProducts: BinanceDualInvestmentProduct[] = [
      {
        id: 'binance-64000',
        investmentAsset: 'USDC',
        targetAsset: 'BTC',
        strikePrice: 64_000,
        settleTimeMs: Date.UTC(2026, 7, 22, 8),
        apr: 0.8,
        durationDays: 1,
        canPurchase: true,
      },
    ];

    render(
      <ReferenceTable
        market={market}
        rows={rows}
        binanceProducts={binanceProducts}
        activeTargetPrice={64_000}
        isFetching={false}
        onSelect={() => undefined}
        onRefresh={() => undefined}
      />,
    );

    expect(screen.getByRole('columnheader', { name: /^Binance APR/ })).toBeVisible();
    expect(screen.getByRole('columnheader', { name: /^Edge/ })).toBeVisible();
    expect(screen.getByText('80.00%')).toBeVisible();
    expect(within(screen.getByRole('table')).getByText('+55.00 pts')).toBeVisible();
    // Methodology + "-- means no match" live in the Binance APR header tooltip.
    expect(screen.getByLabelText(/no comparable product/i)).toBeInTheDocument();
    // Edge gets the same header-tooltip treatment — the term is ours, not Binance's.
    expect(screen.getByLabelText(/percentage points/i)).toBeInTheDocument();
  });

  it('exposes the phone compare button and selects a price from the ladder table', () => {
    const market = marketFixture({ expiryMs: Date.UTC(2026, 7, 22) });
    const firstInput = { principal: 5, targetPrice: 64_000, floorPrice: 59_000, targetLegCount: 6 };
    const secondInput = { principal: 5, targetPrice: 63_500, floorPrice: 58_500, targetLegCount: 6 };
    const rows: DualInvestmentScanRow[] = [
      { input: firstInput, quote: pageQuoteFixture({ market, productInput: firstInput, coupon: 0.02 }) },
      { input: secondInput, quote: pageQuoteFixture({ market, productInput: secondInput, coupon: 0.018 }) },
    ];
    const onLadderOpen = vi.fn();
    const onSelect = vi.fn();

    render(
      <>
        <BuyLowControls
          market={market}
          principal={5}
          targetPrice={64_000}
          ladderRows={rows}
          onLadderOpen={onLadderOpen}
          onPrincipalChange={() => undefined}
          onTargetChange={() => undefined}
        />
        <ReferenceTable
          market={market}
          rows={rows}
          activeTargetPrice={64_000}
          isFetching={false}
          onSelect={onSelect}
          onRefresh={() => undefined}
        />
      </>,
    );

    const compare = screen.getByRole('button', { name: /Yield by price/ });
    expect(compare).toHaveAttribute('aria-haspopup', 'dialog');
    fireEvent.click(compare);
    expect(onLadderOpen).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /\$63,500/ }));
    expect(onSelect).toHaveBeenCalledWith(secondInput);
  });

  it('distinguishes missing products, incomparable offsets, and unavailable APR', () => {
    const market = marketFixture({ expiryMs: Date.UTC(2026, 7, 22) });
    const productInput = { principal: 5, targetPrice: 64_000, floorPrice: 59_000, targetLegCount: 6 };
    const rows: DualInvestmentScanRow[] = [
      {
        input: productInput,
        quote: pageQuoteFixture({ market, productInput, coupon: 0.02 }),
      },
    ];

    const { rerender } = render(
      <ReferenceTable
        market={market}
        rows={rows}
        activeTargetPrice={64_000}
        isFetching={false}
        onSelect={() => undefined}
        onRefresh={() => undefined}
      />,
    );

    // Binance-has-nothing rows show "--" cells; the meaning lives in the header tooltip.
    expect(screen.getAllByText('--').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByLabelText(/no comparable product/i)).toBeInTheDocument();
    expect(screen.queryByText(/Binance has no comparable product/)).not.toBeInTheDocument();

    rerender(
      <ReferenceTable
        market={market}
        rows={rows}
        binanceProducts={[
          {
            id: 'binance-too-far',
            investmentAsset: 'USDC',
            targetAsset: 'BTC',
            strikePrice: 64_000,
            settleTimeMs: Date.UTC(2026, 8, 10, 8),
            apr: 0.5,
            durationDays: 20,
            canPurchase: true,
          },
        ]}
        activeTargetPrice={64_000}
        isFetching={false}
        onSelect={() => undefined}
        onRefresh={() => undefined}
      />,
    );

    // Incomparable settlement offsets read the same way — dashes only, no table footnote.
    expect(screen.getAllByText('--').length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText(/Binance has no comparable product/)).not.toBeInTheDocument();

    rerender(
      <ReferenceTable
        market={market}
        rows={rows}
        binanceProducts={[
          {
            id: 'binance-64000',
            investmentAsset: 'USDC',
            targetAsset: 'BTC',
            strikePrice: 64_000,
            settleTimeMs: Date.UTC(2026, 7, 22, 8),
            apr: null,
            durationDays: 1,
            canPurchase: true,
          },
        ]}
        activeTargetPrice={64_000}
        isFetching={false}
        onSelect={() => undefined}
        onRefresh={() => undefined}
      />,
    );

    expect(screen.getByText('APR unavailable')).toBeVisible();
    expect(within(screen.getByRole('table')).getByText('No APR')).toBeVisible();
  });

  it('surfaces Binance APR fetch failures in the reference table', () => {
    const market = marketFixture({ expiryMs: Date.UTC(2026, 7, 22) });
    const productInput = { principal: 5, targetPrice: 64_000, floorPrice: 59_000, targetLegCount: 6 };
    const rows: DualInvestmentScanRow[] = [
      {
        input: productInput,
        quote: pageQuoteFixture({ market, productInput, coupon: 0.02 }),
      },
    ];

    render(
      <ReferenceTable
        market={market}
        rows={rows}
        binanceStatus="error"
        activeTargetPrice={64_000}
        isFetching={false}
        onSelect={() => undefined}
        onRefresh={() => undefined}
      />,
    );

    expect(screen.getByText('APR fetch failed')).toBeVisible();
    expect(within(screen.getByRole('table')).getByText('No benchmark')).toBeVisible();
  });

  it('renders Chinese copy while keeping target prices in USD', () => {
    const market = marketFixture({ expiryMs: Date.UTC(2026, 7, 22) });
    const productInput = { principal: 5, targetPrice: 64_000, floorPrice: 59_000, targetLegCount: 6 };
    const rows: DualInvestmentScanRow[] = [
      {
        input: productInput,
        quote: pageQuoteFixture({ market, productInput, coupon: 0.02 }),
      },
    ];

    render(
      <>
        <BuyLowControls
          market={market}
          principal={5}
          targetPrice={64_000}
          locale="zh-CN"
          onPrincipalChange={() => undefined}
          onTargetChange={() => undefined}
        />
        <ReferenceTable
          market={market}
          rows={rows}
          activeTargetPrice={64_000}
          isFetching={false}
          locale="zh-CN"
          onSelect={() => undefined}
          onRefresh={() => undefined}
        />
      </>,
    );

    expect(screen.getByText('低买价格')).toBeVisible();
    expect(screen.getByRole('columnheader', { name: '预估净 APR' })).toBeVisible();
    expect(screen.getByRole('columnheader', { name: /^Binance APR/ })).toBeVisible();
    expect(within(screen.getByRole('table')).getByText('$64,000')).toBeVisible();
  });
});

describe('DualInvestmentPage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    const market = marketFixture();
    mocks.marketData = {
      data: {
        market,
        productOracles: [{ oracle_id: market.oracleId, expiry: market.expiryMs, group: 'hourly' }],
        selectedOracleId: market.oracleId,
      },
    };
    mocks.buildVerifiedDualInvestmentQuote.mockReset();
    mocks.buildIndicativeDualInvestmentQuote.mockReset();
    mocks.buildIndicativeDualInvestmentQuote.mockImplementation(
      ({ market: oracle, productInput }: { market: OracleMarket; productInput: DualInvestmentInput }) =>
        pageQuoteFixture({ market: oracle, productInput, coupon: 0.02 }),
    );
    mocks.refetchScan.mockReset();
    mocks.binanceProducts = [];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders Buy Low as active and Sell High as a disabled coming-soon direction', () => {
    render(<DualInvestmentPage />);

    expect(screen.getByRole('link', { name: 'Buy Low' })).toBeVisible();
    const sellHigh = screen.getByRole('button', { name: 'Sell High' });
    expect(sellHigh).not.toHaveAttribute('title');
    expect(sellHigh).toHaveAttribute('aria-disabled', 'true');
  });

  it('leads with a live estimate of the return scenarios and needs no preview step', () => {
    render(<DualInvestmentPage />);

    expect(screen.getByRole('heading', { name: /What you'll receive on/ })).toBeVisible();
    // The ticket summary shows both settlement outcomes side by side (seeded
    // default target: nearest grid step below the fixture spot → $66,000).
    expect(screen.getByText('BTC above $66,000')).toBeVisible();
    expect(screen.getByText('BTC at or below $66,000')).toBeVisible();
    expect(screen.getByText('Estimate')).toBeVisible();
    expect(screen.queryByRole('button', { name: /Preview/i })).not.toBeInTheDocument();
    // Subscribe is gated until the background quote confirms.
    expect(screen.queryByTestId('execution-panel')).not.toBeInTheDocument();
  });

  it('bounds the Buy Low slider by the top reference row and the fillable minimum', () => {
    render(<DualInvestmentPage />);

    // Fixture market (spot 66,172, no SVI): fallback minimum is 70% of spot
    // (46,320.4) aligned up to the $500 ladder grid; max is the top ladder row.
    const slider = screen.getByRole('slider');
    expect(slider).toHaveAttribute('min', '46500');
    expect(slider).toHaveAttribute('max', '66000');
    expect(slider).toHaveAttribute('step', '500');
  });

  it('flags hand-typed targets below the fillable minimum with a visible error', () => {
    render(<DualInvestmentPage />);

    const priceInput = screen.getByRole('spinbutton', { name: /Buy Low price/ });
    fireEvent.change(priceInput, { target: { value: '10' } });

    expect(screen.getByRole('alert')).toHaveTextContent(/Lowest fillable Buy Low price/);
    // No fake legs: the overview returns to its empty state.
    expect(
      screen.getByText('Enter a Buy Low price below the current BTC price to preview your payout.'),
    ).toBeVisible();

    // Back inside the band the error clears and the estimate returns.
    fireEvent.change(priceInput, { target: { value: '65500' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('BTC above $65,500')).toBeVisible();
  });

  it('verifies in the background and unlocks the subscribe execution panel', async () => {
    mocks.buildVerifiedDualInvestmentQuote.mockResolvedValue(
      pageQuoteFixture({ market: mocks.marketData?.data.market, coupon: 0.03 }),
    );

    render(<DualInvestmentPage />);

    expect(screen.queryByTestId('execution-panel')).not.toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });

    expect(mocks.buildVerifiedDualInvestmentQuote).toHaveBeenCalled();
    expect(screen.getByTestId('execution-panel')).toBeVisible();
    // Once verified, the badge flips from Estimate to the live quote.
    expect(screen.getByText('Live quote')).toBeVisible();
  });

  it('keeps the subscribe panel mounted when oracle feed timestamps refresh', async () => {
    // Regression: product keys used to include spot/svi timestamps, so every
    // market poll (~15s) unmatched the verified quote, unmounted
    // TargetBuyExecutionPanel, and wiped success-dialog state mid-wallet-sign.
    const market = marketFixture({ spotTimestampMs: 1_000, sviTimestampMs: 1_000 });
    mocks.marketData = {
      data: {
        market,
        productOracles: [{ oracle_id: market.oracleId, expiry: market.expiryMs, group: 'hourly' }],
        selectedOracleId: market.oracleId,
      },
    };
    mocks.buildVerifiedDualInvestmentQuote.mockImplementation(
      ({ market: oracle, productInput }: { market: OracleMarket; productInput: DualInvestmentInput }) =>
        pageQuoteFixture({ market: oracle, productInput, coupon: 0.03 }),
    );

    const { rerender } = render(<DualInvestmentPage />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(screen.getByTestId('execution-panel')).toBeVisible();
    const callsAfterFirstVerify = mocks.buildVerifiedDualInvestmentQuote.mock.calls.length;

    // Simulate a live market poll: same product, newer oracle feed timestamps.
    const refreshed = marketFixture({ spotTimestampMs: 2_000, sviTimestampMs: 2_000 });
    mocks.marketData = {
      data: {
        market: refreshed,
        productOracles: [
          { oracle_id: refreshed.oracleId, expiry: refreshed.expiryMs, group: 'hourly' },
        ],
        selectedOracleId: refreshed.oracleId,
      },
    };
    rerender(<DualInvestmentPage />);

    // Panel must stay mounted through the feed tick (success dialog lives inside it).
    expect(screen.getByTestId('execution-panel')).toBeVisible();
    expect(screen.getByText('Live quote')).toBeVisible();

    // Background re-verify still runs so prices stay fresh.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(mocks.buildVerifiedDualInvestmentQuote.mock.calls.length).toBeGreaterThan(callsAfterFirstVerify);
    expect(screen.getByTestId('execution-panel')).toBeVisible();
  });

  it('keeps the subscribe success dialog open when the execution panel is torn down', async () => {
    // Regression: dialog state used to live inside TargetBuyExecutionPanel —
    // it popped on confirm, then vanished when live quote churn refreshed the
    // panel. Page-level state must survive even a full confirm-section unmount.
    const market = marketFixture();
    mocks.marketData = {
      data: {
        market,
        productOracles: [{ oracle_id: market.oracleId, expiry: market.expiryMs, group: 'hourly' }],
        selectedOracleId: market.oracleId,
      },
    };
    mocks.buildVerifiedDualInvestmentQuote.mockImplementation(
      ({ market: oracle, productInput }: { market: OracleMarket; productInput: DualInvestmentInput }) =>
        pageQuoteFixture({ market: oracle, productInput, coupon: 0.03 }),
    );

    const { rerender } = render(<DualInvestmentPage />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(screen.getByTestId('execution-panel')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'mock-subscribe-success' }));
    expect(screen.getByRole('dialog', { name: 'Subscription confirmed' })).toBeVisible();

    // Spot crashes below the seeded target: effectiveInput dies and the whole
    // confirm section (panel included) unmounts.
    const crashed = marketFixture({ spot: 50_500, forward: 50_500 });
    mocks.marketData = {
      data: {
        market: crashed,
        productOracles: [{ oracle_id: crashed.oracleId, expiry: crashed.expiryMs, group: 'hourly' }],
        selectedOracleId: crashed.oracleId,
      },
    };
    rerender(<DualInvestmentPage />);

    expect(screen.queryByTestId('execution-panel')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Subscription confirmed' })).toBeVisible();
  });

  it('surfaces a verification failure without blocking the estimate', async () => {
    mocks.buildVerifiedDualInvestmentQuote.mockRejectedValue(new Error('devInspect unavailable'));

    render(<DualInvestmentPage />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });

    expect(screen.getByText('devInspect unavailable')).toBeVisible();
    expect(screen.getByRole('heading', { name: /What you'll receive on/ })).toBeVisible();
    expect(screen.queryByTestId('execution-panel')).not.toBeInTheDocument();
  });

});
