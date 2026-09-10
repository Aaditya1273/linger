// Deterministic Playwright runs: data routes serve committed E2E fixtures so
// browser tests never depend on live upstreams. Never enabled in production.
export function isDeterministicE2E() {
  return (
    process.env.ANKER_DETERMINISTIC_E2E === 'true' ||
    process.env.ANKER_DETERMINISTIC_E2E === '1' ||
    process.env.NEXT_PUBLIC_ANKER_DETERMINISTIC_E2E === 'true' ||
    process.env.NEXT_PUBLIC_ANKER_DETERMINISTIC_E2E === '1'
  );
}
