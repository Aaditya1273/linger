import { describe, expect, it } from 'vitest';
import {
  buildDualInvestmentLegIntents,
  compileDualInvestment,
  minViableDualInvestmentPrincipal,
  suggestedMinPrincipal,
} from './dualInvestment';
import { lastKnownMarketSnapshot } from '../test/marketSnapshotFixture';
import { oracleMarketFromFixture } from '../test/oracleMarketFixture';

const nowMs = lastKnownMarketSnapshot.expiryMs - 7 * 86_400_000;

describe('compileDualInvestment', () => {
  it('builds an UP ladder and computes positive coupon from quoted legs', () => {
    const quote = compileDualInvestment({
      input: {
        principal: 1_000,
        targetPrice: 73_000,
        floorPrice: 58_000,
        stepSize: 2_000,
      },
      oracle: lastKnownMarketSnapshot,
      quotedLegs: [
        { id: 'up-58000', askCost: 3, askPrice: 0.21, redeemPreview: 0, executable: true, quoteTimestampMs: 1 },
        { id: 'up-60000', askCost: 3, askPrice: 0.2, redeemPreview: 0, executable: true, quoteTimestampMs: 1 },
        { id: 'up-62000', askCost: 3, askPrice: 0.19, redeemPreview: 0, executable: true, quoteTimestampMs: 1 },
        { id: 'up-64000', askCost: 3, askPrice: 0.18, redeemPreview: 0, executable: true, quoteTimestampMs: 1 },
        { id: 'up-66000', askCost: 3, askPrice: 0.17, redeemPreview: 0, executable: true, quoteTimestampMs: 1 },
        { id: 'up-68000', askCost: 3, askPrice: 0.16, redeemPreview: 0, executable: true, quoteTimestampMs: 1 },
        { id: 'up-70000', askCost: 3, askPrice: 0.15, redeemPreview: 0, executable: true, quoteTimestampMs: 1 },
        { id: 'up-72000', askCost: 3, askPrice: 0.14, redeemPreview: 0, executable: true, quoteTimestampMs: 1 },
      ],
      nowMs,
    });

    expect(quote.legs).toHaveLength(8);
    // Quantities are lot-floored at the source, and the reserve absorbs the
    // lot dust so reserve + Σ quantity = principal stays exact.
    const maxLegPayout = quote.legs.reduce((sum, leg) => sum + leg.quantity, 0);
    expect(maxLegPayout).toBeCloseTo(205.42);
    expect(quote.reserve).toBeCloseTo(794.58);
    expect(quote.reserve + maxLegPayout).toBeCloseTo(1_000, 9);
    expect(quote.totalLegCost).toBe(24);
    expect(quote.coupon).toBeCloseTo(181.42);
    expect(quote.executable).toBe(true);
    expect(quote.warningCode).toBeUndefined();
  });

  it('marks the quote non-executable with the paused code when the upstream feed stops', () => {
    const quote = compileDualInvestment({
      input: {
        principal: 1_000,
        targetPrice: 73_000,
        floorPrice: 58_000,
        stepSize: 2_000,
      },
      oracle: {
        ...lastKnownMarketSnapshot,
        // Hours-stale Block Scholes lanes: every on-chain mint would abort
        // EBlockScholesPriceStale, whatever the local pricing computes.
        bsPriceTimestampMs: nowMs - 6 * 3_600_000,
        bsSviTimestampMs: nowMs - 6 * 3_600_000,
      },
      quotedLegs: [
        { id: 'up-58000', askCost: 3, askPrice: 0.21, redeemPreview: 0, executable: true, quoteTimestampMs: 1 },
        { id: 'up-60000', askCost: 3, askPrice: 0.2, redeemPreview: 0, executable: true, quoteTimestampMs: 1 },
        { id: 'up-62000', askCost: 3, askPrice: 0.19, redeemPreview: 0, executable: true, quoteTimestampMs: 1 },
        { id: 'up-64000', askCost: 3, askPrice: 0.18, redeemPreview: 0, executable: true, quoteTimestampMs: 1 },
        { id: 'up-66000', askCost: 3, askPrice: 0.17, redeemPreview: 0, executable: true, quoteTimestampMs: 1 },
        { id: 'up-68000', askCost: 3, askPrice: 0.16, redeemPreview: 0, executable: true, quoteTimestampMs: 1 },
        { id: 'up-70000', askCost: 3, askPrice: 0.15, redeemPreview: 0, executable: true, quoteTimestampMs: 1 },
        { id: 'up-72000', askCost: 3, askPrice: 0.14, redeemPreview: 0, executable: true, quoteTimestampMs: 1 },
      ],
      nowMs,
    });

    // Quotes stay browsable (coupon/APR intact) but can never reach the wallet.
    expect(quote.coupon).toBeCloseTo(181.42);
    expect(quote.executable).toBe(false);
    expect(quote.warningCode).toBe('oracle-paused');
    expect(quote.warning).toContain('paused');
  });

  it('builds the requested number of legs and sizes the final interval to the target', () => {
    const legs = buildDualInvestmentLegIntents(
      {
        principal: 1_000,
        targetPrice: 73_000,
        floorPrice: 58_000,
        targetLegCount: 6,
      },
      lastKnownMarketSnapshot,
      { nowMs },
    );

    expect(legs.map((leg) => leg.strike)).toEqual([58_000, 60_500, 63_000, 65_500, 68_000, 70_500]);
    expect(legs).toHaveLength(6);
    // Every quantity sits on Predict's 0.01 mint lot grid — floored, so the
    // ladder never promises more than the mint can deliver.
    legs.forEach((leg) => {
      expect(Math.round(leg.quantity * 100)).toBeCloseTo(leg.quantity * 100, 9);
    });
    const rawLadder = (1_000 / 73_000) * (73_000 - 58_000);
    const total = legs.reduce((sum, leg) => sum + leg.quantity, 0);
    expect(total).toBeCloseTo(205.44);
    expect(total).toBeLessThanOrEqual(rawLadder);
    expect(rawLadder - total).toBeLessThan(0.01 * legs.length);
  });

  it('matches quoted legs by identity instead of array position', () => {
    const input = {
      principal: 1_000,
      targetPrice: 73_000,
      floorPrice: 70_000,
      targetLegCount: 3,
    };
    const quotedLegs = buildDualInvestmentLegIntents(input, lastKnownMarketSnapshot, { nowMs })
      .map((leg, index) => ({
        ...leg,
        askCost: index + 1,
        askPrice: 0.1,
        redeemPreview: 0,
        executable: true,
        quoteTimestampMs: 1,
      }))
      .reverse();

    const quote = compileDualInvestment({
      input,
      oracle: lastKnownMarketSnapshot,
      quotedLegs,
      nowMs,
    });

    expect(quote.legs.map((leg) => leg.askCost)).toEqual([1, 2, 3]);
  });

  it('preserves core payoff invariants across settlement boundaries', () => {
    const input = {
      principal: 1_000,
      targetPrice: 73_000,
      floorPrice: 58_000,
      targetLegCount: 6,
    };
    const quotedLegs = buildDualInvestmentLegIntents(input, lastKnownMarketSnapshot, { nowMs }).map((leg) => ({
      ...leg,
      askCost: 1,
      askPrice: 0.01,
      redeemPreview: 0,
      executable: true,
      quoteTimestampMs: 1,
    }));

    const quote = compileDualInvestment({
      input,
      oracle: lastKnownMarketSnapshot,
      quotedLegs,
      nowMs,
    });
    const maxLegPayout = quote.legs.reduce((sum, leg) => sum + leg.quantity, 0);

    expect(quote.reserve + maxLegPayout).toBeCloseTo(quote.principal);
    expect(quote.coupon).toBeGreaterThanOrEqual(0);
    expect(quote.coupon).toBeLessThanOrEqual(quote.principal);

    const belowFloor = quote.scenarios.find((scenario) => scenario.settlementPrice === input.floorPrice - 1);
    const aboveTarget = quote.scenarios.find((scenario) => scenario.settlementPrice === input.targetPrice);
    expect(belowFloor?.finalUsdc).toBeCloseTo(quote.reserve + quote.coupon);
    expect(aboveTarget?.finalUsdc).toBeCloseTo(quote.principal + quote.coupon);

    const orderedScenarios = [...quote.scenarios].sort((left, right) => left.settlementPrice - right.settlementPrice);
    orderedScenarios.forEach((scenario, index) => {
      expect(scenario.finalUsdc).toBeGreaterThanOrEqual(0);
      if (index > 0) {
        expect(scenario.finalUsdc).toBeGreaterThanOrEqual(orderedScenarios[index - 1].finalUsdc);
      }
    });
  });

  it('increases payoff by exactly the crossed leg quantity at each binary-up strike', () => {
    const input = {
      principal: 1_000,
      targetPrice: 73_000,
      floorPrice: 58_000,
      targetLegCount: 6,
    };
    const quotedLegs = buildDualInvestmentLegIntents(input, lastKnownMarketSnapshot, { nowMs }).map((leg) => ({
      ...leg,
      askCost: 1,
      askPrice: 0.01,
      redeemPreview: 0,
      executable: true,
      quoteTimestampMs: 1,
    }));
    const quote = compileDualInvestment({
      input,
      oracle: lastKnownMarketSnapshot,
      quotedLegs,
      nowMs,
    });

    quote.legs.forEach((leg) => {
      const atStrike = quote.scenarios.find((scenario) => scenario.settlementPrice === leg.strike);
      const aboveStrike = quote.scenarios.find((scenario) => scenario.settlementPrice === (leg.strike ?? 0) + 1);

      expect(atStrike).toBeDefined();
      expect(aboveStrike).toBeDefined();
      expect((aboveStrike?.finalUsdc ?? 0) - (atStrike?.finalUsdc ?? 0)).toBeCloseTo(leg.quantity);
    });
  });

  it('surfaces non-mintable leg errors as the quote warning', () => {
    const quote = compileDualInvestment({
      input: {
        principal: 1_000,
        targetPrice: 73_000,
        floorPrice: 72_000,
        targetLegCount: 1,
      },
      oracle: lastKnownMarketSnapshot,
      quotedLegs: [
        {
          id: 'up-72000',
          askCost: 1,
          askPrice: 1.001,
          redeemPreview: 0,
          executable: false,
          quoteTimestampMs: 1,
          error: 'Ask price 1.0010 is outside Predict mint bounds 0.01-0.99.',
        },
      ],
      nowMs,
    });

    expect(quote.coupon).toBeGreaterThan(0);
    expect(quote.executable).toBe(false);
    expect(quote.warning).toContain('outside Predict mint bounds');
  });

  it('rejects invalid product inputs before quote execution', () => {
    expect(() =>
      buildDualInvestmentLegIntents(
        {
          principal: 1_000,
          targetPrice: 60_000,
          floorPrice: 61_000,
          targetLegCount: 6,
        },
        lastKnownMarketSnapshot,
        { nowMs },
      ),
    ).toThrow('Floor price must be below target price');
  });

  it('rejects a target price far below spot on live markets whose min strike is one grid step', () => {
    // Live day-scale markets expose minStrike = admissionTickSize (~$1), so the
    // floor-vs-minStrike check cannot catch nonsense targets like 10 vs spot ~63,960.
    // Without SVI the coarse spot-band fallback applies.
    expect(() =>
      buildDualInvestmentLegIntents(
        {
          principal: 1_000,
          targetPrice: 10,
          floorPrice: 1,
          targetLegCount: 6,
        },
        { ...lastKnownMarketSnapshot, minStrike: 1, tickSize: 0.01, admissionTickSize: 1 },
        { nowMs },
      ),
    ).toThrow('Target price must be within 30% of the current price');
  });

  it('rejects targets whose legs cannot fill inside the Predict ask clamp, even within 30% of spot', () => {
    // Fixture market: spot ~73,264 with SVI. A 60,000 target is only ~18% below
    // spot, but its legs would ask above the 0.99 − buffer clamp — unfillable.
    const market = oracleMarketFromFixture();
    expect(() =>
      buildDualInvestmentLegIntents(
        {
          principal: 1_000,
          targetPrice: 60_000,
          floorPrice: 55_000,
          targetLegCount: 6,
        },
        market,
        { nowMs: market.spotTimestampMs },
      ),
    ).toThrow('within Predict ask limits');
  });

  it('rejects expired oracle markets', () => {
    expect(() =>
      compileDualInvestment({
        input: {
          principal: 1_000,
          targetPrice: 73_000,
          floorPrice: 58_000,
          targetLegCount: 6,
        },
        oracle: lastKnownMarketSnapshot,
        quotedLegs: [],
        nowMs: lastKnownMarketSnapshot.expiryMs,
      }),
    ).toThrow('Oracle expiry must be in the future');
  });

  it('rejects quotes where leg costs consume the reserve budget', () => {
    expect(() =>
      compileDualInvestment({
        input: {
          principal: 1_000,
          targetPrice: 73_000,
          floorPrice: 72_000,
          targetLegCount: 1,
        },
        oracle: lastKnownMarketSnapshot,
        quotedLegs: [
          {
            id: 'up-72000',
            askCost: 20,
            askPrice: 0.2,
            redeemPreview: 0,
            executable: true,
            quoteTimestampMs: 1,
          },
        ],
        nowMs,
      }),
    ).toThrow('Coupon must be non-negative');
  });
});

