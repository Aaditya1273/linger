import type { OracleMarket } from '../products/types';
import { DEEPBOOK_PREDICT } from '../config/deepbook';

export const lastKnownMarketSnapshot: OracleMarket = {
  predictId: DEEPBOOK_PREDICT.poolVaultId,
  oracleId: '0xb46fdd7aee8b5b729358a254a74ec4eb59c2a07ca8878cc77df09b843bae6c30',
  underlyingAsset: 'BTC',
  expiryMs: Date.now() + 3_600_000,
  minStrike: 1,
  tickSize: 0.01,
  status: 'active',
  spot: 63_960.99160736,
  forward: 63_960.99160736,
  spotTimestampMs: Date.now() - 60_000,
  sviTimestampMs: Date.now() - 60_000,
  serverLagSeconds: 1,
};
