// No 'use client' — pure presentational primitive, stays universal (see Button.tsx).
import type { HTMLAttributes } from 'react';

export type CardVariant = 'default' | 'empty' | 'error';
export type CardElement = 'div' | 'article' | 'section';

/**
 * Card / Panel — the "sticker" surface (paper bg, navy border, hard shadow).
 *
 * Deliberately reuses the existing `.detail-panel` class as its styling
 * contract rather than introducing a new namespaced class. Reason: the generic
 * state modifiers (`.empty-preview`, `.error-panel`) and feature modifiers
 * (`.return-overview-panel`, …) in styles.css intentionally *override*
 * `.detail-panel` via cascade order. A new base class imported after styles.css
 * would win over those overrides and silently break the dashed/coral/copper
 * cards. The win here is the component layer (typed, single source, variants),
 * not relocating already-clean, token-driven CSS.
 */
const VARIANT_CLASS: Record<CardVariant, string> = {
  default: '',
  empty: 'empty-preview',
  error: 'error-panel',
};

export function cardClassName({
  variant = 'default',
  className,
}: {
  variant?: CardVariant;
  className?: string;
} = {}): string {
  return ['detail-panel', VARIANT_CLASS[variant], className].filter(Boolean).join(' ');
}

export interface CardProps extends HTMLAttributes<HTMLElement> {
  /** Rendered element. Cards are usually `article` (self-contained) or `div`. */
  as?: CardElement;
  /** Generic state variant. Feature-specific looks go through `className`. */
  variant?: CardVariant;
}

export function Card({ as: Tag = 'div', variant = 'default', className, ...rest }: CardProps) {
  return <Tag className={cardClassName({ variant, className })} {...rest} />;
}