describe('premium floor minimum amount', () => {
  const market = oracleMarketFromFixture();
  const marketNowMs = market.spotTimestampMs;
  const ladder = { targetPrice: 73_000, floorPrice: 72_400, targetLegCount: 6 };

  function stubQuotedLegs(input: { principal: number } & typeof ladder) {
    return buildDualInvestmentLegIntents(input, market, { nowMs: marketNowMs }).map((intent) => ({
      id: intent.id,
      askCost: 0.001,
      askPrice: 0.2,
      redeemPreview: 0,
      executable: true,
      quoteTimestampMs: 1,
    }));
  }

  it('flags sub-floor amounts with the premium-floor code and a finite minimum', () => {
    const input = { principal: 50, ...ladder };
    const quote = compileDualInvestment({
      input,
      oracle: market,
      quotedLegs: stubQuotedLegs(input),
      nowMs: marketNowMs,
    });

    expect(quote.executable).toBe(false);
    expect(quote.warningCode).toBe('premium-floor');
    expect(quote.minViablePrincipal).toBeGreaterThan(input.principal);
  });

  it('computes a minimum that is independent of the probed principal and clears the floor', () => {
    const minFromSmall = minViableDualInvestmentPrincipal({ principal: 100, ...ladder }, market, {
      nowMs: marketNowMs,
    });
    const minFromLarge = minViableDualInvestmentPrincipal({ principal: 50_000, ...ladder }, market, {
      nowMs: marketNowMs,
    });
    expect(minFromSmall).not.toBeNull();
    expect(minFromSmall).toBe(minFromLarge);

    // Subscribing the rounded minimum clears the floor: no premium-floor code.
    const okInput = { principal: suggestedMinPrincipal(minFromSmall as number), ...ladder };
    const quote = compileDualInvestment({
      input: okInput,
      oracle: market,
      quotedLegs: stubQuotedLegs(okInput),
      nowMs: marketNowMs,
    });
    expect(quote.warningCode).toBeUndefined();
    expect(quote.minViablePrincipal).toBeUndefined();
  });

  it('returns null when the market cannot price the ladder', () => {
    expect(
      minViableDualInvestmentPrincipal(
        { principal: 500, targetPrice: 73_000, floorPrice: 58_000, stepSize: 2_000 },
        lastKnownMarketSnapshot,
        { nowMs },
      ),
    ).toBeNull();
  });

  it('rounds suggested minimums up to whole hundreds', () => {
    expect(suggestedMinPrincipal(2_347)).toBe(2_400);
    expect(suggestedMinPrincipal(2_400)).toBe(2_400);
    expect(suggestedMinPrincipal(3)).toBe(100);
  });
});
