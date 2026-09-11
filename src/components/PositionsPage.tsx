'use client';

import { useQuery } from '@tanstack/react-query';
import { useAccount } from 'wagmi';
import { ArrowUpRight, Wallet } from 'lucide-react';
import { copyForLocale, DEFAULT_LOCALE, type Locale } from '../i18n';
import { useAnkerNotes, type AnkerNoteView } from '../hooks/useAnkerNotes';
import { isNoteContractConfigured } from '../wallet/ankerNote';
import { explorerAddress } from '../wallet/config';
import { ClaimAction } from './ClaimAction';
import { AppFooter } from './AppFooter';
import { AppHeader } from './AppHeader';
import { Badge, Card, Stat, StatGroup, type Tone } from '../ui';

/** Never a boolean. VOID returns stake and is not a loss; FAILED never reached the market. */
type Outcome = 'WON' | 'LOST' | 'VOID' | 'FAILED' | 'PENDING';

const TONE: Record<Outcome, Tone> = {
  WON: 'positive',
  LOST: 'danger',
  VOID: 'neutral',
  FAILED: 'warning',
  PENDING: 'neutral',
};

interface SettledRow {
  marketId: string;
  symbol: string;
  outcome: Outcome;
  yesWon?: boolean;
}

const DECIMALS = 6;
const ONE = 10n ** BigInt(DECIMALS);
const fmt = (raw: bigint, digits = 2) => {
  const neg = raw < 0n;
  const abs = neg ? -raw : raw;
  const frac = (abs % ONE).toString().padStart(DECIMALS, '0').slice(0, digits);
  return `${neg ? '-' : ''}${(abs / ONE).toLocaleString('en-US')}.${frac}`;
};

/**
 * A Position's outcome, derived from raw settlement every render.
 *
 * Never read back from a stored score: the note records the TERMS, the market
 * records the RESULT, and the outcome is the two compared. Anything cached in
 * between is a third source of truth that can disagree with both.
 */
function outcomeForNote(note: AnkerNoteView, settled: readonly SettledRow[], nowSec: number): Outcome {
  if (note.status === 1) return 'WON'; // already redeemed; terminal either way
  const marketId = note.strikes[0];
  const match = marketId ? settled.find((s) => s.marketId === marketId) : undefined;
  if (!match) return Number(note.expiry) > nowSec ? 'PENDING' : 'PENDING';
  if (match.outcome === 'VOID') return 'VOID';
  if (match.yesWon === undefined) return 'PENDING';
  // Anker's leg is always the YES side.
  return match.yesWon ? 'WON' : 'LOST';
}

