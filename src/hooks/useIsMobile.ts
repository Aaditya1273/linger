'use client';

import { useSyncExternalStore } from 'react';

// Same phone breakpoint as src/mobile.css — the two must move together.
const PHONE_QUERY = '(max-width: 767px)';

function subscribe(onStoreChange: () => void) {
  if (typeof window.matchMedia !== 'function') return () => {};
  const mql = window.matchMedia(PHONE_QUERY);
  mql.addEventListener('change', onStoreChange);
  return () => mql.removeEventListener('change', onStoreChange);
}

function getSnapshot() {
  return typeof window.matchMedia === 'function' && window.matchMedia(PHONE_QUERY).matches;
}

/**
 * True on phone viewports. Server-renders false (desktop markup), so use it
 * only where the phone experience needs a genuinely different component tree —
 * pure styling differences belong in mobile.css.
 */
export function useIsMobile() {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
