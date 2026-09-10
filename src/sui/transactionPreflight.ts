import type { Transaction } from '@mysten/sui/transactions';
import {
  applyMintSlippage,
  MINT_SLIPPAGE_BPS,
} from './ankerTransactionPrimitives';
import type { MintLegSlippage } from './subscribeTransactions';

export type PreflightEngine = 'simulateTransaction' | 'devInspectTransactionBlock';

export interface SimulatedMintLeg {
  allInCost: bigint;
  entryProbability: bigint;
}

export type TransactionPreflightResult =
  | {
      status: 'success';
      engine: PreflightEngine;
      mintLegs: SimulatedMintLeg[];
    }
  | { status: 'skipped'; reason: string; mintLegs: [] };

interface TransactionPreflightInput {
  client: unknown;
  sender: string;
  transaction: Transaction;
}

interface SimulateClient {
  simulateTransaction: (input: {
    transaction: Transaction;
    checksEnabled: true;
    include: { effects: true; events: true };
  }) => Promise<unknown>;
}

interface DevInspectClient {
  devInspectTransactionBlock: (input: {
    sender: string;
    transactionBlock: Transaction;
  }) => Promise<unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function messageFromError(error: unknown): string | null {
  if (!isRecord(error)) return null;
  if (typeof error.message === 'string') return error.message;
  if (typeof error.description === 'string') return error.description;
  return null;
}

function statusError(status: unknown): string | null {
  if (!isRecord(status)) return null;

  if (status.success === false) {
    return messageFromError(status.error) ?? 'Transaction simulation failed.';
  }

  if (status.status === 'failure') {
    const error = status.error;
    if (typeof error === 'string') return error;
    return messageFromError(error) ?? 'Transaction simulation failed.';
  }

  return null;
}

function simulatedTransactionError(result: unknown): string | null {
  if (!isRecord(result)) return null;

  if (result.$kind === 'FailedTransaction') {
    const failed = isRecord(result.FailedTransaction) ? result.FailedTransaction : null;
    return statusError(failed?.status) ?? 'Transaction simulation failed.';
  }

  if (result.$kind === 'Transaction') {
    const transaction = isRecord(result.Transaction) ? result.Transaction : null;
    return statusError(transaction?.status);
  }

  const effects = isRecord(result.effects) ? result.effects : null;
  return statusError(effects?.status);
}

/**
 * Predict `pricing` module aborts surface as
 * `... '0x…::pricing::live_inputs' …, abort code: N` — no "oracle"/"stale"
 * keywords, so match module + code. 4 = EBlockScholesPriceStale,
 * 10 = EBlockScholesSVIStale, 9 = ELivePricingExpired (6-24 constants).
 */
function pricingAbortCode(raw: string): number | null {
  if (!/::pricing::/i.test(raw)) return null;
  const match = raw.match(/abort code:?\s*(\d+)/i);
  return match ? Number(match[1]) : null;
}

/** Map raw Move abort / simulation failures to user-facing copy. */
export function readablePreflightError(raw: string): string {
  const lower = raw.toLowerCase();
  const pricingAbort = pricingAbortCode(raw);
  if (pricingAbort === 4 || pricingAbort === 10) {
    return 'Upstream price feed is paused or stale — new subscriptions are temporarily unavailable.';
  }
  if (pricingAbort === 9) {
    return 'This market is too close to expiry to price. Pick a later expiry.';
  }
  if (
    lower.includes('insufficient') ||
    lower.includes('ebalance') ||
    lower.includes('not_enough') ||
    lower.includes('einsufficient')
  ) {
    return 'Insufficient DUSDC in your AccountWrapper (or wallet top-up) for this subscription.';
  }
  if (lower.includes('oracle') || lower.includes('stale') || lower.includes('fresh')) {
    return 'Oracle feed is stale or unavailable. Wait a moment and try again.';
  }
  if (lower.includes('mint_paused') || lower.includes('emintpaused') || lower.includes('mint paused')) {
    return 'Minting is paused on this expiry market.';
  }
  if (
    lower.includes('trading_paused') ||
    lower.includes('etradingpaused') ||
    lower.includes('trading paused')
  ) {
    return 'Trading is paused on Predict. Try again later.';
  }
  if (lower.includes('emintcostabovemax') || lower.includes('cost above max')) {
    return 'On-chain mint cost exceeded the slippage cap. Refresh the quote and try again.';
  }
  if (lower.includes('emintprobabilityabovemax') || lower.includes('probability above max')) {
    return 'On-chain entry probability exceeded the slippage cap. Refresh the quote and try again.';
  }
  return raw.startsWith('Preflight failed:') ? raw : `Preflight failed: ${raw}`;
}

function assertPreflightSuccess(result: unknown) {
  const error = simulatedTransactionError(result);
  if (error) {
    throw new Error(readablePreflightError(error.startsWith('Preflight failed:') ? error.slice('Preflight failed: '.length) : error));
  }
}

function u64Bigint(value: unknown): bigint | null {
  if (typeof value === 'bigint') return value >= 0n ? value : null;
  if (typeof value === 'number') return Number.isSafeInteger(value) && value >= 0 ? BigInt(value) : null;
  if (typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value)) return BigInt(value);
  return null;
}

