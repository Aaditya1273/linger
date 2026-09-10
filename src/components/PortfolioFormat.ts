import { DEFAULT_LOCALE, formattersForLocale, type Locale } from '../i18n';

export function formatAmount(value: number, locale: Locale = DEFAULT_LOCALE) {
  return formattersForLocale(locale).amount(value);
}

export function formatPrice(value: number, locale: Locale = DEFAULT_LOCALE) {
  return formattersForLocale(locale).usd(value);
}

export function formatApr(value: number, locale: Locale = DEFAULT_LOCALE) {
  return formattersForLocale(locale).apr(value);
}

export function formatCashAmount(value: number, locale: Locale = DEFAULT_LOCALE) {
  return formattersForLocale(locale).cashAmount(value);
}

export function formatBtcAmount(value: number, locale: Locale = DEFAULT_LOCALE) {
  return formattersForLocale(locale).btcAmount(value);
}

export function formatBtcAmountCompact(value: number, locale: Locale = DEFAULT_LOCALE) {
  return formattersForLocale(locale).btcAmountCompact(value);
}

export function formatQuoteBaseUnits(value: bigint, locale: Locale = DEFAULT_LOCALE) {
  return formattersForLocale(locale).quoteBaseUnits(value);
}

export function formatPercent(value: number | null, locale: Locale = DEFAULT_LOCALE, checkingLabel = 'Checking') {
  if (value === null) return checkingLabel;
  return formattersForLocale(locale).percent(value);
}

export function formatExpiry(value: number, locale: Locale = DEFAULT_LOCALE) {
  return formattersForLocale(locale).expiry(value);
}

export function formatOracleTimestamp(value: number, locale: Locale = DEFAULT_LOCALE) {
  return formattersForLocale(locale).oracleTimestamp(value);
}

export function shortId(value: string) {
  return value ? `${value.slice(0, 8)}...${value.slice(-6)}` : '--';
}

/** Wallet addresses use one compact shape everywhere: first 6, last 4. */
export function shortAddress(value: string) {
  if (!value) return '--';
  return value.length > 10 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value;
}

const SUI_EXPLORER_BASE = 'https://testnet.suivision.xyz';

export function suiExplorerTxUrl(digest: string) {
  return `${SUI_EXPLORER_BASE}/txblock/${digest}`;
}

export function suiExplorerObjectUrl(objectId: string) {
  return `${SUI_EXPLORER_BASE}/object/${objectId}`;
}

/** The account page — the user's full on-chain history in one place. */
export function suiExplorerAddressUrl(address: string) {
  return `${SUI_EXPLORER_BASE}/account/${address}`;
}
