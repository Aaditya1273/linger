import type { QuoteProvider } from '../deepbook/quoteProvider';
import {
  DEFAULT_QUOTE_ENVELOPE_SLIPPAGE_BPS,
  DEFAULT_QUOTE_ENVELOPE_TTL_MS,
  assertQuoteEnvelope,
  createQuoteEnvelope,
  type QuoteEnvelope,
} from '../products/quoteEnvelope';
import { buildDualInvestmentLegIntents, compileDualInvestment } from '../products/dualInvestment';
import type { DualInvestmentInput, StructuredProductQuote } from '../products/types';
import type { AnkerProductNoteRecord } from '../sui/ankerPortfolio';
import {
  buildSubscribeDualInvestmentTransaction,
  DEFAULT_ANKER_CONFIG,
  type AnkerProtocolConfig,
  type MintLegSlippage,
  type SubscribeDualInvestmentTransactionPlan,
} from '../sui/ankerTransactions';
import {
  mintSlippageFromSimulatedLegs,
  preflightTransaction,
  type SimulatedMintLeg,
} from '../sui/transactionPreflight';

export const SUBSCRIBE_QUOTE_TTL_MS = DEFAULT_QUOTE_ENVELOPE_TTL_MS;
export const SUBSCRIBE_QUOTE_SLIPPAGE_BPS = DEFAULT_QUOTE_ENVELOPE_SLIPPAGE_BPS;

/** Custody handle for the wallet's AccountWrapper (one per owner under AccountRegistry). */
export interface CustodyAccountRef {
  managerId: string;
  owner?: string;
}

export interface SubscribeDualInvestmentApplicationPlan {
  managerId: string;
  quoteEnvelope: QuoteEnvelope;
  transactionPlan: SubscribeDualInvestmentTransactionPlan;
}

export interface PreparedSubscribeDualInvestment {
  managerId: string;
  quoteEnvelope: QuoteEnvelope;
  quote: StructuredProductQuote;
  transactionPlan: SubscribeDualInvestmentTransactionPlan;
  simulatedMintLegs: SimulatedMintLeg[];
  simulatedTotalCostBaseUnits: bigint;
}

/**
 * Select the wallet's AccountWrapper. 6-24 custody is one wrapper per owner — notes may
 * share it. `notes` is accepted for call-site compatibility but no longer gates selection.
 */
export function selectUnallocatedPredictManager(
  managers: readonly CustodyAccountRef[] | undefined,
  _notes: readonly Pick<AnkerProductNoteRecord, 'wrapperId'>[] | undefined,
  ownerAddress?: string,
) {
  if (!managers?.length) return undefined;

  if (!ownerAddress) {
    return managers[0];
  }

  return managers.find(
    (manager) => Boolean(manager.owner) && manager.owner?.toLowerCase() === ownerAddress.toLowerCase(),
  );
}

export function createSubscribeQuoteEnvelope(quote: StructuredProductQuote, config: AnkerProtocolConfig = DEFAULT_ANKER_CONFIG) {
  return createQuoteEnvelope({
    quote,
    network: config.network ?? 'testnet',
    quoteAssetDecimals: config.quoteAssetDecimals,
    ttlMs: SUBSCRIBE_QUOTE_TTL_MS,
    slippageBps: SUBSCRIBE_QUOTE_SLIPPAGE_BPS,
  });
}

export async function refreshDualInvestmentQuoteForSigning(input: {
  productInput: DualInvestmentInput;
  quote: StructuredProductQuote;
  quoteEnvelope: QuoteEnvelope;
  quoteProvider: QuoteProvider;
  config?: AnkerProtocolConfig;
  nowMs?: number;
}) {
  const config = input.config ?? DEFAULT_ANKER_CONFIG;
  const legIntents = buildDualInvestmentLegIntents(input.productInput, input.quote.oracle, { nowMs: input.nowMs });
  const quotedLegs = await input.quoteProvider.quoteLegs(legIntents);
  const refreshedQuote = compileDualInvestment({
    input: input.productInput,
    oracle: input.quote.oracle,
    quotedLegs,
    nowMs: input.nowMs,
  });
  if (!refreshedQuote.executable) {
    throw new Error(refreshedQuote.warning ?? 'Refreshed quote is not executable.');
  }

  assertQuoteEnvelope({
    quote: refreshedQuote,
    envelope: input.quoteEnvelope,
    network: config.network ?? 'testnet',
    quoteAssetDecimals: config.quoteAssetDecimals,
    nowMs: input.nowMs ?? Date.now(),
  });

  return refreshedQuote;
}

