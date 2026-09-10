import { describe, expect, it } from 'vitest';
import type { CustodyAccountRef } from './subscribeDualInvestment';
import type { AnkerProductNoteRecord } from '../sui/ankerPortfolio';
import type { AnkerProtocolConfig } from '../sui/ankerTransactions';
import type { DualInvestmentInput, StructuredProductQuote } from '../products/types';
import { settlementForProductNote } from './settleProductNote';
import { buildClaimDualInvestmentNoteTransaction } from '../sui/ankerTransactions';
import { buildSubscribeDualInvestmentApplicationPlan } from './subscribeDualInvestment';

const OWNER = `0x${'a'.repeat(64)}`;
const MANAGER_ID = `0x${'b'.repeat(64)}`;
const USED_MANAGER_ID = `0x${'c'.repeat(64)}`;
const NOTE_ID = `0x${'d'.repeat(64)}`;
const ANKER_PACKAGE_ID = `0x${'1'.repeat(64)}`;
const ANKER_REGISTRY_ID = `0x${'2'.repeat(64)}`;
const PREDICT_PACKAGE_ID = `0x${'3'.repeat(64)}`;
const PREDICT_OBJECT_ID = `0x${'4'.repeat(64)}`;
const ORACLE_ID = `0x${'5'.repeat(64)}`;
const ACCOUNT_PACKAGE_ID = `0x${'7'.repeat(64)}`;
const DUSDC = `${`0x${'6'.repeat(64)}`}::dusdc::DUSDC`;

const config: AnkerProtocolConfig = {
  network: 'testnet',
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

const productInput: DualInvestmentInput = {
  principal: 5,
  targetPrice: 66_000,
  floorPrice: 65_000,
  targetLegCount: 1,
};

function toBaseUnits(value: number) {
  return BigInt(Math.round(value * 1_000_000));
}

function quoteFixture(): StructuredProductQuote {
  return {
    id: 'dual-demo',
    productType: 'dual-investment',
    title: 'Target Buy BTC at 66,000',
    principal: 5,
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
        id: 'up-65000',
        instrumentType: 'binary-up',
        oracleId: ORACLE_ID,
        expiryMs: 1_781_683_200_000,
        strike: 65_000,
        isUp: true,
        quantity: 0.075758,
        description: 'UP 65,000',
        askPrice: 0.6,
        askCost: 0.045455,
        redeemPreview: 0,
        quoteTimestampMs: 1,
        executable: true,
      },
    ],
    totalLegCost: 0.045455,
    reserve: 4.924242,
    coupon: 0.030303,
    targetPrice: 66_000,
    floorPrice: 65_000,
    apr: 0.49,
    executable: true,
    scenarios: [],
  };
}

function noteFromQuote(quote: StructuredProductQuote): AnkerProductNoteRecord {
  return {
    noteId: NOTE_ID,
    productType: 'dual-investment',
    productId: quote.id,
    owner: OWNER,
    wrapperId: MANAGER_ID,
    oracleId: ORACLE_ID,
    expiryMs: quote.oracle.expiryMs,
    principal: quote.principal,
    principalBaseUnits: toBaseUnits(quote.principal),
    reserve: quote.reserve,
    reserveBaseUnits: toBaseUnits(quote.reserve),
    coupon: quote.coupon,
    couponBaseUnits: toBaseUnits(quote.coupon),
    targetPrice: quote.targetPrice ?? 0,
    floorPrice: quote.floorPrice ?? 0,
    lowerBound: 0,
    upperBound: 0,
    isBullish: false,
    usesMockCurrentDeposit: false,
    apr: quote.apr,
    feeBps: 1_000,
    legs: quote.legs.map((leg) => ({
      strike: leg.strike ?? 0,
      quantity: leg.quantity,
      quantityBaseUnits: toBaseUnits(leg.quantity),
      cost: leg.askCost,
      costBaseUnits: toBaseUnits(leg.askCost),
    })),
    orderIds: quote.legs.map((_, index) => BigInt(index + 1)),
    status: 'open',
    redeemedPayout: 0,
    redeemedPayoutBaseUnits: 0n,
    redeemedFee: 0,
    redeemedFeeBaseUnits: 0n,
  };
}

describe('Dual Investment subscribe-to-settle lifecycle', () => {
  it('builds a deterministic AccountWrapper subscribe, redeem, and withdraw path', () => {
    const quote = quoteFixture();
    const managers: CustodyAccountRef[] = [{ managerId: MANAGER_ID, owner: OWNER }];
    const subscribePlan = buildSubscribeDualInvestmentApplicationPlan({
      accountAddress: OWNER,
      managers,
      notes: [{ wrapperId: MANAGER_ID }],
      productInput,
      quote,
      config,
      nowMs: 1,
    });

    expect(subscribePlan.managerId).toBe(MANAGER_ID);
    expect(subscribePlan.transactionPlan.calls).toContain(
      `${ANKER_PACKAGE_ID}::product_note::new_dual_investment_note_verified`,
    );
    expect(subscribePlan.transactionPlan.calls).toContain(
      `${PREDICT_PACKAGE_ID}::expiry_market::mint_exact_quantity`,
    );

    const note = noteFromQuote(quote);
    const claimPlan = buildClaimDualInvestmentNoteTransaction({
      accountAddress: OWNER,
      note,
      settlement: settlementForProductNote(note, 64_000),
      config,
    });

    expect(claimPlan.payoutAmount).toBe(toBaseUnits(quote.reserve + quote.coupon));
    expect(claimPlan.feeAmount).toBe((toBaseUnits(quote.coupon) * 1_000n) / 10_000n);
    expect(claimPlan.netPayoutAmount).toBe(
      toBaseUnits(quote.reserve + quote.coupon) - (toBaseUnits(quote.coupon) * 1_000n) / 10_000n,
    );
    expect(claimPlan.calls).toContain(`${PREDICT_PACKAGE_ID}::expiry_market::redeem_settled_permissionless`);
    expect(claimPlan.calls).toContain(`${ANKER_PACKAGE_ID}::product_note::record_redeem_with_fee`);
  });
});
