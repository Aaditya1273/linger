import { describe, expect, it } from 'vitest';
import type { AnkerProductNoteRecord } from './ankerPortfolio';
import {
  buildClaimDualInvestmentNoteTransaction,
  buildClaimDualInvestmentNotesTransaction,
  type AnkerProtocolConfig,
} from './ankerTransactions';
import { settlementForProductNote } from '../application/settleProductNote';
import { productNoteFixture } from '../test/productNoteFixture';

const OWNER = `0x${'a'.repeat(64)}`;
const WRAPPER_ID = `0x${'b'.repeat(64)}`;
const NOTE_ID = `0x${'c'.repeat(64)}`;
const MARKET_ID = `0x${'5'.repeat(64)}`;
const ANKER_PACKAGE_ID = `0x${'1'.repeat(64)}`;
const PREDICT_PACKAGE_ID = `0x${'3'.repeat(64)}`;
const ACCOUNT_PACKAGE_ID = `0x${'7'.repeat(64)}`;

const config: AnkerProtocolConfig = {
  packageId: ANKER_PACKAGE_ID,
  originalPackageId: ANKER_PACKAGE_ID,
  registryId: `0x${'2'.repeat(64)}`,
  predictPackageId: PREDICT_PACKAGE_ID,
  poolVaultId: `0x${'4'.repeat(64)}`,
  accountPackageId: ACCOUNT_PACKAGE_ID,
  accountRegistryId: `0x${'8'.repeat(64)}`,
  accumulatorRoot: `0x${'9'.repeat(64)}`,
  protocolConfigId: `0x${'d'.repeat(64)}`,
  oracleRegistryId: `0x${'e'.repeat(64)}`,
  oracle: {
    pythFeed: `0x${'f'.repeat(64)}`,
    blockScholesValueStore: `0x${'1'.repeat(64)}`,
    blockScholesSviStore: `0x${'3'.repeat(64)}`,
  },
  quoteAssetType: `${`0x${'6'.repeat(64)}`}::dusdc::DUSDC`,
  quoteAssetDecimals: 6,
};

function noteFixture(): AnkerProductNoteRecord {
  return productNoteFixture({
    noteId: NOTE_ID,
    productId: 'dual-demo',
    owner: OWNER,
    wrapperId: WRAPPER_ID,
    oracleId: MARKET_ID,
    expiryMs: 1_000,
    principal: 5,
    principalBaseUnits: 5_000_000n,
    reserve: 4.9,
    reserveBaseUnits: 4_900_000n,
    coupon: 0.02,
    couponBaseUnits: 20_000n,
    targetPrice: 65_000,
    floorPrice: 63_000,
    apr: 1,
    feeBps: 1_000,
    legs: [
      { strike: 63_000, quantity: 0.04, quantityBaseUnits: 40_000n, cost: 0.02, costBaseUnits: 20_000n },
      { strike: 64_000, quantity: 0.06, quantityBaseUnits: 60_000n, cost: 0.03, costBaseUnits: 30_000n },
    ],
    orderIds: [11n, 22n],
  });
}

describe('buildClaimDualInvestmentNoteTransaction', () => {
  it('atomically redeems every order id, withdraws the payout, records the fee, and transfers the net coin', () => {
    const note = noteFixture();
    const settlement = settlementForProductNote(note, 63_500);
    const plan = buildClaimDualInvestmentNoteTransaction({
      accountAddress: OWNER,
      note,
      settlement,
      config,
    });

    expect(plan.payoutAmount).toBe(4_960_000n);
    expect(plan.feeAmount).toBe(2_000n);
    expect(plan.netPayoutAmount).toBe(4_958_000n);
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

  it('skips every redeem when the settlement sweep already removed the legs from Predict', () => {
    const note = noteFixture();
    const settlement = settlementForProductNote(note, 63_500);
    const plan = buildClaimDualInvestmentNoteTransaction({
      accountAddress: OWNER,
      note,
      settlement,
      livePredictOrderIds: new Set<string>(),
      config,
    });

    // Payout math is unchanged — the sweep already credited the winnings to
    // the account, so the claim only withdraws and records.
    expect(plan.payoutAmount).toBe(4_960_000n);
    expect(plan.calls).toEqual([
      `${ACCOUNT_PACKAGE_ID}::account::generate_auth`,
      `${ACCOUNT_PACKAGE_ID}::account::withdraw_funds`,
      'splitCoins',
      `${ANKER_PACKAGE_ID}::product_note::record_redeem_with_fee`,
      'transferObjects',
    ]);
  });

  it('redeems only the legs still open on Predict when the sweep was partial', () => {
    const note = noteFixture();
    const settlement = settlementForProductNote(note, 63_500);
    const plan = buildClaimDualInvestmentNoteTransaction({
      accountAddress: OWNER,
      note,
      settlement,
      livePredictOrderIds: new Set(['22']),
      config,
    });

    expect(plan.calls.filter((call) => call.endsWith('::expiry_market::redeem_settled_permissionless'))).toHaveLength(1);
  });

  it('rejects notes whose order ids no longer align with their legs', () => {
    const note = { ...noteFixture(), orderIds: [11n] };
    expect(() =>
      buildClaimDualInvestmentNoteTransaction({
        accountAddress: OWNER,
        note,
        settlement: settlementForProductNote(note, 63_500),
        config,
      }),
    ).toThrow('one order id per leg');
  });
});

describe('buildClaimDualInvestmentNotesTransaction', () => {
  it('claims several notes in one transaction, repeating the per-note sequence and summing the amounts', () => {
    const first = noteFixture();
    const second = { ...noteFixture(), noteId: `0x${'d'.repeat(64)}`, orderIds: [33n, 44n] };
    const settlement = settlementForProductNote(first, 63_500);
    const plan = buildClaimDualInvestmentNotesTransaction({
      accountAddress: OWNER,
      claims: [
        { note: first, settlement },
        { note: second, settlement: settlementForProductNote(second, 63_500) },
      ],
      config,
    });

    // Twice the single-note plan: amounts add up, and the per-note call
    // sequence repeats unchanged inside the one transaction.
    expect(plan.payoutAmount).toBe(9_920_000n);
    expect(plan.feeAmount).toBe(4_000n);
    expect(plan.netPayoutAmount).toBe(9_916_000n);
    const singleCalls = buildClaimDualInvestmentNoteTransaction({
      accountAddress: OWNER,
      note: first,
      settlement,
      config,
    }).calls;
    expect(plan.calls).toEqual([...singleCalls, ...singleCalls]);
  });

  it('applies each note its own sweep-skip set', () => {
    const first = noteFixture();
    const second = { ...noteFixture(), noteId: `0x${'d'.repeat(64)}`, orderIds: [33n, 44n] };
    const plan = buildClaimDualInvestmentNotesTransaction({
      accountAddress: OWNER,
      claims: [
        { note: first, settlement: settlementForProductNote(first, 63_500), livePredictOrderIds: new Set<string>() },
        { note: second, settlement: settlementForProductNote(second, 63_500), livePredictOrderIds: new Set(['33', '44']) },
      ],
      config,
    });

    // First note: fully swept, no redeems. Second note: both legs still live.
    expect(plan.calls.filter((call) => call.endsWith('::expiry_market::redeem_settled_permissionless'))).toHaveLength(2);
  });

  it('rejects an empty claim list', () => {
    expect(() =>
      buildClaimDualInvestmentNotesTransaction({ accountAddress: OWNER, claims: [], config }),
    ).toThrow('At least one product note');
  });
});
