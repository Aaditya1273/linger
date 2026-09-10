import type { PredictMarketState } from '../deepbook/predictMarketState';
import type { AnkerProductNoteRecord } from './ankerPortfolio';

export type ProductNoteLifecycle = 'countdown' | 'awaiting_settle' | 'claimable' | 'claimed';

function sameAddress(left: string, right: string) {
  return left.toLowerCase() === right.toLowerCase();
}

export function lifecycleForProductNote(
  note: Pick<AnkerProductNoteRecord, 'status' | 'oracleId' | 'expiryMs'>,
  marketState: PredictMarketState | undefined,
  nowMs: number,
): ProductNoteLifecycle {
  if (note.status === 'redeemed') return 'claimed';
  if (nowMs < note.expiryMs) return 'countdown';
  if (
    marketState?.settlementPriceBaseUnits !== null &&
    marketState?.settlementPriceBaseUnits !== undefined &&
    sameAddress(marketState.expiryMarketId, note.oracleId)
  ) {
    return 'claimable';
  }
  return 'awaiting_settle';
}
