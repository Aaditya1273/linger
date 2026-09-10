// Pure presentational primitive — universal (no 'use client').
import type { HTMLAttributes } from 'react';

/** The design system's single status vocabulary. Used by Badge (and KeyValue value tone). */
export type Tone = 'neutral' | 'positive' | 'warning' | 'danger';

export function badgeClassName({
  tone = 'neutral',
  className,
}: {
  tone?: Tone;
  className?: string;
} = {}): string {
  return ['anker-badge', `anker-badge--${tone}`, className].filter(Boolean).join(' ');
}

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
}

/** Pill status indicator. `tone` carries the meaning; the label is the children. */
export function Badge({ tone = 'neutral', className, ...rest }: BadgeProps) {
  return <span className={badgeClassName({ tone, className })} {...rest} />;
}
