import { describe, expect, it } from 'vitest';
import { buildAutoFloorDualInvestmentInput } from '../products/dualInvestmentScan';
import { buildDualInvestmentLegIntents, compileDualInvestment } from '../products/dualInvestment';
import { createQuoteEnvelope } from '../products/quoteEnvelope';
import type { LegQuote, OracleMarket } from '../products/types';
import { oracleMarketFromFixture } from '../test/oracleMarketFixture';
import { buildSubscribeDualInvestmentTransaction } from './subscribeTransactions';
import { POS_INF_TICK } from './predictTicks';
import { DEFAULT_ANKER_CONFIG } from './ankerProtocolConfig';

const NOW_MS = 1_783_000_000_000;

/**
 * Live 1h (Turbo) cadence market shape as served by the predict indexer:
 * tickSize $0.01, admissionTickSize $1 (deployment.testnet.json cadence id 2),
 * spot with cents as delivered by the oracle feed.
 */
function turboHourlyMarket(): OracleMarket {
  return {
    predictId: DEFAULT_ANKER_CONFIG.poolVaultId,
    oracleId: `0x${'5'.repeat(64)}`,
    underlyingAsset: 'BTC',
    expiryMs: NOW_MS + 3_600_000,
    minStrike: 1,
    tickSize: 0.01,
    admissionTickSize: 1,
    status: 'active',
    spot: 118_234.57,
    forward: 118_240.12,
    spotTimestampMs: NOW_MS - 1_000,
    sviTimestampMs: NOW_MS - 1_000,
    serverLagSeconds: 1,
  };
}

/**
 * Mirror of on-chain `strike_exposure::assert_admitted_mint_ticks`
 * (package 0xdb3e…446e, verified from bytecode disassembly):
 *   ratio = admission_tick_size / tick_size (= 100 on Turbo markets)
 *   lower admitted  ⇔ lower == 0 || lower % ratio == 0 || lower == reference_tick
 *   higher admitted ⇔ higher == 2^30-1 (pos-inf) || higher % ratio == 0 || higher == reference_tick
 * aborts with code 1 otherwise. reference_tick is unknowable offline, so this
 * mirror treats it as never matching (a strike only equals it by coincidence).
 */
function isAdmittedLowerTick(tick: bigint, admissionRatio: bigint): boolean {
  return tick === 0n || tick % admissionRatio === 0n;
}

function isAdmittedHigherTick(tick: bigint, admissionRatio: bigint): boolean {
  return tick === POS_INF_TICK || tick % admissionRatio === 0n;
}

/** Turbo-shaped market with real SVI params so fair-price premiums are estimable. */
function turboSviMarket(): OracleMarket {
  return {
    ...oracleMarketFromFixture(),
    predictId: DEFAULT_ANKER_CONFIG.poolVaultId,
    tickSize: 0.01,
    admissionTickSize: 1,
    minStrike: 1,
  };
}

describe('Turbo subscribe mint premium floor (strike_exposure_config::assert_mint_admission, abort 4)', () => {
  const market = turboSviMarket();
  const nowMs = market.expiryMs - 40 * 60_000;

  it('marks a small subscription non-executable with a minimum-amount warning', () => {
    // 5 dUSDC across 6 legs → per-leg premium ~0.001 dUSDC, far below the 1 dUSDC chain floor.
    const productInput = buildAutoFloorDualInvestmentInput({
      market,
      principal: 5,
      targetPrice: 73_250,
      targetLegCount: 6,
    });
    const intents = buildDualInvestmentLegIntents(productInput, market, { nowMs });
    const quotedLegs: Partial<LegQuote>[] = intents.map((intent) => ({
      ...intent,
      askPrice: 0.5,
      askCost: 0.5 * intent.quantity,
      redeemPreview: 0,
      quoteTimestampMs: nowMs,
      executable: true,
    }));

    const quote = compileDualInvestment({ input: productInput, oracle: market, quotedLegs, nowMs });

    expect(quote.executable).toBe(false);
    expect(quote.warning).toMatch(/premium/i);
    expect(quote.warning).toMatch(/dUSDC/);
  });

  it('rejects a below-floor premium leg with a readable error before reaching the chain', () => {
    const strike = 73_000;
    const quote = {
      id: 'dual-thin-premium',
      productType: 'dual-investment' as const,
      title: 'Target Buy BTC at 73,250',
      principal: 5,
      oracle: market,
      legs: [
        {
          id: `up-${strike}`,
          instrumentType: 'binary-up' as const,
          oracleId: market.oracleId,
          expiryMs: market.expiryMs,
          strike,
          isUp: true,
          quantity: 0.01,
          description: `UP ${strike}`,
          askPrice: 0.9,
          askCost: 0.009,
          redeemPreview: 0,
          quoteTimestampMs: nowMs,
          executable: true,
        },
      ],
      totalLegCost: 0.009,
      reserve: 4.98,
      coupon: 0.011,
      targetPrice: 73_250,
      floorPrice: strike,
      apr: 1,
      executable: true,
      scenarios: [],
    };
    const quoteEnvelope = createQuoteEnvelope({
      quote,
      network: 'testnet',
      quoteAssetDecimals: DEFAULT_ANKER_CONFIG.quoteAssetDecimals,
      ttlMs: 30_000,
      slippageBps: 100,
    });

    expect(() =>
      buildSubscribeDualInvestmentTransaction({
        accountAddress: `0x${'a'.repeat(64)}`,
        wrapperId: `0x${'b'.repeat(64)}`,
        productInput: { principal: 5, targetPrice: 73_250, floorPrice: strike },
        quote,
        quoteEnvelope,
        nowMs,
      }),
    ).toThrow(/premium/i);
  });
});

