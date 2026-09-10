import {
  calculateSettlement,
  settledLegsFromPrice,
  type DualInvestmentSettlementNote,
  type SettledLeg,
} from '../products/settlement';
import type { AnkerProductNoteRecord } from '../sui/ankerPortfolio';

export function settlementNoteForProductNote(note: AnkerProductNoteRecord): DualInvestmentSettlementNote {
  return {
    principalBaseUnits: note.principalBaseUnits,
    reserveBaseUnits: note.reserveBaseUnits,
    couponBaseUnits: note.couponBaseUnits,
    feeBps: note.feeBps,
    legs: note.legs.map((leg) => ({
      legId: `up-${leg.strike}`,
      strike: leg.strike,
      isUp: true,
      quantityBaseUnits: leg.quantityBaseUnits,
    })),
  };
}

export function settlementEstimateForNote(note: AnkerProductNoteRecord, settledLegs: readonly SettledLeg[] = []) {
  return calculateSettlement(settlementNoteForProductNote(note), settledLegs);
}

export function settlementForProductNote(note: AnkerProductNoteRecord, settlementPrice: number) {
  const settlementNote = settlementNoteForProductNote(note);
  return calculateSettlement(settlementNote, settledLegsFromPrice(settlementNote, settlementPrice));
}

/**
 * Settlement if the market fixes at/above the target: every ladder leg pays.
 * This — not `principal + coupon − fee` — is the number to project for the
 * above branch, so the projection can never drift from the settled payout
 * (pre-lot-identity notes carry ladder dust the shortcut formula misses).
 */
export function settlementIfAboveTarget(note: AnkerProductNoteRecord) {
  const settlementNote = settlementNoteForProductNote(note);
  return calculateSettlement(
    settlementNote,
    settlementNote.legs.map((leg) => ({ legId: leg.legId, payoutBaseUnits: leg.quantityBaseUnits })),
  );
}
