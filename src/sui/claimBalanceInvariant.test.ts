import { describe, expect, it } from 'vitest';
import type { AnkerProductNoteRecord } from './ankerPortfolio';
import { applyMintSlippage, buildClaimDualInvestmentNoteTransaction, type AnkerProtocolConfig } from './ankerTransactions';
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
    owner: OWNER,
    wrapperId: WRAPPER_ID,
    oracleId: MARKET_ID,
    expiryMs: 1_000,
  });
}

describe('claim withdraws no more than the account actually holds', () => {
  it('reproduces the account::withdraw_balance MoveAbort (EBalanceTooLow) when a mint fills at its slippage ceiling', () => {
    const note = noteFixture();

    // Worst-case losing settlement: no leg finishes ITM, so the claim can only
    // rely on the reserve + coupon baked into the note at subscribe time.
    const losingPrice = Math.min(...note.legs.map((leg) => leg.strike)) - 1;
    const settlement = settlementForProductNote(note, losingPrice);
    expect(settlement.realizedLegs).toHaveLength(0);

    const plan = buildClaimDualInvestmentNoteTransaction({
      accountAddress: OWNER,
      note,
      settlement,
      config,
    });

    // What `subscribeTransactions.ts` actually deposits into the AccountWrapper's
    // stored balance at subscribe time is `principal`. What it withdraws per leg
    // during `mint_exact_quantity` is bounded above by `maxCost` — the simulated
    // cost inflated by MINT_SLIPPAGE_BPS (~1.5%) — not by the quoted `leg.cost`
    // baked into the note. A normal, in-tolerance fill can legitimately land at
    // that ceiling.
    const totalLegCostBaseUnits = note.legs.reduce((sum, leg) => sum + leg.costBaseUnits, 0n);
    const worstCaseMintCostBaseUnits = note.legs.reduce(
      (sum, leg) => sum + applyMintSlippage(leg.costBaseUnits),
      0n,
    );
    expect(worstCaseMintCostBaseUnits).toBeGreaterThan(totalLegCostBaseUnits);

    const actualStoredBalanceBaseUnits = note.principalBaseUnits - worstCaseMintCostBaseUnits;

    // dualInvestment.ts computes `coupon = principal - reserve - totalLegCost` with
    // no slippage margin, so reserve+coupon == principal - totalLegCost exactly.
    // Claim unconditionally asks to withdraw that full amount (plus any realized
    // leg payout), regardless of what actually landed in the account.
    expect(plan.payoutAmount).toBe(note.reserveBaseUnits + note.couponBaseUnits);

    // This is the account::withdraw_balance assertion (`bal.value() >= amount`,
    // abort code 1 / EBalanceTooLow) reproduced off-chain: it fails whenever the
    // mint filled anywhere above the exact quoted cost, which the 150bps
    // tolerance explicitly allows.
    expect(actualStoredBalanceBaseUnits).toBeLessThan(plan.payoutAmount);
  });
});
