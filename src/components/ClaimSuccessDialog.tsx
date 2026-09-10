// Presentational — success card shown after a claim transaction executes
// on-chain. Amounts are captured at claim time (the note is optimistically
// marked claimed right after), so the card owns its own snapshot of the
// settlement instead of re-deriving it from the mutating note.
import { copyForLocale, DEFAULT_LOCALE, formattersForLocale, type Locale } from '../i18n';
import type { AnkerProductNoteRecord } from '../sui/ankerPortfolio';
import { Button, Dialog, KeyValue, KeyValueList } from '../ui';
import { shortId, suiExplorerTxUrl } from './PortfolioFormat';

export interface ClaimSuccessSummary {
  digest: string;
  grossPayout: number;
  feeAmount: number;
  netPayout: number;
  settlementPrice: number;
}

export function ClaimSuccessDialog({
  note,
  success,
  locale = DEFAULT_LOCALE,
  onClose,
}: {
  note: Pick<AnkerProductNoteRecord, 'principal' | 'targetPrice' | 'coupon'>;
  /** Settlement snapshot of the confirmed claim; null keeps the dialog closed. */
  success: ClaimSuccessSummary | null;
  locale?: Locale;
  onClose: () => void;
}) {
  if (!success) return null;
  const copy = copyForLocale(locale);
  const dialogCopy = copy.portfolio.claim.successDialog;
  const fmt = formattersForLocale(locale);
  // Same rule as the portfolio card: the deposit converted iff the market
  // fixed below the target. Payout size can't decide this — a settle just
  // under the target still pays above the principal once the coupon lands.
  // Only the deposit converts — the coupon reward stays a dUSDC amount on top.
  const converted = success.settlementPrice < note.targetPrice;
  const btcAmount = note.targetPrice > 0 ? note.principal / note.targetPrice : 0;
  const outcome = converted
    ? dialogCopy.outcomeConverted(
        fmt.usd(success.settlementPrice),
        fmt.usd(note.targetPrice),
        fmt.btcAmount(btcAmount),
        fmt.cashAmount(note.coupon - success.feeAmount),
      )
    : dialogCopy.outcomeReturned(fmt.usd(success.settlementPrice));

  return (
    <Dialog open onClose={onClose} ariaLabel={dialogCopy.title} closeLabel={copy.common.close}>
      <div className="success-dialog">
        <span className="success-dialog-check" aria-hidden="true">
          ✓
        </span>
        <h3 className="success-dialog-title">{dialogCopy.title}</h3>
        <p className="success-dialog-intro">{dialogCopy.received}</p>
        <strong className="success-dialog-hero">{fmt.cashAmount(success.netPayout)} dUSDC</strong>
        <KeyValueList className="success-dialog-terms">
          <KeyValue label={dialogCopy.grossPayout} value={`${fmt.cashAmount(success.grossPayout)} dUSDC`} />
          <KeyValue label={dialogCopy.performanceFee} value={`−${fmt.cashAmount(success.feeAmount)} dUSDC`} />
        </KeyValueList>
        <p className="success-dialog-outcome">{outcome}</p>
        <a className="success-dialog-tx" href={suiExplorerTxUrl(success.digest)} target="_blank" rel="noreferrer">
          {dialogCopy.viewTransaction} — {shortId(success.digest)}
        </a>
        <Button className="success-dialog-cta" onClick={onClose}>
          {dialogCopy.done}
        </Button>
      </div>
    </Dialog>
  );
}
