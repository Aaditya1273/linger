'use client';

import { useCurrentAccount, useCurrentClient, useCurrentWallet, useDAppKit } from '@mysten/dapp-kit-react';
import { isEnokiWallet } from '@mysten/enoki';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  settlementEstimateForNote,
  settlementForProductNote,
  settlementIfAboveTarget,
} from '../application/settleProductNote';
import type { PredictMarketState } from '../deepbook/predictMarketState';
import { fetchLivePredictOrderIds } from '../deepbook/predictPositions';
import { copyForLocale, DEFAULT_LOCALE, type Locale } from '../i18n';
import type { SettlementResult } from '../products/settlement';
import { markProductNoteClaimed, type AnkerProductNoteRecord } from '../sui/ankerPortfolio';
import {
  buildClaimDualInvestmentNoteTransaction,
  buildClaimDualInvestmentNotesTransaction,
  type ClaimDualInvestmentNoteInput,
} from '../sui/ankerTransactions';
import { lifecycleForProductNote } from '../sui/productNoteLifecycle';
import { preflightTransaction } from '../sui/transactionPreflight';
import { isSponsorshipEnabled } from '../sui/sponsoredExecution';
import { executeWalletTransaction } from '../sui/transactionExecution';
import { formatBtcAmount, formatCashAmount, shortId, suiExplorerTxUrl } from './PortfolioFormat';
import { Button } from '../ui';
import type { ClaimSuccessSummary } from './ClaimSuccessDialog';

/**
 * Snapshot of a confirmed claim, reported upward so the success dialog can be
 * rendered above the filtered note list: the optimistic claimed-state update
 * moves the note to the "completed" bucket, which unmounts this card (and any
 * local dialog state) when the user is on a filter tab.
 */
export interface ConfirmedClaim {
  note: Pick<AnkerProductNoteRecord, 'principal' | 'targetPrice' | 'coupon'>;
  summary: ClaimSuccessSummary;
}

export function claimActionViewModel({
  note,
  nowMs,
  marketState,
  isPending,
  locale = DEFAULT_LOCALE,
}: {
  note: AnkerProductNoteRecord;
  nowMs: number;
  marketState?: PredictMarketState;
  isPending: boolean;
  locale?: Locale;
}) {
  const copy = copyForLocale(locale);
  const lifecycle = lifecycleForProductNote(note, marketState, nowMs);
  return {
    lifecycle,
    canClaim: lifecycle === 'claimable' && !isPending,
    actionLabel: copy.portfolio.claim.claimPayout,
    status:
      lifecycle === 'claimed'
        ? copy.portfolio.claim.alreadyClaimed
        : lifecycle === 'awaiting_settle'
          ? copy.portfolio.claim.awaitingSettlement
          : lifecycle === 'claimable'
            ? copy.portfolio.claim.readyClaim
            : copy.portfolio.claim.opensAfterSettlement,
  };
}

function settlementEstimateFromResult(settlement: SettlementResult) {
  return {
    grossPayout: Number(settlement.grossPayoutBaseUnits) / 1_000_000,
    feeAmount: Number(settlement.performanceFeeBaseUnits) / 1_000_000,
    netPayout: Number(settlement.netPayoutBaseUnits) / 1_000_000,
  };
}

export function claimEstimateForNote(note: AnkerProductNoteRecord) {
  return settlementEstimateFromResult(settlementEstimateForNote(note));
}

/** What an above-target settle pays for this note — the fork/claim projection. */
export function claimAboveEstimate(note: AnkerProductNoteRecord) {
  return settlementEstimateFromResult(settlementIfAboveTarget(note));
}

function settlementResultForView(note: AnkerProductNoteRecord, marketState?: PredictMarketState): SettlementResult {
  if (note.status === 'redeemed') {
    return {
      grossPayoutBaseUnits: note.redeemedPayoutBaseUnits,
      performanceFeeBaseUnits: note.redeemedFeeBaseUnits,
      netPayoutBaseUnits: note.redeemedPayoutBaseUnits - note.redeemedFeeBaseUnits,
      realizedLegs: [],
    };
  }
  if (marketState?.settlementPrice !== null && marketState?.settlementPrice !== undefined) {
    return settlementForProductNote(note, marketState.settlementPrice);
  }
  return settlementEstimateForNote(note);
}

/**
 * Which side of the target the market fixed on. The settlement price is the
 * authority: a settle just below the target can still pay more than the
 * principal (the ladder rounds payouts up to the next strike boundary, and
 * the coupon is earned either way), so payout size must not decide the
 * direction. The payout fallback only covers keeper-redeemed notes whose
 * market state is unreachable.
 */
