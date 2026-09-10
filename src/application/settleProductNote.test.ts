import { describe, expect, it } from 'vitest';
import type { AnkerProductNoteRecord } from '../sui/ankerPortfolio';
import { buildClaimDualInvestmentNoteTransaction, type AnkerProtocolConfig } from '../sui/ankerTransactions';
import { productNoteFixture } from '../test/productNoteFixture';
import { settlementForProductNote } from './settleProductNote';

const OWNER = `0x${'a'.repeat(64)}`;
const MARKET_ID = `0x${'5'.repeat(64)}`;
const PREDICT_PACKAGE_ID = `0x${'3'.repeat(64)}`;
const ACCOUNT_PACKAGE_ID = `0x${'7'.repeat(64)}`;
const ANKER_PACKAGE_ID = `0x${'1'.repeat(64)}`;

const config: AnkerProtocolConfig = {
  packageId: ANKER_PACKAGE_ID,
  originalPackageId: ANKER_PACKAGE_ID,
  registryId: `0x${'2'.repeat(64)}`,
  predictPackageId: PREDICT_PACKAGE_ID,
  poolVaultId: `0x${'4'.repeat(64)}`,
  accountPackageId: ACCOUNT_PACKAGE_ID,
  accountRegistryId: `0x${'8'.repeat(64)}`,
  accumulatorRoot: `0x${'9'.repeat(64)}`,
  protocolConfigId: `0x${'b'.repeat(64)}`,
  oracleRegistryId: `0x${'c'.repeat(64)}`,
  oracle: {
    pythFeed: `0x${'d'.repeat(64)}`,
    blockScholesValueStore: `0x${'e'.repeat(64)}`,
    blockScholesSviStore: `0x${'0'.repeat(63)}1`,
  },
  quoteAssetType: `${`0x${'6'.repeat(64)}`}::dusdc::DUSDC`,
  quoteAssetDecimals: 6,
};

function noteFixture(): AnkerProductNoteRecord {
  return productNoteFixture({
    noteId: `0x${'c'.repeat(64)}`,
    productId: 'dual-demo',
    owner: OWNER,
    wrapperId: `0x${'b'.repeat(64)}`,
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
    ],
    orderIds: [11n],
  });
}

describe('Dual Investment settlement application', () => {
  it('derives gross payout and fee from the settlement price', () => {
    expect(settlementForProductNote(noteFixture(), 63_500)).toMatchObject({
      grossPayoutBaseUnits: 4_960_000n,
      performanceFeeBaseUnits: 2_000n,
      netPayoutBaseUnits: 4_958_000n,
    });
    expect(settlementForProductNote(noteFixture(), 62_500)).toMatchObject({
      grossPayoutBaseUnits: 4_920_000n,
      performanceFeeBaseUnits: 2_000n,
      netPayoutBaseUnits: 4_918_000n,
    });
  });

  it('builds the one-shot claim plan from the settlement price', () => {
    const note = noteFixture();
    const plan = buildClaimDualInvestmentNoteTransaction({
      accountAddress: OWNER,
      note,
      settlement: settlementForProductNote(note, 63_500),
      config,
    });

    expect(plan.payoutAmount).toBe(4_960_000n);
    expect(plan.calls).toEqual([
      `${PREDICT_PACKAGE_ID}::expiry_market::redeem_settled_permissionless`,
      `${ACCOUNT_PACKAGE_ID}::account::generate_auth`,
      `${ACCOUNT_PACKAGE_ID}::account::withdraw_funds`,
      'splitCoins',
      `${ANKER_PACKAGE_ID}::product_note::record_redeem_with_fee`,
      'transferObjects',
    ]);
  });
});
