/**
 * Retired predict-testnet-4-16 deployment (CONTEXT: Legacy Oracle).
 *
 * The 4-16 deployment is dead: its indexer is gone and Block Scholes stopped
 * pushing prices to its oracle objects on 2026-07-12. The app never reads it
 * from chain anymore (ADR-0004) — this id survives only so Snapshot rows can
 * stamp their provenance when the committed 4-16 capture is displayed.
 */
export const LEGACY_PREDICT = {
  predictObjectId: '0xc8736204d12f0a7277c86388a68bf8a194b0a14c5538ad13f22cbd8e2a38028a',
} as const;
