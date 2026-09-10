import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  U64_MAX,
  buildClaimDualInvestmentNoteTransaction,
  buildSubscribeDualInvestmentTransaction,
  type AnkerProtocolConfig,
} from './ankerTransactions';
import type { SettlementResult } from '../products/settlement';
import { createQuoteEnvelope } from '../products/quoteEnvelope';
import type { DualInvestmentInput, StructuredProductQuote } from '../products/types';
import type { AnkerProductNoteRecord } from './ankerPortfolio';
import { POS_INF_TICK } from './predictTicks';

const OWNER = `0x${'a'.repeat(64)}`;
const MANAGER_ID = `0x${'b'.repeat(64)}`;
const NOTE_ID = `0x${'c'.repeat(64)}`;
const ANKER_PACKAGE_ID = `0x${'1'.repeat(64)}`;
const ANKER_REGISTRY_ID = `0x${'2'.repeat(64)}`;
const PREDICT_PACKAGE_ID = `0x${'3'.repeat(64)}`;
const ACCOUNT_PACKAGE_ID = `0x${'7'.repeat(64)}`;
const PREDICT_OBJECT_ID = `0x${'4'.repeat(64)}`;
const ORACLE_ID = `0x${'5'.repeat(64)}`;
const DUSDC = `${`0x${'6'.repeat(64)}`}::dusdc::DUSDC`;

const config: AnkerProtocolConfig = {
  packageId: ANKER_PACKAGE_ID,
  originalPackageId: ANKER_PACKAGE_ID,
  registryId: ANKER_REGISTRY_ID,
  predictPackageId: PREDICT_PACKAGE_ID,
  poolVaultId: PREDICT_OBJECT_ID,
  accountPackageId: ACCOUNT_PACKAGE_ID,
  accountRegistryId: `0x${'8'.repeat(64)}`,
  accumulatorRoot: `0x${'a'.repeat(64)}`,
  protocolConfigId: `0x${'b'.repeat(64)}`,
  oracleRegistryId: `0x${'c'.repeat(64)}`,
  oracle: {
    pythFeed: `0x${'d'.repeat(64)}`,
    blockScholesValueStore: `0x${'e'.repeat(64)}`,
    blockScholesSviStore: `0x${'0'.repeat(63)}1`,
  },
  quoteAssetType: DUSDC,
  quoteAssetDecimals: 6,
};

function quoteFixture(): StructuredProductQuote {
  return {
    id: 'dual-demo',
    productType: 'dual-investment',
    title: 'Target Buy BTC at 66,000',
    principal: 1_000,
    oracle: {
      predictId: PREDICT_OBJECT_ID,
      oracleId: ORACLE_ID,
      underlyingAsset: 'BTC',
      expiryMs: 1_781_683_200_000,
      minStrike: 50_000,
      tickSize: 0.01,
      admissionTickSize: 1,
      status: 'active',
      spot: 66_172,
      forward: 66_167,
      spotTimestampMs: 1,
      sviTimestampMs: 1,
      serverLagSeconds: 1,
    },
    legs: [
      {
        id: 'up-61000',
        instrumentType: 'binary-up',
        oracleId: ORACLE_ID,
        expiryMs: 1_781_683_200_000,
        strike: 61_000,
        isUp: true,
        quantity: 10,
        description: 'UP 61,000',
        askPrice: 0.21,
        askCost: 2.1,
        redeemPreview: 0,
        quoteTimestampMs: 1,
        executable: true,
      },
      {
        id: 'up-62000',
        instrumentType: 'binary-up',
        oracleId: ORACLE_ID,
        expiryMs: 1_781_683_200_000,
        strike: 62_000,
        isUp: true,
        quantity: 12.5,
        description: 'UP 62,000',
        askPrice: 0.25,
        askCost: 3.125,
        redeemPreview: 0,
        quoteTimestampMs: 1,
        executable: true,
      },
    ],
    totalLegCost: 5.225,
    reserve: 610,
    coupon: 20,
    apr: 1.9264,
    executable: true,
    scenarios: [],
  };
}

function dualInputFixture(): DualInvestmentInput {
  return {
    principal: 1_000,
    targetPrice: 66_000,
    floorPrice: 61_000,
    targetLegCount: 2,
  };
}

function quoteEnvelopeFixture(quote = quoteFixture(), ttlMs = 30_000) {
  return createQuoteEnvelope({
    quote,
    network: 'testnet',
    quoteAssetDecimals: config.quoteAssetDecimals,
    ttlMs,
    slippageBps: 100,
  });
}

