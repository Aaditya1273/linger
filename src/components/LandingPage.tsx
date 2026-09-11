'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, BookOpen, Layers, LineChart, Lock, ShieldCheck, Zap } from 'lucide-react';
import Link from 'next/link';
import { useScrollReveal } from '../hooks/useScrollReveal';
import { copyForLocale, DEFAULT_LOCALE, localizedPath, type Locale } from '../i18n';
import { EXPLORER, SOMNIA_CHAIN } from '../wallet/config';
import { ANKER_NOTE_ADDRESS, isNoteContractConfigured } from '../wallet/ankerNote';
import { SocialLinks } from './SocialLinks';

/** Proven on-chain — the real artefacts, not placeholders. */
const PROOF = {
  orderTx: '0x2d9d2788b74f8c8e916e07c4f4de8605b3da22f959b25f46c8e581466b985f46',
  deployTx: '0x442536b7245a17d9e775fa62a642a845fea438f081382eba851f7b5f8787139b',
} as const;

interface MarketsResponse {
  markets: Array<{ strikeRaw: string; askRaw: string | null; expirySec: number }>;
}

export function LandingPage({ locale = DEFAULT_LOCALE }: { locale?: Locale }) {
  useScrollReveal();
  const copy = copyForLocale(locale);
  const appHref = localizedPath(locale, '/app/dual-investment');
  const analyticsHref = localizedPath(locale, '/analytics');

  // Live count, so the hero states a fact rather than a boast. Failure is silent:
  // a marketing page must never show an error card.
  const { data } = useQuery<MarketsResponse>({
    queryKey: ['landing-markets'],
    queryFn: async () => (await fetch('/api/markets')).json(),
    refetchInterval: 30_000,
    retry: false,
  });
  const liveCount = data?.markets?.length ?? null;

  return (
    <div className="page lp">
      <nav className="lp-nav">
        <Link href={appHref} className="brand" style={{ textDecoration: 'none' }}>
          <span className="brand-word">Anker Protocol</span>
          <sup className="brand-sup">testnet</sup>
        </Link>
        <div className="lp-nav-links">
          <a href="#how">How it works</a>
          <a href="#dreamdex">DreamDEX</a>
          <a href="#proof">Proof</a>
          <Link href={analyticsHref}>Analytics</Link>
        </div>
        <ConnectButton showBalance={false} accountStatus="avatar" chainStatus="none" />
      </nav>

      <header className="lp-hero">
        <span className="lp-orb lp-orb-a" aria-hidden="true" />
        <span className="lp-orb lp-orb-b" aria-hidden="true" />
        <span className="lp-orb lp-orb-c" aria-hidden="true" />
        <div className="lp-shell">
          <span className="lp-eyebrow reveal">
            <span className="dot" aria-hidden="true" />
            {liveCount === null
              ? `Live on ${SOMNIA_CHAIN.name}`
              : `${liveCount} live Event Contract${liveCount === 1 ? '' : 's'} on Somnia`}
          </span>

          <h1 className="lp-title reveal" style={{ '--reveal-delay': '60ms' } as React.CSSProperties}>
            Earn a coupon on USDso.
            <br />
            <span className="accent">Keep your keys.</span>
          </h1>

          <p className="lp-sub reveal" style={{ '--reveal-delay': '140ms' } as React.CSSProperties}>
            Dual Investment — the structured-yield product every major exchange sells — rebuilt on Somnia from DreamDEX
            Event Contracts. Your principal never enters an Anker account, your downside is capped before you sign, and
            every leg is a public order book you can inspect.
          </p>

          <div className="lp-cta-row reveal" style={{ '--reveal-delay': '220ms' } as React.CSSProperties}>
            <ConnectButton label="Connect wallet to start" showBalance={false} chainStatus="none" />
            <Link href={analyticsHref} className="btn btn-secondary">
              <LineChart size={16} /> See the benchmark
            </Link>
          </div>
          <p className="lp-cta-note reveal" style={{ '--reveal-delay': '280ms' } as React.CSSProperties}>
            Any EVM wallet · no sign-up, no password · Somnia Shannon testnet ({SOMNIA_CHAIN.id})
          </p>
        </div>
      </header>

      <div className="lp-ticker" aria-hidden="true">
        <div className="lp-ticker-track">
          {[0, 1].map((copyIndex) => (
            <span key={copyIndex} style={{ display: 'flex', gap: 'var(--space-8)' }}>
              <span>Downside capped at the <b>option budget</b></span>
              <span>Orders are <b>IOC</b> — fill now or fail clean</span>
              <span>Every leg priced off a <b>live order book</b></span>
              <span>Position is a <b>wallet-owned NFT</b></span>
              <span>Benchmarked vs <b>Binance &amp; Polymarket</b></span>
              <span>Fee on <b>coupon only</b>, never principal</span>
            </span>
          ))}
        </div>
      </div>

      <section className="lp-section" id="how">
        <div className="lp-shell">
          <div className="lp-section-head reveal">
            <h2>Three steps, one transaction each</h2>
            <p>No deposits into a protocol account. No lock-up you cannot see the end of.</p>
          </div>
          <div className="lp-grid lp-grid-3">
            {[
              {
                icon: <Layers size={20} />,
                title: 'Pick a target and a window',
                body: 'Choose how much USDso to commit and a BTC target price. Anker reads the live DreamDEX order book and shows the coupon, the odds of earning it, and the exact worst case before you sign.',
              },
              {
                icon: <Zap size={20} />,
                title: 'Subscribe in one signature',
                body: 'Anker crosses a single Event Contract leg with an immediate-or-cancel order, then mints an AnkerNote recording every term. If the leg does not fill, nothing is minted and you keep your funds.',
              },
              {
                icon: <ShieldCheck size={20} />,
                title: 'Settle and claim',
                body: 'At expiry the market resolves on-chain. Above your target you take principal plus coupon; below it you keep principal minus the option budget — the only amount ever at risk.',
              },
            ].map((step, index) => (
              <article
                key={step.title}
                className="lp-card reveal"
                style={{ '--reveal-delay': `${index * 90}ms` } as React.CSSProperties}
              >
                <span className="lp-step-n">{index + 1}</span>
                <h3>
                  {step.icon} {step.title}
                </h3>
                <p>{step.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-section" style={{ background: 'var(--paper-2)' }}>
        <div className="lp-shell">
          <div className="lp-section-head reveal">
            <h2>You see the whole payoff before you commit</h2>
            <p>
              A worked example on 100 USDso with a 2% option budget. Both branches are shown — the good one is never the
              only number on screen.
            </p>
          </div>
          <div className="lp-grid lp-grid-2">
            <div className="lp-payoff reveal">
              <div className="lp-payoff-row win">
                <span>
                  <strong>BTC at or above target</strong>
                  <br />
                  <span className="lp-payoff-label">Principal returns, coupon is yours</span>
                </span>
                <strong>100 + coupon</strong>
              </div>
              <div className="lp-payoff-row">
                <span>
                  <strong>BTC below target</strong>
                  <br />
                  <span className="lp-payoff-label">Only the option budget is lost</span>
                </span>
                <strong>98.00</strong>
              </div>
              <div className="lp-payoff-row">
                <span>
                  <strong>Leg never fills</strong>
                  <br />
                  <span className="lp-payoff-label">IOC cancels, nothing is minted</span>
                </span>
                <strong>100.00</strong>
              </div>
            </div>
            <article className="lp-card reveal" style={{ '--reveal-delay': '90ms' } as React.CSSProperties}>
              <h3>
                <Lock size={20} /> Why the odds are on screen
              </h3>
              <p>
                A binary&apos;s price <em>is</em> its probability. A 98% coupon at a 2% chance is fair pricing, not free
                money — so Anker shows the coupon and the chance of earning it side by side, always. A bigger coupon
                always means a smaller chance, and hiding that would turn a quote into a promise.
              </p>
              <p style={{ marginTop: 'var(--space-4)' }}>
                Tenors on Shannon are minutes, so the annualised figure is shown as <code>n/a</code> rather than a
                seven-figure number that is arithmetically true and practically meaningless.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="lp-section" id="dreamdex">
        <div className="lp-shell">
          <div className="lp-section-head reveal">
            <h2>Built on DreamDEX Event Contracts</h2>
            <p>The Event Contract is not a price feed Anker reads. It is the thing that pays the user.</p>
          </div>
          <div className="lp-grid lp-grid-3">
            {[
              {
                title: 'The discount is the yield',
                body: 'Buying a YES outcome at 0.968 means paying 0.968 for 1.00 of payout. That 3.2¢ gap is the entire coupon. No DreamDEX, no product.',
              },
              {
                title: 'One book, two sides',
                body: 'A binary market has a single YES book; NO is that book inverted, tied together by complete sets — 1 USDso ⇌ 1 YES + 1 NO. Anker reads the ask in raw integer units, never a rounded float.',
              },
              {
                title: 'Markets die and respawn',
                body: 'A settled market leaves the live list entirely, so the portfolio reads a separate past tier. Pools are recycled between markets, so everything is keyed by market id.',
              },
            ].map((item, index) => (
              <article
                key={item.title}
                className="lp-card reveal"
                style={{ '--reveal-delay': `${index * 90}ms` } as React.CSSProperties}
              >
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-section" id="proof" style={{ background: 'var(--paper-2)' }}>
        <div className="lp-shell">
          <div className="lp-section-head reveal">
            <h2>Live on Shannon, not a mock</h2>
            <p>Every artefact below is on-chain right now. Check them yourself.</p>
          </div>
          <dl className="lp-proof reveal">
            <div className="lp-proof-row">
              <dt>AnkerNote contract</dt>
              <dd>
                {isNoteContractConfigured() ? (
                  <a href={`${EXPLORER}/address/${ANKER_NOTE_ADDRESS}`} target="_blank" rel="noreferrer">
                    {ANKER_NOTE_ADDRESS} <ArrowUpRight size={12} />
                  </a>
                ) : (
                  'not configured for this deployment'
                )}
              </dd>
            </div>
            <div className="lp-proof-row">
              <dt>Real filled order</dt>
              <dd>
                <a href={`${EXPLORER}/tx/${PROOF.orderTx}`} target="_blank" rel="noreferrer">
                  {PROOF.orderTx} <ArrowUpRight size={12} />
                </a>
              </dd>
            </div>
            <div className="lp-proof-row">
              <dt>Contract deployment</dt>
              <dd>
                <a href={`${EXPLORER}/tx/${PROOF.deployTx}`} target="_blank" rel="noreferrer">
                  {PROOF.deployTx} <ArrowUpRight size={12} />
                </a>
              </dd>
            </div>
            <div className="lp-proof-row">
              <dt>Network</dt>
              <dd>
                {SOMNIA_CHAIN.name} · chainId {SOMNIA_CHAIN.id} · collateral is 6-decimal USDso
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="lp-section">
        <div className="lp-shell">
          <div className="lp-close reveal">
            <h2>Your wallet is the only account you need</h2>
            <p>
              Connect any EVM wallet to open the live ladder. Nothing is deposited, nothing is custodied, and you can
              disconnect at any time.
            </p>
            <div className="lp-cta-row">
              <ConnectButton label="Connect wallet" showBalance={false} chainStatus="none" />
              <Link href={analyticsHref} className="btn btn-secondary">
                <BookOpen size={16} /> Read the methodology
              </Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="lp-foot">
        <div className="lp-shell">
          <p>{copy.common.copyright}</p>
          <SocialLinks locale={locale} />
        </div>
      </footer>
    </div>
  );
}
