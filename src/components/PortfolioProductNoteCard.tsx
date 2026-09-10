'use client';

import { ArrowDown, Check, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useIsMobile } from '../hooks/useIsMobile';
import type { PredictMarketState } from '../deepbook/predictMarketState';
import { copyForLocale, DEFAULT_LOCALE, formatTimeToExpiry, type Locale } from '../i18n';
import { netAprAfterCouponFee } from '../products/feePolicy';
import type { AnkerProductNoteRecord } from '../sui/ankerPortfolio';
import type { ProductNoteEventIndexEntry } from '../sui/productNoteEvents';
import { lifecycleForProductNote, type ProductNoteLifecycle } from '../sui/productNoteLifecycle';
import { subscriptionDigestForQuote } from '../sui/subscriptionDigestStore';
import {
  ClaimActionView,
  claimAboveEstimate,
  claimEstimateForNote,
  claimRowPayout,
  useClaimNote,
  type ConfirmedClaim,
} from './PortfolioClaimAction';
import {
  formatApr,
  formatBtcAmount,
  formatBtcAmountCompact,
  formatExpiry,
  formatCashAmount,
  formatPrice,
  formatQuoteBaseUnits,
  shortId,
  suiExplorerObjectUrl,
  suiExplorerTxUrl,
} from './PortfolioFormat';
import { Badge, Button, Card, Dialog, type Tone } from '../ui';

function ProofLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a className="di-proof-link" href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

export function noteStatusBadge(
  note: Pick<AnkerProductNoteRecord, 'status'>,
  lifecycle: ProductNoteLifecycle,
  locale: Locale = DEFAULT_LOCALE,
): { label: string; tone: Tone } {
  const copy = copyForLocale(locale);
  if (note.status === 'redeemed' || lifecycle === 'claimed')
    return { label: copy.portfolio.status.completed, tone: 'neutral' };
  if (lifecycle === 'claimable')
    return { label: copy.portfolio.status.readyToClaim, tone: 'positive' };
  if (lifecycle === 'awaiting_settle') return { label: copy.portfolio.status.settling, tone: 'positive' };
  return { label: copy.portfolio.status.active, tone: 'warning' };
}

function useSubscriptionDigest(owner: string, quoteHash: string) {
  const [digest, setDigest] = useState<string | null>(null);
  useEffect(() => {
    setDigest(subscriptionDigestForQuote({ owner, quoteHash }));
  }, [owner, quoteHash]);
  return digest;
}

/** Proof-footer link for the subscription transaction; renders nothing until a digest is known. */
export function SubscriptionDigestValue({
  owner,
  quoteHash,
  eventDigest,
  label,
}: {
  owner: string;
  quoteHash: string;
  eventDigest?: string;
  label?: string;
}) {
  const localDigest = useSubscriptionDigest(owner, quoteHash);
  const digest = eventDigest || localDigest;
  if (!digest) return null;
  return (
    <ProofLink href={suiExplorerTxUrl(digest)}>
      {label ? (
        <>
          {label}
          <ExternalLink size={12} aria-hidden="true" />
        </>
      ) : (
        <span>{shortId(digest)}</span>
      )}
    </ProofLink>
  );
}

export function depositedCashText(
  note: Pick<AnkerProductNoteRecord, 'principalBaseUnits'>,
  entry?: ProductNoteEventIndexEntry,
) {
  return formatQuoteBaseUnits(entry?.principalBaseUnits ?? note.principalBaseUnits);
}

/**
 * The two-branch outcome panel. Settlement only decides the deposit's form —
 * dUSDC back, or BTC bought at the target — while the coupon reward is earned
 * either way, so the below branch lists the reward as its own dUSDC line
 * instead of folding it into the BTC figure (which is deposit ÷ target,
 * exactly what the claim delivers). The skeleton is identical across the
 * lifecycle: settlement lights up the branch that happened and dims the other.
 */
