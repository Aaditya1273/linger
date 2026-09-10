'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAccount, useBalance, useWalletClient, useWriteContract } from 'wagmi';
import { AlertTriangle, Droplet, RefreshCw } from 'lucide-react';
import { compileBuyLow, type BuyLowQuote } from '../products/buyLow';
import { copyForLocale, DEFAULT_LOCALE, type Locale } from '../i18n';
import { FAUCET_STT, SOMNIA_CHAIN, explorerTx } from '../wallet/config';
import { ANKER_NOTE_ABI, ANKER_NOTE_ADDRESS, isNoteContractConfigured } from '../wallet/ankerNote';
import { AppFooter } from './AppFooter';
import { AppHeader } from './AppHeader';
import { Badge, Button, Card, Stat, StatGroup } from '../ui';

const ORACLE_SCALE = 100n; // strike 7713585 == $77,135.85
const FEE_BPS = 1_000;

interface MarketRow {
  marketId: string;
  asset: string;
  symbol: string;
  upSymbol: string;
  strikeRaw: string;
  expirySec: number;
  collateral: string;
  decimals: number;
  askRaw: string | null;
  askSizeRaw: string | null;
}
interface MarketsResponse {
  serverTimeMs: number;
  markets: MarketRow[];
  error?: string;
}

const fmt = (raw: bigint, decimals: number, digits = 2) => {
  const one = 10n ** BigInt(decimals);
  const neg = raw < 0n;
  const abs = neg ? -raw : raw;
  const frac = (abs % one).toString().padStart(decimals, '0').slice(0, digits);
  return `${neg ? '-' : ''}${(abs / one).toLocaleString('en-US')}${digits > 0 ? `.${frac}` : ''}`;
};
const pct = (bps: number, digits = 2) => `${(bps / 100).toFixed(digits)}%`;
const strikeUsd = (strikeRaw: string) => Number(BigInt(strikeRaw) / ORACLE_SCALE);