describe('Turbo subscribe mint-tick admission', () => {
  it('produces only admission-grid leg ticks for an hourly market (chain aborts code 1 otherwise)', () => {
    const market = turboHourlyMarket();
    // Same path as DualInvestmentPage: $50 browse rung below spot, auto floor, 6 legs.
    const productInput = buildAutoFloorDualInvestmentInput({
      market,
      principal: 1_000,
      targetPrice: 118_200,
      targetLegCount: 6,
    });

    const intents = buildDualInvestmentLegIntents(productInput, market, { nowMs: NOW_MS });
    const quotedLegs: Partial<LegQuote>[] = intents.map((intent) => ({
      ...intent,
      askPrice: 0.2,
      askCost: 0.2 * intent.quantity,
      redeemPreview: 0,
      quoteTimestampMs: NOW_MS,
      executable: true,
    }));
    const quote = compileDualInvestment({
      input: productInput,
      oracle: market,
      quotedLegs,
      nowMs: NOW_MS,
    });
    const quoteEnvelope = createQuoteEnvelope({
      quote,
      network: 'testnet',
      quoteAssetDecimals: DEFAULT_ANKER_CONFIG.quoteAssetDecimals,
      ttlMs: 30_000,
      slippageBps: 100,
    });

    const plan = buildSubscribeDualInvestmentTransaction({
      accountAddress: `0x${'a'.repeat(64)}`,
      wrapperId: `0x${'b'.repeat(64)}`,
      productInput,
      quote,
      quoteEnvelope,
      nowMs: NOW_MS,
    });

    const admissionRatio = BigInt(Math.round(market.admissionTickSize! / market.tickSize));
    expect(admissionRatio).toBe(100n);

    const rejectedLower = plan.legLowerTicks.filter((tick) => !isAdmittedLowerTick(tick, admissionRatio));
    const rejectedHigher = plan.legHigherTicks.filter((tick) => !isAdmittedHigherTick(tick, admissionRatio));

    expect(rejectedLower, `off-admission-grid lower ticks: ${rejectedLower.join(', ')}`).toEqual([]);
    expect(rejectedHigher, `off-admission-grid higher ticks: ${rejectedHigher.join(', ')}`).toEqual([]);
  });

  it('rejects an off-admission-grid quote leg with a readable error before reaching the chain', () => {
    const market = turboHourlyMarket();
    const strike = 114_033.33;
    const quote = {
      id: 'dual-off-grid',
      productType: 'dual-investment' as const,
      title: 'Target Buy BTC at 118,200',
      principal: 1_000,
      oracle: market,
      legs: [
        {
          id: `up-${strike}`,
          instrumentType: 'binary-up' as const,
          oracleId: market.oracleId,
          expiryMs: market.expiryMs,
          strike,
          isUp: true,
          quantity: 10,
          description: `UP ${strike}`,
          askPrice: 0.2,
          askCost: 2,
          redeemPreview: 0,
          quoteTimestampMs: NOW_MS,
          executable: true,
        },
      ],
      totalLegCost: 2,
      reserve: 900,
      coupon: 98,
      targetPrice: 118_200,
      floorPrice: strike,
      apr: 1,
      executable: true,
      scenarios: [],
    };
    const quoteEnvelope = createQuoteEnvelope({
      quote,
      network: 'testnet',
      quoteAssetDecimals: DEFAULT_ANKER_CONFIG.quoteAssetDecimals,
      ttlMs: 30_000,
      slippageBps: 100,
    });

    expect(() =>
      buildSubscribeDualInvestmentTransaction({
        accountAddress: `0x${'a'.repeat(64)}`,
        wrapperId: `0x${'b'.repeat(64)}`,
        productInput: { principal: 1_000, targetPrice: 118_200, floorPrice: strike },
        quote,
        quoteEnvelope,
        nowMs: NOW_MS,
      }),
    ).toThrow(/admission grid/);
  });
});

describe('Turbo subscribe mint order quantity (order::assert_valid_quantity, abort 4)', () => {
  it('produces lot-aligned leg quantities for a laddered subscription (verified via devInspect against 0xdb3e…446e: lot size is 10_000 base units)', () => {
    const market = turboHourlyMarket();
    const ORDER_QUANTITY_LOT_SIZE_BASE_UNITS = 10_000n;

    const productInput = buildAutoFloorDualInvestmentInput({
      market,
      principal: 3_000,
      targetPrice: 118_200,
      targetLegCount: 6,
    });

    const intents = buildDualInvestmentLegIntents(productInput, market, { nowMs: NOW_MS });
    const quotedLegs: Partial<LegQuote>[] = intents.map((intent) => ({
      ...intent,
      askPrice: 0.2,
      askCost: 0.2 * intent.quantity,
      redeemPreview: 0,
      quoteTimestampMs: NOW_MS,
      executable: true,
    }));
    const quote = compileDualInvestment({ input: productInput, oracle: market, quotedLegs, nowMs: NOW_MS });
    const quoteEnvelope = createQuoteEnvelope({
      quote,
      network: 'testnet',
      quoteAssetDecimals: DEFAULT_ANKER_CONFIG.quoteAssetDecimals,
      ttlMs: 30_000,
      slippageBps: 100,
    });

    const plan = buildSubscribeDualInvestmentTransaction({
      accountAddress: `0x${'a'.repeat(64)}`,
      wrapperId: `0x${'b'.repeat(64)}`,
      productInput,
      quote,
      quoteEnvelope,
      nowMs: NOW_MS,
    });

    const misaligned = plan.legQuantities.filter((qty) => qty % ORDER_QUANTITY_LOT_SIZE_BASE_UNITS !== 0n);
    expect(misaligned, `non-lot-aligned quantities: ${misaligned.join(', ')}`).toEqual([]);
  });
});
