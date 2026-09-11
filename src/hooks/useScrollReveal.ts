'use client';

import { useEffect } from 'react';

/**
 * Reveal-on-scroll for every `.reveal` in the document.
 *
 * One IntersectionObserver for the whole page rather than a hook per element,
 * and it unobserves after the first intersection — a reveal that re-hides when
 * you scroll back up reads as a glitch, not as polish.
 *
 * No animation library: the observer only toggles a class, and the CSS animates
 * transform + opacity, which stay on the compositor. `prefers-reduced-motion` is
 * honoured in CSS, so elements are simply visible from the start there.
 */
export function useScrollReveal(): void {
  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>('.reveal'));
    if (nodes.length === 0) return;

    // Without IntersectionObserver, show everything rather than nothing.
    if (typeof IntersectionObserver === 'undefined') {
      nodes.forEach((node) => node.classList.add('is-in'));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('is-in');
          observer.unobserve(entry.target);
        }
      },
      // Fire slightly before the element is fully on screen so the motion has
      // finished by the time the reader's eye arrives.
      { rootMargin: '0px 0px -12% 0px', threshold: 0.08 },
    );

    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);
}