export function BuyLowPage({ locale = DEFAULT_LOCALE }: { locale?: Locale }) {
  const copy = copyForLocale(locale);
  const { address, isConnected, chainId } = useAccount();
  const [amount, setAmount] = useState('100');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const marketsQuery = useQuery<MarketsResponse>({
    queryKey: ['dreamdex-markets'],
    queryFn: async () => {
      const res = await fetch('/api/markets');
      return (await res.json()) as MarketsResponse;
    },
    refetchInterval: 10_000,
  });

  const markets = marketsQuery.data?.markets ?? [];
  const decimals = markets[0]?.decimals ?? 6;

  // Clock skew: rank against the SERVER's clock, not the browser's. On a venue
  // whose markets live ~60s a few seconds of client drift silently offers an
  // expired market as live.
  const nowSec = Math.floor((marketsQuery.data?.serverTimeMs ?? Date.now()) / 1000);

  // The window closes while you compose: if the selected market expires, roll
  // to the next live one rather than leaving a dead quote on screen.
  const selected = useMemo(() => {
    const chosen = markets.find((m) => m.marketId === selectedId && m.expirySec > nowSec);
    return chosen ?? markets.find((m) => m.expirySec > nowSec) ?? null;
  }, [markets, selectedId, nowSec]);

  useEffect(() => {
    if (selected && selected.marketId !== selectedId) setSelectedId(selected.marketId);
  }, [selected, selectedId]);

  const principalRaw = useMemo(() => {
    if (!/^\d+(\.\d+)?$/.test(amount.trim())) return 0n;
    const [w = '0', f = ''] = amount.trim().split('.');
    return BigInt(w) * 10n ** BigInt(decimals) + BigInt(f.padEnd(decimals, '0').slice(0, decimals) || '0');
  }, [amount, decimals]);

  const quote: BuyLowQuote | null = useMemo(() => {
    if (!selected) return null;
    return compileBuyLow({
      principalRaw,
      askRaw: selected.askRaw ? BigInt(selected.askRaw) : 0n,
      strikeRaw: BigInt(selected.strikeRaw),
      oracleScale: ORACLE_SCALE,
      expirySec: selected.expirySec,
      nowSec,
      feeBps: FEE_BPS,
      scale: { decimals, one: 10n ** BigInt(decimals) },
    });
  }, [selected, principalRaw, nowSec, decimals]);

  const { data: stt } = useBalance({ address, query: { enabled: isConnected } });
  const wrongNetwork = isConnected && chainId !== SOMNIA_CHAIN.id;
  const needsGas = isConnected && stt?.value === 0n;

  return (
    <div className="page">
      <AppHeader activeProduct="dual-investment" locale={locale} />
      <main className="page-main di-page">
        <header className="di-hero">
          <h1>BTC Buy Low</h1>
          <p className="di-hero-sub">
            Self-custody structured yield on Somnia, built from DreamDEX Event Contracts. Funds stay in DreamDEX under
            your own wallet; the AnkerNote is your proof.
          </p>
        </header>

        {marketsQuery.data?.error && (
          <Card>
            <p className="di-error">
              <AlertTriangle size={15} /> DreamDEX read failed: {marketsQuery.data.error}
            </p>
          </Card>
        )}

        <section className="di-builder">
          <Card>
            <h2>1 · Amount</h2>
            <label className="di-field">
              <input
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                aria-label="Amount"
              />
              <span>USDso</span>
            </label>
            <p className="di-hint">
              Settles in the venue collateral ({decimals} decimals). All amounts are computed in integer base units.
            </p>
          </Card>

          <Card>
            <div className="di-row-head">
              <h2>2 · Target price &amp; settlement</h2>
              <button className="di-refresh-btn" onClick={() => marketsQuery.refetch()} aria-label="Refresh" title="Refresh">
                <RefreshCw size={15} />
              </button>
            </div>
            {marketsQuery.isLoading ? (
              <p className="di-hint">Loading live Event Contracts…</p>
            ) : markets.length === 0 ? (
              <p className="di-hint">
                No BTC market is live on-chain right now. Shannon markets live about a minute — this refreshes every 10s.
              </p>
            ) : (
              <div className="di-table-wrap">
                <table className="offer-table">
                  <thead>
                    <tr>
                      <th>Target price</th>
                      <th>Settles</th>
                      <th>Ask</th>
                      <th>Period yield</th>
                      <th>Ref. APR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {markets.map((market) => {
                      const rowQuote = compileBuyLow({
                        principalRaw,
                        askRaw: market.askRaw ? BigInt(market.askRaw) : 0n,
                        strikeRaw: BigInt(market.strikeRaw),
                        oracleScale: ORACLE_SCALE,
                        expirySec: market.expirySec,
                        nowSec,
                        feeBps: FEE_BPS,
                        scale: { decimals, one: 10n ** BigInt(decimals) },
                      });
                      const live = market.askRaw !== null && market.expirySec > nowSec;
                      return (
                        <tr
                          key={market.marketId}
                          role="button"
                          tabIndex={0}
                          aria-pressed={selected?.marketId === market.marketId}
                          className={selected?.marketId === market.marketId ? 'selected' : undefined}
                          onClick={() => setSelectedId(market.marketId)}
                          onKeyDown={(e) => e.key === 'Enter' && setSelectedId(market.marketId)}
                        >
                          <td>${strikeUsd(market.strikeRaw).toLocaleString('en-US')}</td>
                          <td>{new Date(market.expirySec * 1000).toUTCString().slice(17, 22)} UTC</td>
                          <td>{live ? fmt(BigInt(market.askRaw as string), decimals, 3) : '—'}</td>
                          <td>{live && rowQuote.executable ? pct(rowQuote.periodYieldBps) : <Badge tone="neutral">no liquidity</Badge>}</td>
                          <td className="muted">{live && rowQuote.executable ? pct(rowQuote.netAprBps, 0) : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="di-hint">
                  <strong>Period yield</strong> is the headline: these tenors are minutes, so the annualized column is a
                  muted reference only — it is not a rate you can earn for a year.
                </p>
              </div>
            )}
          </Card>
        </section>

        {quote && selected && (
          <Card>
            <h2>3 · Review</h2>
            <StatGroup>
              <Stat label="Period yield" value={quote.executable ? pct(quote.periodYieldBps) : '—'} />
              <Stat label="Coupon" value={`${fmt(quote.couponRaw, decimals)} USDso`} />
              <Stat label="If ≥ target" value={`${fmt(quote.aboveTargetRaw, decimals)} USDso`} />
              <Stat label="If < target" value={`${fmt(quote.belowTargetRaw, decimals)} USDso`} />
            </StatGroup>

            <details className="di-legs">
              <summary>Leg disclosure — the exact DreamDEX Event Contract</summary>
              <dl className="kv">
                <dt>Market</dt><dd className="mono">{selected.upSymbol}</dd>
                <dt>Market id</dt><dd className="mono">{selected.marketId}</dd>
                <dt>Quantity</dt><dd>{fmt(quote.quantityRaw, decimals, 4)} YES</dd>
                <dt>Leg cost</dt><dd>{fmt(quote.legCostRaw, decimals)} USDso</dd>
                <dt>Reserve</dt><dd>{fmt(quote.reserveRaw, decimals)} USDso</dd>
                <dt>Cash held</dt><dd>{fmt(quote.cashRaw, decimals)} USDso</dd>
                <dt>Order type</dt><dd>Limit IOC — fills now or fails cleanly, never rests</dd>
              </dl>
            </details>

            {!quote.executable && (
              <p className="di-error">
                <AlertTriangle size={15} /> {quote.warning} — this row is a snapshot, not a subscribable quote.
              </p>
            )}

            {/* Two distinct, separately actionable funding errors. */}
            {needsGas && (
              <p className="di-error">
                <Droplet size={15} /> You need STT for gas.{' '}
                <a href={FAUCET_STT} target="_blank" rel="noreferrer">Get STT</a>
              </p>
            )}
            {wrongNetwork && (
              <p className="di-error"><AlertTriangle size={15} /> Switch to Somnia Shannon to subscribe.</p>
            )}

            <SubscribeButton
              quote={quote}
              market={selected}
              decimals={decimals}
              connected={isConnected && !wrongNetwork && !needsGas}
            />
          </Card>
        )}
      </main>
      <AppFooter locale={locale} />
    </div>
  );
}

/**
 * Subscribe: cross the DreamDEX leg, then mint the AnkerNote receipt.
 *
 * Order matters. The leg is the real position; the note only records a trade
 * that already happened. Minting first would leave a receipt for a position
 * that may never have filled — an IOC that finds no ask fails, and that has to
 * read as FAILED, not as an open Position.
 *
 * Duplicate-submit guard: the button is disabled for the whole in-flight
 * window, and `idempotencyKey` is (wallet, market, expiry) so a double click
 * inside one market window cannot place two orders.
 */
function SubscribeButton({
  quote,
  market,
  decimals,
  connected,
}: {
  quote: BuyLowQuote;
  market: MarketRow;
  decimals: number;
  connected: boolean;
}) {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { writeContractAsync } = useWriteContract();
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string; hash?: string } | null>(null);
  const [submitted, setSubmitted] = useState<Set<string>>(new Set());

  const idempotencyKey = `${address ?? ''}:${market.marketId}:${market.expirySec}`;
  const alreadySubmitted = submitted.has(idempotencyKey);

  async function subscribe() {
    if (!walletClient || !address || alreadySubmitted) return;
    setPending(true);
    setResult(null);
    setSubmitted((prev) => new Set(prev).add(idempotencyKey));
    try {
      const { placeBrowserBuyIOC } = await import('@anker/dex/browser');
      const one = 10n ** BigInt(decimals);
      // Cross buffer: 200 bps of one whole outcome token, clamped at the ceiling.
      const limitRaw = (() => {
        const ask = BigInt(market.askRaw ?? '0');
        const buffered = ask + (one * 200n) / 10_000n;
        return buffered > one ? one : buffered;
      })();

      const fill = await placeBrowserBuyIOC({
        walletClient,
        indexerUrl: process.env.NEXT_PUBLIC_INDEXER_URL ?? '',
        wsRpcUrl: process.env.NEXT_PUBLIC_WS_RPC ?? '',
        market: {
          marketId: market.marketId as `0x${string}`,
          symbol: market.symbol,
          asset: market.asset,
          strikeRaw: market.strikeRaw,
          mode: 'fixed',
          tradingStartSec: 0,
          expirySec: market.expirySec,
          collateral: market.collateral as `0x${string}`,
          indexedStatus: 'Trading',
        },
        quantityRaw: quote.quantityRaw,
        limitPriceRaw: limitRaw,
      });

      if (fill.outcome === 'FAILED') {
        setResult({ ok: false, message: fill.reason ?? 'Order failed.', ...(fill.transactionHash ? { hash: fill.transactionHash } : {}) });
        // A failed leg frees the key: the user may legitimately retry the next window.
        setSubmitted((prev) => {
          const next = new Set(prev);
          next.delete(idempotencyKey);
          return next;
        });
        return;
      }

      if (!isNoteContractConfigured()) {
        setResult({ ok: true, message: 'Leg filled. AnkerNote not deployed for this environment, so no receipt was minted.', ...(fill.transactionHash ? { hash: fill.transactionHash } : {}) });
        return;
      }

      const noteHash = await writeContractAsync({
        abi: ANKER_NOTE_ABI,
        address: ANKER_NOTE_ADDRESS as `0x${string}`,
        functionName: 'subscribe',
        args: [
          quote.principalRaw,
          quote.reserveRaw,
          quote.couponRaw,
          BigInt(market.strikeRaw),
          BigInt(market.strikeRaw),
          BigInt(quote.netAprBps),
          BigInt(market.expirySec),
          [market.marketId],
          [fill.filledRaw],
          [quote.legCostRaw],
        ],
      });
      setResult({ ok: true, message: 'Subscribed. AnkerNote minted.', hash: noteHash });
    } catch (error) {
      setResult({ ok: false, message: error instanceof Error ? error.message : 'Subscribe failed.' });
      setSubmitted((prev) => {
        const next = new Set(prev);
        next.delete(idempotencyKey);
        return next;
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button disabled={!connected || !quote.executable || pending || alreadySubmitted} onClick={subscribe}>
        {pending ? 'Submitting…' : alreadySubmitted ? 'Submitted for this window' : connected ? 'Subscribe' : 'Connect wallet to subscribe'}
      </Button>
      {result && (
        <p className={result.ok ? 'di-hint' : 'di-error'}>
          {result.message}{' '}
          {result.hash && (
            <a href={explorerTx(result.hash)} target="_blank" rel="noreferrer">
              View transaction
            </a>
          )}
        </p>
      )}
    </>
  );
}