function OutcomeFork({
  note,
  marketState,
  lifecycle,
  locale,
}: {
  note: AnkerProductNoteRecord;
  marketState?: PredictMarketState;
  lifecycle: ProductNoteLifecycle;
  locale: Locale;
}) {
  const copy = copyForLocale(locale);
  const cardCopy = copy.portfolio.card;
  const outcomeKnown = lifecycle === 'claimable' || lifecycle === 'claimed';
  const actual = outcomeKnown ? claimRowPayout(note, marketState) : null;
  const aboveWon = actual ? !actual.settledBelow : false;
  const belowWon = actual ? actual.settledBelow : false;
  const targetText = formatPrice(note.targetPrice, locale);
  // Same arithmetic as the claim flow, and always through the settlement
  // engine: the projected figure must equal the settled payout to the base
  // unit, or the branch amount jumps the moment the market fixes.
  const aboveAmount = actual && aboveWon ? actual.netPayout : claimAboveEstimate(note).netPayout;
  const btcIfBelow = note.targetPrice > 0 ? note.principal / note.targetPrice : 0;
  // Reward = above amount − deposit, always: "above − deposit = reward" must
  // hold on every card, so ladder-reconstruction dust lands in the reward
  // rather than in a payout figure that must match the chain.
  const rewardAfterFee = aboveAmount - note.principal;
  const btcAmountText = `≈ ${formatBtcAmount(btcIfBelow, locale)} BTC`;
  // Same dashed affordance + testnet tip as the Buy Low "You receive" line —
  // BTC is illustrative on testnet until mainnet settles in wrapped BTC.
  const btcValueTip = `${btcAmountText} + ${formatCashAmount(rewardAfterFee, locale)} dUSDC · ${cardCopy.outcomeTestnet}`;
  const wonLabel = lifecycle === 'claimed' ? copy.portfolio.claim.youReceived : copy.portfolio.claim.youllReceive;
  const settledTag =
    marketState?.settlementPrice != null
      ? cardCopy.forkSettledAt(formatPrice(marketState.settlementPrice, locale))
      : null;

  return (
    <div className="di-outcome-fork">
      <div className={`di-fork-branch is-above${aboveWon ? ' is-won' : belowWon ? ' is-lost' : ''}`}>
        {aboveWon && settledTag ? (
          <span className="di-fork-tag">
            <Check size={12} aria-hidden="true" />
            {settledTag}
          </span>
        ) : null}
        <span className="di-fork-cond">
          {aboveWon ? null : <Check size={15} aria-hidden="true" />}
          {aboveWon ? cardCopy.forkAboveSettled(targetText) : cardCopy.forkAbove(targetText)}
        </span>
        {aboveWon ? <span className="di-fork-label">{wonLabel}</span> : null}
        <strong className="di-fork-amount">{formatCashAmount(aboveAmount, locale)} dUSDC</strong>
        <span className="di-fork-sub">{belowWon ? cardCopy.forkDidntHappen : cardCopy.forkAboveSub}</span>
      </div>
      <span className="di-fork-or">{cardCopy.forkOr}</span>
      <div className={`di-fork-branch is-below${belowWon ? ' is-won' : aboveWon ? ' is-lost' : ''}`}>
        {belowWon && settledTag ? (
          <span className="di-fork-tag">
            <ArrowDown size={12} aria-hidden="true" />
            {settledTag}
          </span>
        ) : null}
        <span className="di-fork-cond">
          {belowWon ? null : <ArrowDown size={15} aria-hidden="true" />}
          {belowWon ? cardCopy.forkBelowSettled(targetText) : cardCopy.forkBelow(targetText)}
        </span>
        {belowWon ? <span className="di-fork-label">{wonLabel}</span> : null}
        <strong className="di-fork-amount di-equiv-note" data-tip={btcValueTip} tabIndex={0}>
          {btcAmountText}
        </strong>
        <strong className="di-fork-reward">{cardCopy.forkReward(formatCashAmount(rewardAfterFee, locale))}</strong>
        <span className="di-fork-sub">
          {aboveWon
            ? cardCopy.forkDidntHappen
            : belowWon
              ? cardCopy.forkBelowSettledSub(targetText)
              : cardCopy.forkBelowSub(targetText)}
        </span>
      </div>
    </div>
  );
}

