'use client';

import { useEffect, useRef, useState } from 'react';

// Same phone breakpoint as src/mobile.css — the two must move together.
const PHONE_QUERY = '(max-width: 767px)';
/** Release past this pull distance triggers a refresh. */
const PULL_TRIGGER_PX = 64;
/** The indicator stops following the finger here — the gesture has an end. */
const PULL_MAX_PX = 96;
/** Finger travel is damped so the indicator feels weighted, not glued. */
const PULL_DAMPING = 0.45;

export interface PullToRefresh {
  /** Damped pull distance in px — drives the indicator transform. */
  pullPx: number;
  /** True from a triggering release until the refresh promise settles. */
  refreshing: boolean;
}

/**
 * Phone-only pull-to-refresh on the page scroll. The gesture only arms when
 * the touch starts with the page at the very top and no dialog holds the
 * body scroll lock, so list scrolling and sheet gestures never trigger it.
 * The page never translates — only the indicator follows the pull — which
 * keeps the implementation passive (no preventDefault fights with the
 * browser's own overscroll).
 */
export function usePullToRefresh(onRefresh: () => Promise<unknown>): PullToRefresh {
  const [pullPx, setPullPx] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startYRef = useRef<number | null>(null);
  const pullPxRef = useRef(0);
  const refreshingRef = useRef(false);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    if (typeof window.matchMedia !== 'function' || !window.matchMedia(PHONE_QUERY).matches) return;

    function setPull(next: number) {
      pullPxRef.current = next;
      setPullPx(next);
    }

    function handleTouchStart(event: TouchEvent) {
      if (refreshingRef.current || window.scrollY > 0) return;
      // The dialog primitive locks body scroll while a sheet is open —
      // pulling inside a sheet must not refresh the page underneath.
      if (document.body.style.overflow === 'hidden') return;
      startYRef.current = event.touches[0]?.clientY ?? null;
    }

    function handleTouchMove(event: TouchEvent) {
      if (startYRef.current === null || refreshingRef.current) return;
      const y = event.touches[0]?.clientY;
      if (y === undefined) return;
      const delta = y - startYRef.current;
      if (delta <= 0 || window.scrollY > 0) {
        setPull(0);
        return;
      }
      setPull(Math.min(Math.round(delta * PULL_DAMPING), PULL_MAX_PX));
    }

    function handleTouchEnd() {
      const armed = startYRef.current !== null;
      startYRef.current = null;
      const pulled = pullPxRef.current;
      setPull(0);
      if (!armed || refreshingRef.current || pulled < PULL_TRIGGER_PX) return;
      refreshingRef.current = true;
      setRefreshing(true);
      void onRefreshRef.current().finally(() => {
        refreshingRef.current = false;
        setRefreshing(false);
      });
    }

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleTouchEnd);
    window.addEventListener('touchcancel', handleTouchEnd);
    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, []);

  return { pullPx, refreshing };
}
