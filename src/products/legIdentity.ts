import type { LegIntent } from './types';

export type LegIdentity = Pick<
  LegIntent,
  'instrumentType' | 'oracleId' | 'expiryMs' | 'strike' | 'lowerStrike' | 'higherStrike' | 'isUp' | 'quantity'
>;

export function legIdentityKey(leg: LegIdentity) {
  return [
    leg.instrumentType,
    leg.oracleId,
    leg.expiryMs,
    leg.strike ?? '',
    leg.lowerStrike ?? '',
    leg.higherStrike ?? '',
    leg.isUp ?? '',
    leg.quantity,
  ].join(':');
}
