// Pure presentational primitive — universal (no 'use client').
// Reuses the existing, already-clean `.di-position-stats` styling (Card pattern).
import type { ReactNode } from 'react';

export function StatGroup({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={['di-position-stats', className].filter(Boolean).join(' ')}>{children}</div>;
}

export interface StatProps {
  label: ReactNode;
  value: ReactNode;
  /** Optional secondary line under the value (rendered as the `<em>` accent). */
  sub?: ReactNode;
  /** Optional muted one-liner under the value (rendered as `<small>`). */
  hint?: ReactNode;
}

/** A single label / value / optional-sub metric. Place inside <StatGroup>. */
export function Stat({ label, value, sub, hint }: StatProps) {
  return (
    <div>
      <span>{label}</span>
      <strong>
        {value}
        {sub ? <em>{sub}</em> : null}
      </strong>
      {hint ? <small>{hint}</small> : null}
    </div>
  );
}
