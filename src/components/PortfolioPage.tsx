'use client';

import { useCurrentAccount } from '@mysten/dapp-kit-react';
import { ArrowUpRight, ChevronDown, Info, QrCode, RefreshCw, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useAnkerPortfolio } from '../hooks/useAnkerPortfolio';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import { useProductNoteMarketStates } from '../hooks/useProductNoteMarketStates';
import { useProductNoteEventIndex } from '../hooks/useProductNoteEventIndex';
import { useWalletFunds } from '../hooks/useWalletFunds';
import type { PredictMarketState } from '../deepbook/predictMarketState';
import { copyForLocale, DEFAULT_LOCALE, localizedPath, type Locale } from '../i18n';
import { netCouponAfterFee } from '../products/feePolicy';
import type { AnkerProductNoteRecord } from '../sui/ankerPortfolio';
import { DEFAULT_ANKER_CONFIG } from '../sui/ankerTransactions';
import { lifecycleForProductNote } from '../sui/productNoteLifecycle';
import { AppFooter } from './AppFooter';
import { AppHeader } from './AppHeader';
import { ClaimSuccessDialog } from './ClaimSuccessDialog';
import { useClaimAllNotes, type ConfirmedClaim } from './PortfolioClaimAction';
import { formatCashAmount, shortAddress, shortId, suiExplorerTxUrl } from './PortfolioFormat';
import { ProductNoteCard } from './PortfolioProductNoteCard';
import { ReceiveDialog } from './ReceiveDialog';
import { SendDialog } from './SendDialog';
import { WalletConnectButton } from './WalletConnectButton';
import { Badge, Button, buttonClassName, Card } from '../ui';

type PositionBucket = 'ready' | 'active' | 'completed';

// No "All" tab: ready/active/completed partition the positions, and mixing
// settled history into the to-do view is what made the page scroll forever.
const FILTER_TABS: { key: PositionBucket }[] = [{ key: 'ready' }, { key: 'active' }, { key: 'completed' }];

/** Completed positions only ever grow — the list shows a page at a time. */
const COMPLETED_PAGE_SIZE = 10;

// Filter bucket derived from each Position plus its Expiry Market settlement state.
function positionBucket(
  note: Pick<AnkerProductNoteRecord, 'status' | 'oracleId' | 'expiryMs'>,
  marketState: PredictMarketState | undefined,
  nowMs: number,
): PositionBucket {
  const lifecycle = lifecycleForProductNote(note, marketState, nowMs);
  if (lifecycle === 'claimed') return 'completed';
  if (lifecycle === 'claimable') return 'ready';
  return 'active';
}

export { ClaimActionView, claimActionViewModel, claimEstimateForNote } from './PortfolioClaimAction';
export { SubscriptionDigestValue, depositedCashText, noteStatusBadge } from './PortfolioProductNoteCard';

