'use client';

import { copyForLocale, DEFAULT_LOCALE, formattersForLocale, type Locale } from '../i18n';
import { utcOffsetLabel } from '../i18n/formatters';
import type { CuratedOracleListItem } from '../server/curatedOracles';
import { SheetSelect } from './SheetSelect';

export interface SettlementGroup {
  key: string;
  label: string;
  rows: CuratedOracleListItem[];
}

/** One row's display pair — bold countdown plus compact 24h settle moment. */
function rowParts(oracle: CuratedOracleListItem, locale: Locale) {
  const format = formattersForLocale(locale);
  return { countdown: format.timeToExpiry(oracle.expiry), settlesAt: format.expiryCompact(oracle.expiry) };
}

/** Settlement-date picker — the SheetSelect shell fed with oracle expiries. */
export function SettlementSelect({
  value,
  groups,
  onSelect,
  locale = DEFAULT_LOCALE,
}: {
  value: string;
  groups: SettlementGroup[];
  onSelect: (oracleId: string) => void;
  locale?: Locale;
}) {
  const copy = copyForLocale(locale);
  const rows = groups.flatMap((group) => group.rows);
  const selected = rows.find((oracle) => oracle.oracle_id === value);
  const selectedParts = selected ? rowParts(selected, locale) : null;
  // The sheet covers the section label that carries the offset on desktop, so
  // it repeats the disclosure in its own header.
  const zoneNote = rows.length > 0 ? copy.dualInvestment.settlementTimesNote(utcOffsetLabel(rows[0].expiry)) : null;

  return (
    <SheetSelect
      className="di-settlement"
      value={value}
      onSelect={onSelect}
      label={copy.dualInvestment.settlementDate}
      closeLabel={copy.common.close}
      disabled={rows.length === 0}
      triggerValue={selectedParts ? `${selectedParts.countdown} · ${selectedParts.settlesAt}` : '--'}
      sheetNote={zoneNote}
      groups={groups.map((group) => ({
        key: group.key,
        label: group.label,
        options: group.rows.map((oracle) => {
          const parts = rowParts(oracle, locale);
          return { id: oracle.oracle_id, primary: parts.countdown, secondary: parts.settlesAt };
        }),
      }))}
    />
  );
}
