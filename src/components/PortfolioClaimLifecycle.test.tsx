import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { PredictMarketState } from '../deepbook/predictMarketState';
import type { AnkerProductNoteRecord } from '../sui/ankerPortfolio';
import { ClaimActionView, claimRowPayout } from './PortfolioClaimAction';

const MARKET_ID = `0x${'5'.repeat(64)}`;

function noteFixture(overrides: Partial<AnkerProductNoteRecord> = {}): AnkerProductNoteRecord {
  return {
    noteId: `0x${'c'.repeat(64)}`,
    productType: 'dual-investment',
    productId: 'dual-demo',
    owner: `0x${'a'.repeat(64)}`,
    wrapperId: `0x${'b'.repeat(64)}`,
    oracleId: MARKET_ID,
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

function marketState(settlementPrice: number | null): PredictMarketState {
  return {
    expiryMarketId: MARKET_ID,
    expiryMs: 1_000,
    settlementPrice,
    settlementPriceBaseUnits: settlementPrice === null ? null : BigInt(Math.round(settlementPrice * 1_000_000_000)),
  };
}

/**
 * Real testnet scenario (note 0xc2ea…4684): target 64,000 settled at
 * 63,780.19 — below the target, but above every ladder strike, so all legs
 * realize and the payout still beats the principal. The outcome side must
 * come from the settlement price, never from payout vs principal.
 */
function nearTargetNote(): AnkerProductNoteRecord {
  return noteFixture({
    principal: 198,
    principalBaseUnits: 198_000_000n,
    reserve: 185.266125,
    reserveBaseUnits: 185_266_125n,
    coupon: 1.158589,
    couponBaseUnits: 1_158_589n,
    targetPrice: 64_000,
    floorPrice: 59_884,
    legs: [59_884, 60_570, 61_256, 61_942, 62_628, 63_314].map((strike) => ({
      strike,
      quantity: 2.12,
      quantityBaseUnits: 2_120_000n,
      cost: 0,
      costBaseUnits: 0n,
    })),
  });
}

describe('claimRowPayout outcome direction', () => {
  it('flags settledBelow from the settlement price even when the payout beats the principal', () => {
    const row = claimRowPayout(nearTargetNote(), marketState(63_780.19));

    // Every strike sits below the settle, so the ladder pays out in full…
    expect(row.netPayout).toBeGreaterThan(198);
    // …yet the market still fixed below the 64,000 target: the deposit converted.
    expect(row.settledBelow).toBe(true);
    expect(row.btcAmount).toBeCloseTo(0.00309375, 8);
  });

  it('keeps the returned side when the market fixes above the target', () => {
    const row = claimRowPayout(nearTargetNote(), marketState(64_100));

    expect(row.settledBelow).toBe(false);
  });
});

describe('ClaimActionView settlement lifecycle', () => {
  it('keeps an expired market disabled while its settlement event is unavailable', () => {
    render(
      <ClaimActionView
        note={noteFixture()}
        nowMs={1_001}
        marketState={marketState(null)}
        isPending={false}
        onClaim={() => undefined}
      />,
    );

    expect(screen.getByText('Awaiting settlement — claim opens as soon as the market fixes its final price.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Claim payout' })).toBeDisabled();
  });

  it('shows both outcomes while the direction is unknown: full dUSDC or BTC at the target price', () => {
    render(
      <ClaimActionView
        note={noteFixture()}
        nowMs={999}
        marketState={undefined}
        isPending={false}
        onClaim={() => undefined}
      />,
    );

    // deposit + reward − fee in cash; or the deposit alone converted at the
    // chosen target price with the reward staying a separate dUSDC amount
    expect(screen.getByText('~5.01 dUSDC')).toBeVisible();
    expect(screen.getByText('or ≈ 0.000076 BTC + 0.01 dUSDC reward')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Claim payout' })).toBeDisabled();
  });

  it('shows the exact settled payout and fee before enabling one-click claim', () => {
    render(
      <ClaimActionView
        note={noteFixture()}
        nowMs={1_001}
        marketState={marketState(65_600)}
        isPending={false}
        onClaim={() => undefined}
      />,
    );

    expect(screen.getByText("You'll receive")).toBeVisible();
    expect(screen.getByText('5.01 dUSDC')).toBeVisible();
    expect(screen.getByText('after <0.01 dUSDC fee')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Claim payout' })).toBeEnabled();
  });

  it('shows the converted side when the market fixes below the target, even if the payout beats the principal', () => {
    render(
      <ClaimActionView
        note={nearTargetNote()}
        nowMs={1_001}
        marketState={marketState(63_780.19)}
        isPending={false}
        onClaim={() => undefined}
      />,
    );

    // 198 / 64,000 BTC (shown to 6 decimals) plus the coupon net of the 10% fee, cash-settled on testnet.
    expect(screen.getByText('~0.003094 BTC + 1.04 dUSDC')).toBeVisible();
    expect(screen.getByText('≈ 199.03 dUSDC on testnet · after 0.12 dUSDC fee')).toBeVisible();
  });

  it('renders the recorded payout and fee after the Note is claimed', () => {
    render(
      <ClaimActionView
        note={noteFixture({
          status: 'redeemed',
          redeemedPayout: 6.125,
          redeemedPayoutBaseUnits: 6_125_000n,
          redeemedFee: 0.1125,
          redeemedFeeBaseUnits: 112_500n,
        })}
        nowMs={1_001}
        marketState={marketState(65_600)}
        isPending={false}
        onClaim={() => undefined}
      />,
    );

    expect(screen.getByText('You received')).toBeVisible();
    expect(screen.getByText('6.01 dUSDC')).toBeVisible();
    expect(screen.getByText('after 0.11 dUSDC fee')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Claim payout' })).toBeDisabled();
  });
});
