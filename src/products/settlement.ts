export interface DualInvestmentSettlementLeg {
  legId: string;
  strike: number;
  isUp: boolean;
  quantityBaseUnits: bigint;
}

export interface DualInvestmentSettlementNote {
  principalBaseUnits: bigint;
  reserveBaseUnits: bigint;
  couponBaseUnits: bigint;
  feeBps: number;
  legs: readonly DualInvestmentSettlementLeg[];
}

export interface SettledLeg {
  legId: string;
  payoutBaseUnits: bigint;
}

export interface RealizedLeg extends SettledLeg {
  strike: number;
  isUp: boolean;
}

export interface SettlementResult {
  grossPayoutBaseUnits: bigint;
  performanceFeeBaseUnits: bigint;
  netPayoutBaseUnits: bigint;
  realizedLegs: readonly RealizedLeg[];
}

const BPS_DENOMINATOR = 10_000n;

function feeBpsValue(note: DualInvestmentSettlementNote) {
  if (!Number.isFinite(note.feeBps) || note.feeBps < 0) {
    throw new Error('Settlement fee bps must be a non-negative finite number.');
  }
  if (!Number.isInteger(note.feeBps)) {
    throw new Error('Settlement fee bps must be an integer.');
  }
  return BigInt(note.feeBps);
}

function couponFeeBaseUnits(note: DualInvestmentSettlementNote) {
  return (note.couponBaseUnits * feeBpsValue(note)) / BPS_DENOMINATOR;
}

export function settledLegsFromPrice(
  note: DualInvestmentSettlementNote,
  settlementPrice: number,
): SettledLeg[] {
  return note.legs.flatMap((leg) => {
    const realized = leg.isUp ? settlementPrice > leg.strike : settlementPrice <= leg.strike;
    return realized ? [{ legId: leg.legId, payoutBaseUnits: leg.quantityBaseUnits }] : [];
  });
}

export function calculateSettlement(
  note: DualInvestmentSettlementNote,
  settledLegs: readonly SettledLeg[],
): SettlementResult {
  const noteLegsById = new Map(note.legs.map((leg) => [leg.legId, leg]));
  const realizedLegs = settledLegs.flatMap((settledLeg): RealizedLeg[] => {
    if (settledLeg.payoutBaseUnits <= 0n) return [];
    const noteLeg = noteLegsById.get(settledLeg.legId);
    if (!noteLeg) return [];
    return [
      {
        ...settledLeg,
        strike: noteLeg.strike,
        isUp: noteLeg.isUp,
      },
    ];
  });

  const realizedLegPayout = realizedLegs.reduce((sum, leg) => sum + leg.payoutBaseUnits, 0n);
  const grossPayoutBaseUnits = note.reserveBaseUnits + note.couponBaseUnits + realizedLegPayout;
  const performanceFeeBaseUnits = couponFeeBaseUnits(note);
  return {
    grossPayoutBaseUnits,
    performanceFeeBaseUnits,
    netPayoutBaseUnits: grossPayoutBaseUnits - performanceFeeBaseUnits,
    realizedLegs,
  };
}

export function calculateSettlementFromGrossPayout(
  note: DualInvestmentSettlementNote,
  grossPayoutBaseUnits: bigint,
): SettlementResult {
  const performanceFeeBaseUnits = couponFeeBaseUnits(note);
  return {
    grossPayoutBaseUnits,
    performanceFeeBaseUnits,
    netPayoutBaseUnits: grossPayoutBaseUnits - performanceFeeBaseUnits,
    realizedLegs: [],
  };
}
