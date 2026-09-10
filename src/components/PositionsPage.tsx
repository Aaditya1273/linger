'use client';

import { useQuery } from '@tanstack/react-query';
import { useAccount, useReadContract } from 'wagmi';
import { ArrowUpRight, Wallet } from 'lucide-react';
import { copyForLocale, DEFAULT_LOCALE, type Locale } from '../i18n';
import { ANKER_NOTE_ABI, ANKER_NOTE_ADDRESS, isNoteContractConfigured } from '../wallet/ankerNote';
import { explorerAddress, explorerTx } from '../wallet/config';
import { AppFooter } from './AppFooter';
import { AppHeader } from './AppHeader';
import { Badge, Card, Stat, StatGroup } from '../ui';

/** Never a boolean. VOID returns stake and is not a loss; FAILED never reached the market. */
type Outcome = 'WON' | 'LOST' | 'VOID' | 'FAILED' | 'PENDING';

interface SettledRow {
  marketId: string;
  symbol: string;
  outcome: Outcome;
  yesWon?: boolean;
}

import type { Tone } from '../ui';

const TONE: Record<Outcome, Tone> = {
  WON: 'positive',
  LOST: 'danger',
  VOID: 'neutral',
  FAILED: 'warning',
  PENDING: 'neutral',
};

export function PositionsPage({ locale = DEFAULT_LOCALE }: { locale?: Locale }) {
  const copy = copyForLocale(locale);
  const { address, isConnected } = useAccount();

  const { data: noteCount } = useReadContract({
    abi: ANKER_NOTE_ABI,
    address: isNoteContractConfigured() ? (ANKER_NOTE_ADDRESS as `0x${string}`) : undefined,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) && isNoteContractConfigured() },
  });

  // Settled markets come from the PAST list — a resolved market has already
  // left the live one, so a portfolio that reads only live markets loses every
  // position at exactly the moment it becomes claimable.
  const settledQuery = useQuery<{ settled: SettledRow[]; error?: string }>({
    queryKey: ['dreamdex-settled'],
    queryFn: async () => (await fetch('/api/settled')).json(),
    refetchInterval: 30_000,
  });

  const settled = settledQuery.data?.settled ?? [];
  const buckets = {
    claimable: settled.filter((s) => s.outcome === 'WON' || s.outcome === 'VOID'),
    active: settled.filter((s) => s.outcome === 'PENDING'),
    completed: settled.filter((s) => s.outcome === 'LOST' || s.outcome === 'FAILED'),
  };

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
            <p><Wallet size={16} /> Connect a wallet to see your Positions.</p>
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
              <Stat label="AnkerNotes held" value={String(noteCount ?? 0)} />
              <Stat label="Ready to claim" value={String(buckets.claimable.length)} />
              <Stat label="Active" value={String(buckets.active.length)} />
            </StatGroup>
            <p className="di-hint">
              <a href={explorerAddress(address as string)} target="_blank" rel="noreferrer">
                View wallet on Shannon explorer <ArrowUpRight size={13} />
              </a>
            </p>
          </>
        )}

        <Bucket title="Ready to claim" rows={buckets.claimable} />
        <Bucket title="Active" rows={buckets.active} />
        <Bucket title="Completed" rows={buckets.completed} />

        <Card>
          <h2>How outcomes are derived</h2>
          <p className="di-hint">
            Scores are recomputed from raw settlements every time, never read back from a stored score. A market&apos;s
            payout vector decides the outcome: a one-hot vector has a winner, a uniform vector is a <strong>VOID</strong>{' '}
            (stake returned, not a loss). Your Position&apos;s result is that outcome compared against the side you
            actually held.
          </p>
        </Card>
      </main>
      <AppFooter locale={locale} />
    </div>
  );
}

function Bucket({ title, rows }: { title: string; rows: SettledRow[] }) {
  return (
    <section className="portfolio-bucket">
      <h2>
        {title} <Badge tone="neutral">{rows.length}</Badge>
      </h2>
      {rows.length === 0 ? (
        <Card variant="empty"><p className="di-hint">Nothing here yet.</p></Card>
      ) : (
        <div className="portfolio-list">
          {rows.slice(0, 10).map((row) => (
            <Card key={row.marketId}>
              <div className="portfolio-row">
                <span className="mono">{row.symbol}</span>
                <Badge tone={TONE[row.outcome]}>{row.outcome}</Badge>
              </div>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