function noteFixture(): AnkerProductNoteRecord {
  return {
    noteId: NOTE_ID,
    productType: 'dual-investment',
    productId: 'dual-demo',
    owner: OWNER,
    wrapperId: MANAGER_ID,
    oracleId: ORACLE_ID,
    expiryMs: 1_781_683_200_000,
    principal: 1_000,
    principalBaseUnits: 1_000_000_000n,
    reserve: 610,
    reserveBaseUnits: 610_000_000n,
    coupon: 20,
    couponBaseUnits: 20_000_000n,
    targetPrice: 66_000,
    floorPrice: 61_000,
    lowerBound: 0,
    upperBound: 0,
    isBullish: false,
    usesMockCurrentDeposit: false,
    apr: 1.9264,
    feeBps: 1_000,
    legs: [
      { strike: 61_000, quantity: 10, quantityBaseUnits: 10_000_000n, cost: 2.1, costBaseUnits: 2_100_000n },
      { strike: 62_000, quantity: 12.5, quantityBaseUnits: 12_500_000n, cost: 3.125, costBaseUnits: 3_125_000n },
    ],
    orderIds: [11n, 22n],
    status: 'open',
    redeemedPayout: 0,
    redeemedPayoutBaseUnits: 0n,
    redeemedFee: 0,
    redeemedFeeBaseUnits: 0n,
  };
}

function settlementFixture(overrides: Partial<SettlementResult> = {}): SettlementResult {
  return {
    grossPayoutBaseUnits: 1_020_000_000n,
    performanceFeeBaseUnits: 2_000_000n,
    netPayoutBaseUnits: 1_018_000_000n,
    realizedLegs: [],
    ...overrides,
  };
}