function eventContents(event: unknown): Record<string, unknown> | null {
  if (!isRecord(event)) return null;
  if (isRecord(event.contents)) return event.contents;
  if (isRecord(event.parsedJson)) return event.parsedJson;
  if (isRecord(event.json)) return event.json;
  return null;
}

function eventType(event: unknown): string {
  if (!isRecord(event)) return '';
  if (typeof event.eventType === 'string') return event.eventType;
  if (typeof event.type === 'string') return event.type;
  if (typeof event.name === 'string') return event.name;
  return '';
}

function collectEvents(result: unknown): unknown[] {
  if (!isRecord(result)) return [];
  const container =
    (result.$kind === 'Transaction' && isRecord(result.Transaction) ? result.Transaction : null) ??
    (result.$kind === 'FailedTransaction' && isRecord(result.FailedTransaction)
      ? result.FailedTransaction
      : null) ??
    result;
  if (!isRecord(container)) return [];
  if (Array.isArray(container.events)) return container.events;
  return [];
}

/**
 * Parse OrderMinted events from a successful simulateTransaction result.
 * all-in cost = net_premium + (trading_fee - fee_incentive_subsidy) + builder_fee + penalty_fee
 */
export function parseOrderMintedLegs(result: unknown): SimulatedMintLeg[] {
  const legs: SimulatedMintLeg[] = [];

  for (const event of collectEvents(result)) {
    const type = eventType(event);
    if (!type.includes('OrderMinted')) continue;
    const contents = eventContents(event);
    if (!contents) continue;

    const netPremium = u64Bigint(contents.net_premium);
    const tradingFee = u64Bigint(contents.trading_fee) ?? 0n;
    const subsidy = u64Bigint(contents.fee_incentive_subsidy) ?? 0n;
    const builderFee = u64Bigint(contents.builder_fee) ?? 0n;
    const penaltyFee = u64Bigint(contents.penalty_fee) ?? 0n;
    const entryProbability = u64Bigint(contents.entry_probability);
    if (netPremium === null || entryProbability === null) continue;

    const traderFee = tradingFee > subsidy ? tradingFee - subsidy : 0n;
    legs.push({
      allInCost: netPremium + traderFee + builderFee + penaltyFee,
      entryProbability,
    });
  }

  return legs;
}

export function mintSlippageFromSimulatedLegs(
  legs: readonly SimulatedMintLeg[],
  slippageBps: number = MINT_SLIPPAGE_BPS,
): MintLegSlippage[] {
  return legs.map((leg) => ({
    maxCost: applyMintSlippage(leg.allInCost, slippageBps),
    maxProbability: applyMintSlippage(leg.entryProbability, slippageBps),
  }));
}

function hasSimulator(client: unknown): client is SimulateClient {
  return isRecord(client) && typeof client.simulateTransaction === 'function';
}

function hasDevInspect(client: unknown): client is DevInspectClient {
  return isRecord(client) && typeof client.devInspectTransactionBlock === 'function';
}

function allowsUnsimulatedTransactions() {
  return (
    process.env.DEMO_ALLOW_UNSIMULATED_TX === 'true' ||
    process.env.NEXT_PUBLIC_DEMO_ALLOW_UNSIMULATED_TX === 'true'
  );
}

export async function preflightTransaction({
  client,
  sender,
  transaction,
}: TransactionPreflightInput): Promise<TransactionPreflightResult> {
  if (hasSimulator(client)) {
    const result = await client.simulateTransaction({
      transaction,
      checksEnabled: true,
      include: { effects: true, events: true },
    });
    assertPreflightSuccess(result);
    return {
      status: 'success',
      engine: 'simulateTransaction',
      mintLegs: parseOrderMintedLegs(result),
    };
  }

  if (hasDevInspect(client)) {
    const result = await client.devInspectTransactionBlock({
      sender,
      transactionBlock: transaction,
    });
    assertPreflightSuccess(result);
    return {
      status: 'success',
      engine: 'devInspectTransactionBlock',
      mintLegs: parseOrderMintedLegs(result),
    };
  }

  if (allowsUnsimulatedTransactions()) {
    return {
      status: 'skipped',
      reason: 'Current Sui client does not expose transaction simulation.',
      mintLegs: [],
    };
  }

  throw new Error(
    'Transaction simulation is unavailable. Set DEMO_ALLOW_UNSIMULATED_TX=true only for local demo bypasses.',
  );
}