/**
 * One Position, one row: the collapsed summary carries only what varies
 * between Positions (strike, status, deposit, reward, settle time); every
 * shared explainer lives in the expanded detail. Claimable rows swap the
 * settle time for the payout and carry the Claim button inline, so claiming
 * never requires expanding — the detail stays optional reading.
 *
 * Phones get a genuinely different tree (per the useIsMobile contract): a
 * two-line compact row, with the full detail in a bottom sheet instead of an
 * inline accordion — expanding in place loses the scroll position in a list
 * this long.
 */
export function ProductNoteCard({
  note,
  marketState,
  eventIndexEntry,
  onClaimSuccess,
  locale = DEFAULT_LOCALE,
}: {
  note: AnkerProductNoteRecord;
  marketState?: PredictMarketState;
  eventIndexEntry?: ProductNoteEventIndexEntry;
  onClaimSuccess: (claim: ConfirmedClaim) => void;
  locale?: Locale;
}) {
  const copy = copyForLocale(locale);
  const isMobile = useIsMobile();
  const isDual = note.productType === 'dual-investment';
  const lifecycle = lifecycleForProductNote(note, marketState, Date.now());
  const status = noteStatusBadge(note, lifecycle, locale);
  const [expanded, setExpanded] = useState(false);
  const claimFlow = useClaimNote({ note, marketState, onClaimSuccess, locale });
  const showRowClaim = isDual && lifecycle === 'claimable';
  // Once the outcome is known, every figure on the card reads from the actual
  // settlement result — mixing it with subscription-time estimates lets the
  // header reward drift from the settled branch amount.
  const outcomeKnown = lifecycle === 'claimable' || lifecycle === 'claimed';
  const settledPayout = isDual && outcomeKnown ? claimRowPayout(note, marketState) : null;
  const rowPayout = showRowClaim ? settledPayout : null;

  function toggle() {
    setExpanded((value) => !value);
  }

  const rewardApr = netAprAfterCouponFee(note.apr, note.feeBps);
  const localizedSettlesText =
    lifecycle === 'countdown'
      ? locale === 'zh-CN'
        ? formatTimeToExpiry(note.expiryMs, locale)
        : `in ${formatTimeToExpiry(note.expiryMs, locale)}`
      : formatExpiry(note.expiryMs, locale);
  // Reward = above-branch payout − deposit (same identity as the fork), so the
  // header stat, the branches, and the settled amount all reconcile. Legacy
  // products have no fork to reconcile against — net coupon is all there is.
  const rewardEarned = !isDual
    ? note.coupon - claimEstimateForNote(note).feeAmount
    : settledPayout
      ? settledPayout.rewardAfterFee
      : claimAboveEstimate(note).netPayout - note.principal;

  const claimMessages = (
    <>
      {claimFlow.digest ? (
        <p className="execution-message di-position-claim-message">
          {copy.portfolio.claim.submitted} —{' '}
          <a className="di-proof-link" href={suiExplorerTxUrl(claimFlow.digest)} target="_blank" rel="noreferrer">
            {shortId(claimFlow.digest)}
          </a>
        </p>
      ) : null}
      {claimFlow.error ? <p className="execution-error di-position-claim-message">{claimFlow.error}</p> : null}
    </>
  );

  const detailBody = (
    <div className="di-position-detail">
      {isDual ? (
        <>
          {lifecycle === 'awaiting_settle' ? (
            <p className="di-fork-status">{copy.portfolio.claim.awaitingSettlement}</p>
          ) : null}
          <OutcomeFork note={note} marketState={marketState} lifecycle={lifecycle} locale={locale} />
        </>
      ) : (
        // Legacy products have no dual outcome to fork on — keep the
        // info-only claim block for them.
        <ClaimActionView
          note={note}
          nowMs={Date.now()}
          marketState={marketState}
          isPending={claimFlow.isPending}
          locale={locale}
          onClaim={claimFlow.claim}
          showAction={false}
        />
      )}

      {/* Proof links are audit affordances — label + external icon only;
          the explorer URL is the payload, truncated IDs are redundant.
          No fee line here: the fee breakdown lives in the claim dialog. */}
      <div className="di-position-meta">
        <span className="di-proof-links">
          <ProofLink href={suiExplorerObjectUrl(note.noteId)}>
            {copy.portfolio.card.noteId}
            <ExternalLink size={12} aria-hidden="true" />
          </ProofLink>
          {isDual ? (
            <SubscriptionDigestValue
              owner={note.owner}
              quoteHash={note.productId}
              eventDigest={eventIndexEntry?.subscriptionDigest}
              label={copy.portfolio.card.subscriptionTx}
            />
          ) : (
            <span>
              {copy.portfolio.card.productId} {note.productId || '--'}
            </span>
          )}
          <ProofLink href={suiExplorerObjectUrl(note.oracleId)}>
            {copy.portfolio.card.priceFeed}
            <ExternalLink size={12} aria-hidden="true" />
          </ProofLink>
        </span>
      </div>
    </div>
  );

  if (isMobile) {
    // Two lines per Position: identity + status, then the money flow. The
    // short product name rides the strike so mixed product types (and BTC-
    // settled rows) stay tellable apart once more products ship.
    const depositText = depositedCashText(note, eventIndexEntry);
    const compactLine =
      isDual && settledPayout
        ? `${depositText} → ${
            settledPayout.settledBelow
              ? `≈${formatBtcAmountCompact(settledPayout.btcAmount, locale)} BTC`
              : `${formatCashAmount(settledPayout.netPayout, locale)} dUSDC`
          }${lifecycle === 'claimed' ? ` · ${formatExpiry(note.expiryMs, locale)}` : ''}`
        : lifecycle === 'countdown'
          ? `${depositText} dUSDC · ${copy.portfolio.card.settlesCountdown(formatTimeToExpiry(note.expiryMs, locale))}`
          : `${depositText} dUSDC · ${formatExpiry(note.expiryMs, locale)}`;

    return (
      <Card as="article" className="di-position-row is-compact">
        <div className="di-position-compact" onClick={() => setExpanded(true)}>
          <div className="di-position-compact-main">
            <p className="di-position-compact-title">
              <strong>
                {isDual
                  ? `${copy.portfolio.card.buyLow} @ ${formatPrice(note.targetPrice, locale)}`
                  : copy.portfolio.card.legacyProduct}
              </strong>
              {showRowClaim ? (
                <em className="di-position-compact-reward">+{formatCashAmount(rewardEarned, locale)}</em>
              ) : (
                <Badge tone={status.tone}>{status.label}</Badge>
              )}
            </p>
            <p className="di-position-compact-sub">{compactLine}</p>
          </div>
          {showRowClaim ? (
            <Button
              variant="primary"
              size="sm"
              className="di-position-claim"
              disabled={claimFlow.isPending}
              onClick={(event) => {
                event.stopPropagation();
                claimFlow.claim();
              }}
            >
              {claimFlow.isPending ? copy.portfolio.claim.submitting : copy.portfolio.claim.claimShort}
            </Button>
          ) : (
            <button
              type="button"
              className="di-position-compact-open"
              aria-label={copy.portfolio.card.details}
              onClick={(event) => {
                event.stopPropagation();
                setExpanded(true);
              }}
            >
              <ChevronRight size={17} aria-hidden="true" />
            </button>
          )}
        </div>
        {claimMessages}
        <Dialog
          open={expanded}
          onClose={() => setExpanded(false)}
          ariaLabel={copy.portfolio.card.details}
          closeLabel={copy.common.close}
          className="di-position-sheet"
        >
          <div className="di-position-sheet-head">
            <h3>
              {isDual
                ? `${copy.portfolio.card.buyLowBtc} @ ${formatPrice(note.targetPrice, locale)}`
                : copy.portfolio.card.legacyProduct}
            </h3>
            <Badge tone={status.tone}>{status.label}</Badge>
          </div>
          <dl className="di-position-inline-stats di-position-sheet-stats">
            <div>
              <dt>{copy.portfolio.card.deposit}</dt>
              <dd>{depositText} dUSDC</dd>
            </div>
            <div>
              <dt>{copy.portfolio.card.reward}</dt>
              <dd className="is-reward">
                +{formatCashAmount(rewardEarned, locale)} <em>{formatApr(rewardApr, locale)} APR</em>
              </dd>
            </div>
            <div>
              <dt>{copy.portfolio.card.settles}</dt>
              <dd>{localizedSettlesText}</dd>
            </div>
          </dl>
          {detailBody}
          {showRowClaim ? (
            <Button
              variant="primary"
              className="di-position-sheet-claim"
              disabled={claimFlow.isPending}
              onClick={() => claimFlow.claim()}
            >
              {claimFlow.isPending ? copy.portfolio.claim.submitting : copy.portfolio.claim.claimPayout}
            </Button>
          ) : null}
          {claimMessages}
        </Dialog>
      </Card>
    );
  }

  return (
    <Card as="article" className="di-position-row">
      <div className="di-position-summary" onClick={toggle}>
        <div className="di-position-title">
          <h3>{isDual ? copy.portfolio.card.buyLowBtc : copy.portfolio.card.legacyProduct}</h3>
          {isDual ? <span className="di-position-strike">@ {formatPrice(note.targetPrice, locale)}</span> : null}
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>
        <dl className="di-position-inline-stats">
          <div>
            <dt>{copy.portfolio.card.deposit}</dt>
            <dd>{depositedCashText(note, eventIndexEntry)} dUSDC</dd>
          </div>
          <div>
            <dt>{copy.portfolio.card.reward}</dt>
            {/* Net of the fee, like the APR beside it — the pair must describe
                the same money or the stat contradicts itself. */}
            <dd className="is-reward">
              +{formatCashAmount(rewardEarned, locale)}{' '}
              <em>{formatApr(rewardApr, locale)} APR</em>
            </dd>
          </div>
          {rowPayout ? (
            <div>
              <dt>{copy.portfolio.claim.youllReceive}</dt>
              <dd className="is-payout">
                {rowPayout.settledBelow ? (
                  <>
                    ~{formatBtcAmountCompact(rowPayout.btcAmount, locale)} BTC
                    <em className="is-reward-note">
                      {copy.portfolio.card.forkReward(formatCashAmount(rowPayout.rewardAfterFee, locale))}
                    </em>
                  </>
                ) : (
                  `${formatCashAmount(rowPayout.netPayout, locale)} dUSDC`
                )}
              </dd>
            </div>
          ) : (
            <div>
              <dt>{copy.portfolio.card.settles}</dt>
              <dd>{localizedSettlesText}</dd>
            </div>
          )}
        </dl>
        <div className="di-position-actions">
          {showRowClaim ? (
            <Button
              variant="primary"
              size="sm"
              className="di-position-claim"
              disabled={claimFlow.isPending}
              onClick={(event) => {
                event.stopPropagation();
                claimFlow.claim();
              }}
            >
              {claimFlow.isPending ? copy.portfolio.claim.submitting : copy.portfolio.claim.claimPayout}
            </Button>
          ) : null}
          <button
            type="button"
            className="di-position-toggle"
            aria-expanded={expanded}
            aria-label={copy.portfolio.card.details}
            onClick={(event) => {
              event.stopPropagation();
              toggle();
            }}
          >
            {showRowClaim ? null : copy.portfolio.card.details}
            <ChevronDown size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
      {claimMessages}

      {expanded ? detailBody : null}
    </Card>
  );
}
