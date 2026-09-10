import type { Transaction } from '@mysten/sui/transactions';
import { filterMarketsForTenorGroup, type TenorGroup } from '../products/tenorMarkets';
import { fetchActiveExpiryMarketSummariesOnchain } from './predictOnchain';

export interface ExpiryMarketSummary {
  expiryMarketId: string;
  expiryMs: number;
  tickSize: number;
  admissionTickSize: number;
  maxExpiryAllocation: string;
  initialExpiryCash: string;
  packageId: string;
  poolVaultId: string;
  propbookUnderlyingId: number;
  baseFee: number;
  minFee: number;
  minEntryProbability: number;
  maxEntryProbability: number;
}

export interface PredictAdapter {
  discoverMarkets(input?: { nowMs?: number }): Promise<ExpiryMarketSummary[]>;
  /** D6 layer-1 browse quotes — SVI + fee stack via SviBrowseQuoteProvider / useDualInvestmentScan. */
  quoteLegs?(legs: unknown[]): Promise<unknown[]>;
  /** Mint legs in a PTB — implemented in #5. */
  mintLegs?(input: unknown): Promise<unknown>;
  /** Add one permissionless settled redemption per Note leg. */
  redeemLegs(input: PredictRedeemLegsInput): string[];
  /** List custody positions / notes — implemented in #4/#6. */
  listPositions?(owner: string): Promise<unknown[]>;
}

export interface PredictRedeemLegsInput {
  tx: Transaction;
  expiryMarketId: string;
  wrapperId: string;
  legs: readonly { orderId: bigint; quantityBaseUnits: bigint }[];
  config: {
    predictPackageId: string;
    accountRegistryId: string;
    protocolConfigId: string;
    accumulatorRoot: string;
  };
}


export function createPredictAdapter(input?: {
  fetchMarkets?: () => Promise<ExpiryMarketSummary[]>;
  group?: TenorGroup;
}): PredictAdapter {
  const group = input?.group ?? 'hourly';
  const fetchMarkets = input?.fetchMarkets ?? fetchActiveExpiryMarketSummariesOnchain;

  return {
    async discoverMarkets({ nowMs = Date.now() } = {}) {
      const rows = await fetchMarkets();
      return filterMarketsForTenorGroup(rows, group, { nowMs });
    },
    redeemLegs(redeemInput) {
      const market = redeemInput.tx.object(redeemInput.expiryMarketId);
      const wrapper = redeemInput.tx.object(redeemInput.wrapperId);
      const accountRegistry = redeemInput.tx.object(redeemInput.config.accountRegistryId);
      const protocolConfig = redeemInput.tx.object(redeemInput.config.protocolConfigId);
      const accumulatorRoot = redeemInput.tx.object(redeemInput.config.accumulatorRoot);
      const clock = redeemInput.tx.object.clock();
      const redeemTarget = `${redeemInput.config.predictPackageId}::expiry_market::redeem_settled_permissionless`;

      redeemInput.legs.forEach((leg) => {
        redeemInput.tx.moveCall({
          target: redeemTarget,
          arguments: [
            market,
            accountRegistry,
            wrapper,
            protocolConfig,
            redeemInput.tx.pure.u256(leg.orderId),
            redeemInput.tx.pure.u64(leg.quantityBaseUnits),
            accumulatorRoot,
            clock,
          ],
        });
      });

      return redeemInput.legs.map(() => redeemTarget);
    },
  };
}

/** Unfiltered active-market discovery — callers apply tenor-group filters. */
export async function fetchAllExpiryMarketSummaries(
  fetchMarkets: () => Promise<ExpiryMarketSummary[]> = fetchActiveExpiryMarketSummariesOnchain,
): Promise<ExpiryMarketSummary[]> {
  return fetchMarkets();
}

export const predictAdapter = createPredictAdapter();
