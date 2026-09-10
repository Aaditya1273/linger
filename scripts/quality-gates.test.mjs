import { describe, expect, it } from 'vitest';
import { scanForbiddenPatterns, shouldScanPath } from './quality-gates.mjs';

describe('quality guardrails', () => {
  it('flags the principal+coupon settlement shortcut', () => {
    const findings = scanForbiddenPatterns([
      {
        filePath: 'src/products/settlement.ts',
        text: 'const grossPayout = note.principal + Math.max(0, note.coupon);',
      },
    ]);
    expect(findings.map((f) => f.ruleId)).toEqual(['no-principal-plus-coupon-settlement']);
  });

  it('flags unvalidated number-to-bigint conversion', () => {
    const findings = scanForbiddenPatterns([
      { filePath: 'packages/dex/src/money.ts', text: 'const raw = BigInt(Math.max(0, value));' },
    ]);
    expect(findings.map((f) => f.ruleId)).toEqual(['no-unsafe-rounded-bigint']);
  });

  it('flags localhost NEXT_PUBLIC_SITE_URL fallbacks that would bake bad OG URLs', () => {
    const findings = scanForbiddenPatterns([
      {
        filePath: 'app/[locale]/layout.tsx',
        text: "const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://127.0.0.1:3000';",
      },
      {
        filePath: 'app/[locale]/layout.tsx',
        text: "const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.ankerprotocol.xyz';",
      },
    ]);
    expect(findings.map((f) => f.ruleId)).toEqual(['no-localhost-site-url-fallback']);
  });

  it('scans the dex package but never its own fixture file', () => {
    expect(shouldScanPath('packages/dex/src/index.ts')).toBe(true);
    expect(shouldScanPath('scripts/quality-gates.test.mjs')).toBe(false);
  });
});
