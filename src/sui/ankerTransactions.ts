import { Transaction } from '@mysten/sui/transactions';
import { predictAdapter } from '../deepbook/predictAdapter';
import type { SettlementResult } from '../products/settlement';
import type { AnkerProductNoteRecord } from './ankerPortfolio';
import { DEFAULT_ANKER_CONFIG, type AnkerProtocolConfig } from './ankerProtocolConfig';

export {
  MINT_SLIPPAGE_BPS,
  U64_MAX,
  LEVERAGE_1X,
  applyMintSlippage,
  subscribeTopUpBaseUnits,
} from './ankerTransactionPrimitives';

export {
  DEFAULT_ANKER_CONFIG,
  type AnkerProtocolConfig,
  type AnkerProtocolOracleObjects,
} from './ankerProtocolConfig';

export {
  buildSubscribeDualInvestmentTransaction,
  type MintLegSlippage,
  type SubscribeDualInvestmentTransactionPlan,
} from './subscribeTransactions';

export interface ClaimDualInvestmentTransactionPlan {
  tx: Transaction;
  calls: string[];
  feeAmount: bigint;
  payoutAmount: bigint;
  netPayoutAmount: bigint;
}

export interface ClaimDualInvestmentNoteInput {
  note: AnkerProductNoteRecord;
  settlement: SettlementResult;
  /**
   * Order ids (as decimal strings) still open on Predict for this note's
   * market. After settlement a permissionless sweep may redeem legs directly
   * into the account — those legs must be skipped or `redeem_settled` aborts
   * on the missing position. Omit to redeem every leg.
   */
  livePredictOrderIds?: ReadonlySet<string>;
}

/**
 * Appends one note's full claim sequence (redeem legs → withdraw → fee split →
 * record → transfer) onto an existing transaction, so single and batch claims
 * share the exact same per-note move calls.
 */
function appendClaimDualInvestmentNote(
  tx: Transaction,
  input: ClaimDualInvestmentNoteInput & { accountAddress: string; config: AnkerProtocolConfig },
): { calls: string[]; feeAmount: bigint; payoutAmount: bigint } {
  if (input.note.productType !== 'dual-investment') {
    throw new Error('Expected a Dual Investment product note.');
  }
  if (input.note.status !== 'open') {
    throw new Error('Product note is already redeemed.');
  }
  if (input.note.orderIds.length !== input.note.legs.length) {
    throw new Error('Product note must contain one order id per leg.');
  }

  const config = input.config;
  const calls: string[] = [];
  const feeAmount = input.settlement.performanceFeeBaseUnits;
  const payoutAmount = input.settlement.grossPayoutBaseUnits;
  if (feeAmount > payoutAmount) {
    throw new Error('Claim fee cannot exceed payout amount.');
  }

  const wrapper = tx.object(input.note.wrapperId);
  const accumulatorRoot = tx.object(config.accumulatorRoot);
  const clock = tx.object.clock();

  const redeemableLegs = input.note.orderIds
    .map((orderId, index) => ({
      orderId,
      quantityBaseUnits: input.note.legs[index].quantityBaseUnits,
    }))
    .filter((leg) => input.livePredictOrderIds?.has(leg.orderId.toString()) ?? true);

  if (redeemableLegs.length > 0) {
    calls.push(
      ...predictAdapter.redeemLegs({
        tx,
        expiryMarketId: input.note.oracleId,
        wrapperId: input.note.wrapperId,
        legs: redeemableLegs,
        config: {
          predictPackageId: config.predictPackageId,
          accountRegistryId: config.accountRegistryId,
          protocolConfigId: config.protocolConfigId,
          accumulatorRoot: config.accumulatorRoot,
        },
      }),
    );
  }

  const authTarget = `${config.accountPackageId}::account::generate_auth`;
  calls.push(authTarget);
  const auth = tx.moveCall({ target: authTarget, arguments: [] });

  const withdrawTarget = `${config.accountPackageId}::account::withdraw_funds`;
  calls.push(withdrawTarget);
  const [payoutCoin] = tx.moveCall({
    target: withdrawTarget,
    typeArguments: [config.quoteAssetType],
    arguments: [wrapper, auth, tx.pure.u64(payoutAmount), accumulatorRoot, clock],
  });

  calls.push('splitCoins');
  const [feeCoin] = tx.splitCoins(payoutCoin, [tx.pure.u64(feeAmount)]);

  const recordTarget = `${config.packageId}::product_note::record_redeem_with_fee`;
  calls.push(recordTarget);
  tx.moveCall({
    target: recordTarget,
    typeArguments: [config.quoteAssetType],
    arguments: [
      tx.object(config.registryId),
      tx.object(input.note.noteId),
      feeCoin,
      tx.pure.u64(payoutAmount),
    ],
  });

  calls.push('transferObjects');
  tx.transferObjects([payoutCoin], input.accountAddress);

  return { calls, feeAmount, payoutAmount };
}

export function buildClaimDualInvestmentNoteTransaction(
  input: ClaimDualInvestmentNoteInput & {
    accountAddress: string;
    config?: AnkerProtocolConfig;
  },
): ClaimDualInvestmentTransactionPlan {
  return buildClaimDualInvestmentNotesTransaction({
    accountAddress: input.accountAddress,
    claims: [{ note: input.note, settlement: input.settlement, livePredictOrderIds: input.livePredictOrderIds }],
    config: input.config,
  });
}

/**
 * One PTB claiming several settled notes at once — the "Claim all" flow.
 * Per-note sequences are appended in order and share one signature; a note
 * that fails validation or would abort on-chain fails the whole transaction
 * (preflight surfaces this before anything is signed).
 */
export function buildClaimDualInvestmentNotesTransaction(input: {
  accountAddress: string;
  claims: ReadonlyArray<ClaimDualInvestmentNoteInput>;
  config?: AnkerProtocolConfig;
}): ClaimDualInvestmentTransactionPlan {
  if (input.claims.length === 0) {
    throw new Error('At least one product note is required.');
  }

  const config = input.config ?? DEFAULT_ANKER_CONFIG;
  const tx = new Transaction();
  tx.setSender(input.accountAddress);
  const calls: string[] = [];
  let feeAmount = 0n;
  let payoutAmount = 0n;
  for (const claim of input.claims) {
    const appended = appendClaimDualInvestmentNote(tx, { ...claim, accountAddress: input.accountAddress, config });
    calls.push(...appended.calls);
    feeAmount += appended.feeAmount;
    payoutAmount += appended.payoutAmount;
  }

  return { tx, calls, feeAmount, payoutAmount, netPayoutAmount: payoutAmount - feeAmount };
}
