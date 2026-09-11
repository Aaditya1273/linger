'use client';

import { useEffect } from 'react';

/**
 * The landing page's motion engine: reveals, parallax, and count-ups.
 *
 * One IntersectionObserver and ONE rAF-throttled scroll listener for the whole
 * page. The alternative — a hook per animated element — multiplies listeners and
 * makes the stagger impossible to reason about.
 *
 * Every animated property is `transform` or `opacity`, so nothing here triggers
 * layout or paint; the compositor does the work. Parallax is expressed by writing
 * a single `--p` (progress, -1..1) custom property per element and letting CSS
 * decide what to do with it, which keeps the JS ignorant of the design.
 *
 * `prefers-reduced-motion` short-circuits the whole thing: elements are revealed
 * immediately and no scroll listener is attached at all.
 */
export function useScrollMotion(): void {
  useEffect(() => {
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const revealNodes = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'));
    const parallaxNodes = Array.from(document.querySelectorAll<HTMLElement>('[data-parallax]'));
    const counterNodes = Array.from(document.querySelectorAll<HTMLElement>('[data-count-to]'));

    if (reduced || typeof IntersectionObserver === 'undefined') {
      revealNodes.forEach((n) => n.classList.add('is-in'));
      counterNodes.forEach((n) => {
        n.textContent = n.dataset.countSuffix
          ? `${n.dataset.countTo}${n.dataset.countSuffix}`
          : (n.dataset.countTo ?? '');
      });
      return;
    }

    // --- reveals ----------------------------------------------------------
    const revealObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('is-in');
          // Unobserve: a reveal that replays on every pass reads as a glitch.
          revealObserver.unobserve(entry.target);
        }
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.12 },
    );
    revealNodes.forEach((n) => revealObserver.observe(n));

    // --- count-ups --------------------------------------------------------
    const countObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target as HTMLElement;
          countObserver.unobserve(el);
          const to = Number(el.dataset.countTo ?? '0');
          const decimals = Number(el.dataset.countDecimals ?? '0');
          const suffix = el.dataset.countSuffix ?? '';
          const duration = Number(el.dataset.countDuration ?? '1100');
          const start = performance.now();
          const tick = (now: number) => {
            const t = Math.min(1, (now - start) / duration);
            // easeOutExpo: fast start, long settle — reads as "landing" on a number.
            const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
            el.textContent = `${(to * eased).toFixed(decimals)}${suffix}`;
            if (t < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }
      },
      { threshold: 0.5 },
    );
    counterNodes.forEach((n) => countObserver.observe(n));

    // --- parallax ---------------------------------------------------------
    let frame = 0;
    const update = () => {
      frame = 0;
      const vh = window.innerHeight;

      // Safety net: force-reveal anything we have already scrolled PAST.
      //
      // IntersectionObserver only fires on a sampled frame, so an anchor jump
      // (`#proof`) or a fast flick can carry an element from below the fold to
      // above it without ever reporting it as intersecting. For a fade that is
      // cosmetic, but the `wipe` variant clips to zero width — its content would
      // stay invisible forever. Motion is decoration and must never be able to
      // hide content, so anything past the top counts as revealed.
      for (const node of revealNodes) {
        if (node.classList.contains('is-in')) continue;
        const rect = node.getBoundingClientRect();
        if (rect.bottom < vh * 0.9) {
          node.classList.add('is-in');
          revealObserver.unobserve(node);
        }
      }

      for (const node of parallaxNodes) {
        const rect = node.getBoundingClientRect();
        // -1 when the element sits a full viewport below the fold, +1 above it.
        const centre = rect.top + rect.height / 2;
        const progress = (vh / 2 - centre) / (vh / 2 + rect.height / 2);
        node.style.setProperty('--p', Math.max(-1.4, Math.min(1.4, progress)).toFixed(4));
      }
      // Scroll progress for the top bar, as a 0..1 scaleX.
      const doc = document.documentElement;
      const max = doc.scrollHeight - vh;
      doc.style.setProperty('--scroll-progress', max > 0 ? (doc.scrollTop / max).toFixed(4) : '0');
    };
    const onScroll = () => {
      // rAF-throttled: a raw scroll handler fires far faster than a frame and
      // the extra work is discarded anyway.
      if (frame === 0) frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });

    return () => {
      revealObserver.disconnect();
      countObserver.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
}
