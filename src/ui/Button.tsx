// No 'use client': this is a pure presentational primitive (no hooks / browser
// APIs), so it stays universal — server components can call buttonClassName()
// and render <Button>, client components can pass it onClick. Marking it
// 'use client' would turn every export into a client-reference stub and break
// buttonClassName() when called during server rendering.
import type { ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'primary' | 'secondary';
export type ButtonSize = 'sm' | 'md';

/**
 * Class string for the Button look. Exposed separately so non-button elements
 * (e.g. a Next `<Link>`) can wear the same styling without coupling the Button
 * component to next/link.
 *
 *   <Link className={buttonClassName()} href="/app">Launch app</Link>
 */
export function buttonClassName({
  variant = 'primary',
  size = 'md',
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}): string {
  return ['anker-btn', `anker-btn--${variant}`, `anker-btn--${size}`, className]
    .filter(Boolean)
    .join(' ');
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

/**
 * Presentational button. Pure props in → markup out: no data fetching, wallet,
 * or routing. Renders a native `<button>` (defaults to `type="button"`).
 */
export function Button({ variant = 'primary', size = 'md', className, type = 'button', ...rest }: ButtonProps) {
  return <button type={type} className={buttonClassName({ variant, size, className })} {...rest} />;
}