export function PositionsPage({ locale = DEFAULT_LOCALE }: { locale?: Locale }) {
  const copy = copyForLocale(locale);
  const { address, isConnected } = useAccount();
  const { notes, isLoading, refetch } = useAnkerNotes();

  // Settled markets come from the PAST list — a resolved market has already left
  // the live one, so a portfolio that reads only live markets loses every
  // position at exactly the moment it becomes claimable.
  const settledQuery = useQuery<{ settled: SettledRow[]; error?: string }>({
    queryKey: ['dreamdex-settled'],
    queryFn: async () => (await fetch('/api/settled')).json(),
    refetchInterval: 30_000,
  });
  const settled = settledQuery.data?.settled ?? [];
  const nowSec = Math.floor(Date.now() / 1000);

  const decorated = notes.map((note) => ({ note, outcome: outcomeForNote(note, settled, nowSec) }));
  const buckets = {
    claimable: decorated.filter((d) => d.note.status === 0 && (d.outcome === 'WON' || d.outcome === 'VOID')),
    active: decorated.filter((d) => d.note.status === 0 && d.outcome === 'PENDING'),
    completed: decorated.filter((d) => d.note.status === 1 || d.outcome === 'LOST' || d.outcome === 'FAILED'),
  };

  const totalPrincipal = notes.reduce((sum, n) => sum + n.principal, 0n);
  const expectedCoupon = buckets.active.reduce((sum, d) => sum + d.note.coupon, 0n);

  return (
    <div className="page">
      <AppHeader activeProduct="portfolio" locale={locale} />
      <main className="page-main">
        <header className="di-hero">
          <h1>Positions</h1>
          <p className="di-hero-sub">
            Every Position is an AnkerNote in your own wallet. Anker holds nothing — the collateral sits in DreamDEX
            under your address, and the note is the receipt.
          </p>
        </header>

        {!isConnected ? (
          <Card variant="empty">
            <p>
              <Wallet size={16} /> Connect a wallet to see your Positions.
            </p>
          </Card>
        ) : !isNoteContractConfigured() ? (
          <Card variant="error">
            <p>
              AnkerNote is not deployed for this environment. Run <code>npm run contract:deploy</code> and set{' '}
              <code>NEXT_PUBLIC_ANKER_NOTE_ADDRESS</code>.
            </p>
          </Card>
        ) : (
          <>
            <StatGroup>
              <Stat label="Positions" value={String(notes.length)} />
              <Stat label="Principal committed" value={`${fmt(totalPrincipal)} USDso`} />
              <Stat label="Expected coupon" value={`${fmt(expectedCoupon)} USDso`} />
              <Stat label="Ready to claim" value={String(buckets.claimable.length)} />
            </StatGroup>
            <p className="di-hint">
              <a href={explorerAddress(address as string)} target="_blank" rel="noreferrer">
                View wallet on Shannon explorer <ArrowUpRight size={13} />
              </a>
            </p>
            {isLoading && <p className="di-hint">Reading your notes from chain…</p>}
          </>
        )}

        <Bucket title="Ready to claim" rows={buckets.claimable} claimable onClaimed={refetch} />
        <Bucket title="Active" rows={buckets.active} />
        <Bucket title="Completed" rows={buckets.completed} />

        <Card>
          <h2>How outcomes are derived</h2>
          <p className="di-hint">
            Scores are recomputed from raw settlements every render, never read back from a stored score. The note
            records the <strong>terms</strong>, the market records the <strong>result</strong>, and the outcome is the
            two compared. A market&apos;s payout vector decides it: a one-hot vector has a winner, a uniform vector is a{' '}
            <strong>VOID</strong> — stake returned, which is not a loss.
          </p>
        </Card>
      </main>
      <AppFooter locale={locale} />
    </div>
  );
}

function Bucket({
  title,
  rows,
  claimable = false,
  onClaimed,
}: {
  title: string;
  rows: Array<{ note: AnkerNoteView; outcome: Outcome }>;
  claimable?: boolean;
  onClaimed?: () => void;
}) {
  return (
    <section className="portfolio-bucket">
      <h2>
        {title} <Badge tone="neutral">{rows.length}</Badge>
      </h2>
      {rows.length === 0 ? (
        <Card variant="empty">
          <p className="di-hint">Nothing here yet.</p>
        </Card>
      ) : (
        <div className="portfolio-list">
          {rows.map(({ note, outcome }) => (
            <Card key={String(note.tokenId)}>
              <div className="portfolio-row">
                <span>
                  <strong>Note #{String(note.tokenId)}</strong>
                  <br />
                  <span className="muted mono">{note.strikes[0] ?? '—'}</span>
                </span>
                <Badge tone={TONE[outcome]}>{outcome}</Badge>
              </div>
              <dl className="kv">
                <dt>Principal</dt>
                <dd>{fmt(note.principal)} USDso</dd>
                <dt>Coupon</dt>
                <dd>{fmt(note.coupon)} USDso</dd>
                <dt>At risk</dt>
                <dd>{fmt(note.principal - note.reserve > 0n ? note.costs[0] ?? 0n : 0n)} USDso</dd>
                <dt>Fee rate (snapshot)</dt>
                <dd>{(Number(note.feeBpsSnapshot) / 100).toFixed(1)}%</dd>
                <dt>Expiry</dt>
                <dd>{new Date(Number(note.expiry) * 1000).toUTCString()}</dd>
              </dl>
              {claimable && (
                <ClaimAction
                  note={note}
                  // Gross payout: the reserve plus the coupon the note recorded.
                  payoutAmount={note.reserve + note.coupon}
                  {...(onClaimed ? { onClaimed } : {})}
                />
              )}
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