function settledBelowTarget(
  note: Pick<AnkerProductNoteRecord, 'targetPrice' | 'principal'>,
  settlementPrice: number | null | undefined,
  netPayout: number,
) {
  if (settlementPrice != null) return settlementPrice < note.targetPrice;
  return netPayout < note.principal;
}

/**
 * What a claimable Position pays out right now — exact once the settlement
 * price is known, the estimate before. Feeds the summary-row payout stat,
 * with the same arithmetic as the expanded claim block.
 */
export function claimRowPayout(note: AnkerProductNoteRecord, marketState?: PredictMarketState) {
  const estimate = settlementEstimateFromResult(settlementResultForView(note, marketState));
  const settledBelow = settledBelowTarget(note, marketState?.settlementPrice, estimate.netPayout);
  return {
    ...estimate,
    settledBelow,
    // Only the deposit converts at the target; the coupon is paid in dUSDC on
    // top, so the BTC figure must never fold the reward in.
    btcAmount: note.targetPrice > 0 ? note.principal / note.targetPrice : 0,
    // Reward is defined as the above-branch payout minus the deposit, so
    // "amount − deposit = reward" reconciles on every card. Ladder
    // reconstruction dust (pre-lot-identity notes) lands in the reward, never
    // in a payout figure that must match the chain.
    rewardAfterFee: (settledBelow ? claimAboveEstimate(note).netPayout : estimate.netPayout) - note.principal,
  };
}

export function ClaimActionView({
  note,
  nowMs,
  marketState,
  isPending,
  digest,
  error,
  locale = DEFAULT_LOCALE,
  onClaim,
  showAction = true,
}: {
  note: AnkerProductNoteRecord;
  nowMs: number;
  marketState?: PredictMarketState;
  isPending: boolean;
  digest?: string | null;
  error?: string | null;
  locale?: Locale;
  onClaim: () => void;
  /** False when the summary row owns the Claim button — the block stays info-only. */
  showAction?: boolean;
}) {
  const copy = copyForLocale(locale);
  const action = claimActionViewModel({ note, nowMs, marketState, isPending, locale });
  const canClaim = action.canClaim;
  const settlement = settlementResultForView(note, marketState);
  const estimate = settlementEstimateFromResult(settlement);
  const claimed = action.lifecycle === 'claimed';
  const outcomeKnown = claimed || action.lifecycle === 'claimable';
  // Until settlement fixes the direction, show both sides of the product:
  // full dUSDC if BTC holds above target, or that value in BTC at the target if
  // it converts. The dUSDC side comes from the settlement engine so the
  // projection equals the eventual settled payout to the base unit.
  const projectedDusdc = claimAboveEstimate(note).netPayout;
  const settledBelow =
    outcomeKnown && settledBelowTarget(note, marketState?.settlementPrice, estimate.netPayout);
  const mode = settledBelow ? 'btc' : outcomeKnown ? 'dusdc' : 'projected';
  const dusdcAmount = outcomeKnown ? estimate.netPayout : projectedDusdc;
  const amountLabel = claimed
    ? copy.portfolio.claim.youReceived
    : canClaim
      ? copy.portfolio.claim.youllReceive
      : copy.portfolio.claim.projectedPayout;
  const feeText = copy.portfolio.claim.fee(formatCashAmount(estimate.feeAmount, locale));
  // The deposit alone converts at the target price; the coupon reward stays dUSDC.
  const btcAmount = note.targetPrice > 0 ? note.principal / note.targetPrice : 0;
  const rewardAfterFee = note.coupon - estimate.feeAmount;
  const statusText = action.status;
  const showStatus = action.lifecycle === 'awaiting_settle';

  return (
    <div className="di-claim">
      <div className="di-claim-info">
        {showStatus ? <span className="di-claim-status">{statusText}</span> : null}
        <span className="di-claim-label">{amountLabel}</span>
        {mode === 'btc' ? (
          <>
            <strong className="di-claim-amount">
              ~{formatBtcAmount(btcAmount, locale)} BTC + {formatCashAmount(rewardAfterFee, locale)} dUSDC
            </strong>
            <small className="di-claim-fee">
              {copy.portfolio.claim.onTestnetAfterFee(formatCashAmount(estimate.netPayout, locale), feeText)}
            </small>
          </>
        ) : mode === 'projected' ? (
          <>
            <strong className="di-claim-amount">~{formatCashAmount(dusdcAmount, locale)} dUSDC</strong>
            <small className="di-claim-fee">
              {copy.portfolio.claim.orBtcPlusReward(
                formatBtcAmount(btcAmount, locale),
                formatCashAmount(rewardAfterFee, locale),
              )}
            </small>
          </>
        ) : (
          <>
            <strong className="di-claim-amount">{formatCashAmount(dusdcAmount, locale)} dUSDC</strong>
            <small className="di-claim-fee">{copy.portfolio.claim.afterFee(feeText)}</small>
          </>
        )}
      </div>
      {showAction ? (
        <Button variant="primary" className="di-claim-button" disabled={!canClaim} onClick={onClaim}>
          {isPending ? copy.portfolio.claim.submitting : action.actionLabel}
        </Button>
      ) : null}
      {digest ? (
        <p className="execution-message">
          {copy.portfolio.claim.submitted} —{' '}
          <a className="di-proof-link" href={suiExplorerTxUrl(digest)} target="_blank" rel="noreferrer">
            {shortId(digest)}
          </a>
        </p>
      ) : null}
      {error ? <p className="execution-error">{error}</p> : null}
    </div>
  );
}