describe('Anker transaction builders', () => {
  it('builds a Turbo subscribe PTB with top-up deposit, live pricer, and mint_exact_quantity', () => {
    const quote = quoteFixture();
    const quoteEnvelope = quoteEnvelopeFixture(quote);
    const plan = buildSubscribeDualInvestmentTransaction({
      accountAddress: OWNER,
      wrapperId: MANAGER_ID,
      productInput: dualInputFixture(),
      quote,
      quoteEnvelope,
      wrapperBalanceBaseUnits: 100_000_000n,
      nowMs: 1,
      config,
    });

    expect(plan.depositAmount).toBe(1_000_000_000n);
    expect(plan.topUpAmount).toBe(900_000_000n);
    expect(plan.legStrikes).toEqual([61_000_000_000_000n, 62_000_000_000_000n]);
    expect(plan.legQuantities).toEqual([10_000_000n, 12_500_000n]);
    expect(plan.legCosts).toEqual([2_100_000n, 3_125_000n]);
    expect(plan.legLowerTicks).toEqual([6_100_000n, 6_200_000n]);
    expect(plan.legHigherTicks).toEqual([POS_INF_TICK, POS_INF_TICK]);
    expect(plan.mintSlippage).toEqual([
      { maxCost: U64_MAX, maxProbability: U64_MAX },
      { maxCost: U64_MAX, maxProbability: U64_MAX },
    ]);
    expect(plan.targetPrice).toBe(66_000_000_000_000n);
    expect(plan.floorPrice).toBe(61_000_000_000_000n);
    expect(new TextDecoder().decode(Uint8Array.from(plan.productIdBytes))).toBe(quoteEnvelope.productHash);
    expect(plan.calls).toEqual([
      `${ANKER_PACKAGE_ID}::product_note::wrapper_balance`,
      `${ACCOUNT_PACKAGE_ID}::account::generate_auth`,
      `${ACCOUNT_PACKAGE_ID}::account::deposit_funds`,
      `${PREDICT_PACKAGE_ID}::expiry_market::load_live_pricer`,
      `${ACCOUNT_PACKAGE_ID}::account::generate_auth`,
      `${PREDICT_PACKAGE_ID}::expiry_market::mint_exact_quantity`,
      `${ACCOUNT_PACKAGE_ID}::account::generate_auth`,
      `${PREDICT_PACKAGE_ID}::expiry_market::mint_exact_quantity`,
      `${ANKER_PACKAGE_ID}::product_note::wrapper_balance`,
      `${ANKER_PACKAGE_ID}::product_note::new_dual_investment_note_verified`,
      'transferObjects',
    ]);
  });

  it('skips deposit_funds when the wrapper already covers principal', () => {
    const quote = quoteFixture();
    const plan = buildSubscribeDualInvestmentTransaction({
      accountAddress: OWNER,
      wrapperId: MANAGER_ID,
      productInput: dualInputFixture(),
      quote,
      quoteEnvelope: quoteEnvelopeFixture(quote),
      wrapperBalanceBaseUnits: 1_000_000_000n,
      nowMs: 1,
      config,
    });

    expect(plan.topUpAmount).toBe(0n);
    expect(plan.calls[0]).toBe(`${ANKER_PACKAGE_ID}::product_note::wrapper_balance`);
    expect(plan.calls[1]).toBe(`${PREDICT_PACKAGE_ID}::expiry_market::load_live_pricer`);
    expect(plan.calls).not.toContain(`${ACCOUNT_PACKAGE_ID}::account::deposit_funds`);
  });

  it('applies simulate-derived mint slippage caps when provided', () => {
    const quote = quoteFixture();
    const plan = buildSubscribeDualInvestmentTransaction({
      accountAddress: OWNER,
      wrapperId: MANAGER_ID,
      productInput: dualInputFixture(),
      quote,
      quoteEnvelope: quoteEnvelopeFixture(quote),
      mintSlippage: [
        { maxCost: 2_131_500n, maxProbability: 213_150_000n },
        { maxCost: 3_171_875n, maxProbability: 253_750_000n },
      ],
      nowMs: 1,
      config,
    });

    expect(plan.mintSlippage).toEqual([
      { maxCost: 2_131_500n, maxProbability: 213_150_000n },
      { maxCost: 3_171_875n, maxProbability: 253_750_000n },
    ]);
  });

  it('rejects expired Target Buy quote envelopes before signing', () => {
    expect(() =>
      buildSubscribeDualInvestmentTransaction({
        accountAddress: OWNER,
        wrapperId: MANAGER_ID,
        productInput: dualInputFixture(),
        quote: quoteFixture(),
        quoteEnvelope: quoteEnvelopeFixture(quoteFixture(), 1),
        nowMs: 1_000,
        config,
      }),
    ).toThrow('Quote expired');
  });

  it('rejects unsafe base-unit amount conversion before building a subscribe transaction', () => {
    const quote = {
      ...quoteFixture(),
      principal: Number.MAX_SAFE_INTEGER / 1_000_000 + 1,
    };

    expect(() =>
      buildSubscribeDualInvestmentTransaction({
        accountAddress: OWNER,
        wrapperId: MANAGER_ID,
        productInput: dualInputFixture(),
        quote,
        quoteEnvelope: quoteEnvelopeFixture(quote),
        nowMs: 1,
        config,
      }),
    ).toThrow('Quote principal exceeds safe integer range');
  });

  it('rejects invalid APR before encoding note metadata', () => {
    const quote = {
      ...quoteFixture(),
      apr: -0.01,
    };

    expect(() =>
      buildSubscribeDualInvestmentTransaction({
        accountAddress: OWNER,
        wrapperId: MANAGER_ID,
        productInput: dualInputFixture(),
        quote,
        quoteEnvelope: quoteEnvelopeFixture(quote),
        nowMs: 1,
        config,
      }),
    ).toThrow('Quote APR must be a non-negative finite number');
  });

  it('rejects subscribe quotes from a different Predict deployment than the transaction config', () => {
    const quote = {
      ...quoteFixture(),
      oracle: {
        ...quoteFixture().oracle,
        predictId: `0x${'9'.repeat(64)}`,
      },
    };

    expect(() =>
      buildSubscribeDualInvestmentTransaction({
        accountAddress: OWNER,
        wrapperId: MANAGER_ID,
        productInput: dualInputFixture(),
        quote,
        quoteEnvelope: quoteEnvelopeFixture(quote),
        nowMs: 1,
        config,
      }),
    ).toThrow('Quote Predict object does not match configured Predict object.');
  });

  it('builds one atomic claim PTB from settled Predict legs through Note accounting', () => {
    const plan = buildClaimDualInvestmentNoteTransaction({
      accountAddress: OWNER,
      note: noteFixture(),
      settlement: settlementFixture(),
      config,
    });

    expect(plan.feeAmount).toBe(2_000_000n);
    expect(plan.payoutAmount).toBe(1_020_000_000n);
    expect(plan.netPayoutAmount).toBe(1_018_000_000n);
    expect(plan.calls).toEqual([
      `${PREDICT_PACKAGE_ID}::expiry_market::redeem_settled_permissionless`,
      `${PREDICT_PACKAGE_ID}::expiry_market::redeem_settled_permissionless`,
      `${ACCOUNT_PACKAGE_ID}::account::generate_auth`,
      `${ACCOUNT_PACKAGE_ID}::account::withdraw_funds`,
      'splitCoins',
      `${ANKER_PACKAGE_ID}::product_note::record_redeem_with_fee`,
      'transferObjects',
    ]);
  });
});
