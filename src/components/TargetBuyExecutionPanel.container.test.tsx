import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEEPBOOK_PREDICT } from '../config/deepbook';
import { buildDualInvestmentLegIntents, compileDualInvestment } from '../products/dualInvestment';
import type { DualInvestmentInput, StructuredProductQuote } from '../products/types';
import { SubscribeSuccessDialog } from './SubscribeSuccessDialog';
import { TargetBuyExecutionPanel, type ConfirmedSubscription } from './TargetBuyExecutionPanel';

const OWNER = `0x${'a'.repeat(64)}`;
const MANAGER_ID = `0x${'b'.repeat(64)}`;
const ORACLE_ID = `0x${'c'.repeat(64)}`;
const PREDICT_OBJECT_ID = DEEPBOOK_PREDICT.poolVaultId;

const mocks = vi.hoisted(() => ({
  quoteLegs: vi.fn(),
  simulateTransaction: vi.fn(),
  signTransaction: vi.fn(),
  executeTransaction: vi.fn(),
  waitForTransaction: vi.fn(),
  invalidateQueries: vi.fn(),
  managersData: [] as Array<{ managerId: string; owner?: string }>,
  portfolioData: [] as Array<{ managerId: string }>,
  managersRefetch: vi.fn(),
  portfolioRefetch: vi.fn(),
}));

vi.mock('lucide-react', () => ({
  WalletCards: () => <span data-testid="wallet-icon" />,
}));

vi.mock('@mysten/dapp-kit-react', () => ({
  useCurrentAccount: () => ({ address: OWNER }),
  useCurrentClient: () => ({
    waitForTransaction: mocks.waitForTransaction,
    simulateTransaction: mocks.simulateTransaction,
    executeTransaction: mocks.executeTransaction,
  }),
  useCurrentWallet: () => null,
  useDAppKit: () => ({
    signTransaction: mocks.signTransaction,
  }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: mocks.invalidateQueries,
  }),
}));

vi.mock('../hooks/usePredictManagers', () => ({
  usePredictManagers: () => ({
    data: mocks.managersData,
    isPending: false,
    refetch: mocks.managersRefetch,
  }),
}));

vi.mock('../hooks/useAnkerPortfolio', () => ({
  useAnkerPortfolio: () => ({
    data: mocks.portfolioData,
    isPending: false,
    refetch: mocks.portfolioRefetch,
  }),
}));

vi.mock('../hooks/useAccountWrapper', () => ({
  useAccountWrapperBalance: () => ({
    data: { dusdcBalanceBaseUnits: 0n, dusdcBalance: 0 },
    isPending: false,
  }),
}));

vi.mock('../deepbook/quoteProvider', () => ({
  createDefaultQuoteProvider: () => ({
    quoteLegs: mocks.quoteLegs,
  }),
}));

function productInputFixture(): DualInvestmentInput {
  return {
    principal: 1_000,
    targetPrice: 66_000,
    floorPrice: 61_000,
    targetLegCount: 1,
  };
}

function quoteFixture(productInput = productInputFixture()): StructuredProductQuote {
  const nowMs = Date.now();
  const oracle = {
    predictId: PREDICT_OBJECT_ID,
    oracleId: ORACLE_ID,
    underlyingAsset: 'BTC' as const,
    expiryMs: nowMs + 7 * 24 * 60 * 60_000,
    minStrike: 50_000,
    tickSize: 0.01,
    admissionTickSize: 1,
    status: 'active',
    spot: 66_172,
    forward: 66_167,
    spotTimestampMs: 1,
    sviTimestampMs: 1,
    serverLagSeconds: 1,
  };
  const quotedLegs = buildDualInvestmentLegIntents(productInput, oracle).map((leg) => ({
    ...leg,
    askPrice: 0.03,
    askCost: 2.1,
    redeemPreview: 0,
    quoteTimestampMs: nowMs,
    executable: true,
  }));
  return compileDualInvestment({ input: productInput, oracle, quotedLegs, nowMs });
}

function successfulSimulation(legCount: number) {
  return {
    $kind: 'Transaction' as const,
    Transaction: {
      status: { success: true, error: null },
      events: Array.from({ length: legCount }, () => ({
        eventType: `${DEEPBOOK_PREDICT.packageId}::order_events::OrderMinted`,
        json: {
          net_premium: '2100000',
          trading_fee: '0',
          fee_incentive_subsidy: '0',
          builder_fee: '0',
          penalty_fee: '0',
          entry_probability: '30000000',
        },
      })),
    },
  };
}

// Mirrors the DualInvestmentPage wiring: the success dialog renders from lifted state.
function PanelHarness({ quote, productInput }: { quote: StructuredProductQuote; productInput: DualInvestmentInput }) {
  const [confirmed, setConfirmed] = useState<ConfirmedSubscription | null>(null);
  return (
    <>
      <TargetBuyExecutionPanel quote={quote} productInput={productInput} onSubscribeSuccess={setConfirmed} />
      {confirmed ? (
        <SubscribeSuccessDialog quote={confirmed.quote} digest={confirmed.digest} onClose={() => setConfirmed(null)} />
      ) : null}
    </>
  );
}