/**
 * The claim transaction flow behind every Claim button (summary row or claim
 * block): preflight, sponsored-or-wallet execution, optimistic claimed-state
 * update, and chain resync on failure.
 */
export function useClaimNote({
  note,
  marketState,
  onClaimSuccess,
  locale = DEFAULT_LOCALE,
}: {
  note: AnkerProductNoteRecord;
  marketState?: PredictMarketState;
  onClaimSuccess: (claim: ConfirmedClaim) => void;
  locale?: Locale;
}) {
  const copy = copyForLocale(locale);
  const account = useCurrentAccount();
  const client = useCurrentClient();
  const currentWallet = useCurrentWallet();
  const dAppKit = useDAppKit();
  const queryClient = useQueryClient();
  const [isPending, setIsPending] = useState(false);
  const [digest, setDigest] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleClaim() {
    if (!account || note.productType !== 'dual-investment') return;
    const lifecycle = lifecycleForProductNote(note, marketState, Date.now());
    if (lifecycle !== 'claimable' || marketState?.settlementPrice == null) return;

    setIsPending(true);
    setDigest(null);
    setError(null);
    try {
      const settlement = settlementForProductNote(note, marketState.settlementPrice);
      // The settlement sweep may have already redeemed the legs into the
      // account; redeeming a missing position aborts on-chain. When the
      // position table is unreadable, fall back to redeeming everything —
      // preflight still guards the transaction.
      const livePredictOrderIds = await fetchLivePredictOrderIds(client, {
        wrapperId: note.wrapperId,
        expiryMarketId: note.oracleId,
      }).catch(() => undefined);
      const plan = buildClaimDualInvestmentNoteTransaction({
        accountAddress: account.address,
        note,
        settlement,
        livePredictOrderIds,
      });
      await preflightTransaction({ client, sender: account.address, transaction: plan.tx });
      const sponsored = Boolean(currentWallet && isEnokiWallet(currentWallet)) && (await isSponsorshipEnabled());
      const nextDigest = await executeWalletTransaction({
        wallet: dAppKit,
        client,
        transaction: plan.tx,
        sender: account.address,
        sponsored,
      });
      setDigest(nextDigest);
      onClaimSuccess({
        note: { principal: note.principal, targetPrice: note.targetPrice, coupon: note.coupon },
        summary: {
          digest: nextDigest,
          ...settlementEstimateFromResult(settlement),
          settlementPrice: marketState.settlementPrice,
        },
      });

      queryClient.setQueriesData<AnkerProductNoteRecord[]>(
        { queryKey: ['anker-portfolio', account.address] },
        (notes) => (notes ? markProductNoteClaimed(notes, note.noteId, settlement) : notes),
      );

      await client.waitForTransaction({ digest: nextDigest });
      await queryClient.invalidateQueries({ queryKey: ['anker-portfolio', account.address] });
    } catch (nextError) {
      // Wallets can reject after broadcasting (parse failures, timeouts), so the
      // chain is the only authority on whether the claim landed — resync from it.
      await queryClient
        .invalidateQueries({ queryKey: ['anker-portfolio', account.address] })
        .catch(() => undefined);
      setError(nextError instanceof Error ? nextError.message : copy.portfolio.claim.transactionFailed);
    } finally {
      setIsPending(false);
    }
  }

  return {
    isPending,
    digest,
    error,
    claim: () => {
      void handleClaim();
    },
  };
}

