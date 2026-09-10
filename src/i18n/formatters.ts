import type { Locale } from './locales';

export type LocaleFormatters = ReturnType<typeof formattersForLocale>;

function numberLocale(locale: Locale) {
  return locale === 'zh-CN' ? 'zh-CN' : 'en-US';
}

export function formatInteger(value: number, locale: Locale) {
  return value.toLocaleString(numberLocale(locale), { maximumFractionDigits: 0 });
}

export function formatAmount(value: number, locale: Locale) {
  return value.toLocaleString(numberLocale(locale), { maximumFractionDigits: 2 });
}

export function formatUsd(value: number, locale: Locale, options?: Intl.NumberFormatOptions) {
  return `$${value.toLocaleString(numberLocale(locale), { maximumFractionDigits: 0, ...options })}`;
}

/**
 * dUSDC cash amounts display with exactly two decimals everywhere (the cents
 * convention); a nonzero amount that would round to 0.00 shows as "<0.01" so
 * tiny fees never read as free.
 */
export function formatCashAmount(value: number, locale: Locale) {
  if (value !== 0 && Math.abs(value) < 0.005) return '<0.01';
  return value.toLocaleString(numberLocale(locale), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** BTC amounts display with at most six decimals (e.g. 0.123456) everywhere. */
export function formatBtcAmount(value: number, locale: Locale) {
  return value.toLocaleString(numberLocale(locale), { maximumFractionDigits: 6 });
}

/** Same six-decimal cap as formatBtcAmount (kept for call-site clarity on compact rows). */
export function formatBtcAmountCompact(value: number, locale: Locale) {
  return formatBtcAmount(value, locale);
}

export function formatFixedTokenAmount(value: number, decimals: number, locale: Locale) {
  return value.toLocaleString(numberLocale(locale), {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  });
}

export function formatPercent(value: number, locale: Locale, options?: Intl.NumberFormatOptions) {
  return `${(value * 100).toLocaleString(numberLocale(locale), {
    maximumFractionDigits: 2,
    ...options,
  })}%`;
}

/** Format a fractional period return (e.g. 0.0013) as basis points (e.g. "13 bps"). */
export function formatPeriodReturnBps(periodReturn: number, locale: Locale) {
  const bps = periodReturn * 10_000;
  const formatted = bps.toLocaleString(numberLocale(locale), {
    maximumFractionDigits: bps >= 10 ? 0 : 1,
    minimumFractionDigits: 0,
  });
  return locale === 'zh-CN' ? `${formatted} 基点` : `${formatted} bps`;
}

export function formatApr(value: number, locale: Locale) {
  return formatPercent(value, locale);
}

/** Edge in percentage points, e.g. "+10.00 pts" / "−5.00 pts". */
export function formatEdgePts(value: number, locale: Locale) {
  const sign = value > 0 ? '+' : '';
  return `${sign}${(value * 100).toLocaleString(numberLocale(locale), {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })} pts`;
}

export function formatReferenceApr(value: number, locale: Locale) {
  return formatPercent(value, locale, { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

export function formatQuoteBaseUnits(value: bigint, locale: Locale = 'en') {
  // Round half-up to cents in bigint space; base units are 1e6 per dUSDC.
  const centsPerUnit = 10_000n;
  const cents = (value + centsPerUnit / 2n) / centsPerUnit;
  if (value !== 0n && cents === 0n) return '<0.01';
  const whole = cents / 100n;
  const fraction = (cents % 100n).toString().padStart(2, '0');
  return `${whole.toLocaleString(numberLocale(locale))}.${fraction}`;
}

/**
 * Viewer-timezone UTC-offset annotation for the given instant, e.g. "UTC+8",
 * "UTC-5:30", or "UTC". Computed per-instant so DST transitions stay correct.
 */
export function utcOffsetLabel(value: number): string {
  const offsetMinutes = -new Date(value).getTimezoneOffset();
  if (offsetMinutes === 0) return 'UTC';
  const sign = offsetMinutes > 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  const minutes = abs % 60;
  return `UTC${sign}${Math.floor(abs / 60)}${minutes ? `:${String(minutes).padStart(2, '0')}` : ''}`;
}

/** Settlement instants display in the viewer's local timezone, annotated with the UTC offset. */
export function formatExpiry(value: number, locale: Locale) {
  const text = new Intl.DateTimeFormat(numberLocale(locale), {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value);
  return `${text} (${utcOffsetLabel(value)})`;
}

export function formatOracleTimestamp(value: number, locale: Locale) {
  return formatExpiry(value, locale);
}

/**
 * Tightest settle moment — 24h clock, no UTC offset — for the settlement
 * trigger and option rows, e.g. "Sep 04, 08:00" / "9月04日 08:00". The offset
 * displays once in the picker header instead of on every row.
 */
export function formatExpiryCompact(value: number, locale: Locale) {
  return new Intl.DateTimeFormat(numberLocale(locale), {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(value);
}

/** Compact settle moment for prose, e.g. "Jul 16, 08:00 AM" / "7月16日 08:00". */
export function formatShortDateTime(value: number, locale: Locale) {
  return new Intl.DateTimeFormat(numberLocale(locale), {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value);
}

export function formatChartDate(value: number, locale: Locale) {
  return new Intl.DateTimeFormat(locale === 'zh-CN' ? 'zh-CN' : 'en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  }).format(value);
}

export function formatTime(value: number, locale: Locale) {
  return formatExpiry(value, locale);
}

export function formatTimeToExpiry(expiryMs: number, locale: Locale, nowMs = Date.now()) {
  const totalMinutes = Math.max(0, Math.floor((expiryMs - nowMs) / 60_000));
  const days = Math.floor(totalMinutes / 1_440);
  const hours = Math.floor((totalMinutes % 1_440) / 60);
  const minutes = totalMinutes % 60;
  return locale === 'zh-CN' ? `${days}天 ${hours}小时 ${minutes}分` : `${days}d ${hours}h ${minutes}m`;
}

export function formattersForLocale(locale: Locale) {
  return {
    integer: (value: number) => formatInteger(value, locale),
    usd: (value: number, options?: Intl.NumberFormatOptions) => formatUsd(value, locale, options),
    amount: (value: number) => formatAmount(value, locale),
    cashAmount: (value: number) => formatCashAmount(value, locale),
    btcAmount: (value: number) => formatBtcAmount(value, locale),
    btcAmountCompact: (value: number) => formatBtcAmountCompact(value, locale),
    fixedTokenAmount: (value: number, decimals: number) => formatFixedTokenAmount(value, decimals, locale),
    percent: (value: number, options?: Intl.NumberFormatOptions) => formatPercent(value, locale, options),
    periodReturnBps: (value: number) => formatPeriodReturnBps(value, locale),
    apr: (value: number) => formatApr(value, locale),
    referenceApr: (value: number) => formatReferenceApr(value, locale),
    quoteBaseUnits: (value: bigint) => formatQuoteBaseUnits(value, locale),
    expiry: (value: number) => formatExpiry(value, locale),
    expiryCompact: (value: number) => formatExpiryCompact(value, locale),
    oracleTimestamp: (value: number) => formatOracleTimestamp(value, locale),
    shortDateTime: (value: number) => formatShortDateTime(value, locale),
    chartDate: (value: number) => formatChartDate(value, locale),
    time: (value: number) => formatTime(value, locale),
    timeToExpiry: (expiryMs: number, nowMs = Date.now()) => formatTimeToExpiry(expiryMs, locale, nowMs),
  };
}
