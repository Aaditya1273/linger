'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { ArrowDownUp, Briefcase, ChartLine } from 'lucide-react';
import { copyForLocale, DEFAULT_LOCALE, localizedPath, type Locale } from '../i18n';
import { LanguageSwitcher } from './LanguageSwitcher';

export type ActiveProduct = 'dual-investment' | 'portfolio' | 'analytics';

// ssr:false — wagmi reads window.ethereum, which does not exist on the server.
const WalletButton = dynamic(() => import('./WalletButton').then((m) => m.WalletButton), { ssr: false });

function currentPathForActiveProduct(activeProduct: ActiveProduct | undefined) {
  if (activeProduct === 'portfolio') return '/app/portfolio';
  if (activeProduct === 'dual-investment') return '/app/dual-investment';
  if (activeProduct === 'analytics') return '/analytics';
  return '/app';
}

export function AppHeader({
  activeProduct,
  locale = DEFAULT_LOCALE,
}: {
  activeProduct?: ActiveProduct;
  locale?: Locale;
}) {
  const copy = copyForLocale(locale);
  return (
    <header className="top-nav">
      {/* Inner container: the bar itself is full-bleed so its background and
          border reach the viewport edges, but its CONTENTS align to the same
          1180px column as the page below. Without this the brand sat at x=28
          while the content started at x=357, and the app read as two layouts. */}
      <div className="top-nav-inner">
      <Link className="brand-mark" href={localizedPath(locale, '/app')}>
        <span className="anchor-mark" />
        {/* Own span so the wordmark can ellipsize instead of sliding under
            the header actions on narrow phones. */}
        <span className="brand-word">{copy.common.brand}</span>
        <sup className="brand-env-tag">{copy.common.testnetTag}</sup>
      </Link>
      <nav className="product-nav" aria-label={copy.appHeader.productsLabel}>
        <Link
          className={activeProduct === 'dual-investment' ? 'active' : ''}
          aria-current={activeProduct === 'dual-investment' ? 'page' : undefined}
          href={localizedPath(locale, '/app/dual-investment')}
        >
          <ArrowDownUp size={15} aria-hidden="true" />
          {copy.common.dualInvestment}
        </Link>
        <Link
          className={activeProduct === 'portfolio' ? 'active' : ''}
          aria-current={activeProduct === 'portfolio' ? 'page' : undefined}
          href={localizedPath(locale, '/app/portfolio')}
        >
          <Briefcase size={15} aria-hidden="true" />
          {copy.common.portfolio}
        </Link>
        <Link
          className={activeProduct === 'analytics' ? 'active' : ''}
          aria-current={activeProduct === 'analytics' ? 'page' : undefined}
          href={localizedPath(locale, '/analytics')}
        >
          <ChartLine size={15} aria-hidden="true" />
          {copy.common.analytics}
        </Link>
      </nav>
      <div className="top-nav-actions">
        <LanguageSwitcher locale={locale} currentPath={currentPathForActiveProduct(activeProduct)} />
        <div className="wallet-area">
          <WalletButton />
        </div>
      </div>
      </div>
    </header>
  );
}