/** The notes a batch claim would cover right now: claimable, with a fixed settlement price. */
function claimAllTargets(
  notes: readonly AnkerProductNoteRecord[],
  marketStateFor: (note: AnkerProductNoteRecord) => PredictMarketState | undefined,
  nowMs: number,
): Array<{ note: AnkerProductNoteRecord; settlementPrice: number }> {
  const targets: Array<{ note: AnkerProductNoteRecord; settlementPrice: number }> = [];
  for (const note of notes) {
    if (note.productType !== 'dual-investment') continue;
    const marketState = marketStateFor(note);
    if (marketState?.settlementPrice == null) continue;
    if (lifecycleForProductNote(note, marketState, nowMs) !== 'claimable') continue;
    targets.push({ note, settlementPrice: marketState.settlementPrice });
  }
  return targets;
}

/**
 * The "Claim all" flow: every claimable Position in one transaction, so a
 * page of settled notes never costs one signature each. Mirrors useClaimNote
 * end to end — preflight, sponsored-or-wallet execution, optimistic
 * claimed-state update per note, chain resync on failure. No per-note success
 * dialog: the submitted message plus the notes moving to Completed is the
 * confirmation.
 */
export function useClaimAllNotes({
  notes,
  marketStateFor,
  locale = DEFAULT_LOCALE,
}: {
  notes: readonly AnkerProductNoteRecord[];
  marketStateFor: (note: AnkerProductNoteRecord) => PredictMarketState | undefined;
  locale?: Locale;
}) {
  const copy = copyForLocale(locale);
  const account = useCurrentAccount();
  const client = useCurrentClient();
  const currentWallet = useCurrentWallet();
  const dAppKit = useDAppKit();
  const queryClient = useQueryClient();
  const [isPending, setIsPending] = useState(false);
  const [digest, setDigest] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const claimableCount = claimAllTargets(notes, marketStateFor, Date.now()).length;

  async function handleClaimAll() {
    if (!account) return;
    const targets = claimAllTargets(notes, marketStateFor, Date.now());
    if (targets.length === 0) return;

    setIsPending(true);
    setDigest(null);
    setError(null);
    try {
      // One live-position lookup per market — sibling notes share markets, and
      // the sweep-skip rule is per market, not per note.
      const liveIdsByMarket = new Map<string, ReadonlySet<string> | undefined>();
      for (const { note } of targets) {
        const marketKey = `${note.wrapperId}:${note.oracleId}`.toLowerCase();
        if (liveIdsByMarket.has(marketKey)) continue;
        liveIdsByMarket.set(
          marketKey,
          await fetchLivePredictOrderIds(client, {
            wrapperId: note.wrapperId,
            expiryMarketId: note.oracleId,
          }).catch(() => undefined),
        );
      }
      const claims: ClaimDualInvestmentNoteInput[] = targets.map(({ note, settlementPrice }) => ({
        note,
        settlement: settlementForProductNote(note, settlementPrice),
        livePredictOrderIds: liveIdsByMarket.get(`${note.wrapperId}:${note.oracleId}`.toLowerCase()),
      }));
      const plan = buildClaimDualInvestmentNotesTransaction({ accountAddress: account.address, claims });
      await preflightTransaction({ client, sender: account.address, transaction: plan.tx });
      const sponsored = Boolean(currentWallet && isEnokiWallet(currentWallet)) && (await isSponsorshipEnabled());
      const nextDigest = await executeWalletTransaction({
        wallet: dAppKit,
        client,
        transaction: plan.tx,
        sender: account.address,
        sponsored,
      });
      setDigest(nextDigest);

      queryClient.setQueriesData<AnkerProductNoteRecord[]>(
        { queryKey: ['anker-portfolio', account.address] },
        (records) =>
          records
            ? claims.reduce(
                (next, claim) => markProductNoteClaimed(next, claim.note.noteId, claim.settlement),
                records as AnkerProductNoteRecord[],
              )
            : records,
      );

      await client.waitForTransaction({ digest: nextDigest });
      await queryClient.invalidateQueries({ queryKey: ['anker-portfolio', account.address] });
    } catch (nextError) {
      // Same authority rule as the single claim: only the chain knows whether
      // the batch landed — resync before surfacing the error.
      await queryClient
        .invalidateQueries({ queryKey: ['anker-portfolio', account.address] })
        .catch(() => undefined);
      setError(nextError instanceof Error ? nextError.message : copy.portfolio.claim.transactionFailed);
    } finally {
      setIsPending(false);
    }
  }

  return {
    isPending,
    digest,
    error,
    claimableCount,
    claimAll: () => {
      void handleClaimAll();
    },
  };
}
