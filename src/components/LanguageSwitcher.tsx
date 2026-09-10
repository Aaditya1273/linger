'use client';

import { Check, ChevronDown, Globe } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import {
  copyForLocale,
  localeLabel,
  localeShortLabel,
  localizedPath,
  SUPPORTED_LOCALES,
  type Locale,
} from '../i18n';

export function LanguageSwitcher({ locale, currentPath }: { locale: Locale; currentPath: string }) {
  const copy = copyForLocale(locale);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="language-switcher" ref={rootRef}>
      <button
        type="button"
        className="language-switcher-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={copy.common.languageSwitch}
        onClick={() => setOpen((value) => !value)}
      >
        <Globe size={15} aria-hidden="true" />
        <span>{localeShortLabel(locale)}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open ? (
        <div className="language-switcher-menu" role="menu" id={menuId}>
          {SUPPORTED_LOCALES.map((nextLocale) => {
            const isCurrent = nextLocale === locale;
            return (
              <Link
                key={nextLocale}
                role="menuitem"
                href={localizedPath(nextLocale, currentPath)}
                aria-current={isCurrent ? 'true' : undefined}
                className={isCurrent ? 'is-active' : undefined}
                onClick={() => setOpen(false)}
              >
                <span>{localeLabel(nextLocale)}</span>
                {isCurrent ? <Check size={14} aria-hidden="true" /> : null}
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
