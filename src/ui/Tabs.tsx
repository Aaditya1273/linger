// Pure presentational primitive — universal (no 'use client').
// Reuses the existing `.mode-tabs` styling (Card pattern).
import type { ButtonHTMLAttributes, HTMLAttributes } from 'react';

export function Tabs({ children, className, ...rest }: HTMLAttributes<HTMLElement>) {
  return (
    <nav className={['mode-tabs', className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </nav>
  );
}

/**
 * Class string for a tab item. Exposed separately so a Next `<Link>` tab can
 * wear the same active styling without coupling Tabs to next/link.
 */
export function tabClassName({
  active = false,
  disabled = false,
  className,
}: {
  active?: boolean;
  disabled?: boolean;
  className?: string;
} = {}): string {
  return [active ? 'active' : '', disabled ? 'disabled' : '', className].filter(Boolean).join(' ');
}

export interface TabProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

/** A single tab as a <button>. Use tabClassName() for <Link>-based tabs. */
export function Tab({ active = false, className, type = 'button', ...rest }: TabProps) {
  return <button type={type} className={tabClassName({ active, disabled: rest.disabled, className })} {...rest} />;
}