export function buildSubscribeDualInvestmentApplicationPlan(input: {
  accountAddress: string;
  managers: readonly CustodyAccountRef[] | undefined;
  notes: readonly Pick<AnkerProductNoteRecord, 'wrapperId'>[] | undefined;
  productInput: DualInvestmentInput;
  quote: StructuredProductQuote;
  quoteEnvelope?: QuoteEnvelope;
  wrapperBalanceBaseUnits?: bigint;
  mintSlippage?: readonly MintLegSlippage[];
  config?: AnkerProtocolConfig;
  nowMs?: number;
}): SubscribeDualInvestmentApplicationPlan {
  const config = input.config ?? DEFAULT_ANKER_CONFIG;
  const manager = selectUnallocatedPredictManager(input.managers, input.notes, input.accountAddress);
  if (!manager) {
    throw new Error('Finish the one-time setup before subscribing.');
  }

  const quoteEnvelope = input.quoteEnvelope ?? createSubscribeQuoteEnvelope(input.quote, config);
  const transactionPlan = buildSubscribeDualInvestmentTransaction({
    accountAddress: input.accountAddress,
    wrapperId: manager.managerId,
    productInput: input.productInput,
    quote: input.quote,
    quoteEnvelope,
    wrapperBalanceBaseUnits: input.wrapperBalanceBaseUnits,
    mintSlippage: input.mintSlippage,
    nowMs: input.nowMs,
    config,
  });

  return {
    managerId: manager.managerId,
    quoteEnvelope,
    transactionPlan,
  };
}

/**
 * D6 layers 2–3: build a provisional (uncapped) PTB, simulate via gRPC, then rebuild
 * with max_cost / max_probability = simulated × mint slippage. Does not open the wallet.
 */
export async function prepareSubscribeDualInvestmentForSigning(input: {
  accountAddress: string;
  managers: readonly CustodyAccountRef[] | undefined;
  notes: readonly Pick<AnkerProductNoteRecord, 'wrapperId'>[] | undefined;
  productInput: DualInvestmentInput;
  quote: StructuredProductQuote;
  quoteEnvelope?: QuoteEnvelope;
  wrapperBalanceBaseUnits?: bigint;
  client: unknown;
  config?: AnkerProtocolConfig;
  nowMs?: number;
}): Promise<PreparedSubscribeDualInvestment> {
  const quoteEnvelope = input.quoteEnvelope ?? createSubscribeQuoteEnvelope(input.quote, input.config);
  const provisional = buildSubscribeDualInvestmentApplicationPlan({
    ...input,
    quoteEnvelope,
    // Omit mintSlippage → uncapped guards for simulation.
  });

  const preflight = await preflightTransaction({
    client: input.client,
    sender: input.accountAddress,
    transaction: provisional.transactionPlan.tx,
  });

  if (preflight.status === 'skipped') {
    throw new Error(
      preflight.reason ||
        'Transaction simulation is required before signing a Turbo subscription.',
    );
  }

  if (preflight.mintLegs.length !== input.quote.legs.length) {
    throw new Error(
      `Simulation returned ${preflight.mintLegs.length} OrderMinted event(s); expected ${input.quote.legs.length}.`,
    );
  }

  const mintSlippage = mintSlippageFromSimulatedLegs(preflight.mintLegs);
  const signed = buildSubscribeDualInvestmentApplicationPlan({
    ...input,
    quoteEnvelope,
    mintSlippage,
  });

  return {
    managerId: signed.managerId,
    quoteEnvelope,
    quote: input.quote,
    transactionPlan: signed.transactionPlan,
    simulatedMintLegs: preflight.mintLegs,
    simulatedTotalCostBaseUnits: preflight.mintLegs.reduce((sum, leg) => sum + leg.allInCost, 0n),
  };
}