export function PortfolioPage({ locale = DEFAULT_LOCALE }: { locale?: Locale }) {
  const copy = copyForLocale(locale);
  const account = useCurrentAccount();
  const portfolioQuery = useAnkerPortfolio();
  const funds = useWalletFunds();
  // Null until the user picks a tab — the view then defaults to the first
  // non-empty bucket, so a wall of settled positions never buries a claim.
  const [filter, setFilter] = useState<PositionBucket | null>(null);
  const [completedShown, setCompletedShown] = useState(COMPLETED_PAGE_SIZE);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  // Phone-only rewards disclosure: the summary line replaces the rewards tiles
  // there, so the tile hints move into this expandable detail.
  const [rewardsOpen, setRewardsOpen] = useState(false);
  // The testnet settlement note is platform mechanics, not per-position
  // decision info — it lives behind the ⓘ next to the heading.
  const [settlementNoteOpen, setSettlementNoteOpen] = useState(false);
  const settlementNoteRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!settlementNoteOpen) return;
    // pointerdown (not mousedown) so outside-tap dismissal also works on touch.
    const onPointerDown = (event: PointerEvent) => {
      if (!settlementNoteRef.current?.contains(event.target as Node)) setSettlementNoteOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSettlementNoteOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [settlementNoteOpen]);
  // Claim success dialog state lives at page level: the optimistic claimed-state
  // update moves the position out of the "ready" bucket, unmounting its card —
  // any dialog state kept inside the card would be wiped before it could render.
  const [confirmedClaim, setConfirmedClaim] = useState<ConfirmedClaim | null>(null);
  const contractConfigured = DEFAULT_ANKER_CONFIG.packageId !== '0x0' && DEFAULT_ANKER_CONFIG.packageId.length > 0;
  const notes = portfolioQuery.data ?? [];
  const marketStates = useProductNoteMarketStates(notes);
  const marketStateFor = (note: AnkerProductNoteRecord) => marketStates.byMarketId[note.oracleId.toLowerCase()];
  const noteIds = notes.map((note) => note.noteId);
  const productNoteEventIndexQuery = useProductNoteEventIndex(noteIds);
  // Batch claim: one signature for every settled position instead of one each.
  const claimAllFlow = useClaimAllNotes({ notes, marketStateFor, locale });

  // Phone pull-to-refresh replaces the removed header refresh button; desktop
  // relies on react-query's focus refetch plus post-transaction invalidation.
  const pull = usePullToRefresh(() => Promise.all([portfolioQuery.refetch(), funds.refresh()]));

  const nowMs = Date.now();
  const openNotes = notes.filter((note) => note.status === 'open');
  // Net of the fee, like Cumulative Rewards below — the two tiles must share
  // one basis or "expected" never reconciles with "received".
  const expectedRewards = openNotes.reduce((sum, note) => sum + netCouponAfterFee(note.coupon, note.feeBps), 0);
  // Cumulative Rewards (累计收益): realized payout − principal across every
  // Claim on the current deployment — from the redeemed fields the claimed
  // ProductNote objects keep on-chain.
  const cumulativeRewards = notes
    .filter((note) => note.status === 'redeemed')
    .reduce((sum, note) => sum + (note.redeemedPayout - note.redeemedFee - note.principal), 0);
  // In Position / Total Assets come from useWalletFunds so this band and the
  // account panel can never disagree; expected rewards are never counted in.
  const { inPosition, totalAssets } = funds;

  const bucketOrder: Record<PositionBucket, number> = { ready: 0, active: 1, completed: 2 };
  const sortedNotes = [...notes].sort((left, right) => {
    const weight =
      bucketOrder[positionBucket(left, marketStateFor(left), nowMs)] -
      bucketOrder[positionBucket(right, marketStateFor(right), nowMs)];
    if (weight !== 0) return weight;
    return left.expiryMs - right.expiryMs;
  });
  const counts: Record<PositionBucket, number> = {
    ready: notes.filter((note) => positionBucket(note, marketStateFor(note), nowMs) === 'ready').length,
    active: notes.filter((note) => positionBucket(note, marketStateFor(note), nowMs) === 'active').length,
    completed: notes.filter((note) => positionBucket(note, marketStateFor(note), nowMs) === 'completed').length,
  };
  const nonEmptyBuckets = (['ready', 'active', 'completed'] as const).filter((key) => counts[key] > 0);
  const showFilters = nonEmptyBuckets.length >= 2;
  // The chosen tab holds only while its bucket has positions — claiming the
  // last ready position drops the view back to the first non-empty bucket.
  const activeFilter: PositionBucket | null = showFilters
    ? filter && counts[filter] > 0
      ? filter
      : (nonEmptyBuckets[0] ?? null)
    : null;
  const filteredNotes = activeFilter
    ? sortedNotes.filter((note) => positionBucket(note, marketStateFor(note), nowMs) === activeFilter)
    : sortedNotes;
  // Completed positions paginate wherever they appear; ready/active never do.
  const completedInView = filteredNotes.filter(
    (note) => positionBucket(note, marketStateFor(note), nowMs) === 'completed',
  ).length;
  const hiddenCompleted = Math.max(0, completedInView - completedShown);
  const visibleNotes =
    hiddenCompleted > 0 ? filteredNotes.slice(0, filteredNotes.length - hiddenCompleted) : filteredNotes;

  return (
    <main className="dual-page" id="wallet-portfolio">
      <AppHeader activeProduct="portfolio" locale={locale} />

      <div
        className={[
          'pf-pull-indicator',
          pull.refreshing ? 'is-refreshing' : pull.pullPx > 0 ? 'is-pulling' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        style={{ transform: `translate(-50%, ${pull.refreshing ? 12 : Math.min(pull.pullPx, 72) - 52}px)` }}
        aria-hidden="true"
      >
        <RefreshCw size={16} />
      </div>

      <section className="dual-hero calculation-hero portfolio-hero">
        <div>
          <h1>{copy.portfolio.title}</h1>
        </div>
      </section>

      {account ? (
        <section className="calculation-section">
          <div className="pf-wallet">
            <div className="pf-wallet-top">
              <div className="pf-wallet-total">
                {/* Identity lives in the header account control; Receive owns
                    the "get my address" flow (full address + QR + network
                    warning) — the band stays amounts and actions only. */}
                <span className="pf-wallet-label">{copy.portfolio.totalAssets}</span>
                <span className="pf-wallet-amount-row">
                  <strong className="pf-wallet-amount">
                    {totalAssets !== null ? formatCashAmount(totalAssets, locale) : '—'} <em>dUSDC</em>
                  </strong>
                  {expectedRewards > 0 ? (
                    <em className="pf-wallet-expected">
                      <Sparkles size={13} aria-hidden="true" />
                      +{formatCashAmount(expectedRewards, locale)} {copy.portfolio.expectedRewards}
                    </em>
                  ) : null}
                </span>
                {/* Phone-only (CSS-gated): the rewards tiles compress into one
                    line under the hero number; the tile hints live in the
                    disclosure so the card stays four lines tall. */}
                {/* Each figure wears the colour of its detail tile — gold for
                    pending, green for realized — so the collapsed line teaches
                    the same colour language the expansion uses. */}
                <button
                  type="button"
                  className="pf-rewards-line"
                  aria-expanded={rewardsOpen}
                  onClick={() => setRewardsOpen((value) => !value)}
                >
                  <Sparkles size={13} aria-hidden="true" />
                  <span className="pf-rewards-line-expected">
                    {copy.portfolio.rewardsSummaryExpected(`+${formatCashAmount(expectedRewards, locale)}`)}
                  </span>
                  <span className="pf-rewards-line-sep" aria-hidden="true">
                    ·
                  </span>
                  <span className={cumulativeRewards >= 0 ? 'pf-rewards-line-cumulative' : undefined}>
                    {copy.portfolio.rewardsSummaryCumulative(
                      `${cumulativeRewards >= 0 ? '+' : ''}${formatCashAmount(cumulativeRewards, locale)}`,
                    )}
                  </span>
                  <ChevronDown size={14} aria-hidden="true" />
                </button>
                {rewardsOpen ? (
                  <dl className="pf-rewards-detail">
                    <div>
                      <dt>{copy.portfolio.expectedRewardsTile}</dt>
                      <dd className="pf-rewards-expected">+{formatCashAmount(expectedRewards, locale)}</dd>
                      <small>{copy.portfolio.expectedRewardsHint}</small>
                    </div>
                    <div>
                      <dt>{copy.portfolio.cumulativeRewards}</dt>
                      <dd className={cumulativeRewards >= 0 ? 'pf-rewards-positive' : undefined}>
                        {cumulativeRewards >= 0 ? '+' : ''}
                        {formatCashAmount(cumulativeRewards, locale)}
                      </dd>
                      <small>{copy.portfolio.cumulativeRewardsHint}</small>
                    </div>
                  </dl>
                ) : null}
              </div>
              {/* Transfers are utilities, not the product loop — both stay
                  secondary; gold primary is reserved for Subscribe and Claim. */}
              <div className="pf-wallet-actions">
                <Button variant="secondary" onClick={() => setReceiveOpen(true)}>
                  <QrCode size={16} />
                  {copy.wallet.receive}
                </Button>
                <Button variant="secondary" onClick={() => setSendOpen(true)}>
                  <ArrowUpRight size={16} />
                  {copy.wallet.send}
                </Button>
              </div>
            </div>
            {/* Phone-only (CSS-gated): Available and In position are the two
                parts of one whole, so a proportion bar reads faster than two
                tiles. The legend carries the numbers; the bar is decoration. */}
            {totalAssets !== null && totalAssets > 0 ? (
              <div className="pf-balance-split">
                <div className="pf-balance-bar" aria-hidden="true">
                  <span
                    className="pf-balance-bar-available"
                    style={{ width: `${((funds.available ?? 0) / totalAssets) * 100}%` }}
                  />
                </div>
                <div className="pf-balance-legend">
                  <span className="pf-balance-legend-available">
                    {copy.portfolio.available}{' '}
                    <strong>{funds.available !== null ? formatCashAmount(funds.available, locale) : '—'}</strong>
                  </span>
                  <span className="pf-balance-legend-locked">
                    {copy.portfolio.inPosition} <strong>{formatCashAmount(inPosition, locale)}</strong>
                  </span>
                </div>
              </div>
            ) : null}
            <div className="di-portfolio pf-tiles">
              <div>
                <span>{copy.portfolio.available}</span>
                <strong>{funds.available !== null ? formatCashAmount(funds.available, locale) : '—'}</strong>
                <small>{copy.portfolio.availableHint}</small>
              </div>
              <div>
                <span>{copy.portfolio.inPosition}</span>
                <strong>{formatCashAmount(inPosition, locale)}</strong>
                <small>{copy.portfolio.inPositionHint}</small>
              </div>
              <div>
                <span>{copy.portfolio.expectedRewardsTile}</span>
                <strong className="pf-rewards-expected">+{formatCashAmount(expectedRewards, locale)}</strong>
                <small>{copy.portfolio.expectedRewardsHint}</small>
              </div>
              <div>
                <span>{copy.portfolio.cumulativeRewards}</span>
                <strong className={cumulativeRewards >= 0 ? 'pf-rewards-positive' : undefined}>
                  {cumulativeRewards >= 0 ? '+' : ''}
                  {formatCashAmount(cumulativeRewards, locale)}
                </strong>
                <small>{copy.portfolio.cumulativeRewardsHint}</small>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {!account ? (
        <section className="calculation-section">
          <Card variant="empty">
            <div className="portfolio-connect-empty">
              <p>{copy.portfolio.connectWallet}</p>
              <WalletConnectButton locale={locale} variant="primary">
                {copy.common.connect}
              </WalletConnectButton>
            </div>
          </Card>
        </section>
      ) : null}

      {!account ? null : !contractConfigured ? (
        <section className="calculation-section">
          <Card variant="error">{copy.portfolio.contractNotConfigured}</Card>
        </section>
      ) : portfolioQuery.isPending ? (
        <section className="calculation-section">
          {/* Skeleton rows in the list's own shape — the page settles into
              place instead of swapping a text card for content. */}
          <div className="notes-skeleton" role="status" aria-label={copy.portfolio.loadingPositions}>
            <span />
            <span />
            <span />
          </div>
        </section>
      ) : portfolioQuery.error ? (
        <section className="calculation-section">
          <Card variant="error">
            {portfolioQuery.error instanceof Error
              ? portfolioQuery.error.message
              : copy.portfolio.unableToLoadPositions}
          </Card>
        </section>
      ) : notes.length === 0 ? (
        <section className="calculation-section">
          <Card variant="empty">
            <div className="portfolio-empty">
              <p>{copy.portfolio.noPositions(shortAddress(account.address))}</p>
              {/* An empty state is an invitation — give it the exit. */}
              <Link
                className={buttonClassName({ variant: 'primary' })}
                href={localizedPath(locale, '/app/dual-investment')}
              >
                {copy.portfolio.noPositionsCta}
              </Link>
            </div>
          </Card>
        </section>
      ) : (
        <section className="calculation-section">
          <div className="section-heading di-positions-heading">
            <div className="di-positions-title" ref={settlementNoteRef}>
              <h2>{copy.portfolio.yourPositions}</h2>
              <button
                type="button"
                className="di-note-toggle"
                aria-expanded={settlementNoteOpen}
                aria-label={copy.portfolio.settlementNoteLabel}
                onClick={() => setSettlementNoteOpen((value) => !value)}
              >
                <Info size={16} aria-hidden="true" />
              </button>
              {/* One settlement note for the whole section, floated as a
                  toggletip — repeating it on every card buried the numbers
                  under identical fine print, and an inline strip pushed the
                  list down every time it opened. */}
              {settlementNoteOpen ? (
                <p className="di-positions-note" role="note">
                  {copy.portfolio.card.outcomeTestnet}
                </p>
              ) : null}
            </div>
            {/* Count badge stays neutral — green is reserved for realized money. */}
            <Badge>
              {notes.length} {notes.length === 1 ? copy.portfolio.position : copy.portfolio.positions}
            </Badge>
          </div>
          {showFilters ? (
            <div className="di-position-filters" role="tablist" aria-label={copy.portfolio.filterLabel}>
              {FILTER_TABS.filter((tab) => counts[tab.key] > 0).map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={activeFilter === tab.key}
                  className={activeFilter === tab.key ? 'di-filter is-active' : 'di-filter'}
                  onClick={() => setFilter(tab.key)}
                >
                  {copy.portfolio.filters[tab.key]}
                  <em>{counts[tab.key]}</em>
                </button>
              ))}
            </div>
          ) : null}
          {/* Only worth a row once it saves signatures, and only where the
              claimable rows are on screen. */}
          {claimAllFlow.claimableCount >= 2 && (activeFilter === 'ready' || activeFilter === null) ? (
            <div className="di-claim-all">
              <Button
                variant="primary"
                className="di-claim-all-btn"
                disabled={claimAllFlow.isPending}
                onClick={claimAllFlow.claimAll}
              >
                {claimAllFlow.isPending
                  ? copy.portfolio.claim.submitting
                  : copy.portfolio.claim.claimAll(claimAllFlow.claimableCount)}
              </Button>
              {claimAllFlow.digest ? (
                <p className="execution-message">
                  {copy.portfolio.claim.submitted} —{' '}
                  <a
                    className="di-proof-link"
                    href={suiExplorerTxUrl(claimAllFlow.digest)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {shortId(claimAllFlow.digest)}
                  </a>
                </p>
              ) : null}
              {claimAllFlow.error ? <p className="execution-error">{claimAllFlow.error}</p> : null}
            </div>
          ) : null}
          {visibleNotes.length === 0 ? (
            <Card variant="empty">{copy.portfolio.noPositionsInView}</Card>
          ) : (
            <div className="notes-list">
              {visibleNotes.map((note) => (
                <ProductNoteCard
                  note={note}
                  marketState={marketStateFor(note)}
                  eventIndexEntry={productNoteEventIndexQuery.data?.byNoteId[note.noteId]}
                  onClaimSuccess={setConfirmedClaim}
                  locale={locale}
                  key={note.noteId}
                />
              ))}
            </div>
          )}
          {hiddenCompleted > 0 ? (
            <Button
              variant="secondary"
              className="di-positions-more"
              onClick={() => setCompletedShown((value) => value + COMPLETED_PAGE_SIZE)}
            >
              {copy.portfolio.showMoreCompleted(Math.min(hiddenCompleted, COMPLETED_PAGE_SIZE))}
            </Button>
          ) : null}
        </section>
      )}
      {account ? (
        <>
          <ReceiveDialog
            open={receiveOpen}
            address={account.address}
            locale={locale}
            onClose={() => setReceiveOpen(false)}
          />
          <SendDialog open={sendOpen} locale={locale} onClose={() => setSendOpen(false)} />
        </>
      ) : null}
      {confirmedClaim ? (
        <ClaimSuccessDialog
          note={confirmedClaim.note}
          success={confirmedClaim.summary}
          locale={locale}
          onClose={() => setConfirmedClaim(null)}
        />
      ) : null}
      <AppFooter locale={locale} />
    </main>
  );
}