describe('TargetBuyExecutionPanel subscription flow', () => {
  beforeEach(() => {
    mocks.quoteLegs.mockReset();
    mocks.simulateTransaction.mockReset();
    mocks.signTransaction.mockReset();
    mocks.executeTransaction.mockReset();
    mocks.waitForTransaction.mockReset();
    mocks.invalidateQueries.mockReset();
    mocks.managersRefetch.mockReset();
    mocks.portfolioRefetch.mockReset();
    mocks.managersData = [{ managerId: MANAGER_ID, owner: OWNER }];
    mocks.portfolioData = [];
  });

  it('refreshes the quote, simulates, then opens the wallet only after preflight succeeds', async () => {
    const productInput = productInputFixture();
    const quote = quoteFixture(productInput);
    mocks.quoteLegs.mockResolvedValue(
      buildDualInvestmentLegIntents(productInput, quote.oracle).map((leg) => ({
        ...leg,
        askPrice: 0.031,
        askCost: 2.11,
        redeemPreview: 0,
        quoteTimestampMs: Date.now(),
        executable: true,
      })),
    );
    mocks.simulateTransaction.mockResolvedValue(successfulSimulation(quote.legs.length));
    mocks.signTransaction.mockResolvedValue({ bytes: 'AQID', signature: 'sig' });
    mocks.executeTransaction.mockResolvedValue({ Transaction: { digest: '0xdigest' } });
    mocks.waitForTransaction.mockResolvedValue({});

    render(<PanelHarness quote={quote} productInput={productInput} />);

    fireEvent.click(screen.getByRole('button', { name: 'Subscribe Buy Low' }));

    await waitFor(() => expect(mocks.quoteLegs).toHaveBeenCalledTimes(1));
    expect(mocks.simulateTransaction).toHaveBeenCalledTimes(1);
    expect(mocks.signTransaction).toHaveBeenCalledTimes(1);
    // The signed bytes are submitted through our own client, not the wallet bridge.
    expect(mocks.executeTransaction).toHaveBeenCalledWith({
      transaction: new Uint8Array([1, 2, 3]),
      signatures: ['sig'],
    });

    await waitFor(() =>
      expect(screen.getByText('Subscription confirmed. Your position is in your Portfolio.')).toBeVisible(),
    );

    // The success card pops with the confirmed terms and a portfolio CTA.
    const dialog = screen.getByRole('dialog', { name: 'Subscription confirmed' });
    expect(within(dialog).getByRole('link', { name: 'View Portfolio' })).toHaveAttribute(
      'href',
      '/en/app/portfolio',
    );
    expect(within(dialog).getByRole('link', { name: /View transaction/ })).toHaveAttribute(
      'href',
      'https://testnet.suivision.xyz/txblock/0xdigest',
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();

    // The inline confirmation stays behind as the persistent record.
    expect(screen.getByText(/Subscription confirmed — your position is live:/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'View Portfolio' })).toBeVisible();
  });

  it('shows a readable error and does not open the wallet when simulation fails', async () => {
    const productInput = productInputFixture();
    const quote = quoteFixture(productInput);
    mocks.quoteLegs.mockResolvedValue(
      buildDualInvestmentLegIntents(productInput, quote.oracle).map((leg) => ({
        ...leg,
        askPrice: 0.031,
        askCost: 2.11,
        redeemPreview: 0,
        quoteTimestampMs: Date.now(),
        executable: true,
      })),
    );
    mocks.simulateTransaction.mockResolvedValue({
      $kind: 'FailedTransaction',
      FailedTransaction: {
        status: {
          success: false,
          error: { message: 'MoveAbort: EInsufficientBalance' },
        },
      },
    });

    render(<TargetBuyExecutionPanel quote={quote} productInput={productInput} onSubscribeSuccess={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: 'Subscribe Buy Low' }));

    await waitFor(() => expect(screen.getByText(/Insufficient DUSDC/i)).toBeVisible());
    expect(mocks.signTransaction).not.toHaveBeenCalled();
    expect(mocks.executeTransaction).not.toHaveBeenCalled();
  });

  it('runs the one-time setup as a separate wallet transaction when none is available', async () => {
    mocks.managersData = [];
    const productInput = productInputFixture();
    const quote = quoteFixture(productInput);
    mocks.quoteLegs.mockResolvedValue(
      buildDualInvestmentLegIntents(productInput, quote.oracle).map((leg) => ({
        ...leg,
        askPrice: 0.031,
        askCost: 2.11,
        redeemPreview: 0,
        quoteTimestampMs: Date.now(),
        executable: true,
      })),
    );
    mocks.signTransaction.mockResolvedValueOnce({ bytes: 'AQID', signature: 'sig' });
    mocks.executeTransaction.mockResolvedValueOnce({ Transaction: { digest: '0xmanager' } });
    mocks.waitForTransaction.mockResolvedValue({});

    render(<TargetBuyExecutionPanel quote={quote} productInput={productInput} onSubscribeSuccess={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: 'Set up wallet · 1 of 2' }));

    await waitFor(() => expect(mocks.executeTransaction).toHaveBeenCalledTimes(1));
    expect(mocks.waitForTransaction).toHaveBeenCalledWith({ digest: '0xmanager' });
    expect(mocks.managersRefetch).toHaveBeenCalledTimes(1);
    expect(mocks.portfolioRefetch).not.toHaveBeenCalled();
    expect(mocks.quoteLegs).not.toHaveBeenCalled();
    expect(mocks.simulateTransaction).not.toHaveBeenCalled();
  });
});
