// Presentational — success card shown after a subscribe transaction is
// confirmed on-chain. The Note object id is not available at this moment
// (it only arrives with the portfolio refetch), so the card shows the terms
// captured in the quote plus the transaction digest.
import { copyForLocale, DEFAULT_LOCALE, formattersForLocale, localizedPath, type Locale } from '../i18n';
import type { StructuredProductQuote } from '../products/types';
import { buttonClassName, Dialog, KeyValue, KeyValueList } from '../ui';
import { shortId, suiExplorerTxUrl } from './PortfolioFormat';

export function SubscribeSuccessDialog({
  quote,
  digest,
  locale = DEFAULT_LOCALE,
  onClose,
}: {
  quote: StructuredProductQuote;
  /** Digest of the confirmed subscribe transaction; null keeps the dialog closed. */
  digest: string | null;
  locale?: Locale;
  onClose: () => void;
}) {
  if (!digest) return null;
  const copy = copyForLocale(locale);
  const dialogCopy = copy.execution.successDialog;
  const fmt = formattersForLocale(locale);
  const asset = quote.quoteAsset ?? 'dUSDC';

  return (
    <Dialog open onClose={onClose} ariaLabel={dialogCopy.title} closeLabel={copy.common.close}>
      <div className="success-dialog">
        <span className="success-dialog-check" aria-hidden="true">
          ✓
        </span>
        <h3 className="success-dialog-title">{dialogCopy.title}</h3>
        <p className="success-dialog-intro">{dialogCopy.intro}</p>
        <p className="success-dialog-product">{quote.title}</p>
        <KeyValueList className="success-dialog-terms">
          <KeyValue label={dialogCopy.principal} value={`${fmt.cashAmount(quote.principal)} ${asset}`} />
          {quote.targetPrice ? <KeyValue label={dialogCopy.targetPrice} value={fmt.usd(quote.targetPrice)} /> : null}
          <KeyValue label={dialogCopy.settlement} value={fmt.expiry(quote.oracle.expiryMs)} />
          <KeyValue label={dialogCopy.coupon} value={`${fmt.cashAmount(quote.coupon)} ${asset}`} tone="good" />
          <KeyValue label={dialogCopy.apr} value={fmt.apr(quote.apr)} tone="good" />
        </KeyValueList>
        <a className="success-dialog-tx" href={suiExplorerTxUrl(digest)} target="_blank" rel="noreferrer">
          {dialogCopy.viewTransaction} — {shortId(digest)}
        </a>
        <a className={buttonClassName({ className: 'success-dialog-cta' })} href={localizedPath(locale, '/app/portfolio')}>
          {copy.execution.viewPortfolio}
        </a>
      </div>
    </Dialog>
  );
}
