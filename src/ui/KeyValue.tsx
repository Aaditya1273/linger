// Pure presentational primitive — universal (no 'use client').
// Reuses the existing, already-clean `.oracle-meta` styling (Card pattern).
import type { HTMLAttributes, ReactNode } from 'react';

export function KeyValueList({ children, className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={['oracle-meta', className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </div>
  );
}

export interface KeyValueProps {
  label: ReactNode;
  value: ReactNode;
  /** Optional value-text tone (maps to the validation-* colour scale). */
  tone?: 'good' | 'warn' | 'neutral';
}

/** A single key → value row. Place inside <KeyValueList>. */
export function KeyValue({ label, value, tone }: KeyValueProps) {
  return (
    <div>
      <span>{label}</span>
      <dd className={tone ? `validation-${tone}` : undefined}>{value}</dd>
    </div>
  );
}
